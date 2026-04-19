import type { AgentRunOutput } from './agent-backend.js';
import {
  ASSISTANT_NAME,
  DEFAULT_EXECUTION_MODE,
  SHADOW_EXECUTION_MODE,
  TERMINAL_GROUP_JID,
} from '../config/config.js';
import { deleteSession, getAllTasks, setSession } from '../db.js';
import {
  commitExecution,
  completeExecution,
  failExecution,
  heartbeatExecution,
} from './execution-state.js';
import {
  buildGroupsSnapshotPayload,
  buildTaskSnapshots,
} from './execution-snapshots.js';
import {
  classifyRuntimeRecovery,
  markTaskNodeForReplan,
} from './framework-recovery.js';
import { summarizeRuntimeError } from '../infra/error-utils.js';
import { logger } from '../infra/logger.js';
import {
  writeGroupsSnapshotToIpc,
  writeTasksSnapshotToIpc,
  syncObservabilitySnapshotToIpc,
} from '../edge/container-snapshot-writer.js';
import { emitTerminalSystemEvent } from '../channels/terminal.js';
import { createFrameworkRunContext } from './framework-orchestrator.js';
import {
  beginTerminalTurn,
  completeTerminalTurn,
  failTerminalTurn,
  getTerminalWorkerLabel,
  recordTerminalTimeline,
  ensureTerminalWorker,
  updateTerminalTurnStage,
} from '../terminal/terminal-observability.js';
import type { FrameworkWorkerRegistry } from './framework-worker.js';
import { maybeRunEdgeTeamOrchestration } from '../tasks/team-orchestrator.js';
import {
  completeRootTaskGraph,
  failRootTaskGraph,
} from '../tasks/task-graph-state.js';
import {
  clearTerminalRetryState,
  setTerminalRetryState,
} from '../terminal/terminal-retry.js';
import {
  runShadowExecutionComparison,
  selectShadowExecution,
} from '../edge/shadow-execution.js';
import type { GroupQueue } from '../infra/group-queue.js';
import { getAvailableGroups } from '../infra/group-registration.js';
import type { RegisteredGroup } from '../types.js';

function handleStructuredAgentOutput(options: {
  chatJid: string;
  graphId: string;
  executionId: string | null;
  backendId: string;
  workerClass: 'edge' | 'heavy';
  output: AgentRunOutput;
}): boolean {
  const metadata = options.output.metadata;
  if (!metadata?.event) return false;

  const targetKey = metadata.targetKey ?? 'root';
  const detail = metadata.detail ?? metadata.summary ?? metadata.event;

  ensureTerminalWorker({
    chatJid: options.chatJid,
    key: targetKey,
    backendId: options.backendId,
    workerClass: options.workerClass,
    executionId: options.executionId,
    status: 'running',
    activity: detail,
    summary: metadata.summary,
  });
  recordTerminalTimeline({
    chatJid: options.chatJid,
    targetKey,
    text: `${getTerminalWorkerLabel(targetKey)} · ${metadata.event}${detail ? ` · ${detail}` : ''}`,
  });
  updateTerminalTurnStage({
    chatJid: options.chatJid,
    graphId: options.graphId,
    executionId: options.executionId,
    stage: metadata.event,
    backendId: options.backendId,
    workerClass: options.workerClass,
    activity: detail,
  });
  return true;
}

export interface AgentExecutorDeps {
  sessions: Record<string, string>;
  frameworkWorkers: FrameworkWorkerRegistry;
  queue: GroupQueue;
}

