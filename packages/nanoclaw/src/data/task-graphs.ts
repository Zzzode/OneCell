/**
 * Task graph database operations.
 */

import { getDb } from './connection.js';
import type {
  LogicalSessionScopeType,
  TaskGraphStatus,
  TaskNodeStatus,
  AggregatePolicy,
  TaskFailureClass,
  TaskGraphRecord,
  TaskNodeRecord,
  TaskNodeDependencyRecord,
} from './types.js';

const TASK_GRAPH_SELECT = `
  SELECT
    graph_id AS graphId,
    request_kind AS requestKind,
    scope_type AS scopeType,
    scope_id AS scopeId,
    group_folder AS groupFolder,
    chat_jid AS chatJid,
    logical_session_id AS logicalSessionId,
    root_task_id AS rootTaskId,
    status,
    error,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM task_graphs
`;

const TASK_NODE_SELECT = `
  SELECT
    task_id AS taskId,
    graph_id AS graphId,
    parent_task_id AS parentTaskId,
    node_kind AS nodeKind,
    worker_class AS workerClass,
    backend_id AS backendId,
    required_capabilities_json AS requiredCapabilitiesJson,
    route_reason AS routeReason,
    policy_version AS policyVersion,
    fallback_eligible AS fallbackEligible,
    fallback_target AS fallbackTarget,
    fallback_reason AS fallbackReason,
    failure_class AS failureClass,
    aggregate_policy AS aggregatePolicy,
    quorum_count AS quorumCount,
    status,
    error,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM task_nodes
`;

const TASK_NODE_DEPENDENCY_SELECT = `
  SELECT
    task_id AS taskId,
    depends_on_task_id AS dependsOnTaskId,
    created_at AS createdAt
  FROM task_node_dependencies
`;

function mapTaskGraphRow(row: {
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
}): TaskGraphRecord {
  return row;
}

