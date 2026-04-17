/**
 * Legacy session database operations.
 * These bridge the old sessions table to the new logical_sessions table.
 */

import { getDb } from './connection.js';
import { buildLogicalSessionId } from './types.js';
import {
  getLogicalSession,
  getLogicalSessionById,
  createLogicalSession,
  updateLogicalSession,
  listLogicalSessions,
} from './logical-sessions.js';

export function getSession(groupFolder: string): string | undefined {
  const db = getDb();
  const logicalSession = getLogicalSession('group', groupFolder);
  if (logicalSession?.providerSessionId) {
    return logicalSession.providerSessionId;
  }

  const row = db
    .prepare('SELECT session_id FROM sessions WHERE group_folder = ?')
    .get(groupFolder) as { session_id: string } | undefined;
  return row?.session_id;
}

export function setSession(groupFolder: string, sessionId: string): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    'INSERT OR REPLACE INTO sessions (group_folder, session_id) VALUES (?, ?)',
  ).run(groupFolder, sessionId);

  const logicalSessionId = buildLogicalSessionId('group', groupFolder);
  const existing = getLogicalSessionById(logicalSessionId);
  if (existing) {
    updateLogicalSession(logicalSessionId, {
      providerSessionId: sessionId,
      status: 'active',
      updatedAt: now,
    });
    return;
  }

  createLogicalSession({
    id: logicalSessionId,
    scopeType: 'group',
    scopeId: groupFolder,
    providerSessionId: sessionId,
    status: 'active',
    lastTurnId: null,
    workspaceVersion: null,
    groupMemoryVersion: null,
    summaryRef: null,
    recentMessagesWindow: null,
    createdAt: now,
    updatedAt: now,
  });
}

export function deleteSession(groupFolder: string): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare('DELETE FROM sessions WHERE group_folder = ?').run(groupFolder);

  const logicalSessionId = buildLogicalSessionId('group', groupFolder);
  const existing = getLogicalSessionById(logicalSessionId);
  if (existing) {
    updateLogicalSession(logicalSessionId, {
      providerSessionId: null,
      status: 'stale',
      updatedAt: now,
    });
    return;
  }

  createLogicalSession({
    id: logicalSessionId,
    scopeType: 'group',
    scopeId: groupFolder,
    providerSessionId: null,
    status: 'stale',
    lastTurnId: null,
    workspaceVersion: null,
    groupMemoryVersion: null,
    summaryRef: null,
    recentMessagesWindow: null,
    createdAt: now,
    updatedAt: now,
  });
}

export function getAllSessions(): Record<string, string> {
  const db = getDb();
  const result: Record<string, string> = {};
  for (const session of listLogicalSessions('group')) {
    if (session.providerSessionId) {
      result[session.scopeId] = session.providerSessionId;
    }
  }

  const legacyRows = db
    .prepare('SELECT group_folder, session_id FROM sessions')
    .all() as Array<{ group_folder: string; session_id: string }>;
  for (const row of legacyRows) {
    if (!result[row.group_folder]) {
      result[row.group_folder] = row.session_id;
    }
  }

  return result;
}
