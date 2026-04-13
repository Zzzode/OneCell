export interface TerminalPanelTranscriptEntry {
  at: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
}
