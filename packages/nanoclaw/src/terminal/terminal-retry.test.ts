import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearTerminalRetryState,
  getTerminalRetryState,
  setTerminalRetryState,
} from './terminal-retry.js';

describe('terminal retry state', () => {
  beforeEach(() => {
    clearTerminalRetryState();
  });

  it('stores only the latest retryable request', () => {
    setTerminalRetryState({
      groupFolder: 'terminal_canary',
      isMain: false,
      prompt: 'first prompt',
      chatJid: 'term:canary-group',
      sessionId: 'session-1',
      failureSummary: 'first error',
      error: 'first error',
      escalationReason: 'edge_timeout',
      graphId: 'graph:first',
      createdAt: '2026-04-12T00:00:01.000Z',
    });

    setTerminalRetryState({
      groupFolder: 'terminal_canary',
      isMain: false,
      prompt: 'second prompt',
      chatJid: 'term:canary-group',
      sessionId: 'session-2',
      failureSummary: 'second error',
      error: 'second error',
      escalationReason: 'edge_runtime_unhealthy',
      graphId: 'graph:second',
      createdAt: '2026-04-12T00:00:02.000Z',
    });

    expect(getTerminalRetryState()).toMatchObject({
      prompt: 'second prompt',
      sessionId: 'session-2',
      failureSummary: 'second error',
      error: 'second error',
      escalationReason: 'edge_runtime_unhealthy',
      graphId: 'graph:second',
      createdAt: '2026-04-12T00:00:02.000Z',
    });
  });

  it('clears retry state', () => {
    setTerminalRetryState({
      groupFolder: 'terminal_canary',
      isMain: false,
      prompt: 'retry me',
      chatJid: 'term:canary-group',
      sessionId: null,
      failureSummary: 'boom',
      error: 'boom',
      escalationReason: 'edge_timeout',
      graphId: 'graph:retry',
      createdAt: '2026-04-12T00:00:03.000Z',
    });

    clearTerminalRetryState();

    expect(getTerminalRetryState()).toBeNull();
  });
});
