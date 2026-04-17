/**
 * Database connection singleton and lifecycle management.
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

import { STORE_DIR } from '../config/config.js';
import { logger } from '../infra/logger.js';

import { createSchema } from './schema.js';
import { migrateJsonState } from './migration.js';

let db: Database.Database;

/** Get the raw database instance. Must call initDatabase() first. */
export function getDb(): Database.Database {
  return db;
}

export function initDatabase(): void {
  const dbPath = path.join(STORE_DIR, 'messages.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  db = new Database(dbPath);
  createSchema(db);

  // Migrate from JSON files if they exist
  migrateJsonState();

  logger.info({ dbPath }, 'Database initialized');
}

export function ensureDatabaseInitialized(): void {
  if (!db) {
    initDatabase();
  }
}

/** @internal - for tests only. Creates a fresh in-memory database. */
export function _initTestDatabase(): void {
  db = new Database(':memory:');
  createSchema(db);
}

/** @internal - for tests only. */
export function _closeDatabase(): void {
  db.close();
}
