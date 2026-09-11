import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { closeDatabase, createDatabase } from '../src/db/client.js';
import { migrate } from '../src/db/migrator.js';
import { createSessionManager } from '../src/services/session-manager.js';

test('imports a Codex session as content-free normalized review evidence', async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'agent-insights-session-manager-')), 'test.sqlite');
  migrate({ path });
  const database = createDatabase(path);
  const source = {
    list: async () => [{ externalId: 'thread-12345678', title: 'Feature work', repositoryName: 'example', source: 'vscode', status: 'notLoaded', createdAt: '2026-08-18T00:00:00.000Z', updatedAt: '2026-08-18T01:00:00.000Z', branch: 'develop', revision: 'abc123' }],
    read: async () => ({
      externalId: 'thread-12345678', title: 'Feature work', repositoryName: 'example', source: 'vscode', status: 'notLoaded',
      createdAt: '2026-08-18T00:00:00.000Z', updatedAt: '2026-08-18T01:00:00.000Z', branch: 'develop', revision: 'abc123',
      turns: [{ id: 'turn-1', status: 'completed', items: [{ id: 'item-1', type: 'fileChange', status: 'completed' }, { id: 'item-2', type: 'contextCompaction', status: null }] }],
    }),
    workers: async () => [{ externalThreadId: 'thread-12345678', parentExternalThreadId: null, nickname: null, role: null, model: 'gpt-5.6-sol', reasoningLevel: 'low', inputTokens: 100, cachedInputTokens: 60, cacheWriteInputTokens: 0, outputTokens: 20, reasoningOutputTokens: 5, totalTokens: 120 }],
    offload: async () => ({ available: true as const, shellBatches: 4, candidateBatches: 2, associatedInputTokens: 50, associatedCachedInputTokens: 40, associatedOutputTokens: 10, associatedTotalTokens: 60, categories: { verification: 1, build: 0, formatting: 0, script: 1, monitoring: 0 }, processPatterns: [{ key: 'package-manager:check', label: 'Package-manager check', runner: 'package-manager' as const, operation: 'check' as const, batchCount: 2, successCount: 1, failureCount: 1, unknownCount: 0, outputBytes: 1200, maximumOutputBytes: 700, outputMode: 'summary-errors' as const, recommendation: 'Return exit status and a compact summary on success; include a bounded error excerpt on failure.' }] }),
    directives: async () => ({
      available: true as const, classifierVersion: 2 as const,
      interactions: [
        { sourceKey: 'question-1', sequenceNumber: 1, kind: 'question' as const, occurredAt: '2026-08-18T00:10:00.000Z', confidence: 0.85, contextTokens: 20, contextWindow: 100, inputTokens: 30, cachedInputTokens: 20, outputTokens: 5 },
        { sourceKey: 'directive-1', sequenceNumber: 2, kind: 'directive' as const, occurredAt: '2026-08-18T00:20:00.000Z', confidence: 0.8, contextTokens: 40, contextWindow: 100, inputTokens: 50, cachedInputTokens: 35, outputTokens: 8 },
      ],
      episodes: [{
        key: 'directive:1', sequenceNumber: 1, status: 'completed' as const,
        startedAt: '2026-08-18T00:20:00.000Z', completedAt: '2026-08-18T00:50:00.000Z',
        openingInteractionKey: 'directive-1', openingKind: 'directive' as const, classificationConfidence: 0.8,
        preparation: { questions: 1, context: 0, approvals: 0, patternReferences: 1, skillsUsed: ['review-changes'] }, corrections: 1,
        context: { tokensAtStart: 40, window: 100, percentAtStart: 40, peakPercent: 65 },
        usageAtStart: { inputTokens: 50, cachedInputTokens: 35, outputTokens: 8 },
        discovery: { agentsReferences: 1, skillReferences: 1, skillsUsed: ['develop-feature'], firstPatternLatencyMs: 2_000, patternBeforeFirstChange: true },
        execution: { toolCalls: 4, fileChanges: 2, webSearches: 0, delegations: 1, compactions: 0, verificationBatches: 1 },
      }],
    }),
    pathTouches: async () => [
      { sourceKey: 'read-app', promptKey: 'directive-1', path: 'frontend/src/App.tsx', kind: 'read' as const, occurredAt: '2026-08-18T00:21:00.000Z' },
      { sourceKey: 'read-home', promptKey: 'directive-1', path: 'frontend/src/pages/Home.tsx', kind: 'search' as const, occurredAt: '2026-08-18T00:22:00.000Z' },
      { sourceKey: 'change-app', promptKey: 'directive-1', path: 'frontend/src/App.tsx', kind: 'change' as const, occurredAt: '2026-08-18T00:30:00.000Z' },
      { sourceKey: 'unsafe', promptKey: 'directive-1', path: '../outside/secret.ts', kind: 'read' as const, occurredAt: '2026-08-18T00:31:00.000Z' },
    ],
  };
  try {
    const manager = createSessionManager({ root: process.cwd(), database, source });
    const first = await manager.importCodex('thread-12345678');
    assert.equal(first?.title, 'Codex session thread-1');
    assert.equal(first?.status, 'idle');
    assert.equal(first?.telemetryLevel, 'imported');
    const durableTurn = await database.selectFrom('session_turns').select('id').executeTakeFirstOrThrow();
    await database.insertInto('session_events').values({
      id: 'live-event', session_id: first!.id, thread_id: null, turn_id: durableTurn.id,
      sequence_number: 3, source_event_key: 'live:turn.completed', event_type: 'turn.completed',
      status: 'completed', occurred_at: '2026-08-18T02:00:00.000Z', summary: null, evidence_json: null,
    }).execute();
    await database.updateTable('sessions').set({
      telemetry_level: 'full', observed_sequence: 3, durable_sequence: 3,
    }).where('id', '=', first!.id).execute();
    const second = await manager.importCodex('thread-12345678');
    assert.equal(first?.id, second?.id);
    assert.equal(second?.turnCount, 1);
    assert.equal(second?.eventCount, 3);
    assert.equal(second?.telemetryLevel, 'full');
    assert.deepEqual(second?.evidence, { contextCompaction: 1, fileChange: 1, 'turn.completed': 1 });
    assert.equal(second?.usageAvailable, true);
    assert.equal(second?.offload.processPatterns[0]?.key, 'package-manager:check');
    assert.equal(second?.offload.processPatterns[0]?.outputBytes, 1200);
    assert.equal(second?.directives.episodes.length, 1);
    assert.equal(second?.usageTimeline.points.length, 2);
    assert.equal(second?.repositoryTraversal.available, true);
    assert.equal(second?.repositoryTraversal.totalFileHits, 3);
    assert.equal(second?.repositoryTraversal.directionCounts.revisit, 1);
    assert.deepEqual(second?.usageTimeline.points.map(point => ({ sequence: point.sequenceNumber, input: point.inputTokens, cached: point.cachedInputTokens, output: point.outputTokens })), [
      { sequence: 1, input: 20, cached: 15, output: 3 },
      { sequence: 2, input: 50, cached: 25, output: 12 },
    ]);
    assert.deepEqual(second?.directives.episodes[0]?.preparation, { questions: 1, context: 0, approvals: 0, patternReferences: 1, skillsUsed: ['review-changes'] });
    assert.deepEqual(second?.directives.episodes[0]?.discovery.skillsUsed, ['develop-feature']);
    assert.equal(await database.selectFrom('session_interactions').selectAll().execute().then(rows => rows.length), 2);
    assert.equal(await database.selectFrom('session_directive_episodes').selectAll().execute().then(rows => rows.length), 1);
    assert.equal(await database.selectFrom('session_path_touches').selectAll().execute().then(rows => rows.length), 3);
    await assert.rejects(database.insertInto('session_path_touches').values({
      id: 'unsafe-touch', session_id: first!.id, sequence_number: 4, source_touch_key: 'unsafe', prompt_key: null,
      file_path: '/private/repository/secret.ts', touch_kind: 'read', occurred_at: '2026-08-18T00:40:00.000Z',
    }).execute(), /CHECK constraint failed/);
    assert.deepEqual(second?.modelUsage, [{ model: 'gpt-5.6-sol', workerCount: 1, inputTokens: 100, cachedInputTokens: 60, cacheWriteInputTokens: 0, outputTokens: 20, reasoningOutputTokens: 5, totalTokens: 120 }]);
    assert.equal(await database.selectFrom('sessions').selectAll().execute().then(rows => rows.length), 1);
    const storedEvent = await database.selectFrom('session_events').selectAll().where('source_event_key', '=', 'import:turn-1:item-1').executeTakeFirstOrThrow();
    assert.equal(storedEvent.summary, null);
    assert.equal(storedEvent.evidence_json, null);
  } finally { await closeDatabase(database); }
});
