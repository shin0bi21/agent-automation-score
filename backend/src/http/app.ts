import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { chooseRepositoryDirectory, createRunManager, providerCatalog, validateAutomationGuidance } from '../benchmark-web-lib.js';
import { probeCodexSessionSource } from '../services/codex-session-source.js';
import { readCodexLiveSession } from '../services/codex-local-session-store.js';
import { createSessionManager } from '../services/session-manager.js';

type RunManager = {
  get(id: string): unknown | null | Promise<unknown | null>;
  list(): unknown | Promise<unknown>;
  start(input: Record<string, unknown>): unknown | Promise<unknown>;
  readiness?(input: Record<string, unknown>): unknown | Promise<unknown>;
  catalog?(): unknown | Promise<unknown>;
  listSchedules?(): unknown | Promise<unknown>;
  createSuiteSchedule?(input: Record<string, unknown>): unknown | Promise<unknown>;
  updateSchedule?(id: string, input: Record<string, unknown>): unknown | null | Promise<unknown | null>;
};

type SessionManager = ReturnType<typeof createSessionManager>;

export type CreateBenchmarkAppOptions = {
  root: string;
  manager?: RunManager;
  publicRoot?: string;
  chooseDirectory?: typeof chooseRepositoryDirectory;
  providers?: typeof providerCatalog;
  validateGuidance?: typeof validateAutomationGuidance;
  directoryPickerAvailable?: boolean;
  repositoryPath?: string | null;
  probeSessions?: typeof probeCodexSessionSource;
  sessionManager?: SessionManager;
  readLiveSession?: typeof readCodexLiveSession;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Creates the local HTTP boundary without binding a port. Keeping construction
 * separate from the server entry point gives API tests an injectable run manager
 * and keeps privileged repository operations on the localhost service.
 */
export function createBenchmarkApp(options: CreateBenchmarkAppOptions): Express {
  const { root } = options;
  const manager = options.manager ?? createRunManager({ root });
  const publicRoot = options.publicRoot ?? resolve(root, 'frontend/dist');
  const pickDirectory = options.chooseDirectory ?? chooseRepositoryDirectory;
  const getProviders = options.providers ?? providerCatalog;
  const validateGuidance = options.validateGuidance ?? validateAutomationGuidance;
  const directoryPickerAvailable = options.directoryPickerAvailable ?? process.platform === 'darwin';
  const repositoryPath = options.repositoryPath
    ?? process.env.AGENT_INSIGHTS_REPOSITORY_PATH
    ?? null;
  const probeSessions = options.probeSessions ?? probeCodexSessionSource;
  let sessions = options.sessionManager;
  const getSessions = () => sessions ??= createSessionManager({ root });
  const liveSession = options.readLiveSession ?? readCodexLiveSession;
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (_request, response) => {
    response.set('cache-control', 'no-store').json({ status: 'ok' });
  });

  app.get('/api/runs', async (_request, response) => {
    response.set('cache-control', 'no-store').json(await manager.list());
  });

  app.get('/api/providers', (_request, response) => {
    response.set('cache-control', 'no-store').json(getProviders());
  });

  app.get('/api/benchmark-catalog', async (_request, response) => {
    response.set('cache-control', 'no-store').json(await manager.catalog?.() ?? { scenarios: [], suites: [] });
  });

  app.post('/api/benchmark-readiness', async (request, response) => {
    if (!manager.readiness) return response.status(501).set('cache-control', 'no-store').json({ error: 'Benchmark readiness is unavailable.' });
    response.set('cache-control', 'no-store').json(await manager.readiness(request.body ?? {}));
  });

  app.get('/api/benchmark-schedules', async (_request, response) => {
    response.set('cache-control', 'no-store').json(await manager.listSchedules?.() ?? []);
  });

  app.post('/api/benchmark-schedules', async (request, response) => {
    if (!manager.createSuiteSchedule) return response.status(501).set('cache-control', 'no-store').json({ error: 'Recurring benchmarks are unavailable.' });
    return response.status(201).set('cache-control', 'no-store').json(await manager.createSuiteSchedule(request.body ?? {}));
  });

  app.patch('/api/benchmark-schedules/:id', async (request, response) => {
    if (!manager.updateSchedule) return response.status(501).set('cache-control', 'no-store').json({ error: 'Recurring benchmarks are unavailable.' });
    const schedule = await manager.updateSchedule(request.params.id, request.body ?? {});
    if (!schedule) return response.status(404).set('cache-control', 'no-store').json({ error: 'Benchmark schedule not found.' });
    return response.set('cache-control', 'no-store').json(schedule);
  });

  app.get('/api/runtime', (_request, response) => {
    response.set('cache-control', 'no-store').json({ directoryPickerAvailable, repositoryPath });
  });

  app.post('/api/session-source/probe', async (_request, response) => {
    response.set('cache-control', 'no-store').json(await probeSessions());
  });

  app.get('/api/session-sources/codex/sessions', async (_request, response) => {
    response.set('cache-control', 'no-store').json(await getSessions().listSourceSessions());
  });

  app.get('/api/session-sources/codex/sessions/:id/live', async (request, response) => {
    response.set('cache-control', 'no-store').json(await liveSession(request.params.id));
  });

  app.get('/api/sessions', async (_request, response) => {
    response.set('cache-control', 'no-store').json(await getSessions().listImported());
  });

  app.get('/api/sessions/:id', async (request, response) => {
    const session = await getSessions().get(request.params.id);
    if (!session) return response.status(404).set('cache-control', 'no-store').json({ error: 'Session not found.' });
    return response.set('cache-control', 'no-store').json(session);
  });

  app.post('/api/sessions/import', async (request, response) => {
    if (request.body?.source !== 'codex' || typeof request.body?.externalSessionId !== 'string') {
      return response.status(400).set('cache-control', 'no-store').json({ error: 'A Codex session ID is required.' });
    }
    return response.status(201).set('cache-control', 'no-store').json(
      await getSessions().importCodex(request.body.externalSessionId),
    );
  });

  app.get('/api/runs/:id', async (request, response) => {
    const run = await manager.get(request.params.id);
    if (!run) return response.status(404).set('cache-control', 'no-store').json({ error: 'Run not found.' });
    return response.set('cache-control', 'no-store').json(run);
  });

  app.post('/api/repository', (request, response) => {
    response.set('cache-control', 'no-store').json(validateGuidance(request.body?.repo));
  });

  app.post('/api/pick-directory', (_request, response) => {
    response.set('cache-control', 'no-store').json({ repo: pickDirectory() });
  });

  app.post('/api/runs', async (request, response) => {
    response.status(202).set('cache-control', 'no-store').json(await manager.start(request.body ?? {}));
  });

  if (existsSync(publicRoot)) app.use(express.static(publicRoot));

  app.use('/api', (_request, response) => {
    response.status(404).set('cache-control', 'no-store').json({ error: 'Not found.' });
  });

  app.use((_request, response) => {
    response.status(404).set('cache-control', 'no-store').json({ error: 'Not found.' });
  });

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    const status = typeof error === 'object' && error !== null && 'status' in error && Number.isInteger(error.status)
      ? error.status as number
      : 400;
    response.status(status >= 400 && status < 500 ? status : 400)
      .set('cache-control', 'no-store')
      .json({ error: errorMessage(error) });
  });

  return app;
}
