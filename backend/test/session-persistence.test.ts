import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { sql } from 'kysely';
import { closeDatabase, createDatabase } from '../src/db/client.js';
import { migrate } from '../src/db/migrator.js';
import { createSessionPersistence } from '../src/services/session-persistence.js';

async function withDatabase(run: (path: string) => Promise<void>) {
  const directory = mkdtempSync(join(tmpdir(), 'agent-insights-session-'));
  const path = join(directory, 'sessions.sqlite');
  try {
    migrate({ path });
    await run(path);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('session migration preserves unknown telemetry and relational integrity', async () => {
  await withDatabase(async path => {
    const database = createDatabase(path);
    try {
      const persistence = createSessionPersistence(database, { batchIntervalMs: 60_000, idleFlushMs: 60_000 });
      await persistence.openSession({
        id: 'session-1',
        sourceId: 'source-1',
        platform: 'codex',
        externalSessionId: 'thread-1',
        sourceKind: 'ide',
        adapterVersion: 'app-server-v1',
        telemetryLevel: 'imported',
      });
      await persistence.upsertThread({
        id: 'thread-1',
        sessionId: 'session-1',
        externalThreadId: 'thread-1',
        role: 'orchestrator',
        status: 'completed',
      });
      await persistence.upsertTurn({
        id: 'turn-1',
        sessionId: 'session-1',
        threadId: 'thread-1',
        externalTurnId: 'turn-1',
        sequenceNumber: 1,
        status: 'completed',
      });
      await persistence.recordUsage({
        sessionId: 'session-1',
        turnId: 'turn-1',
        sourceEventKey: 'usage-unavailable',
        measurement: 'unavailable',
        inputTokens: 0,
        outputTokens: 0,
        final: true,
      });

      const usage = await database.selectFrom('turn_usage_snapshots').selectAll().executeTakeFirstOrThrow();
      assert.equal(usage.measurement, 'unavailable');
      assert.equal(usage.input_tokens, null);
      assert.equal(usage.output_tokens, null);
      const summary = await persistence.getStoredSnapshot('session-1');
      assert.equal(summary?.input_tokens, null);
      assert.equal(summary?.thread_count, 1);
      assert.equal(summary?.turn_count, 1);
      const foreignKeys = await sql<{ table: string }>`PRAGMA foreign_key_check`.execute(database);
      assert.equal(foreignKeys.rows.length, 0);
      await persistence.close();
    } finally {
      await closeDatabase(database);
    }
  });
});

test('routine telemetry batches while lifecycle events flush and advance watermarks', async () => {
  await withDatabase(async path => {
    const database = createDatabase(path);
    try {
      const persistence = createSessionPersistence(database, { batchIntervalMs: 60_000, idleFlushMs: 60_000 });
      await persistence.openSession({
        id: 'session-2',
        sourceId: 'source-2',
        platform: 'codex',
        externalSessionId: 'thread-2',
        sourceKind: 'desktop',
        adapterVersion: 'app-server-v1',
        telemetryLevel: 'full',
      });
      await persistence.recordEvent({
        sessionId: 'session-2',
        sequenceNumber: 1,
        sourceEventKey: 'event-1',
        eventType: 'turn.plan.updated',
        summary: 'Planning the change.',
      });
      assert.equal((await database.selectFrom('session_events').selectAll().execute()).length, 0);
      assert.deepEqual(persistence.getLiveSnapshot('session-2'), {
        sessionId: 'session-2',
        observedSequence: 1,
        durableSequence: 0,
        pendingEventCount: 1,
        pendingUsageCount: 0,
        durable: false,
      });

      await persistence.recordEvent({
        sessionId: 'session-2',
        sequenceNumber: 2,
        sourceEventKey: 'event-2',
        eventType: 'turn.completed',
        status: 'completed',
        critical: true,
        syncCursor: 'cursor-2',
      });
      assert.equal((await database.selectFrom('session_events').selectAll().execute()).length, 2);
      const stored = await persistence.getStoredSnapshot('session-2');
      assert.equal(stored?.observed_sequence, 2);
      assert.equal(stored?.durable_sequence, 2);
      assert.equal(stored?.event_count, 2);
      assert.equal((await database.selectFrom('session_sources').select('sync_cursor').executeTakeFirstOrThrow()).sync_cursor, 'cursor-2');
      assert.equal(persistence.getLiveSnapshot('session-2').durable, true);
      await persistence.close();
    } finally {
      await closeDatabase(database);
    }
  });
});

test('replayed source events are idempotent and idle sessions can resume', async () => {
  await withDatabase(async path => {
    const database = createDatabase(path);
    try {
      const persistence = createSessionPersistence(database, { batchIntervalMs: 60_000, idleFlushMs: 60_000 });
      await persistence.openSession({
        id: 'session-3',
        sourceId: 'source-3',
        platform: 'codex',
        externalSessionId: 'thread-3',
        sourceKind: 'cli',
        adapterVersion: 'app-server-v1',
        telemetryLevel: 'partial',
      });
      for (let replay = 0; replay < 2; replay += 1) {
        await persistence.recordEvent({
          sessionId: 'session-3',
          sequenceNumber: 1,
          sourceEventKey: 'stable-event',
          eventType: 'context.compacted',
          critical: true,
        });
      }
      assert.equal((await database.selectFrom('session_events').selectAll().execute()).length, 1);
      await persistence.setStatus('session-3', 'idle');
      assert.equal((await database.selectFrom('sessions').select('status').executeTakeFirstOrThrow()).status, 'idle');
      await persistence.openSession({
        id: 'session-3',
        sourceId: 'source-3',
        platform: 'codex',
        externalSessionId: 'thread-3',
        sourceKind: 'cli',
        adapterVersion: 'app-server-v1',
        telemetryLevel: 'partial',
      });
      assert.equal((await database.selectFrom('sessions').select('status').executeTakeFirstOrThrow()).status, 'active');
      assert.equal((await database.selectFrom('sessions').select(({ fn }) => fn.countAll<number>().as('count')).executeTakeFirstOrThrow()).count, 1);
      await persistence.close();
    } finally {
      await closeDatabase(database);
    }
  });
});

test('a repeated in-memory source event keeps the newest bounded snapshot', async () => {
  await withDatabase(async path => {
    const database = createDatabase(path);
    try {
      const persistence = createSessionPersistence(database, { batchIntervalMs: 60_000, idleFlushMs: 60_000 });
      await persistence.openSession({
        id: 'session-4',
        sourceId: 'source-4',
        platform: 'codex',
        externalSessionId: 'thread-4',
        sourceKind: 'ide',
        adapterVersion: 'app-server-v1',
        telemetryLevel: 'full',
      });
      await persistence.recordEvent({
        sessionId: 'session-4',
        sequenceNumber: 1,
        sourceEventKey: 'plan-item-1',
        eventType: 'turn.plan.updated',
        summary: 'Initial plan',
      });
      await persistence.recordEvent({
        sessionId: 'session-4',
        sequenceNumber: 1,
        sourceEventKey: 'plan-item-1',
        eventType: 'turn.plan.updated',
        summary: 'Updated plan',
      });
      await persistence.flush('session-4');
      const events = await database.selectFrom('session_events').selectAll().execute();
      assert.equal(events.length, 1);
      assert.equal(events[0]?.summary, 'Updated plan');
      await persistence.close();
    } finally {
      await closeDatabase(database);
    }
  });
});

test('session change paths reject absolute and parent traversal paths', async () => {
  await withDatabase(async path => {
    const database = createDatabase(path);
    try {
      const persistence = createSessionPersistence(database);
      assert.equal(persistence.relativeRepositoryPath('frontend/src/App.tsx'), 'frontend/src/App.tsx');
      assert.throws(() => persistence.relativeRepositoryPath('/private/repository/App.tsx'), /repository-relative/);
      assert.throws(() => persistence.relativeRepositoryPath('../outside.txt'), /repository-relative/);
      await persistence.close();
    } finally {
      await closeDatabase(database);
    }
  });
});

test('replay keys cannot move to a later sequence or advance the durable watermark across gaps', async () => {
  await withDatabase(async path => {
    const database = createDatabase(path);
    try {
      const persistence = createSessionPersistence(database, { batchIntervalMs: 60_000, idleFlushMs: 60_000 });
      await persistence.openSession({
        id: 'session-replay', sourceId: 'source-replay', platform: 'codex',
        externalSessionId: 'external-replay', sourceKind: 'cli', adapterVersion: 'v1', telemetryLevel: 'partial',
      });
      await persistence.recordEvent({
        sessionId: 'session-replay', sequenceNumber: 1, sourceEventKey: 'stable-1',
        eventType: 'turn.started', syncCursor: 'cursor-1', critical: true,
      });
      await assert.rejects(() => persistence.recordEvent({
        sessionId: 'session-replay', sequenceNumber: 10, sourceEventKey: 'stable-1',
        eventType: 'turn.started', syncCursor: 'cursor-10', critical: true,
      }), /different sequence number/);
      await persistence.recordEvent({
        sessionId: 'session-replay', sequenceNumber: 3, sourceEventKey: 'stable-3',
        eventType: 'turn.updated', syncCursor: 'cursor-3', critical: true,
      });
      const stored = await persistence.getStoredSnapshot('session-replay');
      assert.equal(stored?.observed_sequence, 3);
      assert.equal(stored?.durable_sequence, 1);
      assert.equal((await database.selectFrom('session_sources').select('sync_cursor').executeTakeFirstOrThrow()).sync_cursor, 'cursor-1');
      await persistence.close();
    } finally {
      await closeDatabase(database);
    }
  });
});

test('source identity and evidence ownership cannot cross local sessions', async () => {
  await withDatabase(async path => {
    const database = createDatabase(path);
    try {
      const persistence = createSessionPersistence(database, { batchIntervalMs: 60_000, idleFlushMs: 60_000 });
      await persistence.openSession({
        id: 'session-a', sourceId: 'source-a', platform: 'codex', externalSessionId: 'external-a',
        sourceKind: 'cli', adapterVersion: 'v1', telemetryLevel: 'partial',
      });
      await assert.rejects(() => persistence.openSession({
        id: 'session-orphan', sourceId: 'source-orphan', platform: 'codex', externalSessionId: 'external-a',
        sourceKind: 'cli', adapterVersion: 'v1', telemetryLevel: 'partial',
      }), /different local session/);
      assert.equal(await database.selectFrom('sessions').selectAll().where('id', '=', 'session-orphan').executeTakeFirst(), undefined);

      await persistence.openSession({
        id: 'session-b', sourceId: 'source-b', platform: 'codex', externalSessionId: 'external-b',
        sourceKind: 'cli', adapterVersion: 'v1', telemetryLevel: 'partial',
      });
      await persistence.upsertThread({
        id: 'thread-b', sessionId: 'session-b', externalThreadId: 'thread-b', role: 'implementer', status: 'active',
      });
      await assert.rejects(() => persistence.upsertTurn({
        id: 'turn-crossed', sessionId: 'session-a', threadId: 'thread-b', externalTurnId: 'turn-crossed',
        sequenceNumber: 1, status: 'active',
      }), /same session/);
      await assert.rejects(() => persistence.recordEvent({
        sessionId: 'session-a', threadId: 'thread-b', sequenceNumber: 1,
        sourceEventKey: 'crossed-event', eventType: 'turn.updated', critical: true,
      }), /another session/);
      assert.equal((await database.selectFrom('session_events').selectAll().execute()).length, 0);
      await persistence.close();
    } finally {
      await closeDatabase(database);
    }
  });
});

test('usage snapshots preserve cache-write input when the provider reports it', async () => {
  await withDatabase(async path => {
    const database = createDatabase(path);
    try {
      const persistence = createSessionPersistence(database);
      await persistence.openSession({
        id: 'session-cache', sourceId: 'source-cache', platform: 'codex', externalSessionId: 'external-cache',
        sourceKind: 'cli', adapterVersion: 'v1', telemetryLevel: 'full',
      });
      await persistence.upsertThread({
        id: 'thread-cache', sessionId: 'session-cache', externalThreadId: 'thread-cache', role: 'orchestrator', status: 'active',
      });
      await persistence.upsertTurn({
        id: 'turn-cache', sessionId: 'session-cache', threadId: 'thread-cache', externalTurnId: 'turn-cache',
        sequenceNumber: 1, status: 'active',
      });
      await persistence.recordUsage({
        sessionId: 'session-cache', turnId: 'turn-cache', sourceEventKey: 'usage-cache',
        measurement: 'exact-live', inputTokens: 20, cachedInputTokens: 12, cacheWriteInputTokens: 3,
        outputTokens: 4, final: true,
      });
      const usage = await database.selectFrom('turn_usage_snapshots').selectAll().executeTakeFirstOrThrow();
      assert.equal(usage.cache_write_input_tokens, 3);
      await persistence.close();
    } finally {
      await closeDatabase(database);
    }
  });
});
