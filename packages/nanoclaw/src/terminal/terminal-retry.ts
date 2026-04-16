export interface TerminalRetryState {
  prompt: string;
  groupFolder: string;
  chatJid: string;
  isMain: boolean;
  sessionId: string | null;
  failureSummary: string;
  error: string;
  escalationReason: 'edge_timeout' | 'edge_runtime_unhealthy';
  graphId: string;
  createdAt: string;
}

let latestRetryState: TerminalRetryState | null = null;

export function setTerminalRetryState(state: TerminalRetryState): void {
  latestRetryState = state;
}

export function getTerminalRetryState(): TerminalRetryState | null {
  return latestRetryState;
}

export function clearTerminalRetryState(): void {
  latestRetryState = null;
}
