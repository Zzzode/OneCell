import type { ExecutionEventHooks, ExecutionRequest } from '../framework/agent-backend.js';
import {
  acknowledgeExecution,
  heartbeatExecution,
  persistExecutionCheckpoint,
} from '../framework/execution-state.js';
import {
  completeTerminalWorker,
  deriveTerminalWorkerKey,
  ensureTerminalWorker,
  failTerminalWorker,
  recordTerminalFallback,
  recordTerminalTimeline,
  updateTerminalTurnStage,
} from '../terminal/terminal-observability.js';
import { commitWorkspaceOverlay } from '../infra/workspace-service.js';

function summarizeToolArgs(
  tool: string,
  args: Record<string, unknown>,
): string {
  switch (tool) {
    case 'workspace.read':
      return typeof args.path === 'string' ? args.path : '';
    case 'workspace.write':
      return typeof args.path === 'string' ? args.path : '';
    case 'workspace.search':
      return typeof args.pattern === 'string' ? args.pattern : '';
    case 'workspace.list':
      return typeof args.path === 'string' ? args.path : '(root)';
    case 'workspace.apply_patch':
      return '(patch)';
    case 'message.send':
      return typeof args.text === 'string'
        ? args.text.length > 40
          ? `${args.text.slice(0, 39)}…`
          : args.text
        : '';
    case 'task.create':
      return typeof args.prompt === 'string'
        ? args.prompt.length > 40
          ? `${args.prompt.slice(0, 39)}…`
          : args.prompt
        : '';
    case 'task.delete':
    case 'task.update':
      return typeof args.taskId === 'string' ? args.taskId : '';
    case 'http.fetch':
      return typeof args.url === 'string' ? args.url : '';
    case 'js.exec':
      return typeof args.code === 'string'
        ? args.code.length > 40
          ? `${args.code.slice(0, 39)}…`
          : args.code
        : '';
    default:
      return '';
  }
}

function buildCheckpointKey(payload: {
  providerSession?: unknown;
  summaryDelta?: string;
  workspaceOverlayDigest?: string;
}): string {
  return JSON.stringify({
    providerSession:
      typeof payload.providerSession === 'string'
        ? payload.providerSession
        : null,
    summaryDelta: payload.summaryDelta ?? null,
    workspaceOverlayDigest: payload.workspaceOverlayDigest ?? null,
  });
}

