import { randomUUID } from 'node:crypto';
import { isAbsolute, normalize, sep } from 'node:path';
import type { Kysely } from 'kysely';
import type {
  Database,
  SessionStatus,
  TelemetryLevel,
  UsageMeasurement,
} from '../db/database.js';

type TimerHandle = ReturnType<typeof setTimeout>;
type Scheduler = {
  setTimeout(callback: () => void, delayMs: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
};

type PendingEvent = {
  id: string;
  session_id: string;
  thread_id: string | null;
  turn_id: string | null;
  sequence_number: number;
  source_event_key: string;
  event_type: string;
  status: string | null;
  occurred_at: string;
  summary: string | null;
  evidence_json: null;
};

type PendingUsage = {
  id: string;
  turn_id: string;
  source_event_key: string;
  measurement: UsageMeasurement;
  input_tokens: number | null;
  cached_input_tokens: number | null;
  cache_write_input_tokens: number | null;
  output_tokens: number | null;
  reasoning_output_tokens: number | null;
  observed_at: string;
};

type PendingSession = {
  observedSequence: number;
  durableSequence: number;
  events: Map<string, PendingEvent>;
  usage: Map<string, PendingUsage>;
  syncCursor: string | null;
};

export type LiveSessionSnapshot = {
  sessionId: string;
  observedSequence: number;
  durableSequence: number;
  pendingEventCount: number;
  pendingUsageCount: number;
  durable: boolean;
};

export type SessionSnapshotListener = (snapshot: LiveSessionSnapshot) => void;

export type CreateSessionPersistenceOptions = {
  batchIntervalMs?: number;
  maximumBatchSize?: number;
  idleFlushMs?: number;
  uiIntervalMs?: number;
  now?: () => string;
  scheduler?: Scheduler;
};

const defaultScheduler: Scheduler = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: handle => clearTimeout(handle),
};

function compactText(value: unknown, limit = 500) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function relativeRepositoryPath(value: string) {
  const path = normalize(value.trim());
  if (!path || path === '.' || isAbsolute(path) || path === '..' || path.startsWith(`..${sep}`)) {
    throw new Error('Session change paths must be repository-relative.');
  }
  return path.split(sep).join('/');
}

function nullableTokens(measurement: UsageMeasurement, value: number | null | undefined) {
  if (measurement === 'unavailable') return null;
  if (value === null || value === undefined) return null;
  if (!Number.isInteger(value) || value < 0) throw new Error('Token counts must be non-negative integers.');
  return value;
}

