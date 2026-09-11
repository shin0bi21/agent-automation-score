import DatabaseDriver from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import type { Database } from './database.js';
import { databasePath, ensureDatabaseDirectory } from './config.js';

export function createDatabase(path = databasePath()) {
  const sqlite = new DatabaseDriver(ensureDatabaseDirectory(path));
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('busy_timeout = 5000');
  return new Kysely<Database>({ dialect: new SqliteDialect({ database: sqlite }) });
}

export async function closeDatabase(database: Kysely<Database>) {
  await database.destroy();
}
