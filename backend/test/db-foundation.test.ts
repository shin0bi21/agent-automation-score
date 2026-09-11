import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createDatabase, closeDatabase } from '../src/db/client.js';
import { databasePath } from '../src/db/config.js';
import { migrate } from '../db/scripts/migrate.js';
import { migrationStatus } from '../db/scripts/migration-status.js';

test('database path uses the Agent Insights default and explicit override', () => {
  const directory = mkdtempSync(join(tmpdir(), 'agent-insights-path-'));
  const previous = process.env.AGENT_INSIGHTS_DB_PATH;
  try {
    delete process.env.AGENT_INSIGHTS_DB_PATH;
    assert.equal(databasePath(directory), join(directory, 'data', 'agent-insights.sqlite'));
    const configured = join(directory, 'configured.sqlite');
    process.env.AGENT_INSIGHTS_DB_PATH = configured;
    assert.equal(databasePath(directory), configured);
  } finally {
    if (previous === undefined) delete process.env.AGENT_INSIGHTS_DB_PATH;
    else process.env.AGENT_INSIGHTS_DB_PATH = previous;
    rmSync(directory, { recursive: true, force: true });
  }
});

test('SQLite migrations create typed run persistence and summary views', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'agent-insights-db-'));
  const path = join(directory, 'runs.sqlite');
  try {
    const result = migrate({ path });
    assert.deepEqual(result.applied, [
      '2026-08-14_1_initialize_run_database',
      '2026-08-18_1_add_session_monitoring',
      '2026-08-19_1_add_session_worker_usage',
      '2026-08-20_1_add_session_offload_summary',
      '2026-08-21_1_add_session_offload_processes',
      '2026-08-22_1_add_session_directive_episodes',
      '2026-08-23_1_add_session_prompt_snapshots',
      '2026-08-28_1_add_benchmark_schedules',
      '2026-08-28_2_add_benchmark_readiness',
      '2026-08-30_1_add_session_path_touches',
    ]);
    assert.deepEqual(migrationStatus({ path }).map(item => item.state), ['applied', 'applied', 'applied', 'applied', 'applied', 'applied', 'applied', 'applied', 'applied', 'applied']);

    const database = createDatabase(path);
    try {
      await database.insertInto('runs').values({
        id: 'run-1',
        repository_name: 'sample-app',
        base_revision: 'base',
        guidance_revision: 'guidance',
        working_tree_dirty: 0,
        feature_type: 'frontend',
        description: 'Build a page',
        prepared_prompt: 'Prompt',
        prompt_template_version: 'v1',
        evaluation_template: 'tasks-page',
        requested_repetitions: 1,
        requested_review_passes: 1,
        status: 'completed',
        created_at: '2026-08-14T00:00:00.000Z',
        started_at: null,
        completed_at: null,
        runner_version: null,
        provider_cli_version: null,
      }).execute();
      await database.insertInto('run_agent_setup').values({
        run_id: 'run-1',
        provider: 'codex',
        agent: 'luna',
        reasoning_level: 'medium',
      }).execute();
      await database.insertInto('run_attempts').values({
        id: 'attempt-1',
        run_id: 'run-1',
        attempt_number: 1,
        status: 'completed',
        started_at: null,
        completed_at: null,
        failure_summary: null,
      }).execute();
      await database.insertInto('run_passes').values([
        {
          id: 'pass-0',
          attempt_id: 'attempt-1',
          pass_number: 0,
          pass_type: 'initial',
          status: 'completed',
          started_at: null,
          completed_at: null,
          duration_ms: 100,
          final_response: null,
        },
        {
          id: 'pass-1',
          attempt_id: 'attempt-1',
          pass_number: 1,
          pass_type: 'review',
          status: 'completed',
          started_at: null,
          completed_at: null,
          duration_ms: 50,
          final_response: null,
        },
      ]).execute();
      await database.insertInto('pass_token_usage').values([
        { pass_id: 'pass-0', input_tokens: 100, cached_input_tokens: 80, output_tokens: 10, reasoning_output_tokens: 0 },
        { pass_id: 'pass-1', input_tokens: 50, cached_input_tokens: 40, output_tokens: 5, reasoning_output_tokens: 0 },
      ]).execute();
      await database.insertInto('pass_evaluations').values([
        { id: 'evaluation-0', pass_id: 'pass-0', score: 60, evaluator_version: 'v1', created_at: '2026-08-14T00:01:00.000Z' },
        { id: 'evaluation-1', pass_id: 'pass-1', score: 80, evaluator_version: 'v1', created_at: '2026-08-14T00:02:00.000Z' },
      ]).execute();
      await database.insertInto('pass_events').values({
        id: 'event-1',
        pass_id: 'pass-1',
        sequence_number: 1,
        event_type: 'retry',
        status: 'completed',
        occurred_at: '2026-08-14T00:01:30.000Z',
        summary: null,
        payload_json: null,
      }).execute();
      await database.insertInto('pass_changes').values({
        id: 'change-1',
        pass_id: 'pass-0',
        file_path: 'frontend/page.tsx',
        change_type: 'added',
        lines_added: 10,
        lines_removed: 0,
      }).execute();

      const attempt = await database.selectFrom('attempt_summary').selectAll().executeTakeFirstOrThrow();
      assert.equal(attempt.initial_score, 60);
      assert.equal(attempt.final_score, 80);
      assert.equal(attempt.score_improvement, 20);
      assert.equal(attempt.duration_ms, 150);
      assert.equal(attempt.input_tokens, 150);
      assert.equal(attempt.retry_count, 1);
      assert.equal(attempt.changed_file_count, 1);
      const run = await database.selectFrom('run_summary').selectAll().executeTakeFirstOrThrow();
      assert.equal(run.average_score, 80);
      assert.equal(run.input_tokens, 150);
    } finally {
      await closeDatabase(database);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