function mapTaskNodeRow(row: {
  taskId: string;
  graphId: string;
  parentTaskId: string | null;
  nodeKind: string;
  workerClass: string | null;
  backendId: string | null;
  requiredCapabilitiesJson: string | null;
  routeReason: string | null;
  policyVersion: string | null;
  fallbackEligible: number;
  fallbackTarget: string | null;
  fallbackReason: string | null;
  failureClass: TaskFailureClass | null;
  aggregatePolicy: AggregatePolicy | null;
  quorumCount: number | null;
  status: TaskNodeStatus;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}): TaskNodeRecord {
  let requiredCapabilities: string[] = [];
  if (row.requiredCapabilitiesJson) {
    try {
      const parsed = JSON.parse(row.requiredCapabilitiesJson) as unknown;
      if (Array.isArray(parsed)) {
        requiredCapabilities = parsed.filter(
          (value): value is string => typeof value === 'string',
        );
      }
    } catch {
      requiredCapabilities = [];
    }
  }

  return {
    taskId: row.taskId,
    graphId: row.graphId,
    parentTaskId: row.parentTaskId,
    nodeKind: row.nodeKind,
    workerClass: row.workerClass,
    backendId: row.backendId,
    requiredCapabilities,
    routeReason: row.routeReason,
    policyVersion: row.policyVersion,
    fallbackEligible: row.fallbackEligible === 1,
    fallbackTarget: row.fallbackTarget,
    fallbackReason: row.fallbackReason,
    failureClass: row.failureClass,
    aggregatePolicy: row.aggregatePolicy,
    quorumCount: row.quorumCount,
    status: row.status,
    error: row.error,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapTaskNodeDependencyRow(row: {
  taskId: string;
  dependsOnTaskId: string;
  createdAt: string;
}): TaskNodeDependencyRecord {
  return row;
}

export function getTaskGraph(graphId: string): TaskGraphRecord | undefined {
  const db = getDb();
  const row = db
    .prepare(`${TASK_GRAPH_SELECT} WHERE graph_id = ?`)
    .get(graphId) as
    | {
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
    | undefined;
  return row ? mapTaskGraphRow(row) : undefined;
}

export function listTaskGraphs(status?: TaskGraphStatus): TaskGraphRecord[] {
  const db = getDb();
  const rows = status
    ? (db
        .prepare(
          `${TASK_GRAPH_SELECT} WHERE status = ? ORDER BY created_at ASC`,
        )
        .all(status) as Array<{
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
      }>)
    : (db
        .prepare(`${TASK_GRAPH_SELECT} ORDER BY created_at ASC`)
        .all() as Array<{
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
      }>);
  return rows.map(mapTaskGraphRow);
}

export function createTaskGraph(record: TaskGraphRecord): void {
  const db = getDb();
  db.prepare(
    `
      INSERT INTO task_graphs (
        graph_id,
        request_kind,
        scope_type,
        scope_id,
        group_folder,
        chat_jid,
        logical_session_id,
        root_task_id,
        status,
        error,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    record.graphId,
    record.requestKind,
    record.scopeType,
    record.scopeId,
    record.groupFolder,
    record.chatJid,
    record.logicalSessionId,
    record.rootTaskId,
    record.status,
    record.error,
    record.createdAt,
    record.updatedAt,
  );
}

export function updateTaskGraph(
  graphId: string,
  updates: Partial<Pick<TaskGraphRecord, 'status' | 'error' | 'updatedAt'>>,
): void {
  const db = getDb();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }
  if (updates.error !== undefined) {
    fields.push('error = ?');
    values.push(updates.error);
  }
  if (updates.updatedAt !== undefined) {
    fields.push('updated_at = ?');
    values.push(updates.updatedAt);
  }

  if (fields.length === 0) return;
  values.push(graphId);
  db.prepare(
    `UPDATE task_graphs SET ${fields.join(', ')} WHERE graph_id = ?`,
  ).run(...values);
}

export function getTaskNode(taskId: string): TaskNodeRecord | undefined {
  const db = getDb();
  const row = db
    .prepare(`${TASK_NODE_SELECT} WHERE task_id = ?`)
    .get(taskId) as
    | {
        taskId: string;
        graphId: string;
        parentTaskId: string | null;
        nodeKind: string;
        workerClass: string | null;
        backendId: string | null;
        requiredCapabilitiesJson: string | null;
        routeReason: string | null;
        policyVersion: string | null;
        fallbackEligible: number;
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
    | undefined;
  return row ? mapTaskNodeRow(row) : undefined;
}

export function listTaskNodes(graphId?: string): TaskNodeRecord[] {
  const db = getDb();
  const rows = graphId
    ? (db
        .prepare(
          `${TASK_NODE_SELECT} WHERE graph_id = ? ORDER BY created_at ASC`,
        )
        .all(graphId) as Array<{
        taskId: string;
        graphId: string;
        parentTaskId: string | null;
        nodeKind: string;
        workerClass: string | null;
        backendId: string | null;
        requiredCapabilitiesJson: string | null;
        routeReason: string | null;
        policyVersion: string | null;
        fallbackEligible: number;
        fallbackTarget: string | null;
        fallbackReason: string | null;
        failureClass: TaskFailureClass | null;
        aggregatePolicy: AggregatePolicy | null;
        quorumCount: number | null;
        status: TaskNodeStatus;
        error: string | null;
        createdAt: string;
        updatedAt: string;
      }>)
    : (db
        .prepare(`${TASK_NODE_SELECT} ORDER BY created_at ASC`)
        .all() as Array<{
        taskId: string;
        graphId: string;
        parentTaskId: string | null;
        nodeKind: string;
        workerClass: string | null;
        backendId: string | null;
        requiredCapabilitiesJson: string | null;
        routeReason: string | null;
        policyVersion: string | null;
        fallbackEligible: number;
        fallbackTarget: string | null;
        fallbackReason: string | null;
        failureClass: TaskFailureClass | null;
        aggregatePolicy: AggregatePolicy | null;
        quorumCount: number | null;
        status: TaskNodeStatus;
        error: string | null;
        createdAt: string;
        updatedAt: string;
      }>);
  return rows.map(mapTaskNodeRow);
}

export function createTaskNode(record: TaskNodeRecord): void {
  const db = getDb();
  db.prepare(
    `
      INSERT INTO task_nodes (
        task_id,
        graph_id,
        parent_task_id,
        node_kind,
        worker_class,
        backend_id,
        required_capabilities_json,
        route_reason,
        policy_version,
        fallback_eligible,
        fallback_target,
        fallback_reason,
        failure_class,
        aggregate_policy,
        quorum_count,
        status,
        error,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    record.taskId,
    record.graphId,
    record.parentTaskId,
    record.nodeKind,
    record.workerClass,
    record.backendId,
    JSON.stringify(record.requiredCapabilities),
    record.routeReason,
    record.policyVersion,
    record.fallbackEligible ? 1 : 0,
    record.fallbackTarget,
    record.fallbackReason,
    record.failureClass,
    record.aggregatePolicy,
    record.quorumCount,
    record.status,
    record.error,
    record.createdAt,
    record.updatedAt,
  );
}

export function createTaskNodeDependency(
  record: TaskNodeDependencyRecord,
): void {
  const db = getDb();
  db.prepare(
    `
      INSERT OR IGNORE INTO task_node_dependencies (
        task_id,
        depends_on_task_id,
        created_at
      )
      VALUES (?, ?, ?)
    `,
  ).run(record.taskId, record.dependsOnTaskId, record.createdAt);
}

export function listTaskNodeDependencies(
  taskId?: string,
): TaskNodeDependencyRecord[] {
  const db = getDb();
  const rows = taskId
    ? (db
        .prepare(
          `${TASK_NODE_DEPENDENCY_SELECT} WHERE task_id = ? ORDER BY created_at ASC`,
        )
        .all(taskId) as Array<{
        taskId: string;
        dependsOnTaskId: string;
        createdAt: string;
      }>)
    : (db
        .prepare(`${TASK_NODE_DEPENDENCY_SELECT} ORDER BY created_at ASC`)
        .all() as Array<{
        taskId: string;
        dependsOnTaskId: string;
        createdAt: string;
      }>);
  return rows.map(mapTaskNodeDependencyRow);
}

export function updateTaskNode(
  taskId: string,
  updates: Partial<
    Pick<
      TaskNodeRecord,
      | 'workerClass'
      | 'backendId'
      | 'requiredCapabilities'
      | 'routeReason'
      | 'policyVersion'
      | 'fallbackEligible'
      | 'fallbackTarget'
      | 'fallbackReason'
      | 'failureClass'
      | 'aggregatePolicy'
      | 'quorumCount'
      | 'status'
      | 'error'
      | 'updatedAt'
    >
  >,
): void {
  const db = getDb();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.workerClass !== undefined) {
    fields.push('worker_class = ?');
    values.push(updates.workerClass);
  }
  if (updates.backendId !== undefined) {
    fields.push('backend_id = ?');
    values.push(updates.backendId);
  }
  if (updates.requiredCapabilities !== undefined) {
    fields.push('required_capabilities_json = ?');
    values.push(JSON.stringify(updates.requiredCapabilities));
  }
  if (updates.routeReason !== undefined) {
    fields.push('route_reason = ?');
    values.push(updates.routeReason);
  }
  if (updates.policyVersion !== undefined) {
    fields.push('policy_version = ?');
    values.push(updates.policyVersion);
  }
  if (updates.fallbackEligible !== undefined) {
    fields.push('fallback_eligible = ?');
    values.push(updates.fallbackEligible ? 1 : 0);
  }
  if (updates.fallbackTarget !== undefined) {
    fields.push('fallback_target = ?');
    values.push(updates.fallbackTarget);
  }
  if (updates.fallbackReason !== undefined) {
    fields.push('fallback_reason = ?');
    values.push(updates.fallbackReason);
  }
  if (updates.failureClass !== undefined) {
    fields.push('failure_class = ?');
    values.push(updates.failureClass);
  }
  if (updates.aggregatePolicy !== undefined) {
    fields.push('aggregate_policy = ?');
    values.push(updates.aggregatePolicy);
  }
  if (updates.quorumCount !== undefined) {
    fields.push('quorum_count = ?');
    values.push(updates.quorumCount);
  }
  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }
  if (updates.error !== undefined) {
    fields.push('error = ?');
    values.push(updates.error);
  }
  if (updates.updatedAt !== undefined) {
    fields.push('updated_at = ?');
    values.push(updates.updatedAt);
  }

  if (fields.length === 0) return;
  values.push(taskId);
  db.prepare(
    `UPDATE task_nodes SET ${fields.join(', ')} WHERE task_id = ?`,
  ).run(...values);
}
