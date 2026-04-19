import { deploymentRequiresContainerRuntime } from './routing/backend-selection.js';
import { edgeBackend } from './backends/edge-backend.js';
import { heavyWorker } from './backends/container-backend.js';
import {
  DEFAULT_EXECUTION_MODE,
  TERMINAL_CHANNEL_ENABLED,
  TERMINAL_GROUP_FOLDER,
  TERMINAL_GROUP_JID,
  TERMINAL_RESET_SESSION_ON_START,
} from './config/config.js';
import { initConfig } from './config/config.js';
import {
  renderStartupConfigError,
  resolveConfigPath,
} from './config/config-loader.js';
import {
  getChannelFactory,
  getRegisteredChannelNames,
} from './channels/registry.js';
import {
  writeGroupsSnapshotToIpc,
  syncObservabilitySnapshotToIpc,
  writeTasksSnapshotToIpc,
} from './edge/container-snapshot-writer.js';
import {
  cleanupOrphans,
  ensureContainerRuntimeRunning,
} from './container/container-runtime.js';
import {
  deleteSession,
  getAllTasks,
  initDatabase,
  setSession,
  storeChatMetadata,
  storeMessage,
} from './db.js';
import { buildTaskSnapshots } from './framework/execution-snapshots.js';
import { GroupQueue } from './infra/group-queue.js';
import { recordBotMessage } from './infra/bot-message-recorder.js';
import { startIpcWatcher } from './infra/ipc.js';
import { findChannel, formatOutbound } from './routing/router.js';
import { initRouterState, loadState } from './routing/router-state.js';
import {
  initMessageProcessor,
  processGroupMessages,
  startMessageLoop,
  recoverPendingMessages,
} from './routing/message-processor.js';
import {
  restoreRemoteControl,
  startRemoteControl,
  stopRemoteControl,
} from './infra/remote-control.js';
import {
  isSenderAllowed,
  loadSenderAllowlist,
  shouldDropMessage,
} from './infra/sender-allowlist.js';
import { emitTerminalSystemEvent } from './channels/terminal.js';
import {
  createFrameworkWorkerRegistry,
  type FrameworkWorkerRegistry,
} from './framework/framework-worker.js';
import {
  clearTerminalRetryState,
  getTerminalRetryState,
  setTerminalRetryState,
} from './terminal/terminal-retry.js';
import { startSchedulerLoop } from './tasks/task-scheduler.js';
import { Channel, NewMessage, RegisteredGroup } from './types.js';
import { logger } from './infra/logger.js';
import {
  ensureOneCLIAgent,
  ensureTerminalCanaryGroup,
  getAvailableGroups,
  initGroupRegistration,
  registerGroup,
  _setRegisteredGroupsRef,
} from './infra/group-registration.js';
import {
  cleanupTerminalRuntime,
  gracefulTerminalQuit,
  initTerminalRuntimeManager,
  interruptTerminalTurn,
  resetTerminalConversation,
} from './terminal/terminal-runtime-manager.js';
import { createAgentExecutor } from './framework/agent-executor.js';

// Re-export for backwards compatibility during refactor
export { escapeXml, formatMessages } from './routing/router.js';
export { getAvailableGroups } from './infra/group-registration.js';

const lastTimestamp = '';
const sessions: Record<string, string> = {};
const registeredGroups: Record<string, RegisteredGroup> = {};
const lastAgentTimestamp: Record<string, string> = {};
const messageLoopRunning = false;

const channels: Channel[] = [];
const queue = new GroupQueue();
initRouterState({
  lastTimestamp,
  sessions,
  registeredGroups,
  lastAgentTimestamp,
  messageLoopRunning,
});
initTerminalRuntimeManager({ sessions, queue });
initGroupRegistration({ registeredGroups });
const frameworkWorkers: FrameworkWorkerRegistry = createFrameworkWorkerRegistry(
  {
    container: heavyWorker,
    edge: edgeBackend,
  },
);
const { runAgent } = createAgentExecutor({ sessions, frameworkWorkers, queue });
initMessageProcessor({
  channels,
  registeredGroups,
  lastTimestamp,
  lastAgentTimestamp,
  messageLoopRunning,
  queue,
  runAgent,
});