export function createAgentExecutor(deps: AgentExecutorDeps) {
  const { sessions, frameworkWorkers, queue } = deps;

  async function runAgent(
    group: RegisteredGroup,
    prompt: string,
    chatJid: string,
    onOutput?: (output: AgentRunOutput) => Promise<void>,
    override?: {
      executionMode?: 'edge' | 'container' | 'auto';
      retryOrigin?: 'explicit_container_retry';
    },
  ): Promise<'success' | 'error'> {
    const isMain = group.isMain === true;
    const sessionId = sessions[group.folder];
    const effectiveGroup =
      override?.executionMode && override.executionMode !== group.executionMode
        ? { ...group, executionMode: override.executionMode }
        : group;
    const frameworkRun = createFrameworkRunContext({
      requestKind: 'group_turn',
      group: effectiveGroup,
      input: {
        prompt,
        script: undefined,
        chatJid,
      },
      defaultExecutionMode: DEFAULT_EXECUTION_MODE,
      executionScope: {
        scopeType: 'group',
        scopeId: group.folder,
        groupJid: chatJid,
      },
    });
    const {
      placement,
      graph,
      execution,
      executionContext,
      baseWorkspaceVersion: _baseWorkspaceVersion,
    } = frameworkRun;
    const usesHeavyWorker = placement.workerClass === 'heavy';
    const backend = frameworkWorkers[placement.backendId];
    const isTerminalGroup = chatJid === TERMINAL_GROUP_JID;

    if (usesHeavyWorker) {
      const taskSnapshots = buildTaskSnapshots(
        getAllTasks(),
        group.folder,
        isMain,
      );
      writeTasksSnapshotToIpc(group.folder, taskSnapshots);

      const availableGroups = getAvailableGroups();
      writeGroupsSnapshotToIpc(
        group.folder,
        buildGroupsSnapshotPayload(availableGroups, isMain),
      );
      syncObservabilitySnapshotToIpc(group.folder);
    }

    let executionId: string | null = null;
    let streamedError: string | null = null;
    let streamedVisibleResult = false;

    logger.debug(
      {
        chatJid,
        graphId: graph.graphId,
        rootTaskId: graph.rootTaskId,
        executionMode: placement.executionMode,
        retryOrigin: override?.retryOrigin ?? null,
        backendId: placement.backendId,
        workerClass: placement.workerClass,
        routeReason: placement.routeReason,
        requiredCapabilities: placement.requiredCapabilities,
        fallbackEligible: placement.fallbackEligible,
        fallbackReason: placement.fallbackReason,
      },
      'Selected backend for group execution',
    );
    emitTerminalSystemEvent(
      chatJid,
      `执行开始：${graph.graphId} · ${placement.backendId}/${placement.workerClass}`,
    );
    beginTerminalTurn({
      chatJid,
      graphId: graph.graphId,
      rootTaskId: graph.rootTaskId,
      executionId: execution.executionId,
      stage: 'starting',
      backendId: placement.backendId,
      workerClass: placement.workerClass,
      activity: `执行开始：${graph.graphId} · ${placement.backendId}/${placement.workerClass}`,
    });

    try {
      executionId = execution.executionId;
      const effectiveExecutionId = execution.executionId;
      const effectiveBackendId = placement.backendId;

      // Always stream through the wrapper so execution heartbeats and
      // session compatibility updates happen even when the caller does not
      // need per-chunk output handling.
      const wrappedOnOutput = async (output: AgentRunOutput) => {
        if (output.newSessionId) {
          sessions[group.folder] = output.newSessionId;
          setSession(group.folder, output.newSessionId);
        }
        if (executionId) heartbeatExecution(executionId);
        if (output.status === 'error') {
          streamedError = output.error || 'Unknown error';
          updateTerminalTurnStage({
            chatJid,
            graphId: graph.graphId,
            executionId: effectiveExecutionId,
            stage: 'stream_error',
            backendId: effectiveBackendId,
            workerClass: effectiveBackendId === 'container' ? 'heavy' : 'edge',
            activity: output.error || 'Unknown error',
            error: output.error || 'Unknown error',
          });
        }
        const handledStructuredOutput = handleStructuredAgentOutput({
          chatJid,
          graphId: graph.graphId,
          executionId: effectiveExecutionId,
          backendId: effectiveBackendId,
          workerClass: effectiveBackendId === 'container' ? 'heavy' : 'edge',
          output,
        });
        if (output.result) {
          streamedVisibleResult = true;
          updateTerminalTurnStage({
            chatJid,
            graphId: graph.graphId,
            executionId: effectiveExecutionId,
            stage: 'streaming_output',
            backendId: effectiveBackendId,
            workerClass: effectiveBackendId === 'container' ? 'heavy' : 'edge',
            activity: output.result,
          });
        }
        if (handledStructuredOutput && !output.result && !output.error) {
          await onOutput?.(output);
          return;
        }
        await onOutput?.(output);
      };

      const teamOrchestrationResult = await maybeRunEdgeTeamOrchestration({
        group,
        prompt,
        chatJid,
        isMain,
        assistantName: ASSISTANT_NAME,
        frameworkRun,
        edgeWorker: frameworkWorkers.edge,
        onOutput: wrappedOnOutput,
      });
      if (teamOrchestrationResult.handled) {
        return teamOrchestrationResult.status;
      }

      const output = await backend.run(
        group,
        {
          prompt,
          sessionId,
          groupFolder: group.folder,
          chatJid,
          isMain,
          assistantName: ASSISTANT_NAME,
          executionContext,
        },
        usesHeavyWorker
          ? (execution) =>
              queue.registerProcess(
                execution.chatJid,
                execution.process,
                execution.executionName,
                execution.groupFolder,
              )
          : undefined,
        wrappedOnOutput,
      );

      const _recovery = classifyRuntimeRecovery({
        error: streamedError || output.error || '',
        workerClass: placement.workerClass,
        fallbackEligible: placement.fallbackEligible,
        visibleOutputEmitted: streamedVisibleResult,
      });

      if (output.newSessionId) {
        sessions[group.folder] = output.newSessionId;
        setSession(group.folder, output.newSessionId);
      }

      if (output.result && !streamedVisibleResult) {
        await onOutput?.(output);
      }

      await runShadowExecutionComparison({
        selection: selectShadowExecution(
          effectiveBackendId,
          { prompt, script: undefined },
          SHADOW_EXECUTION_MODE,
        ),
        backends: frameworkWorkers,
        group,
        input: {
          prompt,
          sessionId,
          groupFolder: group.folder,
          chatJid,
          isMain,
          assistantName: ASSISTANT_NAME,
        },
        primaryBackendId: effectiveBackendId,
        primaryOutput: output,
        scope: 'group',
        scopeId: group.folder,
        fallbackReason: placement.fallbackReason,
      });

      const error = streamedError || output.error;
      if (output.status === 'error' || error) {
        const finalRecovery = classifyRuntimeRecovery({
          error: error || 'Unknown error',
          workerClass: effectiveBackendId === 'container' ? 'heavy' : 'edge',
          fallbackEligible:
            effectiveBackendId === 'edge' &&
            override?.retryOrigin !== 'explicit_container_retry',
          visibleOutputEmitted: streamedVisibleResult,
        });

        if (effectiveExecutionId) {
          failExecution(effectiveExecutionId, error || 'Unknown error');
        }
        if (finalRecovery.kind === 'replan') {
          markTaskNodeForReplan(graph.rootTaskId, finalRecovery.reason);
        }
        if (
          finalRecovery.kind === 'explicit_container_retry' &&
          isTerminalGroup
        ) {
          setTerminalRetryState({
            prompt,
            groupFolder: group.folder,
            chatJid,
            isMain,
            sessionId: sessionId ?? null,
            failureSummary: summarizeRuntimeError(error || 'Unknown error'),
            error: error || 'Unknown error',
            escalationReason: finalRecovery.reason,
            graphId: graph.graphId,
            createdAt: new Date().toISOString(),
          });
        }

        // Detect stale/corrupt session — clear it so the next retry starts fresh.
        const isStaleSession =
          sessionId &&
          error &&
          /no conversation found|ENOENT.*\.jsonl|session.*not found/i.test(
            error,
          );

        if (isStaleSession) {
          logger.warn(
            { group: group.name, staleSessionId: sessionId, error },
            'Stale session detected — clearing for next retry',
          );
          delete sessions[group.folder];
          deleteSession(group.folder);
        }

        failRootTaskGraph(
          graph.graphId,
          graph.rootTaskId,
          error || 'Unknown error',
        );
        const failureActivity =
          finalRecovery.kind === 'explicit_container_retry'
            ? `执行失败：${graph.graphId} · edge 需要显式切换到 container 重试 · 输入 /retry-container · ${summarizeRuntimeError(error || 'Unknown error')}`
            : `执行失败：${graph.graphId} · ${error || 'Unknown error'}`;
        failTerminalTurn({
          chatJid,
          stage: 'failed',
          error: error || 'Unknown error',
          activity: failureActivity,
        });
        emitTerminalSystemEvent(chatJid, failureActivity);
        logger.error(
          { group: group.name, error },
          'Heavy worker execution error',
        );
        return 'error';
      }

      if (override?.retryOrigin === 'explicit_container_retry') {
        clearTerminalRetryState();
      } else if (isTerminalGroup) {
        clearTerminalRetryState();
      }
      commitExecution(effectiveExecutionId);
      completeExecution(effectiveExecutionId);
      completeRootTaskGraph(graph.graphId, graph.rootTaskId);
      completeTerminalTurn({
        chatJid,
        stage: 'completed',
        activity: `执行完成：${graph.graphId}`,
      });
      emitTerminalSystemEvent(chatJid, `执行完成：${graph.graphId}`);
      return 'success';
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      const recovery = classifyRuntimeRecovery({
        error,
        workerClass: placement.workerClass,
        fallbackEligible: placement.fallbackEligible,
        visibleOutputEmitted: streamedVisibleResult,
      });
      if (executionId) failExecution(executionId, error);
      if (recovery.kind === 'replan') {
        markTaskNodeForReplan(graph.rootTaskId, recovery.reason);
      }
      if (recovery.kind === 'explicit_container_retry' && isTerminalGroup) {
        setTerminalRetryState({
          prompt,
          groupFolder: group.folder,
          chatJid,
          isMain,
          sessionId: sessionId ?? null,
          failureSummary: summarizeRuntimeError(error),
          error,
          escalationReason: recovery.reason,
          graphId: graph.graphId,
          createdAt: new Date().toISOString(),
        });
      }
      failRootTaskGraph(graph.graphId, graph.rootTaskId, error);
      const failureActivity =
        recovery.kind === 'explicit_container_retry'
          ? `执行失败：${graph.graphId} · edge 需要显式切换到 container 重试 · 输入 /retry-container · ${summarizeRuntimeError(error)}`
          : `执行失败：${graph.graphId} · ${error}`;
      failTerminalTurn({
        chatJid,
        stage: 'failed',
        error,
        activity: failureActivity,
      });
      emitTerminalSystemEvent(chatJid, failureActivity);
      logger.error({ group: group.name, err }, 'Agent error');
      return 'error';
    } finally {
      try {
        syncObservabilitySnapshotToIpc(group.folder);
      } catch (snapshotError) {
        logger.warn(
          {
            group: group.name,
            error:
              snapshotError instanceof Error
                ? snapshotError.message
                : String(snapshotError),
          },
          'Failed to write framework observability snapshot',
        );
      }
    }
  }

  return { runAgent };
}
