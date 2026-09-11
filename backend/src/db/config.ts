import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * The database remains local and ignored by Git. An explicit path is useful for
 * tests and future desktop packaging without persisting a machine-specific path
 * in run records.
 */
export function databasePath(root = process.cwd()) {
  const configured = process.env.AGENT_INSIGHTS_DB_PATH;
  return configured
    ? resolve(configured)
    : resolve(root, 'data', 'agent-insights.sqlite');
}

export function ensureDatabaseDirectory(path: string) {
  mkdirSync(dirname(path), { recursive: true });
  return path;
}