export function createPersistentExecutionEventHooks(
  request: Pick<
    ExecutionRequest,
    | 'executionId'
    | 'logicalSessionId'
    | 'groupId'
    | 'workspace'
    | 'chatJid'
    | 'graphId'
    | 'taskId'
    | 'workerClass'
    | 'planFragment'
  >,
): ExecutionEventHooks {
  const workerKey = deriveTerminalWorkerKey({
    taskId: request.taskId,
    planKind: request.planFragment?.kind,
  });
  const roleTitle = request.planFragment?.fanoutRole ?? null;
  const pendingToolCalls = new Map<
    string,
    import('../terminal/terminal-panel.js').TerminalPanelTranscriptEntry
  >();

  return {
    onAck(event) {
      acknowledgeExecution(event.executionId, event.nodeId);
      ensureTerminalWorker({
        chatJid: request.chatJid,
        key: workerKey,
        taskId: request.taskId,
        roleTitle,
        backendId: 'edge',
        workerClass: request.workerClass,
        executionId: event.executionId,
        status: 'running',
        activity: 'edge runner acknowledged request',
      });
    },
    onHeartbeat(event) {
      heartbeatExecution(event.executionId, new Date(event.at));
      ensureTerminalWorker({
        chatJid: request.chatJid,
        key: workerKey,
        taskId: request.taskId,
        roleTitle,
        backendId: 'edge',
        workerClass: request.workerClass,
        executionId: event.executionId,
        status: 'running',
        activity: 'edge runner heartbeat',
        at: event.at,
      });
    },
    onProgress(event) {
      ensureTerminalWorker({
        chatJid: request.chatJid,
        key: workerKey,
        taskId: request.taskId,
        roleTitle,
        backendId: 'edge',
        workerClass: request.workerClass,
        executionId: event.executionId,
        status: 'running',
        activity: event.message,
      });
    },
    async onToolCall(event) {
      const args =
        event.args &&
        typeof event.args === 'object' &&
        !Array.isArray(event.args)
          ? (event.args as Record<string, unknown>)
          : {};
      const detail = summarizeToolArgs(event.tool, args);
      const label = detail ? `${event.tool}(${detail})` : event.tool;
      const { emitTerminalToolEvent } = await import('../channels/terminal.js');
      const entry = emitTerminalToolEvent(request.chatJid, label, {
        tool: event.tool,
        args,
        status: 'running',
      });
      if (entry) {
        pendingToolCalls.set(event.executionId, entry);
      }
    },
    async onToolResult(event) {
      const entry = pendingToolCalls.get(event.executionId);
      if (entry?.toolData) {
        const isError =
          typeof event.result === 'object' &&
          event.result !== null &&
          (('ok' in (event.result as Record<string, unknown>) &&
            (event.result as Record<string, unknown>).ok === false) ||
            'error' in (event.result as Record<string, unknown>));
        entry.toolData.result = event.result;
        entry.toolData.status = isError ? 'error' : 'success';
        pendingToolCalls.delete(event.executionId);
        const { emitTerminalRefresh } = await import('../channels/terminal.js');
        emitTerminalRefresh(request.chatJid);
      }
    },
    onWarning(event) {
      recordTerminalTimeline({
        chatJid: request.chatJid,
        targetKey: workerKey,
        text: `${workerKey} warning · ${event.message}`,
      });
    },
    onNeedsFallback(event) {
      recordTerminalFallback({
        chatJid: request.chatJid,
        reason: event.reason,
        fromBackend: 'edge',
        toBackend: event.suggestedWorkerClass ?? 'heavy',
      });
      updateTerminalTurnStage({
        chatJid: request.chatJid,
        graphId: request.graphId,
        executionId: request.executionId,
        stage: 'edge_needs_fallback',
        backendId: 'edge',
        workerClass: request.workerClass,
        activity: event.reason,
      });
    },
    onCheckpoint(event) {
      persistExecutionCheckpoint(event.executionId, {
        checkpointKey: buildCheckpointKey(event),
        providerSessionId:
          typeof event.providerSession === 'string'
            ? event.providerSession
            : null,
        summaryDelta: event.summaryDelta,
        workspaceOverlayDigest: event.workspaceOverlayDigest,
      });
      if (event.summaryDelta || event.providerSession) {
        ensureTerminalWorker({
          chatJid: request.chatJid,
          key: workerKey,
          taskId: request.taskId,
          roleTitle,
          backendId: 'edge',
          workerClass: request.workerClass,
          executionId: event.executionId,
          status: 'running',
          activity: event.summaryDelta ?? 'checkpoint persisted',
          summary: event.summaryDelta,
        });
      }
    },
    onFinal(event) {
      pendingToolCalls.clear();
      if (event.result.status === 'success') {
        completeTerminalWorker({
          chatJid: request.chatJid,
          key: workerKey,
          activity: 'edge runner completed',
          summary: event.result.outputText ?? undefined,
        });
      } else {
        failTerminalWorker({
          chatJid: request.chatJid,
          key: workerKey,
          error: event.result.error?.message || 'Edge execution failed.',
        });
      }
      if (event.result.workspaceOverlay) {
        commitWorkspaceOverlay({
          groupFolder: request.groupId,
          logicalSessionId: request.logicalSessionId,
          baseWorkspaceVersion: request.workspace.baseVersion,
          overlay: event.result.workspaceOverlay,
          operationId: `${request.executionId}:workspace-commit`,
        });
      }
    },
    onError(event) {
      pendingToolCalls.clear();
      failTerminalWorker({
        chatJid: request.chatJid,
        key: workerKey,
        error: event.message,
      });
    },
  };
}
