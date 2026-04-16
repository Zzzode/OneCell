export interface ToolTranscriptEntry {
  tool: string;
  args: Record<string, unknown>;
  result?: unknown;
  status: 'running' | 'success' | 'error';
}

export interface TerminalPanelTranscriptEntry {
  at: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  text: string;
  toolData?: ToolTranscriptEntry;
}
