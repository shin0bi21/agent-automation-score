import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import test from 'node:test';
import { migrate } from '../db/scripts/migrate.js';
import { createDatabase, closeDatabase } from '../src/db/client.js';
import { createRunPersistence } from '../src/services/run-persistence.js';

function writeJson(path: string, value: unknown) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function fixture(root: string, id = 'run-legacy') {
  const run = join(root, id);
  const candidate = join(run, 'gpt-5.6-luna-low-run-1');
  mkdirSync(candidate, { recursive: true });
  writeJson(join(run, 'web-run.json'), {
    id,
    createdAt: '2026-08-14T00:00:00.000Z',
    status: 'running',
    repo: '/private/example/my-webapp',
    provider: 'codex',
    model: 'gpt-5.6-luna',
    reasoningEffort: 'low',
    featureType: 'frontend',
    description: 'Build Tasks.',
  });
  writeFileSync(join(run, 'prompt.md'), 'Prepared prompt');
  writeJson(join(run, 'plan.json'), {
    scenario: 'tasks-page',
    baseSha: 'base-sha',
    guidance: { ref: 'guidance-sha' },
    matrix: [{ repetition: 1 }],
  });
  writeJson(join(run, 'comparison.json'), { comparison: [] });
  writeJson(join(candidate, 'result.json'), {
    repetition: 1,
    productBaseSha: 'base-sha',
    worktree: candidate,
    agent: {
      exitCode: 0,
      durationMs: 250,
      timedOut: false,
      usage: {
        inputTokens: 100,
        cachedInputTokens: 80,
        outputTokens: 10,
        reasoningOutputTokens: 2,
      },
    },
  });
  writeFileSync(join(candidate, 'final.md'), 'Done.');
  writeFileSync(join(candidate, 'changed-files.txt'), `A\t${join(candidate, 'frontend/src/Tasks.tsx')}\nM\tfrontend/src/App.tsx\n`);
  writeJson(join(candidate, 'setup.json'), [{ command: ['npm', 'ci'], exitCode: 0, durationMs: 20 }]);
  writeFileSync(join(candidate, 'events.jsonl'), [
    JSON.stringify({ type: 'item.completed', item: { id: 'message', type: 'agent_message', text: 'Inspecting patterns.' } }),
    JSON.stringify({ type: 'item.completed', item: { id: 'command', type: 'command_execution', command: 'npm test', exit_code: 1, status: 'completed' } }),
    JSON.stringify({ type: 'item.completed', item: { id: 'change', type: 'file_change', status: 'completed', changes: [{ kind: 'add', path: join(candidate, 'frontend/src/Tasks.tsx') }] } }),
    JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 100 } }),
  ].join('\n'));
  writeJson(join(candidate, 'grade.json'), {
    scenario: 'tasks-page',
    scenarioVersion: 6,
    percentage: 90,
    checks: [{ id: 'frontend', label: 'Focused tests', command: ['npm', 'test'], passed: true, durationMs: 30 }],
    requirements: [{
      id: 'frontend-layers',
      label: 'Frontend Layers',
      passed: false,
      points: 10,
      earned: 0,
      missingFiles: ['src/x'],
      missingText: [],
    }],
    implementationReview: [{
      id: 'frontend',
      label: 'Frontend implementation',
      items: [{
        id: 'page',
        label: 'Tasks page',
        implemented: true,
        candidateFiles: ['frontend/src/Tasks.tsx'],
        referenceFiles: ['frontend/src/Tasks.tsx'],
      }],
    }],
  });
  return run;
}

function addCandidate(run: string, repetition: number, score: number, implemented: boolean) {
  const candidate = join(run, `gpt-5.6-luna-low-run-${repetition}`);
  mkdirSync(candidate, { recursive: true });
  writeJson(join(candidate, 'result.json'), {
    repetition,
    productBaseSha: 'base-sha',
    worktree: candidate,
    agent: {
      exitCode: 0,
      durationMs: 750,
      timedOut: false,
      usage: {
        inputTokens: 100,
        cachedInputTokens: 80,
        outputTokens: 10,
        reasoningOutputTokens: 2,
      },
    },
  });
  writeFileSync(join(candidate, 'final.md'), `Completed ${candidate}.`);
  const commandEvent = {
    type: 'item.completed',
    item: {
      id: `command-${repetition}`,
      type: 'command_execution',
      command: `npm test -- --root ${candidate} --token secret-value`,
      exit_code: 0,
      status: 'completed',
    },
  };
  writeFileSync(join(candidate, 'events.jsonl'), JSON.stringify(commandEvent));
  writeJson(join(candidate, 'grade.json'), {
    scenario: 'tasks-page', scenarioVersion: 6, percentage: score, checks: [], requirements: [],
    implementationReview: [{
      id: 'frontend',
      label: 'Frontend implementation',
      items: [{
        id: 'page',
        label: 'Tasks page',
        implemented,
        candidateFiles: [join(candidate, 'frontend/src/Tasks.tsx')],
        referenceFiles: ['/private/reference/frontend/src/Tasks.tsx'],
      }],
    }],
  });
}

