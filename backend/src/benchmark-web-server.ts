#!/usr/bin/env node

import { createServer } from 'node:http';
import { resolve } from 'node:path';
import process from 'node:process';
import { createBenchmarkApp } from './http/app.js';
import { resolveServerHost } from './http/server-config.js';

const ROOT = resolve(import.meta.dirname, '../..');
const port = Number(process.env.BENCHMARK_WEB_PORT ?? 4173);
const host = resolveServerHost();
export const app = createBenchmarkApp({ root: ROOT });

if (import.meta.url === `file://${process.argv[1]}`) {
  createServer(app).listen(port, host, () => {
    console.log(`Agent Insights listening on ${host}:${port}`);
  });
}
