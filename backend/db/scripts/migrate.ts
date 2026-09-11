import { fileURLToPath } from 'node:url';
import { migrate } from '../../src/db/migrator.js';
export { checksum, discoverMigrations, migrate, migrationsDirectory } from '../../src/db/migrator.js';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = migrate();
  process.stdout.write(result.applied.length ? `Applied migrations: ${result.applied.join(', ')}\n` : 'Database is up to date.\n');
}
