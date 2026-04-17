/**
 * Workspace version database operations.
 */

import { getDb } from './connection.js';
import type { WorkspaceVersionRecord, WorkspaceCommitRecord } from './types.js';

const WORKSPACE_VERSION_SELECT = `
  SELECT
    version_id AS versionId,
    group_folder AS groupFolder,
    base_version_id AS baseVersionId,
    manifest_json AS manifestJson,
    created_at AS createdAt
  FROM workspace_versions
`;

const WORKSPACE_COMMIT_SELECT = `
  SELECT
    operation_id AS operationId,
    group_folder AS groupFolder,
    base_version_id AS baseVersionId,
    new_version_id AS newVersionId,
    created_at AS createdAt
  FROM workspace_commits
`;

function mapWorkspaceVersionRow(row: {
  versionId: string;
  groupFolder: string;
  baseVersionId: string | null;
  manifestJson: string;
  createdAt: string;
}): WorkspaceVersionRecord {
  return row;
}

function mapWorkspaceCommitRow(row: {
  operationId: string;
  groupFolder: string;
  baseVersionId: string;
  newVersionId: string;
  createdAt: string;
}): WorkspaceCommitRecord {
  return row;
}

export function getWorkspaceVersion(
  versionId: string,
): WorkspaceVersionRecord | undefined {
  const db = getDb();
  const row = db
    .prepare(`${WORKSPACE_VERSION_SELECT} WHERE version_id = ?`)
    .get(versionId) as
    | {
        versionId: string;
        groupFolder: string;
        baseVersionId: string | null;
        manifestJson: string;
        createdAt: string;
      }
    | undefined;
  return row ? mapWorkspaceVersionRow(row) : undefined;
}

export function listWorkspaceVersions(
  groupFolder?: string,
): WorkspaceVersionRecord[] {
  const db = getDb();
  const rows = groupFolder
    ? (db
        .prepare(
          `${WORKSPACE_VERSION_SELECT} WHERE group_folder = ? ORDER BY created_at ASC`,
        )
        .all(groupFolder) as Array<{
        versionId: string;
        groupFolder: string;
        baseVersionId: string | null;
        manifestJson: string;
        createdAt: string;
      }>)
    : (db
        .prepare(`${WORKSPACE_VERSION_SELECT} ORDER BY created_at ASC`)
        .all() as Array<{
        versionId: string;
        groupFolder: string;
        baseVersionId: string | null;
        manifestJson: string;
        createdAt: string;
      }>);
  return rows.map(mapWorkspaceVersionRow);
}

export function createWorkspaceVersion(record: WorkspaceVersionRecord): void {
  const db = getDb();
  db.prepare(
    `
      INSERT INTO workspace_versions (
        version_id,
        group_folder,
        base_version_id,
        manifest_json,
        created_at
      )
      VALUES (?, ?, ?, ?, ?)
    `,
  ).run(
    record.versionId,
    record.groupFolder,
    record.baseVersionId,
    record.manifestJson,
    record.createdAt,
  );
}

export function getWorkspaceCommit(
  operationId: string,
): WorkspaceCommitRecord | undefined {
  const db = getDb();
  const row = db
    .prepare(`${WORKSPACE_COMMIT_SELECT} WHERE operation_id = ?`)
    .get(operationId) as
    | {
        operationId: string;
        groupFolder: string;
        baseVersionId: string;
        newVersionId: string;
        createdAt: string;
      }
    | undefined;
  return row ? mapWorkspaceCommitRow(row) : undefined;
}

export function listWorkspaceCommits(
  groupFolder?: string,
): WorkspaceCommitRecord[] {
  const db = getDb();
  const rows = groupFolder
    ? (db
        .prepare(
          `${WORKSPACE_COMMIT_SELECT} WHERE group_folder = ? ORDER BY created_at ASC`,
        )
        .all(groupFolder) as Array<{
        operationId: string;
        groupFolder: string;
        baseVersionId: string;
        newVersionId: string;
        createdAt: string;
      }>)
    : (db
        .prepare(`${WORKSPACE_COMMIT_SELECT} ORDER BY created_at ASC`)
        .all() as Array<{
        operationId: string;
        groupFolder: string;
        baseVersionId: string;
        newVersionId: string;
        createdAt: string;
      }>);

  return rows.map(mapWorkspaceCommitRow);
}

export function createWorkspaceCommit(record: WorkspaceCommitRecord): void {
  const db = getDb();
  db.prepare(
    `
      INSERT OR IGNORE INTO workspace_commits (
        operation_id,
        group_folder,
        base_version_id,
        new_version_id,
        created_at
      )
      VALUES (?, ?, ?, ?, ?)
    `,
  ).run(
    record.operationId,
    record.groupFolder,
    record.baseVersionId,
    record.newVersionId,
    record.createdAt,
  );
}
