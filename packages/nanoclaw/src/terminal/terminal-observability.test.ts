import { beforeEach, describe, expect, it } from 'vitest';

import {
  beginTerminalTurn,
  ensureTerminalWorker,
  recordTerminalFallback,
  recordTerminalTimeline,
  resetTerminalObservability,
  setTerminalFocus,
  updateTerminalTurnStage,
  getTerminalActiveTurnSnapshot,
  getTerminalWorkerListSnapshot,
  getTerminalFocusedTimelineSnapshot,
  getTerminalFallbackSnapshot,
  getTerminalFocusMetadata,
} from './terminal-observability.js';

const CHAT_JID = 'term:test-observability';

describe('terminal observability selectors', () => {
  beforeEach(() => {
    resetTerminalObservability(CHAT_JID);
  });

  it('returns null snapshots when no active turn exists', () => {
    expect(getTerminalActiveTurnSnapshot(CHAT_JID)).toBeNull();
    expect(getTerminalWorkerListSnapshot(CHAT_JID)).toBeNull();
    expect(getTerminalFocusedTimelineSnapshot(CHAT_JID)).toBeNull();
    expect(getTerminalFallbackSnapshot(CHAT_JID)).toBeNull();
    expect(getTerminalFocusMetadata(CHAT_JID)).toBeNull();
  });

  it('builds structured snapshots for active turn, workers, focus timeline, fallback, and focus metadata', () => {
    beginTerminalTurn({
      chatJid: CHAT_JID,
      graphId: 'graph:red-1',
      rootTaskId: 'task:red-root',
      executionId: 'exec:red-root',
      stage: 'planning',
      backendId: 'edge',
      workerClass: 'edge',
      activity: 'root planning',
      at: '2026-04-13T10:00:00.000Z',
    });

    updateTerminalTurnStage({
      chatJid: CHAT_JID,
      stage: 'fanout',
      activity: 'dispatching workers',
      at: '2026-04-13T10:00:01.000Z',
    });

    ensureTerminalWorker({
      chatJid: CHAT_JID,
      key: 'worker-2',
      taskId: 'task:red-root:child-2',
      nodeKind: 'worker',
      roleTitle: 'Research',
      backendId: 'edge',
      workerClass: 'edge',
      executionId: 'exec:red-worker-2',
      status: 'running',
      activity: 'worker two running',
      summary: 'worker two summary',
      at: '2026-04-13T10:00:02.000Z',
    });

    ensureTerminalWorker({
      chatJid: CHAT_JID,
      key: 'worker-1',
      taskId: 'task:red-root:child-1',
      nodeKind: 'worker',
      roleTitle: 'Implement',
      backendId: 'container',
      workerClass: 'heavy',
      executionId: 'exec:red-worker-1',
      status: 'failed',
      activity: 'worker one failed',
      error: 'worker one error',
      at: '2026-04-13T10:00:03.000Z',
    });

    recordTerminalTimeline({
      chatJid: CHAT_JID,
      text: 'worker-1 detailed event',
      targetKey: 'worker-1',
      at: '2026-04-13T10:00:04.000Z',
    });

    recordTerminalFallback({
      chatJid: CHAT_JID,
      fromBackend: 'edge',
      toBackend: 'container',
      reason: 'edge_runtime_unhealthy',
      detail: 'manual retry available',
      at: '2026-04-13T10:00:05.000Z',
    });

    setTerminalFocus('worker 1', CHAT_JID);

    expect(getTerminalActiveTurnSnapshot(CHAT_JID)).toEqual({
      graphId: 'graph:red-1',
      status: 'running',
      stage: 'fallback',
      backend: { backendId: 'edge', workerClass: 'edge' },
      focus: { key: 'worker-1', label: 'worker 1', status: 'failed' },
      fallback: {
        fromBackend: 'edge',
        toBackend: 'container',
        reason: 'edge_runtime_unhealthy',
        detail: 'manual retry available',
      },
      error: null,
      activity: {
        current: 'worker 1: worker one failed',
        focus: 'worker one failed',
      },
    });

    expect(getTerminalWorkerListSnapshot(CHAT_JID)).toEqual([
      {
        key: 'root',
        label: 'root',
        status: 'running',
        focused: false,
      },
      {
        key: 'worker-1',
        label: 'worker 1',
        status: 'failed',
        focused: true,
      },
      {
        key: 'worker-2',
        label: 'worker 2',
        status: 'running',
        focused: false,
      },
    ]);

    expect(getTerminalFocusedTimelineSnapshot(CHAT_JID)).toEqual({
      focusKey: 'worker-1',
      entries: [
        {
          targetKey: 'root',
          text: 'root planning',
        },
        {
          targetKey: 'root',
          text: 'dispatching workers',
        },
        {
          targetKey: 'worker-1',
          text: 'worker 1 · worker one failed',
        },
        {
          targetKey: 'worker-1',
          text: 'worker-1 detailed event',
        },
        {
          targetKey: 'root',
          text: 'fallback · edge -> container · edge_runtime_unhealthy · manual retry available',
        },
      ],
    });

    expect(getTerminalFallbackSnapshot(CHAT_JID)).toEqual({
      fromBackend: 'edge',
      toBackend: 'container',
      reason: 'edge_runtime_unhealthy',
      detail: 'manual retry available',
    });

    expect(getTerminalFocusMetadata(CHAT_JID)).toEqual({
      key: 'worker-1',
      label: 'worker 1',
    });
  });

  it('bounds focused timeline snapshots to the visible focus window', () => {
    beginTerminalTurn({
      chatJid: CHAT_JID,
      graphId: 'graph:red-2',
      rootTaskId: 'task:red-root-2',
      executionId: 'exec:red-root-2',
      stage: 'planning',
      backendId: 'edge',
      workerClass: 'edge',
      activity: 'root event 1',
      at: '2026-04-13T11:00:00.000Z',
    });

    ensureTerminalWorker({
      chatJid: CHAT_JID,
      key: 'worker-1',
      taskId: 'task:red-root-2:child-1',
      nodeKind: 'worker',
      backendId: 'edge',
      workerClass: 'edge',
      executionId: 'exec:red-worker-1',
      status: 'running',
      activity: 'worker event 1',
      at: '2026-04-13T11:00:01.000Z',
    });

    recordTerminalTimeline({
      chatJid: CHAT_JID,
      text: 'worker event 2',
      targetKey: 'worker-1',
      at: '2026-04-13T11:00:02.000Z',
    });
    recordTerminalTimeline({
      chatJid: CHAT_JID,
      text: 'root event 2',
      targetKey: 'root',
      at: '2026-04-13T11:00:03.000Z',
    });
    recordTerminalTimeline({
      chatJid: CHAT_JID,
      text: 'worker event 3',
      targetKey: 'worker-1',
      at: '2026-04-13T11:00:04.000Z',
    });
    recordTerminalTimeline({
      chatJid: CHAT_JID,
      text: 'root event 3',
      targetKey: 'root',
      at: '2026-04-13T11:00:05.000Z',
    });
    recordTerminalTimeline({
      chatJid: CHAT_JID,
      text: 'worker event 4',
      targetKey: 'worker-1',
      at: '2026-04-13T11:00:06.000Z',
    });
    recordTerminalTimeline({
      chatJid: CHAT_JID,
      text: 'root event 4',
      targetKey: 'root',
      at: '2026-04-13T11:00:07.000Z',
    });
    recordTerminalTimeline({
      chatJid: CHAT_JID,
      text: 'worker event 5',
      targetKey: 'worker-1',
      at: '2026-04-13T11:00:08.000Z',
    });
    recordTerminalTimeline({
      chatJid: CHAT_JID,
      text: 'root event 5',
      targetKey: 'root',
      at: '2026-04-13T11:00:09.000Z',
    });
    recordTerminalTimeline({
      chatJid: CHAT_JID,
      text: 'worker event 6',
      targetKey: 'worker-1',
      at: '2026-04-13T11:00:10.000Z',
    });

    setTerminalFocus('worker 1', CHAT_JID);

    expect(getTerminalFocusedTimelineSnapshot(CHAT_JID)).toEqual({
      focusKey: 'worker-1',
      entries: [
        { targetKey: 'root', text: 'root event 2' },
        { targetKey: 'worker-1', text: 'worker event 3' },
        { targetKey: 'root', text: 'root event 3' },
        { targetKey: 'worker-1', text: 'worker event 4' },
        { targetKey: 'root', text: 'root event 4' },
        { targetKey: 'worker-1', text: 'worker event 5' },
        { targetKey: 'root', text: 'root event 5' },
        { targetKey: 'worker-1', text: 'worker event 6' },
      ],
    });
  });
});
