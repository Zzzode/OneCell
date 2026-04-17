/**
 * Tool operation database operations.
 */

import { getDb } from './connection.js';
import type { ToolOperationRecord } from './types.js';

const TOOL_OPERATION_SELECT = `
  SELECT
    operation_id AS operationId,
    execution_id AS executionId,
    tool,
    result_json AS resultJson,
    created_at AS createdAt
  FROM tool_operations
`;

function mapToolOperationRow(row: {
  operationId: string;
  executionId: string;
  tool: string;
  resultJson: string;
  createdAt: string;
}): ToolOperationRecord {
  return row;
}

export function getToolOperation(
  operationId: string,
): ToolOperationRecord | undefined {
  const db = getDb();
  const row = db
    .prepare(`${TOOL_OPERATION_SELECT} WHERE operation_id = ?`)
    .get(operationId) as
    | {
        operationId: string;
        executionId: string;
        tool: string;
        resultJson: string;
        createdAt: string;
      }
    | undefined;

  return row ? mapToolOperationRow(row) : undefined;
}

export function listToolOperations(
  executionId?: string,
): ToolOperationRecord[] {
  const db = getDb();
  const rows = executionId
    ? (db
        .prepare(
          `${TOOL_OPERATION_SELECT} WHERE execution_id = ? ORDER BY created_at ASC`,
        )
        .all(executionId) as Array<{
        operationId: string;
        executionId: string;
        tool: string;
        resultJson: string;
        createdAt: string;
      }>)
    : (db
        .prepare(`${TOOL_OPERATION_SELECT} ORDER BY created_at ASC`)
        .all() as Array<{
        operationId: string;
        executionId: string;
        tool: string;
        resultJson: string;
        createdAt: string;
      }>);

  return rows.map(mapToolOperationRow);
}

export function createToolOperation(record: ToolOperationRecord): void {
  const db = getDb();
  db.prepare(
    `
      INSERT OR IGNORE INTO tool_operations (
        operation_id,
        execution_id,
        tool,
        result_json,
        created_at
      )
      VALUES (?, ?, ?, ?, ?)
    `,
  ).run(
    record.operationId,
    record.executionId,
    record.tool,
    record.resultJson,
    record.createdAt,
  );
}
