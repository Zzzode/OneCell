/**
 * Execution state database operations.
 */

import { getDb } from './connection.js';
import type {
  ExecutionStatus,
  ExecutionStateRecord,
  ExecutionCheckpointRecord,
} from './types.js';

const EXECUTION_STATE_SELECT = `
  SELECT
    execution_id AS executionId,
    logical_session_id AS logicalSessionId,
    turn_id AS turnId,
    task_node_id AS taskNodeId,
    group_jid AS groupJid,
    task_id AS taskId,
    backend,
    edge_node_id AS edgeNodeId,
    base_workspace_version AS baseWorkspaceVersion,
    lease_until AS leaseUntil,
    status,
    last_heartbeat_at AS lastHeartbeatAt,
    cancel_requested_at AS cancelRequestedAt,
    committed_at AS committedAt,
    finished_at AS finishedAt,
    error,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM execution_state
`;

const EXECUTION_CHECKPOINT_SELECT = `
  SELECT
    execution_id AS executionId,
    checkpoint_key AS checkpointKey,
    provider_session_id AS providerSessionId,
    summary_delta AS summaryDelta,
    workspace_overlay_digest AS workspaceOverlayDigest,
    created_at AS createdAt
  FROM execution_checkpoints
`;

function mapExecutionStateRow(row: {
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
}): ExecutionStateRecord {
  return row;
}

function mapExecutionCheckpointRow(row: {
  executionId: string;
  checkpointKey: string;
  providerSessionId: string | null;
  summaryDelta: string | null;
  workspaceOverlayDigest: string | null;
  createdAt: string;
}): ExecutionCheckpointRecord {
  return row;
}

export function getExecutionState(
  executionId: string,
): ExecutionStateRecord | undefined {
  const db = getDb();
  const row = db
    .prepare(`${EXECUTION_STATE_SELECT} WHERE execution_id = ?`)
    .get(executionId) as
    | {
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
    | undefined;
  return row ? mapExecutionStateRow(row) : undefined;
}

export function listExecutionStates(
  status?: ExecutionStatus,
): ExecutionStateRecord[] {
  const db = getDb();
  const rows = status
    ? (db
        .prepare(
          `${EXECUTION_STATE_SELECT} WHERE status = ? ORDER BY created_at ASC`,
        )
        .all(status) as Array<{
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
      }>)
    : (db
        .prepare(`${EXECUTION_STATE_SELECT} ORDER BY created_at ASC`)
        .all() as Array<{
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
      }>);
  return rows.map(mapExecutionStateRow);
}

export function listExecutionStatesForTaskNode(
  taskNodeId: string,
): ExecutionStateRecord[] {
  const db = getDb();
  const rows = db
    .prepare(
      `${EXECUTION_STATE_SELECT} WHERE task_node_id = ? ORDER BY created_at ASC`,
    )
    .all(taskNodeId) as Array<{
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
  }>;
  return rows.map(mapExecutionStateRow);
}

export function listExecutionCheckpoints(
  executionId?: string,
): ExecutionCheckpointRecord[] {
  const db = getDb();
  const rows = executionId
    ? (db
        .prepare(
          `${EXECUTION_CHECKPOINT_SELECT} WHERE execution_id = ? ORDER BY created_at ASC`,
        )
        .all(executionId) as Array<{
        executionId: string;
        checkpointKey: string;
        providerSessionId: string | null;
        summaryDelta: string | null;
        workspaceOverlayDigest: string | null;
        createdAt: string;
      }>)
    : (db
        .prepare(`${EXECUTION_CHECKPOINT_SELECT} ORDER BY created_at ASC`)
        .all() as Array<{
        executionId: string;
        checkpointKey: string;
        providerSessionId: string | null;
        summaryDelta: string | null;
        workspaceOverlayDigest: string | null;
        createdAt: string;
      }>);

  return rows.map(mapExecutionCheckpointRow);
}

export function createExecutionState(record: ExecutionStateRecord): void {
  const db = getDb();
  db.prepare(
    `
      INSERT INTO execution_state (
        execution_id,
        logical_session_id,
        turn_id,
        task_node_id,
        group_jid,
        task_id,
        backend,
        edge_node_id,
        base_workspace_version,
        lease_until,
        status,
        last_heartbeat_at,
        cancel_requested_at,
        committed_at,
        finished_at,
        error,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    record.executionId,
    record.logicalSessionId,
    record.turnId,
    record.taskNodeId,
    record.groupJid,
    record.taskId,
    record.backend,
    record.edgeNodeId,
    record.baseWorkspaceVersion,
    record.leaseUntil,
    record.status,
    record.lastHeartbeatAt,
    record.cancelRequestedAt,
    record.committedAt,
    record.finishedAt,
    record.error,
    record.createdAt,
    record.updatedAt,
  );
}

export function createExecutionCheckpoint(
  record: ExecutionCheckpointRecord,
): void {
  const db = getDb();
  db.prepare(
    `
      INSERT OR IGNORE INTO execution_checkpoints (
        execution_id,
        checkpoint_key,
        provider_session_id,
        summary_delta,
        workspace_overlay_digest,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `,
  ).run(
    record.executionId,
    record.checkpointKey,
    record.providerSessionId,
    record.summaryDelta,
    record.workspaceOverlayDigest,
    record.createdAt,
  );
}

export function updateExecutionState(
  executionId: string,
  updates: Partial<
    Pick<
      ExecutionStateRecord,
      | 'taskNodeId'
      | 'backend'
      | 'edgeNodeId'
      | 'baseWorkspaceVersion'
      | 'leaseUntil'
      | 'status'
      | 'lastHeartbeatAt'
      | 'cancelRequestedAt'
      | 'committedAt'
      | 'finishedAt'
      | 'error'
      | 'updatedAt'
    >
  >,
): void {
  const db = getDb();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.taskNodeId !== undefined) {
    fields.push('task_node_id = ?');
    values.push(updates.taskNodeId);
  }
  if (updates.backend !== undefined) {
    fields.push('backend = ?');
    values.push(updates.backend);
  }
  if (updates.edgeNodeId !== undefined) {
    fields.push('edge_node_id = ?');
    values.push(updates.edgeNodeId);
  }
  if (updates.baseWorkspaceVersion !== undefined) {
    fields.push('base_workspace_version = ?');
    values.push(updates.baseWorkspaceVersion);
  }
  if (updates.leaseUntil !== undefined) {
    fields.push('lease_until = ?');
    values.push(updates.leaseUntil);
  }
  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }
  if (updates.lastHeartbeatAt !== undefined) {
    fields.push('last_heartbeat_at = ?');
    values.push(updates.lastHeartbeatAt);
  }
  if (updates.cancelRequestedAt !== undefined) {
    fields.push('cancel_requested_at = ?');
    values.push(updates.cancelRequestedAt);
  }
  if (updates.committedAt !== undefined) {
    fields.push('committed_at = ?');
    values.push(updates.committedAt);
  }
  if (updates.finishedAt !== undefined) {
    fields.push('finished_at = ?');
    values.push(updates.finishedAt);
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

  values.push(executionId);
  db.prepare(
    `UPDATE execution_state SET ${fields.join(', ')} WHERE execution_id = ?`,
  ).run(...values);
}
