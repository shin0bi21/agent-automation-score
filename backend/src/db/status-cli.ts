#!/usr/bin/env node

import { migrationStatus } from './migrator.js';

for (const migration of migrationStatus()) {
  process.stdout.write(`${migration.state.padEnd(17)} ${migration.version}\n`);
}
