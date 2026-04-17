/**
 * Barrel re-export for all data modules.
 * Provides backward compatibility for `from './db.js'` imports.
 */

// Connection & lifecycle
export {
  initDatabase,
  ensureDatabaseInitialized,
  _initTestDatabase,
  _closeDatabase,
} from './connection.js';

// Types
export type {
  LogicalSessionScopeType,
  LogicalSessionStatus,
  ExecutionStatus,
  TaskGraphStatus,
  TaskNodeStatus,
  AggregatePolicy,
  TaskFailureClass,
  TaskGraphRecord,
  TaskNodeRecord,
  TaskNodeDependencyRecord,
  LogicalSessionRecord,
  ExecutionStateRecord,
  ExecutionCheckpointRecord,
  ToolOperationRecord,
  WorkspaceVersionRecord,
  WorkspaceCommitRecord,
  ConversationMessageRecord,
  ChatInfo,
} from './types.js';

export { buildLogicalSessionId } from './types.js';

// Messages
export {
  storeChatMetadata,
  updateChatName,
  getAllChats,
  getLastGroupSync,
  setLastGroupSync,
  storeMessage,
  storeMessageDirect,
  getNewMessages,
  getMessagesSince,
  getRecentConversationMessages,
  clearConversationMessages,
  getLastBotMessageTimestamp,
} from './messages.js';

// Scheduled tasks
export {
  createTask,
  getTaskById,
  getTasksForGroup,
  getAllTasks,
  updateTask,
  deleteTask,
  getDueTasks,
  updateTaskAfterRun,
  logTaskRun,
} from './scheduled-tasks.js';

// Router state
export { getRouterState, setRouterState } from './router-state.js';

// Logical sessions
export {
  getLogicalSession,
  getLogicalSessionById,
  listLogicalSessions,
  createLogicalSession,
  updateLogicalSession,
} from './logical-sessions.js';

// Execution state
export {
  getExecutionState,
  listExecutionStates,
  listExecutionStatesForTaskNode,
  listExecutionCheckpoints,
  createExecutionState,
  createExecutionCheckpoint,
  updateExecutionState,
} from './execution-state.js';

// Task graphs
export {
  getTaskGraph,
  listTaskGraphs,
  createTaskGraph,
  updateTaskGraph,
  getTaskNode,
  listTaskNodes,
  createTaskNode,
  createTaskNodeDependency,
  listTaskNodeDependencies,
  updateTaskNode,
} from './task-graphs.js';

// Tool operations
export {
  getToolOperation,
  listToolOperations,
  createToolOperation,
} from './tool-operations.js';

// Workspace versions
export {
  getWorkspaceVersion,
  listWorkspaceVersions,
  createWorkspaceVersion,
  getWorkspaceCommit,
  listWorkspaceCommits,
  createWorkspaceCommit,
} from './workspace-versions.js';

// Sessions (legacy)
export {
  getSession,
  setSession,
  deleteSession,
  getAllSessions,
} from './sessions.js';

// Registered groups
export {
  getRegisteredGroup,
  setRegisteredGroup,
  getAllRegisteredGroups,
} from './registered-groups.js';
