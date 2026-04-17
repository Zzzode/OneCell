/**
 * Database schema creation and migrations.
 */

import type Database from 'better-sqlite3';

import { ASSISTANT_NAME } from '../config/config.js';

export function createSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS chats (
      jid TEXT PRIMARY KEY,
      name TEXT,
      last_message_time TEXT,
      channel TEXT,
      is_group INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT,
      chat_jid TEXT,
      sender TEXT,
      sender_name TEXT,
      content TEXT,
      timestamp TEXT,
      is_from_me INTEGER,
      is_bot_message INTEGER DEFAULT 0,
      PRIMARY KEY (id, chat_jid),
      FOREIGN KEY (chat_jid) REFERENCES chats(jid)
    );
    CREATE INDEX IF NOT EXISTS idx_timestamp ON messages(timestamp);

    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id TEXT PRIMARY KEY,
      group_folder TEXT NOT NULL,
      chat_jid TEXT NOT NULL,
      prompt TEXT NOT NULL,
      schedule_type TEXT NOT NULL,
      schedule_value TEXT NOT NULL,
      next_run TEXT,
      last_run TEXT,
      last_result TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_next_run ON scheduled_tasks(next_run);
    CREATE INDEX IF NOT EXISTS idx_status ON scheduled_tasks(status);

    CREATE TABLE IF NOT EXISTS task_run_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      run_at TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      status TEXT NOT NULL,
      result TEXT,
      error TEXT,
      FOREIGN KEY (task_id) REFERENCES scheduled_tasks(id)
    );
    CREATE INDEX IF NOT EXISTS idx_task_run_logs ON task_run_logs(task_id, run_at);

    CREATE TABLE IF NOT EXISTS router_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      group_folder TEXT PRIMARY KEY,
      session_id TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS logical_sessions (
      id TEXT PRIMARY KEY,
      scope_type TEXT NOT NULL,
      scope_id TEXT NOT NULL,
      provider_session_id TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      last_turn_id TEXT,
      workspace_version TEXT,
      group_memory_version TEXT,
      summary_ref TEXT,
      recent_messages_window TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (scope_type, scope_id)
    );
    CREATE INDEX IF NOT EXISTS idx_logical_sessions_scope
      ON logical_sessions(scope_type, scope_id);

    CREATE TABLE IF NOT EXISTS execution_state (
      execution_id TEXT PRIMARY KEY,
      logical_session_id TEXT NOT NULL,
      turn_id TEXT NOT NULL,
      task_node_id TEXT,
      group_jid TEXT,
      task_id TEXT,
      backend TEXT NOT NULL,
      edge_node_id TEXT,
      base_workspace_version TEXT,
      lease_until TEXT NOT NULL,
      status TEXT NOT NULL,
      last_heartbeat_at TEXT,
      cancel_requested_at TEXT,
      committed_at TEXT,
      finished_at TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (logical_session_id) REFERENCES logical_sessions(id)
    );
    CREATE INDEX IF NOT EXISTS idx_execution_state_status
      ON execution_state(status);
    CREATE INDEX IF NOT EXISTS idx_execution_state_lease
      ON execution_state(lease_until);
    CREATE INDEX IF NOT EXISTS idx_execution_state_session
      ON execution_state(logical_session_id);

    CREATE TABLE IF NOT EXISTS task_graphs (
      graph_id TEXT PRIMARY KEY,
      request_kind TEXT NOT NULL,
      scope_type TEXT NOT NULL,
      scope_id TEXT NOT NULL,
      group_folder TEXT NOT NULL,
      chat_jid TEXT NOT NULL,
      logical_session_id TEXT NOT NULL,
      root_task_id TEXT NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (logical_session_id) REFERENCES logical_sessions(id)
    );
    CREATE INDEX IF NOT EXISTS idx_task_graphs_scope
      ON task_graphs(scope_type, scope_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_task_graphs_status
      ON task_graphs(status, created_at);

    CREATE TABLE IF NOT EXISTS task_nodes (
      task_id TEXT PRIMARY KEY,
      graph_id TEXT NOT NULL,
      parent_task_id TEXT,
      node_kind TEXT NOT NULL,
      worker_class TEXT,
      backend_id TEXT,
      required_capabilities_json TEXT NOT NULL DEFAULT '[]',
      route_reason TEXT,
      policy_version TEXT,
      fallback_eligible INTEGER NOT NULL DEFAULT 0,
      fallback_target TEXT,
      fallback_reason TEXT,
      failure_class TEXT,
      aggregate_policy TEXT,
      quorum_count INTEGER,
      status TEXT NOT NULL,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (graph_id) REFERENCES task_graphs(graph_id)
    );
    CREATE INDEX IF NOT EXISTS idx_task_nodes_graph
      ON task_nodes(graph_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_task_nodes_status
      ON task_nodes(status, created_at);

    CREATE TABLE IF NOT EXISTS task_node_dependencies (
      task_id TEXT NOT NULL,
      depends_on_task_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (task_id, depends_on_task_id),
      FOREIGN KEY (task_id) REFERENCES task_nodes(task_id)
    );
    CREATE INDEX IF NOT EXISTS idx_task_node_dependencies_task
      ON task_node_dependencies(task_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_task_node_dependencies_depends_on
      ON task_node_dependencies(depends_on_task_id, created_at);

    CREATE TABLE IF NOT EXISTS execution_checkpoints (
      execution_id TEXT NOT NULL,
      checkpoint_key TEXT NOT NULL,
      provider_session_id TEXT,
      summary_delta TEXT,
      workspace_overlay_digest TEXT,
      created_at TEXT NOT NULL,
      PRIMARY KEY (execution_id, checkpoint_key),
      FOREIGN KEY (execution_id) REFERENCES execution_state(execution_id)
    );
    CREATE INDEX IF NOT EXISTS idx_execution_checkpoints_execution
      ON execution_checkpoints(execution_id, created_at);

    CREATE TABLE IF NOT EXISTS tool_operations (
      operation_id TEXT PRIMARY KEY,
      execution_id TEXT NOT NULL,
      tool TEXT NOT NULL,
      result_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tool_operations_execution
      ON tool_operations(execution_id, created_at);

    CREATE TABLE IF NOT EXISTS workspace_versions (
      version_id TEXT PRIMARY KEY,
      group_folder TEXT NOT NULL,
      base_version_id TEXT,
      manifest_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_workspace_versions_group
      ON workspace_versions(group_folder, created_at);

    CREATE TABLE IF NOT EXISTS workspace_commits (
      operation_id TEXT PRIMARY KEY,
      group_folder TEXT NOT NULL,
      base_version_id TEXT NOT NULL,
      new_version_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_workspace_commits_group
      ON workspace_commits(group_folder, created_at);

    CREATE TABLE IF NOT EXISTS registered_groups (
      jid TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      folder TEXT NOT NULL UNIQUE,
      trigger_pattern TEXT NOT NULL,
      added_at TEXT NOT NULL,
      execution_mode TEXT,
      container_config TEXT,
      requires_trigger INTEGER DEFAULT 1
    );
  `);

  // Add context_mode column if it doesn't exist (migration for existing DBs)
  try {
    database.exec(
      `ALTER TABLE scheduled_tasks ADD COLUMN context_mode TEXT DEFAULT 'isolated'`,
    );
  } catch {
    /* column already exists */
  }

  // Add script column if it doesn't exist (migration for existing DBs)
  try {
    database.exec(`ALTER TABLE scheduled_tasks ADD COLUMN script TEXT`);
  } catch {
    /* column already exists */
  }

  try {
    database.exec(`ALTER TABLE execution_state ADD COLUMN task_node_id TEXT`);
  } catch {
    /* column already exists */
  }

  try {
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_execution_state_task_node
        ON execution_state(task_node_id, created_at)
    `);
  } catch {
    /* index creation will succeed after task_node_id exists */
  }

  try {
    database.exec(
      `ALTER TABLE task_nodes ADD COLUMN required_capabilities_json TEXT NOT NULL DEFAULT '[]'`,
    );
  } catch {
    /* column already exists */
  }

  try {
    database.exec(`ALTER TABLE task_nodes ADD COLUMN route_reason TEXT`);
  } catch {
    /* column already exists */
  }

  try {
    database.exec(`ALTER TABLE task_nodes ADD COLUMN policy_version TEXT`);
  } catch {
    /* column already exists */
  }

  try {
    database.exec(
      `ALTER TABLE task_nodes ADD COLUMN fallback_eligible INTEGER NOT NULL DEFAULT 0`,
    );
  } catch {
    /* column already exists */
  }

  try {
    database.exec(`ALTER TABLE task_nodes ADD COLUMN fallback_target TEXT`);
  } catch {
    /* column already exists */
  }

  try {
    database.exec(`ALTER TABLE task_nodes ADD COLUMN fallback_reason TEXT`);
  } catch {
    /* column already exists */
  }

  try {
    database.exec(`ALTER TABLE task_nodes ADD COLUMN failure_class TEXT`);
  } catch {
    /* column already exists */
  }

  try {
    database.exec(`ALTER TABLE task_nodes ADD COLUMN aggregate_policy TEXT`);
  } catch {
    /* column already exists */
  }

  try {
    database.exec(`ALTER TABLE task_nodes ADD COLUMN quorum_count INTEGER`);
  } catch {
    /* column already exists */
  }

  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS task_node_dependencies (
        task_id TEXT NOT NULL,
        depends_on_task_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (task_id, depends_on_task_id),
        FOREIGN KEY (task_id) REFERENCES task_nodes(task_id)
      )
    `);
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_task_node_dependencies_task
        ON task_node_dependencies(task_id, created_at)
    `);
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_task_node_dependencies_depends_on
        ON task_node_dependencies(depends_on_task_id, created_at)
    `);
  } catch {
    /* table or indexes already exist */
  }

  // Add is_bot_message column if it doesn't exist (migration for existing DBs)
  try {
    database.exec(
      `ALTER TABLE messages ADD COLUMN is_bot_message INTEGER DEFAULT 0`,
    );
    // Backfill: mark existing bot messages that used the content prefix pattern
    database
      .prepare(`UPDATE messages SET is_bot_message = 1 WHERE content LIKE ?`)
      .run(`${ASSISTANT_NAME}:%`);
  } catch {
    /* column already exists */
  }

  // Add is_main column if it doesn't exist (migration for existing DBs)
  try {
    database.exec(
      `ALTER TABLE registered_groups ADD COLUMN is_main INTEGER DEFAULT 0`,
    );
    // Backfill: existing rows with folder = 'main' are the main group
    database.exec(
      `UPDATE registered_groups SET is_main = 1 WHERE folder = 'main'`,
    );
  } catch {
    /* column already exists */
  }

  // Add execution_mode column if it doesn't exist (migration for existing DBs)
  try {
    database.exec(
      `ALTER TABLE registered_groups ADD COLUMN execution_mode TEXT`,
    );
  } catch {
    /* column already exists */
  }

  // Add channel and is_group columns if they don't exist (migration for existing DBs)
  try {
    database.exec(`ALTER TABLE chats ADD COLUMN channel TEXT`);
    database.exec(`ALTER TABLE chats ADD COLUMN is_group INTEGER DEFAULT 0`);
    // Backfill from JID patterns
    database.exec(
      `UPDATE chats SET channel = 'whatsapp', is_group = 1 WHERE jid LIKE '%@g.us'`,
    );
    database.exec(
      `UPDATE chats SET channel = 'whatsapp', is_group = 0 WHERE jid LIKE '%@s.whatsapp.net'`,
    );
    database.exec(
      `UPDATE chats SET channel = 'discord', is_group = 1 WHERE jid LIKE 'dc:%'`,
    );
    database.exec(
      `UPDATE chats SET channel = 'telegram', is_group = 0 WHERE jid LIKE 'tg:%'`,
    );
  } catch {
    /* columns already exist */
  }

  database.exec(`
    INSERT OR IGNORE INTO logical_sessions (
      id,
      scope_type,
      scope_id,
      provider_session_id,
      status,
      created_at,
      updated_at
    )
    SELECT
      'group:' || group_folder,
      'group',
      group_folder,
      session_id,
      'active',
      strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
      strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    FROM sessions;

    UPDATE logical_sessions
    SET
      provider_session_id = (
        SELECT session_id
        FROM sessions
        WHERE sessions.group_folder = logical_sessions.scope_id
      ),
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE scope_type = 'group'
      AND provider_session_id IS NULL
      AND EXISTS (
        SELECT 1
        FROM sessions
        WHERE sessions.group_folder = logical_sessions.scope_id
      );
  `);
}
