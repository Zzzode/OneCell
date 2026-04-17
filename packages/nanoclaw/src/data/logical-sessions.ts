/**
 * Logical session database operations.
 */

import { getDb } from './connection.js';
import type {
  LogicalSessionScopeType,
  LogicalSessionStatus,
  LogicalSessionRecord,
} from './types.js';

const LOGICAL_SESSION_SELECT = `
  SELECT
    id,
    scope_type AS scopeType,
    scope_id AS scopeId,
    provider_session_id AS providerSessionId,
    status,
    last_turn_id AS lastTurnId,
    workspace_version AS workspaceVersion,
    group_memory_version AS groupMemoryVersion,
    summary_ref AS summaryRef,
    recent_messages_window AS recentMessagesWindow,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM logical_sessions
`;

function mapLogicalSessionRow(row: {
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
}): LogicalSessionRecord {
  return row;
}

export function getLogicalSession(
  scopeType: LogicalSessionScopeType,
  scopeId: string,
): LogicalSessionRecord | undefined {
  const db = getDb();
  const row = db
    .prepare(`${LOGICAL_SESSION_SELECT} WHERE scope_type = ? AND scope_id = ?`)
    .get(scopeType, scopeId) as
    | {
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
    | undefined;
  return row ? mapLogicalSessionRow(row) : undefined;
}

export function getLogicalSessionById(
  id: string,
): LogicalSessionRecord | undefined {
  const db = getDb();
  const row = db.prepare(`${LOGICAL_SESSION_SELECT} WHERE id = ?`).get(id) as
    | {
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
    | undefined;
  return row ? mapLogicalSessionRow(row) : undefined;
}

export function listLogicalSessions(
  scopeType?: LogicalSessionScopeType,
): LogicalSessionRecord[] {
  const db = getDb();
  const rows = scopeType
    ? (db
        .prepare(
          `${LOGICAL_SESSION_SELECT} WHERE scope_type = ? ORDER BY created_at ASC`,
        )
        .all(scopeType) as Array<{
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
      }>)
    : (db
        .prepare(`${LOGICAL_SESSION_SELECT} ORDER BY created_at ASC`)
        .all() as Array<{
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
      }>);
  return rows.map(mapLogicalSessionRow);
}

export function createLogicalSession(session: LogicalSessionRecord): void {
  const db = getDb();
  db.prepare(
    `
      INSERT INTO logical_sessions (
        id,
        scope_type,
        scope_id,
        provider_session_id,
        status,
        last_turn_id,
        workspace_version,
        group_memory_version,
        summary_ref,
        recent_messages_window,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    session.id,
    session.scopeType,
    session.scopeId,
    session.providerSessionId,
    session.status,
    session.lastTurnId,
    session.workspaceVersion,
    session.groupMemoryVersion,
    session.summaryRef,
    session.recentMessagesWindow,
    session.createdAt,
    session.updatedAt,
  );
}

export function updateLogicalSession(
  id: string,
  updates: Partial<
    Pick<
      LogicalSessionRecord,
      | 'providerSessionId'
      | 'status'
      | 'lastTurnId'
      | 'workspaceVersion'
      | 'groupMemoryVersion'
      | 'summaryRef'
      | 'recentMessagesWindow'
      | 'updatedAt'
    >
  >,
): void {
  const db = getDb();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.providerSessionId !== undefined) {
    fields.push('provider_session_id = ?');
    values.push(updates.providerSessionId);
  }
  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }
  if (updates.lastTurnId !== undefined) {
    fields.push('last_turn_id = ?');
    values.push(updates.lastTurnId);
  }
  if (updates.workspaceVersion !== undefined) {
    fields.push('workspace_version = ?');
    values.push(updates.workspaceVersion);
  }
  if (updates.groupMemoryVersion !== undefined) {
    fields.push('group_memory_version = ?');
    values.push(updates.groupMemoryVersion);
  }
  if (updates.summaryRef !== undefined) {
    fields.push('summary_ref = ?');
    values.push(updates.summaryRef);
  }
  if (updates.recentMessagesWindow !== undefined) {
    fields.push('recent_messages_window = ?');
    values.push(updates.recentMessagesWindow);
  }
  if (updates.updatedAt !== undefined) {
    fields.push('updated_at = ?');
    values.push(updates.updatedAt);
  }

  if (fields.length === 0) return;

  values.push(id);
  db.prepare(
    `UPDATE logical_sessions SET ${fields.join(', ')} WHERE id = ?`,
  ).run(...values);
}
