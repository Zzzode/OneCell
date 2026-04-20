export type TerminalTranscriptRole = 'user' | 'assistant' | 'system' | 'tool';
export type ToolTranscriptStatus = 'running' | 'success' | 'error';

export interface ToolTranscriptEntry {
  tool: string;
  args: Record<string, unknown>;
  result?: unknown;
  status: ToolTranscriptStatus;
  order?: number;
  turnId?: string;
}

export interface TerminalPanelTranscriptEntry {
  at: string;
  role: TerminalTranscriptRole;
  text: string;
  toolData?: ToolTranscriptEntry;
  turnId?: string;
}

export function createTranscriptEntry(input: {
  at?: string;
  role: TerminalTranscriptRole;
  text: string;
  toolData?: ToolTranscriptEntry;
  turnId?: string;
}): TerminalPanelTranscriptEntry {
  return {
    at: input.at ?? new Date().toISOString(),
    role: input.role,
    text: input.text.trim(),
    toolData: input.toolData,
    turnId: input.turnId,
  };
}

export function normalizeToolTranscriptEntry(
  toolData: ToolTranscriptEntry,
): ToolTranscriptEntry {
  return {
    ...toolData,
    status: toolData.status,
    order:
      typeof toolData.order === 'number' && Number.isFinite(toolData.order)
        ? toolData.order
        : undefined,
    turnId: toolData.turnId,
  };
}