export function createSessionPersistence(
  database: Kysely<Database>,
  {
    batchIntervalMs = 3_000,
    maximumBatchSize = 50,
    idleFlushMs = 15_000,
    uiIntervalMs = 750,
    now = () => new Date().toISOString(),
    scheduler = defaultScheduler,
  }: CreateSessionPersistenceOptions = {},
) {
  const pending = new Map<string, PendingSession>();
  const batchTimers = new Map<string, TimerHandle>();
  const idleTimers = new Map<string, TimerHandle>();
  const uiTimers = new Map<string, TimerHandle>();
  const listeners = new Set<SessionSnapshotListener>();
  const flushes = new Map<string, Promise<void>>();

  function state(sessionId: string, durableSequence = 0) {
    let current = pending.get(sessionId);
    if (!current) {
      current = {
        observedSequence: durableSequence,
        durableSequence,
        events: new Map(),
        usage: new Map(),
        syncCursor: null,
      };
      pending.set(sessionId, current);
    }
    return current;
  }

  function snapshot(sessionId: string): LiveSessionSnapshot {
    const current = state(sessionId);
    return {
      sessionId,
      observedSequence: current.observedSequence,
      durableSequence: current.durableSequence,
      pendingEventCount: current.events.size,
      pendingUsageCount: current.usage.size,
      durable: current.observedSequence === current.durableSequence
        && current.events.size === 0
        && current.usage.size === 0,
    };
  }

  function emit(sessionId: string) {
    const value = snapshot(sessionId);
    for (const listener of listeners) listener(value);
  }

  function scheduleUi(sessionId: string, immediate = false) {
    const existing = uiTimers.get(sessionId);
    if (existing) scheduler.clearTimeout(existing);
    if (immediate) {
      uiTimers.delete(sessionId);
      emit(sessionId);
      return;
    }
    const handle = scheduler.setTimeout(() => {
      uiTimers.delete(sessionId);
      emit(sessionId);
    }, uiIntervalMs);
    uiTimers.set(sessionId, handle);
  }

  function clearTimer(timers: Map<string, TimerHandle>, sessionId: string) {
    const handle = timers.get(sessionId);
    if (handle) scheduler.clearTimeout(handle);
    timers.delete(sessionId);
  }

  function scheduleFlush(sessionId: string) {
    clearTimer(batchTimers, sessionId);
    batchTimers.set(sessionId, scheduler.setTimeout(() => {
      batchTimers.delete(sessionId);
      void flush(sessionId).catch(error => handleScheduledFlushFailure(sessionId, error));
    }, batchIntervalMs));
  }

  function scheduleIdleFlush(sessionId: string) {
    clearTimer(idleTimers, sessionId);
    idleTimers.set(sessionId, scheduler.setTimeout(() => {
      idleTimers.delete(sessionId);
      void flush(sessionId).catch(error => handleScheduledFlushFailure(sessionId, error));
    }, idleFlushMs));
  }

  async function handleScheduledFlushFailure(sessionId: string, error: unknown) {
    try {
      await database.updateTable('session_sources').set({
        sync_status: 'error',
        sync_error: compactText(error instanceof Error ? error.message : error, 500),
      }).where('session_id', '=', sessionId).execute();
    } catch {
      // Keep the pending batch in memory; a later explicit flush can recover it.
    }
    if (pending.has(sessionId)) scheduleFlush(sessionId);
    scheduleUi(sessionId, true);
  }

  async function openSession(input: {
    id: string;
    sourceId: string;
    platform: string;
    externalSessionId: string;
    sourceKind: 'cli' | 'ide' | 'desktop' | 'cloud' | 'imported' | 'unknown';
    adapterVersion: string;
    telemetryLevel: TelemetryLevel;
    title?: string | null;
    startedAt?: string | null;
  }) {
    const timestamp = now();
    await database.transaction().execute(async transaction => {
      const existingSource = await transaction.selectFrom('session_sources')
        .select('session_id')
        .where('platform', '=', input.platform)
        .where('external_session_id', '=', input.externalSessionId)
        .executeTakeFirst();
      if (existingSource && existingSource.session_id !== input.id) {
        throw new Error('The external session is already attached to a different local session.');
      }
      await transaction.insertInto('sessions').values({
        id: input.id,
        title: compactText(input.title, 200),
        status: 'active',
        telemetry_level: input.telemetryLevel,
        observed_sequence: 0,
        durable_sequence: 0,
        created_at: timestamp,
        started_at: input.startedAt ?? timestamp,
        last_observed_at: timestamp,
        last_persisted_at: timestamp,
        completed_at: null,
        updated_at: timestamp,
      }).onConflict(conflict => conflict.column('id').doUpdateSet({
        status: 'active',
        completed_at: null,
        last_observed_at: timestamp,
        last_persisted_at: timestamp,
        updated_at: timestamp,
      })).execute();
      await transaction.insertInto('session_sources').values({
        id: input.sourceId,
        session_id: input.id,
        platform: input.platform,
        external_session_id: input.externalSessionId,
        source_kind: input.sourceKind,
        adapter_version: input.adapterVersion,
        sync_status: 'connected',
        sync_cursor: null,
        last_synced_at: timestamp,
        sync_error: null,
      }).onConflict(conflict => conflict.columns(['platform', 'external_session_id']).doUpdateSet({
        adapter_version: input.adapterVersion,
        sync_status: 'connected',
        last_synced_at: timestamp,
        sync_error: null,
      })).execute();
    });
    const row = await database.selectFrom('sessions')
      .select(['observed_sequence', 'durable_sequence'])
      .where('id', '=', input.id)
      .executeTakeFirstOrThrow();
    const current = state(input.id, row.durable_sequence);
    current.observedSequence = Math.max(current.observedSequence, row.observed_sequence);
    scheduleUi(input.id, true);
    return snapshot(input.id);
  }

  async function upsertThread(input: {
    id: string;
    sessionId: string;
    externalThreadId: string;
    parentThreadId?: string | null;
    role: 'orchestrator' | 'implementer' | 'researcher' | 'tester' | 'reviewer' | 'other';
    status: 'active' | 'idle' | 'completed' | 'failed' | 'interrupted' | 'unknown';
    startedAt?: string | null;
    completedAt?: string | null;
  }) {
    await flush(input.sessionId);
    if (input.parentThreadId) {
      const parent = await database.selectFrom('session_threads')
        .select('session_id')
        .where('id', '=', input.parentThreadId)
        .executeTakeFirst();
      if (!parent || parent.session_id !== input.sessionId) {
        throw new Error('A parent thread must belong to the same session.');
      }
    }
    await database.insertInto('session_threads').values({
      id: input.id,
      session_id: input.sessionId,
      external_thread_id: input.externalThreadId,
      parent_thread_id: input.parentThreadId ?? null,
      role: input.role,
      status: input.status,
      started_at: input.startedAt ?? null,
      completed_at: input.completedAt ?? null,
      display_name: null,
    }).onConflict(conflict => conflict.columns(['session_id', 'external_thread_id']).doUpdateSet({
      parent_thread_id: input.parentThreadId ?? null,
      role: input.role,
      status: input.status,
      completed_at: input.completedAt ?? null,
    })).execute();
    scheduleUi(input.sessionId, true);
  }

  async function upsertTurn(input: {
    id: string;
    sessionId: string;
    threadId: string;
    externalTurnId: string;
    sequenceNumber: number;
    provider?: string | null;
    model?: string | null;
    reasoningLevel?: string | null;
    status: 'active' | 'completed' | 'failed' | 'interrupted' | 'unknown';
    startedAt?: string | null;
    completedAt?: string | null;
    durationMs?: number | null;
  }) {
    await flush(input.sessionId);
    const thread = await database.selectFrom('session_threads')
      .select('session_id')
      .where('id', '=', input.threadId)
      .executeTakeFirst();
    if (!thread || thread.session_id !== input.sessionId) {
      throw new Error('A turn must belong to a thread in the same session.');
    }
    await database.insertInto('session_turns').values({
      id: input.id,
      thread_id: input.threadId,
      external_turn_id: input.externalTurnId,
      sequence_number: input.sequenceNumber,
      provider: input.provider ?? null,
      model: input.model ?? null,
      reasoning_level: input.reasoningLevel ?? null,
      status: input.status,
      started_at: input.startedAt ?? null,
      completed_at: input.completedAt ?? null,
      duration_ms: input.durationMs ?? null,
    }).onConflict(conflict => conflict.columns(['thread_id', 'external_turn_id']).doUpdateSet({
      provider: input.provider ?? null,
      model: input.model ?? null,
      reasoning_level: input.reasoningLevel ?? null,
      status: input.status,
      completed_at: input.completedAt ?? null,
      duration_ms: input.durationMs ?? null,
    })).execute();
    scheduleUi(input.sessionId, true);
  }

  async function recordEvent(input: {
    sessionId: string;
    threadId?: string | null;
    turnId?: string | null;
    sequenceNumber: number;
    sourceEventKey: string;
    eventType: string;
    status?: string | null;
    occurredAt?: string;
    summary?: string | null;
    syncCursor?: string | null;
    critical?: boolean;
  }) {
    if (!Number.isInteger(input.sequenceNumber) || input.sequenceNumber < 1) {
      throw new Error('Session event sequence numbers must be positive integers.');
    }
    if (!input.sourceEventKey.trim()) throw new Error('Session events require a stable source event key.');
    if (input.threadId) {
      const thread = await database.selectFrom('session_threads')
        .select('session_id').where('id', '=', input.threadId).executeTakeFirst();
      if (!thread || thread.session_id !== input.sessionId) {
        throw new Error('Session evidence cannot reference a thread from another session.');
      }
    }
    if (input.turnId) {
      const turn = await database.selectFrom('session_turns as turns')
        .innerJoin('session_threads as threads', 'threads.id', 'turns.thread_id')
        .select('threads.session_id').where('turns.id', '=', input.turnId).executeTakeFirst();
      if (!turn || turn.session_id !== input.sessionId) {
        throw new Error('Session evidence cannot reference a turn from another session.');
      }
    }
    const current = state(input.sessionId);
    const pendingReplay = current.events.get(input.sourceEventKey);
    if (pendingReplay && pendingReplay.sequence_number !== input.sequenceNumber) {
      throw new Error('A source event key cannot be replayed with a different sequence number.');
    }
    const durableReplay = await database.selectFrom('session_events')
      .select('sequence_number')
      .where('session_id', '=', input.sessionId)
      .where('source_event_key', '=', input.sourceEventKey)
      .executeTakeFirst();
    if (durableReplay && durableReplay.sequence_number !== input.sequenceNumber) {
      throw new Error('A source event key cannot be replayed with a different sequence number.');
    }
    current.observedSequence = Math.max(current.observedSequence, input.sequenceNumber);
    current.syncCursor = input.syncCursor ?? current.syncCursor;
    current.events.set(input.sourceEventKey, {
      id: randomUUID(),
      session_id: input.sessionId,
      thread_id: input.threadId ?? null,
      turn_id: input.turnId ?? null,
      sequence_number: input.sequenceNumber,
      source_event_key: input.sourceEventKey,
      event_type: compactText(input.eventType, 100) ?? 'unknown',
      status: compactText(input.status, 100),
      occurred_at: input.occurredAt ?? now(),
      summary: compactText(input.summary),
      evidence_json: null,
    });
    scheduleIdleFlush(input.sessionId);
    scheduleUi(input.sessionId, Boolean(input.critical));
    if (input.critical || current.events.size + current.usage.size >= maximumBatchSize) {
      await flush(input.sessionId);
    } else {
      scheduleFlush(input.sessionId);
    }
    return snapshot(input.sessionId);
  }

  async function recordUsage(input: {
    sessionId: string;
    turnId: string;
    sourceEventKey: string;
    measurement: UsageMeasurement;
    inputTokens?: number | null;
    cachedInputTokens?: number | null;
    cacheWriteInputTokens?: number | null;
    outputTokens?: number | null;
    reasoningOutputTokens?: number | null;
    observedAt?: string;
    final?: boolean;
  }) {
    if (!input.sourceEventKey.trim()) throw new Error('Usage snapshots require a stable source event key.');
    const turn = await database.selectFrom('session_turns as turns')
      .innerJoin('session_threads as threads', 'threads.id', 'turns.thread_id')
      .select('threads.session_id')
      .where('turns.id', '=', input.turnId)
      .executeTakeFirst();
    if (!turn || turn.session_id !== input.sessionId) {
      throw new Error('Usage must belong to a turn in the same session.');
    }
    const current = state(input.sessionId);
    current.usage.set(`${input.turnId}:${input.sourceEventKey}`, {
      id: randomUUID(),
      turn_id: input.turnId,
      source_event_key: input.sourceEventKey,
      measurement: input.measurement,
      input_tokens: nullableTokens(input.measurement, input.inputTokens),
      cached_input_tokens: nullableTokens(input.measurement, input.cachedInputTokens),
      cache_write_input_tokens: nullableTokens(input.measurement, input.cacheWriteInputTokens),
      output_tokens: nullableTokens(input.measurement, input.outputTokens),
      reasoning_output_tokens: nullableTokens(input.measurement, input.reasoningOutputTokens),
      observed_at: input.observedAt ?? now(),
    });
    scheduleIdleFlush(input.sessionId);
    scheduleUi(input.sessionId);
    if (input.final || current.events.size + current.usage.size >= maximumBatchSize) {
      await flush(input.sessionId);
    } else {
      scheduleFlush(input.sessionId);
    }
    return snapshot(input.sessionId);
  }

  async function performFlush(sessionId: string) {
    clearTimer(batchTimers, sessionId);
    const current = state(sessionId);
    const events = [...current.events.values()];
    const usage = [...current.usage.values()];
    if (!events.length && !usage.length) return;
    let durableSequence = current.durableSequence;
    const persistedAt = now();
    await database.transaction().execute(async transaction => {
      if (events.length) {
        const existing = await transaction.selectFrom('session_events')
          .select(['source_event_key', 'sequence_number'])
          .where('session_id', '=', sessionId)
          .where('source_event_key', 'in', events.map(event => event.source_event_key))
          .execute();
        const pendingByKey = new Map(events.map(event => [event.source_event_key, event]));
        for (const row of existing) {
          if (pendingByKey.get(row.source_event_key)?.sequence_number !== row.sequence_number) {
            throw new Error('A source event key cannot be replayed with a different sequence number.');
          }
        }
        for (const event of events) {
          if (event.thread_id) {
            const thread = await transaction.selectFrom('session_threads')
              .select('session_id')
              .where('id', '=', event.thread_id)
              .executeTakeFirst();
            if (!thread || thread.session_id !== sessionId) {
              throw new Error('Session evidence cannot reference a thread from another session.');
            }
          }
          if (event.turn_id) {
            const turn = await transaction.selectFrom('session_turns as turns')
              .innerJoin('session_threads as threads', 'threads.id', 'turns.thread_id')
              .select('threads.session_id')
              .where('turns.id', '=', event.turn_id)
              .executeTakeFirst();
            if (!turn || turn.session_id !== sessionId) {
              throw new Error('Session evidence cannot reference a turn from another session.');
            }
          }
        }
        await transaction.insertInto('session_events').values(events)
          .onConflict(conflict => conflict.columns(['session_id', 'source_event_key']).doNothing())
          .execute();
      }
      if (usage.length) {
        await transaction.insertInto('turn_usage_snapshots').values(usage)
          .onConflict(conflict => conflict.columns(['turn_id', 'source_event_key']).doNothing())
          .execute();
      }
      const sequences = await transaction.selectFrom('session_events')
        .select('sequence_number')
        .where('session_id', '=', sessionId)
        .orderBy('sequence_number')
        .execute();
      durableSequence = 0;
      for (const row of sequences) {
        if (row.sequence_number !== durableSequence + 1) break;
        durableSequence = row.sequence_number;
      }
      await transaction.updateTable('sessions').set({
        observed_sequence: current.observedSequence,
        durable_sequence: durableSequence,
        last_observed_at: persistedAt,
        last_persisted_at: persistedAt,
        updated_at: persistedAt,
      }).where('id', '=', sessionId).executeTakeFirstOrThrow();
      if (current.syncCursor !== null && durableSequence === current.observedSequence) {
        await transaction.updateTable('session_sources').set({
          sync_cursor: current.syncCursor,
          last_synced_at: persistedAt,
          sync_status: 'synced',
        }).where('session_id', '=', sessionId).execute();
      }
    });
    for (const event of events) {
      if (current.events.get(event.source_event_key) === event) {
        current.events.delete(event.source_event_key);
      }
    }
    for (const item of usage) {
      const key = `${item.turn_id}:${item.source_event_key}`;
      if (current.usage.get(key) === item) current.usage.delete(key);
    }
    current.durableSequence = durableSequence;
    emit(sessionId);
  }

  async function flush(sessionId: string) {
    const existing = flushes.get(sessionId);
    if (existing) {
      await existing;
      if (state(sessionId).events.size || state(sessionId).usage.size) return flush(sessionId);
      return;
    }
    const operation = performFlush(sessionId).finally(() => flushes.delete(sessionId));
    flushes.set(sessionId, operation);
    await operation;
  }

  async function setStatus(sessionId: string, status: SessionStatus) {
    await flush(sessionId);
    const timestamp = now();
    const terminal = status === 'completed' || status === 'failed' || status === 'interrupted';
    await database.updateTable('sessions').set({
      status,
      completed_at: terminal ? timestamp : null,
      last_observed_at: timestamp,
      last_persisted_at: timestamp,
      updated_at: timestamp,
    }).where('id', '=', sessionId).executeTakeFirstOrThrow();
    if (terminal) {
      clearTimer(idleTimers, sessionId);
      clearTimer(batchTimers, sessionId);
    }
    scheduleUi(sessionId, true);
  }

  async function getStoredSnapshot(sessionId: string) {
    return database.selectFrom('session_summary').selectAll()
      .where('session_id', '=', sessionId)
      .executeTakeFirst();
  }

  function subscribe(listener: SessionSnapshotListener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  async function close() {
    for (const sessionId of pending.keys()) await flush(sessionId);
    for (const sessionId of pending.keys()) {
      clearTimer(batchTimers, sessionId);
      clearTimer(idleTimers, sessionId);
      clearTimer(uiTimers, sessionId);
    }
    listeners.clear();
  }

  return {
    openSession,
    upsertThread,
    upsertTurn,
    recordEvent,
    recordUsage,
    flush,
    setStatus,
    getLiveSnapshot: snapshot,
    getStoredSnapshot,
    subscribe,
    close,
    relativeRepositoryPath,
  };
}
