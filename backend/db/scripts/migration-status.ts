import { fileURLToPath } from 'node:url';
import { migrationStatus } from '../../src/db/migrator.js';
export { migrationStatus } from '../../src/db/migrator.js';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const migration of migrationStatus()) process.stdout.write(`${migration.state.padEnd(17)} ${migration.version}\n`);
}