/** @internal - exported for testing */
export function _setRegisteredGroups(
  groups: Record<string, RegisteredGroup>,
): void {
  Object.keys(registeredGroups).forEach((k) => delete registeredGroups[k]);
  Object.assign(registeredGroups, groups);
  _setRegisteredGroupsRef(registeredGroups);
}

/** @internal - exported for testing */
export function _setChannelsForTests(next: Channel[]): void {
  channels.splice(0, channels.length, ...next);
}

/** @internal - exported for testing */
export function _setSessionsForTests(next: Record<string, string>): void {
  Object.keys(sessions).forEach((k) => delete sessions[k]);
  Object.assign(sessions, next);
}

/** @internal - exported for testing */
export function _setLastAgentTimestampForTests(
  next: Record<string, string>,
): void {
  Object.keys(lastAgentTimestamp).forEach((k) => delete lastAgentTimestamp[k]);
  Object.assign(lastAgentTimestamp, next);
}

/** @internal - exported for testing */
export async function _retryTerminalOnContainerForTests(): Promise<
  'success' | 'error'
> {
  const result = await retryTerminalOnContainerForTests();
  return result;
}

async function retryTerminalOnContainerForTests(): Promise<
  'success' | 'error'
> {
  const retry = getTerminalRetryState();
  if (!retry) {
    return 'error';
  }

  const group = registeredGroups[retry.chatJid];
  if (!group) {
    return 'error';
  }

  const previousSession = sessions[group.folder];
  if (retry.sessionId) {
    sessions[group.folder] = retry.sessionId;
    setSession(group.folder, retry.sessionId);
  } else {
    delete sessions[group.folder];
    deleteSession(group.folder);
  }

  try {
    const result = await runAgent(
      group,
      retry.prompt,
      retry.chatJid,
      undefined,
      {
        executionMode: 'container',
        retryOrigin: 'explicit_container_retry',
      },
    );
    if (result === 'success') {
      clearTerminalRetryState();
      return 'success';
    }
    setTerminalRetryState(retry);
    return 'error';
  } catch (error) {
    setTerminalRetryState(retry);
    throw error;
  } finally {
    if (getTerminalRetryState() !== null) {
      if (previousSession) {
        sessions[group.folder] = previousSession;
        setSession(group.folder, previousSession);
      } else if (!retry.sessionId) {
        delete sessions[group.folder];
        deleteSession(group.folder);
      }
    }
  }
}

export function _cleanupTerminalRuntimeForTests(
  reason: 'startup' | 'command' | 'quit' = 'startup',
): void {
  cleanupTerminalRuntime({
    reason,
    error:
      reason === 'startup'
        ? 'Terminal session reset on startup'
        : reason === 'quit'
          ? 'Terminal session quit'
          : 'Terminal session reset',
    resetSession: true,
    finalizeExecutions: reason === 'startup',
    closeForeground: true,
    closeBackground: true,
    clearPendingMessages: true,
    clearPendingTasks: true,
  });
}

/** @internal - exported for testing */
export async function _processGroupMessagesForTests(
  chatJid: string,
): Promise<boolean> {
  return processGroupMessages(chatJid);
}

function ensureContainerSystemRunning(): void {
  ensureContainerRuntimeRunning();
  cleanupOrphans();
}

