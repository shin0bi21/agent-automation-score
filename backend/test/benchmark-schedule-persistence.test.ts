import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { migrate } from '../src/db/migrator.js';
import { closeDatabase, createDatabase } from '../src/db/client.js';
import { createBenchmarkSchedulePersistence } from '../src/services/benchmark-schedule-persistence.js';

function schedule(id = 'schedule-1') {
  return {
    id,
    repositoryName: 'agent-insights',
    scenarioId: 'tasks-page',
    scenarioVersion: 7,
    scenarioFingerprint: 'a'.repeat(64),
    provider: 'codex',
    model: 'gpt-5.6-luna',
    reasoning: 'low',
    featureType: 'frontend' as const,
    description: 'Run the representative frontend regression.',
    intervalMinutes: 1_440,
    tokenCostConsentAt: '2026-08-28T10:00:00.000Z',
    nextRunAt: '2026-08-29T10:00:00.000Z',
    createdAt: '2026-08-28T10:00:00.000Z',
  };
}

async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'agent-insights-benchmark-schedule-'));
  const path = join(directory, 'test.sqlite');
  migrate({ path });
  const database = createDatabase(path);
  return {
    database,
    persistence: createBenchmarkSchedulePersistence(database),
    async close() {
      await closeDatabase(database);
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

test('creates, updates, lists, disables, and advances schedules without storing repository paths', async () => {
  const context = await fixture();
  try {
    const created = await context.persistence.createSchedule(schedule());
    assert.equal(created?.repository_name, 'agent-insights');
    assert.equal(created?.enabled, 1);
    assert.equal('repository_path' in (created ?? {}), false);

    assert.deepEqual((await context.persistence.listDueSchedules('2026-08-29T09:59:59.999Z')).map(row => row.id), []);
    assert.deepEqual((await context.persistence.listDueSchedules('2026-08-29T10:00:00.000Z')).map(row => row.id), ['schedule-1']);

    assert.equal(await context.persistence.advanceSchedule(
      'schedule-1',
      '2026-08-29T10:00:00.000Z',
      '2026-08-30T10:00:00.000Z',
      '2026-08-29T10:00:00.000Z',
    ), true);
    assert.equal(await context.persistence.advanceSchedule(
      'schedule-1',
      '2026-08-29T10:00:00.000Z',
      '2026-08-31T10:00:00.000Z',
      '2026-08-29T10:00:01.000Z',
    ), false);

    assert.equal(await context.persistence.updateSchedule('schedule-1', {
      enabled: false,
      description: 'Paused representative regression.',
      updatedAt: '2026-08-29T10:01:00.000Z',
    }), true);
    assert.deepEqual(await context.persistence.listDueSchedules('2026-09-01T00:00:00.000Z'), []);
    assert.equal((await context.persistence.listSchedules())[0]?.description, 'Paused representative regression.');
  } finally {
    await context.close();
  }
});

test('creates a schedule suite atomically', async () => {
  const context = await fixture();
  try {
    await assert.rejects(context.persistence.createSchedules([
      schedule('schedule-atomic'),
      schedule('schedule-atomic'),
    ]), /UNIQUE constraint failed/);
    assert.deepEqual(await context.persistence.listSchedules(), []);

    const created = await context.persistence.createSchedules([
      schedule('schedule-a'),
      schedule('schedule-b'),
    ]);
    assert.deepEqual(created.map(row => row.id).sort(), ['schedule-a', 'schedule-b']);
  } finally {
    await context.close();
  }
});

test('audits each planned occurrence once and preserves it when a schedule is disabled', async () => {
  const context = await fixture();
  try {
    await context.persistence.createSchedule(schedule());
    const occurrence = {
      id: 'occurrence-1',
      scheduleId: 'schedule-1',
      plannedAt: '2026-08-29T10:00:00.000Z',
      outcome: 'skipped' as const,
      reason: 'Repository is not connected.',
      createdAt: '2026-08-29T10:00:00.100Z',
    };
    assert.equal(await context.persistence.recordOccurrence(occurrence), true);
    assert.equal(await context.persistence.recordOccurrence({ ...occurrence, id: 'occurrence-duplicate' }), false);

    await context.persistence.updateSchedule('schedule-1', {
      enabled: false,
      updatedAt: '2026-08-29T10:01:00.000Z',
    });
    const history = await context.persistence.listOccurrences('schedule-1');
    assert.equal(history.length, 1);
    assert.equal(history[0]?.reason, 'Repository is not connected.');

    const trends = await context.persistence.listTrendPoints('schedule-1');
    assert.deepEqual(trends[0], {
      occurrence_id: 'occurrence-1',
      planned_at: '2026-08-29T10:00:00.000Z',
      outcome: 'skipped',
      run_id: null,
      reason: 'Repository is not connected.',
      run_status: null,
      average_score: null,
      duration_ms: null,
      input_tokens: null,
      cached_input_tokens: null,
      output_tokens: null,
      failed_command_count: null,
      retry_count: null,
    });
  } finally {
    await context.close();
  }
});

test('database constraints allow nullable run linkage but reject invalid links and unbounded reasons', async () => {
  const context = await fixture();
  try {
    await context.persistence.createSchedule(schedule());
    assert.equal(await context.persistence.recordOccurrence({
      id: 'occurrence-started-before-run-link',
      scheduleId: 'schedule-1',
      plannedAt: '2026-08-29T10:00:00.000Z',
      outcome: 'started',
      createdAt: '2026-08-29T10:00:00.100Z',
    }), true);
    await context.database.insertInto('runs').values({
      id: 'run-1', repository_name: 'agent-insights', base_revision: 'base', guidance_revision: null,
      working_tree_dirty: 0, feature_type: 'frontend', description: 'Scheduled run', prepared_prompt: 'Prompt',
      prompt_template_version: 'tasks-page:v7', evaluation_template: 'tasks-page', requested_repetitions: 1,
      requested_review_passes: 0, status: 'running', runner_version: null, provider_cli_version: null,
      created_at: '2026-08-29T10:00:00.000Z', started_at: null, completed_at: null,
    }).execute();
    assert.equal(await context.persistence.linkOccurrenceRun('schedule-1', '2026-08-29T10:00:00.000Z', 'run-1'), true);
    assert.equal((await context.persistence.listOccurrences('schedule-1'))[0]?.run_id, 'run-1');
    await assert.rejects(context.persistence.recordOccurrence({
      id: 'occurrence-invalid-run',
      scheduleId: 'schedule-1',
      plannedAt: '2026-08-29T11:00:00.000Z',
      outcome: 'started',
      runId: 'missing-run',
      createdAt: '2026-08-29T11:00:00.100Z',
    }), /FOREIGN KEY constraint failed/);
    await assert.rejects(context.persistence.recordOccurrence({
      id: 'occurrence-long-reason',
      scheduleId: 'schedule-1',
      plannedAt: '2026-08-30T10:00:00.000Z',
      outcome: 'failed',
      reason: 'x'.repeat(501),
      createdAt: '2026-08-30T10:00:00.100Z',
    }), /CHECK constraint failed/);
  } finally {
    await context.close();
  }
});
