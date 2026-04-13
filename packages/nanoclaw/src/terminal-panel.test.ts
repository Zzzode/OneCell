import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getTerminalTurnState } = vi.hoisted(() => ({
  getTerminalTurnState: vi.fn(),
}));

vi.mock('./terminal-observability.js', () => ({
  getTerminalTurnState,
}));

import { buildTerminalPanel } from './terminal-panel.js';

function stripAnsi(value: string): string {
  return value.replace(/\x1b\[[0-9;]*m/g, '');
}

describe('buildTerminalPanel', () => {
  beforeEach(() => {
    getTerminalTurnState.mockReset();
    getTerminalTurnState.mockReturnValue(null);
  });

  it('renders an idle frame with a terminal-native header and light section titles', () => {
    const panel = stripAnsi(
      buildTerminalPanel({
        statusLine:
          'edge · openai-compatible · glm-5 · terminal_canary · 1 running · 1 scheduled',
        busy: false,
        recentTranscript: [
          { at: '2026-04-13T12:00:00.000Z', role: 'user', text: '你好' },
          { at: '2026-04-13T12:00:01.000Z', role: 'assistant', text: '我在。' },
        ],
        width: 92,
        height: 26,
      }),
    );

    expect(panel).toContain('NanoClaw terminal');
    expect(panel).toContain('Transcript');
    expect(panel).toContain('Status');
    expect(panel).toContain('Recent system');
    expect(panel).toContain('Shift+');
    expect(panel).not.toContain('[ Transcript ]');
    expect(panel).not.toContain('--------------------------------');
  });

  it('renders an active frame with transcript-first layout and summary columns', () => {
    getTerminalTurnState.mockReturnValue({
      chatJid: 'term:canary-group',
      graphId: 'graph:redesign-1',
      rootTaskId: 'task:redesign-root',
      executionId: 'exec:redesign-root',
      status: 'running',
      stage: 'planning',
      backendId: 'edge',
      workerClass: 'edge',
      startedAt: '2026-04-13T12:00:00.000Z',
      updatedAt: '2026-04-13T12:00:05.000Z',
      lastActivity: 'Refining terminal layout',
      error: null,
      fallback: null,
      focusKey: 'worker-1',
      workers: new Map([
        [
          'root',
          {
            key: 'root',
            label: 'root',
            taskId: 'task:redesign-root',
            nodeKind: 'root',
            roleTitle: null,
            status: 'running',
            backendId: 'edge',
            workerClass: 'edge',
            executionId: 'exec:redesign-root',
            startedAt: '2026-04-13T12:00:00.000Z',
            updatedAt: '2026-04-13T12:00:05.000Z',
            lastActivity: 'Planning',
            summary: null,
            error: null,
          },
        ],
        [
          'worker-1',
          {
            key: 'worker-1',
            label: 'worker 1',
            taskId: 'task:redesign-root:child-1',
            nodeKind: 'fanout_child',
            roleTitle: 'UI',
            status: 'running',
            backendId: 'edge',
            workerClass: 'edge',
            executionId: 'exec:redesign-worker-1',
            startedAt: '2026-04-13T12:00:01.000Z',
            updatedAt: '2026-04-13T12:00:05.000Z',
            lastActivity: 'Restyling transcript',
            summary: 'Transcript hierarchy refined',
            error: null,
          },
        ],
      ]),
      timeline: [
        {
          at: '2026-04-13T12:00:02.000Z',
          targetKey: 'root',
          text: 'planner accepted visual direction',
        },
        {
          at: '2026-04-13T12:00:03.000Z',
          targetKey: 'worker-1',
          text: 'worker 1 · restyling transcript',
        },
      ],
    });

    const panel = stripAnsi(
      buildTerminalPanel({
        statusLine:
          'edge · openai-compatible · glm-5 · terminal_canary · 1 running · 1 scheduled',
        busy: true,
        recentTranscript: [
          {
            at: '2026-04-13T12:00:00.000Z',
            role: 'user',
            text: '把 UI 改漂亮一点',
          },
          {
            at: '2026-04-13T12:00:04.000Z',
            role: 'assistant',
            text: '我先重做结构和层级。',
          },
        ],
        width: 104,
        height: 28,
      }),
    );

    expect(panel).toContain('Transcript');
    expect(panel).toContain('Current');
    expect(panel).toContain('Agents');
    expect(panel).toContain('Progress');
    expect(panel).toContain('把 UI 改漂亮一点');
    expect(panel).toContain('我先重做结构和层级。');
    expect(panel).toContain('worker 1');
    expect(panel).not.toContain('[ Current ]');
  });
});
