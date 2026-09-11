import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createDatabase, closeDatabase } from '../../src/db/client.js';
import { createRunPersistence } from '../../src/services/run-persistence.js';
import { migrate } from './migrate.js';

export async function importResults({ path, resultsRoot, runId }: { path?: string; resultsRoot?: string; runId?: string } = {}) {
  migrate(path ? { path } : {});
  const database = createDatabase(path);
  try {
    return await createRunPersistence(database).importResults({
      resultsRoot: resolve(resultsRoot ?? 'results/web-runs'),
      runId,
    });
  } finally {
    await closeDatabase(database);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  importResults()
    .then(result => {
      const importedCount = result.filter(run => run.imported).length;
      const existingCount = result.length - importedCount;
      process.stdout.write(`Imported ${importedCount} run(s); ${existingCount} already present.\n`);
    })
    .catch(error => {
      process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
      process.exitCode = 1;
    });
}