async function main(): Promise<void> {
  const configPath = resolveConfigPath(process.argv);
  initConfig(configPath);

  // Dynamic channel loading — must happen after initConfig() so channels
  // can call getAppConfig() during registration.
  await import('./channels/index.js');

  initDatabase();
  logger.info('Database initialized');
  loadState();
  ensureTerminalCanaryGroup();
  if (TERMINAL_CHANNEL_ENABLED && TERMINAL_RESET_SESSION_ON_START) {
    cleanupTerminalRuntime({
      reason: 'startup',
      error: 'Terminal session reset on startup',
      resetSession: true,
      finalizeExecutions: true,
      closeForeground: true,
      closeBackground: true,
      clearPendingMessages: true,
      clearPendingTasks: true,
    });
  }

  if (
    deploymentRequiresContainerRuntime(
      Object.values(registeredGroups),
      DEFAULT_EXECUTION_MODE,
    )
  ) {
    ensureContainerSystemRunning();
  } else {
    logger.info(
      { defaultExecutionMode: DEFAULT_EXECUTION_MODE },
      'Skipping container runtime startup check for edge-only deployment',
    );
  }

  // Ensure OneCLI agents exist for all registered groups.
  // Recovers from missed creates (e.g. OneCLI was down at registration time).
  for (const [jid, group] of Object.entries(registeredGroups)) {
    ensureOneCLIAgent(jid, group);
  }

  restoreRemoteControl();

  // Graceful shutdown handlers
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');
    await queue.shutdown(10000);
    for (const ch of channels) await ch.disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Handle /remote-control and /remote-control-end commands
  async function handleRemoteControl(
    command: string,
    chatJid: string,
    msg: NewMessage,
  ): Promise<void> {
    const group = registeredGroups[chatJid];
    if (!group?.isMain) {
      logger.warn(
        { chatJid, sender: msg.sender },
        'Remote control rejected: not main group',
      );
      return;
    }

    const channel = findChannel(channels, chatJid);
    if (!channel) return;

    if (command === '/remote-control') {
      const result = await startRemoteControl(
        msg.sender,
        chatJid,
        process.cwd(),
      );
      if (result.ok) {
        await channel.sendMessage(chatJid, result.url);
      } else {
        await channel.sendMessage(
          chatJid,
          `Remote Control failed: ${result.error}`,
        );
      }
    } else {
      const result = stopRemoteControl();
      if (result.ok) {
        await channel.sendMessage(chatJid, 'Remote Control session ended.');
      } else {
        await channel.sendMessage(chatJid, result.error);
      }
    }
  }

  // Channel callbacks (shared by all channels)
  async function retryTerminalOnContainer(): Promise<string> {
    const retry = getTerminalRetryState();
    if (!retry) {
      return '当前没有可在 container 上重试的失败执行。';
    }

    const group = registeredGroups[retry.chatJid];
    if (!group) {
      return `无法找到可重试的 terminal group：${retry.groupFolder}`;
    }

    emitTerminalSystemEvent(
      TERMINAL_GROUP_JID,
      `开始在 container 上重试：${retry.graphId}`,
    );

    const previousSession = sessions[group.folder];
    if (retry.sessionId) {
      sessions[group.folder] = retry.sessionId;
      setSession(group.folder, retry.sessionId);
    } else {
      delete sessions[group.folder];
      deleteSession(group.folder);
    }

    try {
      const status = await runAgent(
        group,
        retry.prompt,
        retry.chatJid,
        undefined,
        {
          executionMode: 'container',
          retryOrigin: 'explicit_container_retry',
        },
      );

      if (status === 'success') {
        clearTerminalRetryState();
        return `已在 container 上重新执行：${retry.graphId}`;
      }

      setTerminalRetryState(retry);
      return `container 重试失败：${retry.graphId}`;
    } catch (error) {
      setTerminalRetryState(retry);
      throw error;
    } finally {
      if (getTerminalRetryState() !== null) {
        if (previousSession) {
          sessions[group.folder] = previousSession;
          setSession(group.folder, previousSession);
        } else if (!retry.sessionId) {
          delete sessions[group.folder];
          deleteSession(group.folder);
        }
      }
    }
  }

  const channelOpts = {
    onMessage: (chatJid: string, msg: NewMessage) => {
      // Remote control commands — intercept before storage
      const trimmed = msg.content.trim();
      if (trimmed === '/remote-control' || trimmed === '/remote-control-end') {
        handleRemoteControl(trimmed, chatJid, msg).catch((err) =>
          logger.error({ err, chatJid }, 'Remote control command error'),
        );
        return;
      }

      // Sender allowlist drop mode: discard messages from denied senders before storing
      if (!msg.is_from_me && !msg.is_bot_message && registeredGroups[chatJid]) {
        const cfg = loadSenderAllowlist();
        if (
          shouldDropMessage(chatJid, cfg) &&
          !isSenderAllowed(chatJid, msg.sender, cfg)
        ) {
          if (cfg.logDenied) {
            logger.debug(
              { chatJid, sender: msg.sender },
              'sender-allowlist: dropping message (drop mode)',
            );
          }
          return;
        }
      }
      storeMessage(msg);
    },
    onChatMetadata: (
      chatJid: string,
      timestamp: string,
      name?: string,
      channel?: string,
      isGroup?: boolean,
    ) => storeChatMetadata(chatJid, timestamp, name, channel, isGroup),
    registeredGroups: () => registeredGroups,
    onResetSession: (groupFolder: string) => {
      if (groupFolder === TERMINAL_GROUP_FOLDER) {
        resetTerminalConversation();
      }
    },
    onQuit: (groupFolder: string) => {
      if (groupFolder === TERMINAL_GROUP_FOLDER) {
        gracefulTerminalQuit();
      }
    },
    onCancel: (groupFolder: string) => {
      if (groupFolder === TERMINAL_GROUP_FOLDER) {
        interruptTerminalTurn();
        emitTerminalSystemEvent(TERMINAL_GROUP_JID, '已打断当前对话（ESC）');
      }
    },
    onRetryContainer: async (groupFolder: string) => {
      if (groupFolder !== TERMINAL_GROUP_FOLDER) {
        return '当前仅支持 terminal group 使用 /retry-container。';
      }
      return retryTerminalOnContainer();
    },
  };

  // Create and connect all registered channels.
  // Each channel self-registers via the barrel import above.
  // Factories return null when credentials are missing, so unconfigured channels are skipped.
  for (const channelName of getRegisteredChannelNames()) {
    const factory = getChannelFactory(channelName)!;
    const channel = factory(channelOpts);
    if (!channel) {
      logger.warn(
        { channel: channelName },
        'Channel installed but credentials missing — skipping. Check .env or re-run the channel skill.',
      );
      continue;
    }
    channels.push(channel);
    await channel.connect();
  }
  if (channels.length === 0) {
    logger.fatal('No channels connected');
    process.exit(1);
  }

  // Start subsystems (independently of connection handler)
  startSchedulerLoop({
    backends: frameworkWorkers,
    defaultExecutionMode: DEFAULT_EXECUTION_MODE,
    registeredGroups: () => registeredGroups,
    getSessions: () => sessions,
    queue,
    onExecutionStarted: (execution) =>
      queue.registerProcess(
        execution.chatJid,
        execution.process,
        execution.executionName,
        execution.groupFolder,
      ),
    sendMessage: async (jid, rawText) => {
      const channel = findChannel(channels, jid);
      if (!channel) {
        logger.warn({ jid }, 'No channel owns JID, cannot send message');
        return;
      }
      const text = formatOutbound(rawText);
      if (text) {
        await channel.sendMessage(jid, text);
        recordBotMessage(jid, text);
      }
    },
  });
  startIpcWatcher({
    sendMessage: (jid, text) => {
      const channel = findChannel(channels, jid);
      if (!channel) throw new Error(`No channel for JID: ${jid}`);
      return channel
        .sendMessage(jid, text)
        .then(() => recordBotMessage(jid, text));
    },
    registeredGroups: () => registeredGroups,
    registerGroup,
    syncGroups: async (force: boolean) => {
      await Promise.all(
        channels
          .filter((ch) => ch.syncGroups)
          .map((ch) => ch.syncGroups!(force)),
      );
    },
    getAvailableGroups,
    writeGroupsSnapshot: writeGroupsSnapshotToIpc,
    onTasksChanged: () => {
      const tasks = getAllTasks();
      for (const group of Object.values(registeredGroups)) {
        writeTasksSnapshotToIpc(
          group.folder,
          buildTaskSnapshots(tasks, group.folder, group.isMain === true),
        );
        syncObservabilitySnapshotToIpc(group.folder);
      }
    },
  });
  queue.setProcessMessagesFn(processGroupMessages);
  recoverPendingMessages();
  startMessageLoop().catch((err) => {
    logger.fatal({ err }, 'Message loop crashed unexpectedly');
    process.exit(1);
  });
}

// Guard: only run when executed directly, not when imported by tests
const isDirectRun =
  process.argv[1] &&
  new URL(import.meta.url).pathname ===
    new URL(`file://${process.argv[1]}`).pathname;

if (isDirectRun) {
  main().catch((err) => {
    const configPath = resolveConfigPath(process.argv);
    const startupHint = renderStartupConfigError(err, configPath);
    if (startupHint) {
      logger.error(startupHint);
    } else {
      logger.error({ err }, 'Failed to start NanoClaw');
    }
    process.exit(1);
  });
}
