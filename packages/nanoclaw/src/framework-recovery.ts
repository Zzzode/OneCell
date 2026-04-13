import { requireReplanForTaskNode, type TaskFallbackReason } from './task-graph-state.js';

export type RuntimeRecoveryDecision =
  | { kind: 'none' }
  | {
      kind: 'explicit_container_retry';
      reason: Extract<
        TaskFallbackReason,
        'edge_timeout' | 'edge_runtime_unhealthy'
      >;
    }
  | {
      kind: 'replan';
      reason: Extract<TaskFallbackReason, 'state_conflict_requires_heavy'>;
    };

export function classifyRuntimeRecovery(options: {
  error: string;
  workerClass: 'edge' | 'heavy';
  fallbackEligible: boolean;
  visibleOutputEmitted?: boolean;
}): RuntimeRecoveryDecision {
  if (!options.error.trim()) {
    return { kind: 'none' };
  }

  if (/workspace version conflict/i.test(options.error)) {
    return {
      kind: 'replan',
      reason: 'state_conflict_requires_heavy',
    };
  }

  if (
    options.workerClass !== 'edge' ||
    !options.fallbackEligible ||
    options.visibleOutputEmitted === true ||
    /cancelled before completion/i.test(options.error)
  ) {
    return { kind: 'none' };
  }

  return {
    kind: 'explicit_container_retry',
    reason: /deadline|timeout/i.test(options.error)
      ? 'edge_timeout'
      : 'edge_runtime_unhealthy',
  };
}

export function markTaskNodeForReplan(
  taskNodeId: string,
  reason: Extract<TaskFallbackReason, 'state_conflict_requires_heavy'>,
  now: Date = new Date(),
): void {
  requireReplanForTaskNode(taskNodeId, reason, now);
}
