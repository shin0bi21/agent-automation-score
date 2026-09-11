import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import DatabaseDriver from 'better-sqlite3';
import { databasePath, ensureDatabaseDirectory } from './config.js';

export const migrationsDirectory = resolve(import.meta.dirname, '../../db/migrations');
export interface Migration {
  version: string;
  path: string;
  sql: string;
  checksum: string;
}

export interface MigrationStatus {
  version: string;
  state: 'applied' | 'pending' | 'checksum-mismatch' | 'missing';
}

export function checksum(source: string) { return createHash('sha256').update(source).digest('hex'); }

export function discoverMigrations(directory = migrationsDirectory): Migration[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isFile() && /^\d{4}-\d{2}-\d{2}_\d+_.+\.sql$/.test(entry.name))
    .map(entry => {
      const path = resolve(directory, entry.name);
      const sql = readFileSync(path, 'utf8');
      return { version: entry.name.slice(0, -4), path, sql, checksum: checksum(sql) };
    })
    .sort((left, right) => left.version.localeCompare(right.version));
}

export function migrate({ path = databasePath(), directory = migrationsDirectory } = {}) {
  const database = new DatabaseDriver(ensureDatabaseDirectory(path));
  try {
    database.pragma('foreign_keys = ON');
    database.pragma('journal_mode = WAL');
    database.pragma('busy_timeout = 5000');
    database.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)');
    const migrations = discoverMigrations(directory);
    const appliedRows = database
      .prepare('SELECT version, checksum FROM schema_migrations')
      .all() as Array<{ version: string; checksum: string }>;
    const applied = new Map(appliedRows.map(row => [row.version, row.checksum]));
    const available = new Set(migrations.map(migration => migration.version));
    for (const version of applied.keys()) {
      if (!available.has(version)) {
        throw new Error(`Applied migration is missing from disk: ${version}`);
      }
    }
    const pending = migrations.filter(migration => {
      const previous = applied.get(migration.version);
      if (previous && previous !== migration.checksum) throw new Error(`Migration checksum mismatch: ${migration.version}`);
      return !previous;
    });
    const apply = database.transaction((migration: Migration) => {
      database.exec(migration.sql);
      database
        .prepare('INSERT INTO schema_migrations (version, checksum, applied_at) VALUES (?, ?, ?)')
        .run(migration.version, migration.checksum, new Date().toISOString());
    });
    for (const migration of pending) apply(migration);
    return { applied: pending.map(migration => migration.version), pending: [] as string[] };
  } finally {
    database.close();
  }
}

export function migrationStatus({ path = databasePath(), directory = migrationsDirectory } = {}): MigrationStatus[] {
  const migrations = discoverMigrations(directory);
  if (!existsSync(path)) return migrations.map(migration => ({ version: migration.version, state: 'pending' }));
  const database = new DatabaseDriver(ensureDatabaseDirectory(path), { readonly: true });
  try {
    const migrationsTable = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'").get();
    if (!migrationsTable) return migrations.map(migration => ({ version: migration.version, state: 'pending' }));
    const appliedRows = database
      .prepare('SELECT version, checksum FROM schema_migrations')
      .all() as Array<{ version: string; checksum: string }>;
    const applied = new Map(appliedRows.map(row => [row.version, row.checksum]));
    const available = new Set(migrations.map(migration => migration.version));
    const known = migrations.map(migration => {
      const appliedChecksum = applied.get(migration.version);
      const state = !applied.has(migration.version)
        ? 'pending'
        : appliedChecksum === migration.checksum
          ? 'applied'
          : 'checksum-mismatch';
      return { version: migration.version, state } as const;
    });
    const missing = [...applied.keys()]
      .filter(version => !available.has(version))
      .map(version => ({ version, state: 'missing' as const }));
    return [...known, ...missing];
  } finally {
    database.close();
  }
}