test('normalizes temporary run evidence into a frontend-compatible SQLite report', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'agent-insights-persistence-'));
  const databasePath = join(directory, 'runs.sqlite');
  try {
    const runDirectory = fixture(directory);
    addCandidate(runDirectory, 2, 50, true);
    addCandidate(runDirectory, 3, 50, false);
    writeJson(join(runDirectory, 'plan.json'), {
      scenario: 'tasks-page',
      baseSha: 'base-sha',
      guidance: { ref: 'guidance-sha' },
      matrix: [{ repetition: 1 }, { repetition: 2 }, { repetition: 3 }],
    });
    migrate({ path: databasePath });
    const database = createDatabase(databasePath);
    try {
      const persistence = createRunPersistence(database);
      assert.deepEqual(await persistence.normalizeTemporaryRun(runDirectory), {
        id: 'run-legacy', status: 'completed', normalized: true,
      });
      assert.deepEqual(await persistence.normalizeTemporaryRun(runDirectory), {
        id: 'run-legacy', status: 'running', normalized: false,
      });
      const run = await persistence.getRun('run-legacy');
      assert.equal(run?.repositoryName, 'my-webapp');
      assert.equal(run?.status, 'completed');
      assert.equal(run?.preparedPrompt, 'Prepared prompt');
      assert.equal(run?.comparison?.comparison[0].medianScore, 50);
      assert.equal(run?.comparison?.comparison[0].medianDurationMs, 750);
      assert.equal(run?.comparison?.comparison[0].inputTokens, 300);
      assert.deepEqual(run?.comparison?.comparison[0].missedRequirements, { 'frontend-layers': 1 });
      assert.equal(run?.comparison?.comparison[0].implementationReview[0].items[0].implemented, false);
      const events = await database.selectFrom('pass_events').selectAll().execute();
      assert.equal(events.length, 7);
      const eventPaths = events.flatMap(event => (JSON.parse(event.payload_json ?? '{}').changes ?? []).map((change: { path: string }) => change.path));
      assert.equal(eventPaths.some((path: string) => isAbsolute(path)), false);
      assert.equal(events.some(event => event.summary?.includes(runDirectory) || event.summary?.includes('secret-value')), false);
      assert.equal((await database.selectFrom('pass_checks').selectAll().execute()).length, 1);
      const changes = await database.selectFrom('pass_changes').selectAll().execute();
      assert.equal(changes.length, 2);
      assert.deepEqual(changes.map(change => change.file_path).sort(), ['frontend/src/App.tsx', 'frontend/src/Tasks.tsx']);
      const implementation = await database.selectFrom('implementation_findings').selectAll().execute();
      assert.equal(implementation.some(finding => finding.candidate_files_json?.includes(runDirectory) || finding.reference_files_json?.includes('/private/reference')), false);
    } finally { await closeDatabase(database); }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('keeps the legacy results importer as an idempotent migration path', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'agent-insights-legacy-import-'));
  const databasePath = join(directory, 'runs.sqlite');
  const resultsRoot = join(directory, 'results', 'web-runs');
  try {
    fixture(resultsRoot);
    migrate({ path: databasePath });
    const database = createDatabase(databasePath);
    try {
      const persistence = createRunPersistence(database);
      assert.deepEqual(await persistence.importResults({ resultsRoot }), [
        { id: 'run-legacy', status: 'completed', imported: true },
      ]);
      assert.deepEqual(await persistence.importResults({ resultsRoot }), [
        { id: 'run-legacy', status: 'running', imported: false },
      ]);
    } finally {
      await closeDatabase(database);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('provisional runs do not expose an empty report before evaluation', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'agent-insights-persistence-'));
  const databasePath = join(directory, 'runs.sqlite');
  try {
    migrate({ path: databasePath });
    const database = createDatabase(databasePath);
    try {
      const persistence = createRunPersistence(database);
      await persistence.createRun({
        id: 'run-active',
        repositoryName: 'demo',
        baseRevision: 'abc',
        featureType: 'frontend',
        description: 'Build it.',
        preparedPrompt: 'Prompt',
        promptTemplateVersion: 'v1',
        evaluationTemplate: 'tasks-page',
        provider: 'codex',
        agent: 'gpt-5.6-luna',
        reasoningLevel: 'low',
      });
      await persistence.updateRunStatus('run-active', 'running');
      assert.equal((await persistence.getRun('run-active'))?.comparison, null);
    } finally { await closeDatabase(database); }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('normalizes incomplete temporary evidence as interrupted without a pass', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'agent-insights-persistence-'));
  const databasePath = join(directory, 'runs.sqlite');
  try {
    const run = join(directory, 'run-stopped');
    mkdirSync(run, { recursive: true });
    writeJson(join(run, 'web-run.json'), {
      id: 'run-stopped',
      createdAt: '2026-08-14T00:00:00.000Z',
      status: 'running',
      repo: '/tmp/demo',
      provider: 'codex',
      model: 'gpt-5.6-terra',
      reasoningEffort: 'low',
      featureType: 'backend',
      description: 'Build API.',
    });
    migrate({ path: databasePath });
    const database = createDatabase(databasePath);
    try {
      const persistence = createRunPersistence(database);
      await persistence.normalizeTemporaryRun(run);
      const attempt = await database.selectFrom('run_attempts').selectAll().where('run_id', '=', 'run-stopped').executeTakeFirstOrThrow();
      assert.equal(attempt.status, 'interrupted');
      assert.equal(await database.selectFrom('run_passes').select(({ fn }) => fn.countAll<number>().as('count')).executeTakeFirstOrThrow().then(row => row.count), 0);
    } finally { await closeDatabase(database); }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
