import {
  ASSISTANT_NAME,
  DEFAULT_TRIGGER,
  getTriggerPattern,
  IDLE_TIMEOUT,
  MAX_MESSAGES_PER_PROMPT,
  POLL_INTERVAL,
  TERMINAL_CHANNEL_ENABLED,
  TERMINAL_GROUP_JID,
  TIMEZONE,
} from '../config/config.js';
import { getMessagesSince, getNewMessages } from '../db.js';
import { recordBotMessage } from '../infra/bot-message-recorder.js';
import { logger } from '../infra/logger.js';
import {
  isTriggerAllowed,
  loadSenderAllowlist,
} from '../infra/sender-allowlist.js';
import { findChannel, formatMessages } from './router.js';
import { getOrRecoverCursor, saveState } from './router-state.js';
import type { Channel, NewMessage, RegisteredGroup } from '../types.js';
import type { GroupQueue } from '../infra/group-queue.js';
import { emitTerminalSystemEvent } from '../channels/terminal.js';

interface MessageProcessorState {
  channels: Channel[];
  registeredGroups: Record<string, RegisteredGroup>;
  lastTimestamp: string;
  lastAgentTimestamp: Record<string, string>;
  messageLoopRunning: boolean;
  queue: GroupQueue;
  runAgent: (
    group: RegisteredGroup,
    prompt: string,
    chatJid: string,
    onOutput?: (
      output: import('../framework/agent-backend.js').AgentRunOutput,
    ) => Promise<void>,
    override?: {
      executionMode?: 'edge' | 'container' | 'auto';
      retryOrigin?: 'explicit_container_retry';
    },
  ) => Promise<'success' | 'error'>;
}

let state: MessageProcessorState;

const MAX_IDENTICAL_RETRY_ATTEMPTS = 2;
const RETRY_GUARD_TTL_MS = 5 * 60 * 1000;
const RETRY_HINT =
  '\n\n[retry-hint] The previous attempt failed. First analyze why it failed. Avoid repeating the exact same tool call with the same arguments. Choose a revised strategy before invoking tools. [/retry-hint]';

interface RetryGuardState {
  promptHash: string;
  failuresWithoutOutput: number;
  lastFailureAt: number;
}

const retryGuards = new Map<string, RetryGuardState>();

function hashPrompt(prompt: string): string {
  let hash = 2166136261;
  for (let i = 0; i < prompt.length; i++) {
    hash ^= prompt.charCodeAt(i);
    hash +=
      (hash << 1) +
      (hash << 4) +
      (hash << 7) +
      (hash << 8) +
      (hash << 24);
  }
  return (hash >>> 0).toString(16);
}

function buildRunPrompt(chatJid: string, prompt: string): string {
  const hash = hashPrompt(prompt);
  const guard = retryGuards.get(chatJid);
  if (!guard) return prompt;
  if (Date.now() - guard.lastFailureAt > RETRY_GUARD_TTL_MS) {
    retryGuards.delete(chatJid);
    return prompt;
  }
  if (guard.promptHash !== hash || guard.failuresWithoutOutput === 0) {
    return prompt;
  }
  return `${prompt}${RETRY_HINT}`;
}

function recordRetryFailure(chatJid: string, prompt: string): number {
  const promptHash = hashPrompt(prompt);
  const prev = retryGuards.get(chatJid);
  const failuresWithoutOutput =
    prev && prev.promptHash === promptHash ? prev.failuresWithoutOutput + 1 : 1;
  retryGuards.set(chatJid, {
    promptHash,
    failuresWithoutOutput,
    lastFailureAt: Date.now(),
  });
  return failuresWithoutOutput;
}

function clearRetryFailure(chatJid: string): void {
  retryGuards.delete(chatJid);
}

export function resetMessageProcessorRetryGuardsForTests(): void {
  retryGuards.clear();
}

export function initMessageProcessor(deps: MessageProcessorState): void {
  state = deps;
}

/**
 * Process all pending messages for a group.
 * Called by the GroupQueue when it's this group's turn.
 */
