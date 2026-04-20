import { describe, expect, it } from 'vitest';
import {
  createTranscriptEntry,
  normalizeToolTranscriptEntry,
  type TerminalPanelTranscriptEntry,
} from './terminal-panel.js';

describe('terminal-panel types', () => {
  it('TerminalPanelTranscriptEntry accepts valid data', () => {
    const entry: TerminalPanelTranscriptEntry = {
      at: '2026-04-13T14:30:00Z',
      role: 'user',
      text: 'hello',
    };
    expect(entry.role).toBe('user');
  });

  it('createTranscriptEntry trims text and preserves turn id', () => {
    const entry = createTranscriptEntry({
      role: 'assistant',
      text: '  hi  ',
      turnId: 'turn:1',
    });
    expect(entry.text).toBe('hi');
    expect(entry.turnId).toBe('turn:1');
  });

  it('normalizeToolTranscriptEntry keeps finite order only', () => {
    const normalized = normalizeToolTranscriptEntry({
      tool: 'workspace.read',
      args: { path: 'a.ts' },
      status: 'running',
      order: Number.NaN,
      turnId: 'turn:2',
    });
    expect(normalized.order).toBeUndefined();
    expect(normalized.turnId).toBe('turn:2');
  });
});
