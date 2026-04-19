import { describe, expect, it } from 'vitest';

import { classifyRuntimeRecovery } from './framework-recovery.js';

describe('framework recovery', () => {
  it('classifies edge runtime failures for explicit container retry', () => {
    expect(
      classifyRuntimeRecovery({
        error: 'Edge execution exceeded deadline of 100ms.',
        workerClass: 'edge',
        fallbackEligible: true,
      }),
    ).toEqual({
      kind: 'explicit_container_retry',
      reason: 'edge_timeout',
    });

    expect(
      classifyRuntimeRecovery({
        error: 'Edge runner finished without a final event.',
        workerClass: 'edge',
        fallbackEligible: true,
      }),
    ).toEqual({
      kind: 'explicit_container_retry',
      reason: 'edge_runtime_unhealthy',
    });
  });

  it('returns none for guard branches that suppress explicit retry', () => {
    expect(
      classifyRuntimeRecovery({
        error: 'Edge execution exceeded deadline of 100ms.',
        workerClass: 'heavy',
        fallbackEligible: true,
      }),
    ).toEqual({ kind: 'none' });

    expect(
      classifyRuntimeRecovery({
        error: 'Edge execution exceeded deadline of 100ms.',
        workerClass: 'edge',
        fallbackEligible: false,
      }),
    ).toEqual({ kind: 'none' });

    expect(
      classifyRuntimeRecovery({
        error: 'Edge execution cancelled before completion.',
        workerClass: 'edge',
        fallbackEligible: true,
      }),
    ).toEqual({ kind: 'none' });

    expect(
      classifyRuntimeRecovery({
        error: '   ',
        workerClass: 'edge',
        fallbackEligible: true,
      }),
    ).toEqual({ kind: 'none' });

    expect(
      classifyRuntimeRecovery({
        error: 'Edge execution exceeded deadline of 100ms.',
        workerClass: 'edge',
        fallbackEligible: true,
        visibleOutputEmitted: true,
      }),
    ).toEqual({ kind: 'none' });
  });

  it('keeps workspace conflicts on replan even when timeout text is present', () => {
    expect(
      classifyRuntimeRecovery({
        error:
          'Workspace version conflict: expected a, received b after timeout waiting for edge execution.',
        workerClass: 'edge',
        fallbackEligible: true,
      }),
    ).toEqual({
      kind: 'replan',
      reason: 'state_conflict_requires_heavy',
    });
  });
});
