import {
  deleteSession,
  listExecutionStates,
  listTaskGraphs,
  listTaskNodes,
  updateTaskNode,
} from '../db.js';
import {
  failExecution,
  requestExecutionCancel,
} from '../framework/execution-state.js';
import { failRootTaskGraph } from '../tasks/task-graph-state.js';
import { clearTerminalRetryState } from './terminal-retry.js';
import { resetTerminalObservability } from './terminal-observability.js';
import { logger } from '../infra/logger.js';
import {
  TERMINAL_GROUP_FOLDER,
  TERMINAL_GROUP_JID,
} from '../config/config.js';
import type { GroupQueue } from '../infra/group-queue.js';

interface TerminalRuntimeState {
  sessions: Record<string, string>;
  queue: GroupQueue;
}

let state: TerminalRuntimeState;

export function initTerminalRuntimeManager(
  deps: TerminalRuntimeState,
): void {
  state = deps;
}

export function resetTerminalSession(
  reason: 'startup' | 'command',
): void {
  delete state.sessions[TERMINAL_GROUP_FOLDER];
  deleteSession(TERMINAL_GROUP_FOLDER);
  clearTerminalRetryState();
  resetTerminalObservability();
  logger.info(
    { group: TERMINAL_GROUP_FOLDER, reason },
    'Terminal session reset',
  );
}

export function failTerminalTaskNodes(
  graphId: string,
  error: string,
): number {
  const timestamp = new Date().toISOString();
  let failedCount = 0;

  for (const node of listTaskNodes(graphId)) {
    if (node.status === 'completed' || node.status === 'failed') {
      continue;
    }
    updateTaskNode(node.taskId, {
      status: 'failed',
      error,
      updatedAt: timestamp,
    });
    failedCount += 1;
  }

  return failedCount;
}

export function cleanupTerminalRuntime(options: {
  reason: 'startup' | 'command' | 'quit' | 'interrupt';
  error: string;
  resetSession: boolean;
  finalizeExecutions: boolean;
  closeForeground: boolean;
  closeBackground: boolean;
  clearPendingMessages: boolean;
  clearPendingTasks: boolean;
}): void {
  const activeExecutions = listExecutionStates().filter(
    (execution) =>
      execution.groupJid === TERMINAL_GROUP_JID &&
      (execution.status === 'running' ||
        execution.status === 'cancel_requested'),
  );

  for (const execution of activeExecutions) {
    requestExecutionCancel(execution.executionId);
    if (options.finalizeExecutions) {
      failExecution(execution.executionId, options.error);
    }
  }

  const runningGraphs = listTaskGraphs().filter(
    (graph) =>
      (graph.chatJid === TERMINAL_GROUP_JID ||
        graph.groupFolder === TERMINAL_GROUP_FOLDER) &&
      graph.status === 'running',
  );
  let failedNodes = 0;
  for (const graph of runningGraphs) {
    failedNodes += failTerminalTaskNodes(graph.graphId, options.error);
    failRootTaskGraph(graph.graphId, graph.rootTaskId, options.error);
  }

  state.queue.resetGroup(TERMINAL_GROUP_JID, {
    closeForeground: options.closeForeground,
    closeBackground: options.closeBackground,
    clearPendingMessages: options.clearPendingMessages,
    clearPendingTasks: options.clearPendingTasks,
  });

  if (options.resetSession) {
    resetTerminalSession(options.reason === 'startup' ? 'startup' : 'command');
  }

  logger.info(
    {
      reason: options.reason,
      resetSession: options.resetSession,
      finalizeExecutions: options.finalizeExecutions,
      affectedExecutions: activeExecutions.length,
      affectedGraphs: runningGraphs.length,
      affectedNodes: failedNodes,
    },
    'Terminal runtime cleaned up',
  );
}

export function gracefulTerminalQuit(): void {
  clearTerminalRetryState();
  cleanupTerminalRuntime({
    reason: 'quit',
    error: 'Terminal session quit',
    resetSession: true,
    finalizeExecutions: false,
    closeForeground: true,
    closeBackground: true,
    clearPendingMessages: true,
    clearPendingTasks: true,
  });
}

/**
 * Interrupt the current terminal turn by cancelling active executions and task graphs.
 * Unlike gracefulTerminalQuit, this does NOT reset the session — it only stops
 * the current run so the user can start a new turn immediately.
 */
export function interruptTerminalTurn(): void {
  cleanupTerminalRuntime({
    reason: 'interrupt',
    error: 'Terminal turn interrupted',
    resetSession: false,
    finalizeExecutions: false,
    closeForeground: true,
    closeBackground: false,
    clearPendingMessages: true,
    clearPendingTasks: false,
  });
}

export function resetTerminalConversation(): void {
  cleanupTerminalRuntime({
    reason: 'command',
    error: 'Terminal session reset',
    resetSession: true,
    finalizeExecutions: false,
    closeForeground: true,
    closeBackground: true,
    clearPendingMessages: true,
    clearPendingTasks: true,
  });
}
