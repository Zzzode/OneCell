/**
 * Shared type definitions for all data modules.
 * These types correspond to database table schemas.
 */

export type LogicalSessionScopeType = 'group' | 'task';
export type LogicalSessionStatus = 'active' | 'stale' | 'closed';
export type ExecutionStatus =
  | 'running'
  | 'cancel_requested'
  | 'committed'
  | 'completed'
  | 'failed'
  | 'lost';
export type TaskGraphStatus = 'ready' | 'running' | 'completed' | 'failed';
export type TaskNodeStatus = 'ready' | 'running' | 'completed' | 'failed';
export type AggregatePolicy = 'strict' | 'quorum' | 'best_effort';
export type TaskFailureClass =
  | 'routing_failure'
  | 'execution_failure'
  | 'commit_failure'
  | 'semantic_failure';

export interface TaskGraphRecord {
  graphId: string;
  requestKind: string;
  scopeType: LogicalSessionScopeType;
  scopeId: string;
  groupFolder: string;
  chatJid: string;
  logicalSessionId: string;
  rootTaskId: string;
  status: TaskGraphStatus;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskNodeRecord {
  taskId: string;
  graphId: string;
  parentTaskId: string | null;
  nodeKind: string;
  workerClass: string | null;
  backendId: string | null;
  requiredCapabilities: string[];
  routeReason: string | null;
  policyVersion: string | null;
  fallbackEligible: boolean;
  fallbackTarget: string | null;
  fallbackReason: string | null;
  failureClass: TaskFailureClass | null;
  aggregatePolicy: AggregatePolicy | null;
  quorumCount: number | null;
  status: TaskNodeStatus;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskNodeDependencyRecord {
  taskId: string;
  dependsOnTaskId: string;
  createdAt: string;
}

export interface LogicalSessionRecord {
  id: string;
  scopeType: LogicalSessionScopeType;
  scopeId: string;
  providerSessionId: string | null;
  status: LogicalSessionStatus;
  lastTurnId: string | null;
  workspaceVersion: string | null;
  groupMemoryVersion: string | null;
  summaryRef: string | null;
  recentMessagesWindow: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExecutionStateRecord {
  executionId: string;
  logicalSessionId: string;
  turnId: string;
  taskNodeId: string | null;
  groupJid: string | null;
  taskId: string | null;
  backend: string;
  edgeNodeId: string | null;
  baseWorkspaceVersion: string | null;
  leaseUntil: string;
  status: ExecutionStatus;
  lastHeartbeatAt: string | null;
  cancelRequestedAt: string | null;
  committedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExecutionCheckpointRecord {
  executionId: string;
  checkpointKey: string;
  providerSessionId: string | null;
  summaryDelta: string | null;
  workspaceOverlayDigest: string | null;
  createdAt: string;
}

export interface ToolOperationRecord {
  operationId: string;
  executionId: string;
  tool: string;
  resultJson: string;
  createdAt: string;
}

export interface WorkspaceVersionRecord {
  versionId: string;
  groupFolder: string;
  baseVersionId: string | null;
  manifestJson: string;
  createdAt: string;
}

export interface WorkspaceCommitRecord {
  operationId: string;
  groupFolder: string;
  baseVersionId: string;
  newVersionId: string;
  createdAt: string;
}

export interface ConversationMessageRecord {
  id: string;
  chatJid: string;
  sender: string;
  senderName: string;
  content: string;
  timestamp: string;
  isFromMe: boolean;
  isBotMessage: boolean;
}

export interface ChatInfo {
  jid: string;
  name: string;
  last_message_time: string;
  channel: string;
  is_group: number;
}

export function buildLogicalSessionId(
  scopeType: LogicalSessionScopeType,
  scopeId: string,
): string {
  return `${scopeType}:${scopeId}`;
}