export async function processGroupMessages(chatJid: string): Promise<boolean> {
  const group = state.registeredGroups[chatJid];
  if (!group) return true;

  const channel = findChannel(state.channels, chatJid);
  if (!channel) {
    logger.warn({ chatJid }, 'No channel owns JID, skipping messages');
    return true;
  }

  const isMainGroup = group.isMain === true;

  const missedMessages = getMessagesSince(
    chatJid,
    getOrRecoverCursor(chatJid),
    ASSISTANT_NAME,
    MAX_MESSAGES_PER_PROMPT,
  );

  if (missedMessages.length === 0) return true;

  // For non-main groups, check if trigger is required and present
  if (!isMainGroup && group.requiresTrigger !== false) {
    const triggerPattern = getTriggerPattern(group.trigger);
    const allowlistCfg = loadSenderAllowlist();
    const hasTrigger = missedMessages.some(
      (m) =>
        triggerPattern.test(m.content.trim()) &&
        (m.is_from_me || isTriggerAllowed(chatJid, m.sender, allowlistCfg)),
    );
    if (!hasTrigger) return true;
  }

  const prompt = formatMessages(missedMessages, TIMEZONE);
  const runPrompt = buildRunPrompt(chatJid, prompt);

  // Advance cursor so the piping path in startMessageLoop won't re-fetch
  // these messages. Save the old cursor so we can roll back on error.
  const previousCursor = state.lastAgentTimestamp[chatJid] || '';
  state.lastAgentTimestamp[chatJid] =
    missedMessages[missedMessages.length - 1].timestamp;
  saveState();

  logger.info(
    { group: group.name, messageCount: missedMessages.length },
    'Processing messages',
  );

  // Track idle timer for closing stdin when agent is idle
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  const resetIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      logger.debug(
        { group: group.name },
        'Idle timeout, closing container stdin',
      );
      state.queue.closeStdin(chatJid);
    }, IDLE_TIMEOUT);
  };

  await channel.setTyping?.(chatJid, true);
  let hadError = false;
  let outputSentToUser = false;
  let typingReleased = false;

  const output = await state.runAgent(
    group,
    runPrompt,
    chatJid,
    async (result) => {
      // Streaming output callback — called for each agent result
      if (result.result) {
        const raw =
          typeof result.result === 'string'
            ? result.result
            : JSON.stringify(result.result);
        // Strip <internal>...</internal> blocks — agent uses these for internal reasoning
        const text = raw.replace(/<internal>[\s\S]*?<\/internal>/g, '').trim();
        logger.info({ group: group.name }, `Agent output: ${raw.length} chars`);
        if (text) {
          await channel.sendMessage(chatJid, text);
          recordBotMessage(chatJid, text);
          outputSentToUser = true;
          if (!typingReleased) {
            await channel.setTyping?.(chatJid, false);
            typingReleased = true;
          }
        }
        // Only reset idle timer on actual results, not session-update markers (result: null)
        resetIdleTimer();
      }

      if (result.status === 'success') {
        state.queue.notifyIdle(chatJid);
      }

      if (result.status === 'error') {
        hadError = true;
      }
    },
  );

  if (!typingReleased) {
    await channel.setTyping?.(chatJid, false);
  }
  if (idleTimer) clearTimeout(idleTimer);

  if (output === 'error' || hadError) {
    // If we already sent output to the user, don't roll back the cursor —
    // the user got their response and re-processing would send duplicates.
    if (outputSentToUser) {
      clearRetryFailure(chatJid);
      logger.warn(
        { group: group.name },
        'Agent error after output was sent, skipping cursor rollback to prevent duplicates',
      );
      return true;
    }

    const retryCount = recordRetryFailure(chatJid, prompt);
    if (retryCount > MAX_IDENTICAL_RETRY_ATTEMPTS) {
      const notice = `重复失败已达上限（${MAX_IDENTICAL_RETRY_ATTEMPTS} 次），停止自动重试，请调整策略后重试。`;
      emitTerminalSystemEvent(chatJid, notice);
      logger.error(
        { group: group.name, retryCount, promptHash: hashPrompt(prompt) },
        'Stopped automatic retry due to repeated identical failures',
      );
      return true;
    }

    // Roll back cursor so retries can re-process these messages
    state.lastAgentTimestamp[chatJid] = previousCursor;
    saveState();
    logger.warn(
      { group: group.name, retryCount, promptHash: hashPrompt(prompt) },
      'Agent error, rolled back message cursor for retry',
    );
    return false;
  }

  clearRetryFailure(chatJid);
  return true;
}

