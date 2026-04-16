import { describe, expect, it } from 'vitest';
import type { TerminalPanelTranscriptEntry } from './terminal-panel.js';

describe('terminal-panel types', () => {
  it('TerminalPanelTranscriptEntry accepts valid data', () => {
    const entry: TerminalPanelTranscriptEntry = {
      at: '2026-04-13T14:30:00Z',
      role: 'user',
      text: 'hello',
    };
    expect(entry.role).toBe('user');
  });
});