export async function startMessageLoop(): Promise<void> {
  if (state.messageLoopRunning) {
    logger.debug('Message loop already running, skipping duplicate start');
    return;
  }
  state.messageLoopRunning = true;

  logger.info(`NanoClaw running (default trigger: ${DEFAULT_TRIGGER})`);

  while (true) {
    try {
      const jids = Object.keys(state.registeredGroups);
      const { messages, newTimestamp } = getNewMessages(
        jids,
        state.lastTimestamp,
        ASSISTANT_NAME,
      );

      if (messages.length > 0) {
        logger.info({ count: messages.length }, 'New messages');

        // Advance the "seen" cursor for all messages immediately
        state.lastTimestamp = newTimestamp;
        saveState();

        // Deduplicate by group
        const messagesByGroup = new Map<string, NewMessage[]>();
        for (const msg of messages) {
          const existing = messagesByGroup.get(msg.chat_jid);
          if (existing) {
            existing.push(msg);
          } else {
            messagesByGroup.set(msg.chat_jid, [msg]);
          }
        }

        for (const [chatJid, groupMessages] of messagesByGroup) {
          const group = state.registeredGroups[chatJid];
          if (!group) continue;

          const channel = findChannel(state.channels, chatJid);
          if (!channel) {
            logger.warn({ chatJid }, 'No channel owns JID, skipping messages');
            continue;
          }

          const isMainGroup = group.isMain === true;
          const needsTrigger = !isMainGroup && group.requiresTrigger !== false;

          // For non-main groups, only act on trigger messages.
          // Non-trigger messages accumulate in DB and get pulled as
          // context when a trigger eventually arrives.
          if (needsTrigger) {
            const triggerPattern = getTriggerPattern(group.trigger);
            const allowlistCfg = loadSenderAllowlist();
            const hasTrigger = groupMessages.some(
              (m) =>
                triggerPattern.test(m.content.trim()) &&
                (m.is_from_me ||
                  isTriggerAllowed(chatJid, m.sender, allowlistCfg)),
            );
            if (!hasTrigger) continue;
          }

          // Pull all messages since lastAgentTimestamp so non-trigger
          // context that accumulated between triggers is included.
          const allPending = getMessagesSince(
            chatJid,
            getOrRecoverCursor(chatJid),
            ASSISTANT_NAME,
            MAX_MESSAGES_PER_PROMPT,
          );
          const messagesToSend =
            allPending.length > 0 ? allPending : groupMessages;
          const formatted = formatMessages(messagesToSend, TIMEZONE);

          if (state.queue.sendMessage(chatJid, formatted)) {
            logger.debug(
              { chatJid, count: messagesToSend.length },
              'Piped messages to active container',
            );
            state.lastAgentTimestamp[chatJid] =
              messagesToSend[messagesToSend.length - 1].timestamp;
            saveState();
            // Show typing indicator while the container processes the piped message
            channel
              .setTyping?.(chatJid, true)
              ?.catch((err) =>
                logger.warn({ chatJid, err }, 'Failed to set typing indicator'),
              );
          } else {
            // No active container — enqueue for a new one
            state.queue.enqueueMessageCheck(chatJid);
          }
        }
      }
    } catch (err) {
      logger.error({ err }, 'Error in message loop');
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
  }
}

/**
 * Startup recovery: check for unprocessed messages in registered groups.
 * Handles crash between advancing lastTimestamp and processing messages.
 */
export function recoverPendingMessages(): void {
  for (const [chatJid, group] of Object.entries(state.registeredGroups)) {
    const pending = getMessagesSince(
      chatJid,
      getOrRecoverCursor(chatJid),
      ASSISTANT_NAME,
      MAX_MESSAGES_PER_PROMPT,
    );
    if (pending.length > 0) {
      if (TERMINAL_CHANNEL_ENABLED && chatJid === TERMINAL_GROUP_JID) {
        state.lastAgentTimestamp[chatJid] =
          pending[pending.length - 1].timestamp;
        saveState();
        logger.info(
          { group: group.name, pendingCount: pending.length },
          'Recovery: muted pending terminal messages',
        );
        continue;
      }
      logger.info(
        { group: group.name, pendingCount: pending.length },
        'Recovery: found unprocessed messages',
      );
      state.queue.enqueueMessageCheck(chatJid);
    }
  }
}
