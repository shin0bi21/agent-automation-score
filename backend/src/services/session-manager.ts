import { createHash, randomUUID } from 'node:crypto';
import type { Kysely } from 'kysely';
import { createDatabase } from '../db/client.js';
import { databasePath } from '../db/config.js';
import type { Database, SessionStatus } from '../db/database.js';
import { migrate } from '../db/migrator.js';
import { listCodexStoredSessions, readCodexStoredSession } from './codex-session-source.js';
import { readCodexSessionTelemetry, readCodexWorkerUsage, type CodexDirectiveSummary, type CodexSessionTelemetry, type CodexOffloadSummary } from './codex-local-session-store.js';
import { buildSessionRepositoryTraversalReport } from './session-path-report.js';
import type { ObservedRepositoryPathTouch } from './codex-path-observation.js';
import { normalizeSessionRepositoryPath } from './session-path-traversal.js';
import { buildSessionUsageTimeline } from './session-usage-timeline.js';

export type SessionWorkerUsage = {
  externalThreadId: string;
  parentExternalThreadId: string | null;
  nickname: string | null;
  role: string | null;
  model: string | null;
  reasoningLevel: string | null;
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
};

type Source = {
  list(): ReturnType<typeof listCodexStoredSessions>;
  read(id: string): ReturnType<typeof readCodexStoredSession>;
  telemetry?(id: string): Promise<Pick<CodexSessionTelemetry, 'workers' | 'offload' | 'directives' | 'pathTouches'>>;
  workers?(id: string): Promise<SessionWorkerUsage[]>;
  offload?(id: string): Promise<CodexOffloadSummary>;
  directives?(id: string): Promise<CodexDirectiveSummary>;
  pathTouches?(id: string): Promise<ObservedRepositoryPathTouch[]>;
};

const stableId = (prefix: string, value: string) => `${prefix}-${createHash('sha256').update(value).digest('hex').slice(0, 24)}`;
const sessionStatus = (value: string): SessionStatus => value === 'completed' ? 'completed' : value === 'failed' ? 'failed' : value === 'interrupted' || value === 'cancelled' ? 'interrupted' : value === 'active' ? 'active' : 'idle';
const turnStatus = (value: string) => value === 'completed' ? 'completed' : value === 'failed' ? 'failed' : value === 'interrupted' || value === 'cancelled' ? 'interrupted' : 'unknown';

async function review(database: Kysely<Database>, id: string) {
  const row = await database.selectFrom('session_summary as summary')
    .innerJoin('sessions as session', 'session.id', 'summary.session_id')
    .innerJoin('session_sources as source', 'source.session_id', 'summary.session_id')
    .leftJoin('session_repositories as repository', 'repository.session_id', 'summary.session_id')
    .select([
      'summary.session_id as id', 'session.title', 'summary.status', 'summary.telemetry_level as telemetryLevel',
      'summary.observed_sequence as observedSequence', 'summary.durable_sequence as durableSequence',
      'summary.started_at as startedAt', 'summary.last_observed_at as lastObservedAt',
      'summary.completed_at as completedAt', 'summary.turn_count as turnCount',
      'summary.event_count as eventCount', 'summary.check_count as checkCount',
      'summary.changed_file_event_count as changedFileEventCount', 'summary.input_tokens as inputTokens',
      'summary.cached_input_tokens as cachedInputTokens', 'summary.output_tokens as outputTokens',
      'source.platform', 'source.external_session_id as externalSessionId', 'repository.repository_name as repositoryName',
    ]).where('summary.session_id', '=', id).executeTakeFirst();
  if (!row) return null;
  const groups = await database.selectFrom('session_events').select(['event_type as type'])
    .select(expression => expression.fn.count<number>('id').as('count'))
    .where('session_id', '=', id).groupBy('event_type').execute();
  const offloadRow = await database.selectFrom('session_offload_summaries').selectAll().where('session_id', '=', id).executeTakeFirst();
  const processRows = await database.selectFrom('session_offload_processes').selectAll().where('session_id', '=', id)
    .orderBy('output_bytes', 'desc').orderBy('batch_count', 'desc').execute();
  const directiveRows = await database.selectFrom('session_directive_episodes as episode')
    .innerJoin('session_interactions as interaction', 'interaction.id', 'episode.opening_interaction_id')
    .select([
      'episode.id', 'episode.sequence_number as sequenceNumber', 'episode.status', 'episode.started_at as startedAt',
      'episode.completed_at as completedAt', 'episode.classification_confidence as classificationConfidence',
      'episode.preparation_questions as preparationQuestions', 'episode.preparation_context as preparationContext',
      'episode.preparation_approvals as preparationApprovals', 'episode.correction_count as corrections',
      'episode.preparation_pattern_references as preparationPatternReferences',
      'episode.context_tokens_at_start as contextTokensAtStart', 'episode.context_window as contextWindow',
      'episode.peak_context_percent as peakContextPercent', 'episode.agents_references as agentsReferences',
      'episode.skill_references as skillReferences', 'episode.first_pattern_latency_ms as firstPatternLatencyMs',
      'episode.pattern_before_first_change as patternBeforeFirstChange', 'episode.tool_calls as toolCalls',
      'episode.file_changes as fileChanges', 'episode.web_searches as webSearches', 'episode.delegations',
      'episode.compactions', 'episode.verification_batches as verificationBatches',
      'interaction.source_interaction_key as openingInteractionKey', 'interaction.kind as openingKind',
      'interaction.input_tokens as openingInputTokens', 'interaction.cached_input_tokens as openingCachedInputTokens',
      'interaction.output_tokens as openingOutputTokens',
    ]).where('episode.session_id', '=', id).orderBy('episode.sequence_number').execute();
  const interactionRows = await database.selectFrom('session_interactions')
    .select([
      'source_interaction_key as key', 'sequence_number as sequenceNumber', 'kind', 'occurred_at as occurredAt',
      'context_tokens as contextTokens', 'context_window as contextWindow', 'input_tokens as inputTokens',
      'cached_input_tokens as cachedInputTokens', 'output_tokens as outputTokens',
    ])
    .where('session_id', '=', id).orderBy('sequence_number').execute();
  const pathTouchRows = await database.selectFrom('session_path_touches')
    .select(['file_path as path', 'touch_kind as kind', 'occurred_at as occurredAt', 'prompt_key as promptKey'])
    .where('session_id', '=', id).orderBy('sequence_number').execute();
  const directiveSkills = await database.selectFrom('session_episode_skills as skill')
    .innerJoin('session_directive_episodes as episode', 'episode.id', 'skill.episode_id')
    .select(['skill.episode_id as episodeId', 'skill.skill_name as skillName'])
    .where('episode.session_id', '=', id).orderBy('skill.skill_name').execute();
  const preparationSkills = await database.selectFrom('session_episode_preparation_skills as skill')
    .innerJoin('session_directive_episodes as episode', 'episode.id', 'skill.episode_id')
    .select(['skill.episode_id as episodeId', 'skill.skill_name as skillName'])
    .where('episode.session_id', '=', id).orderBy('skill.skill_name').execute();
  const workerRows = await database.selectFrom('session_threads as thread')
    .innerJoin('session_turns as turn', 'turn.thread_id', 'thread.id')
    .innerJoin('turn_usage_snapshots as usage', 'usage.turn_id', 'turn.id')
    .select(['thread.id', 'thread.display_name as name', 'thread.role', 'turn.id as turnId', 'turn.model', 'turn.reasoning_level as reasoningLevel', 'usage.id as usageId', 'usage.observed_at as observedAt', 'usage.measurement', 'usage.input_tokens as inputTokens', 'usage.cached_input_tokens as cachedInputTokens', 'usage.cache_write_input_tokens as cacheWriteInputTokens', 'usage.output_tokens as outputTokens', 'usage.reasoning_output_tokens as reasoningOutputTokens'])
    .where('thread.session_id', '=', id)
    .orderBy('usage.observed_at', 'desc').orderBy('usage.id', 'desc').execute();
  const latestByTurn = new Map<string, typeof workerRows[number]>();
  for (const worker of workerRows) if (!latestByTurn.has(worker.turnId)) latestByTurn.set(worker.turnId, worker);
  const byWorker = new Map<string, { id: string; name: string | null; role: string; model: string | null; reasoningLevel: string | null; inputTokens: number; cachedInputTokens: number; cacheWriteInputTokens: number; outputTokens: number; reasoningOutputTokens: number; totalTokens: number }>();
  for (const row of latestByTurn.values()) {
    if (row.measurement === 'unavailable') continue;
    const worker = byWorker.get(row.id) ?? { id: row.id, name: row.name, role: row.role, model: row.model, reasoningLevel: row.reasoningLevel, inputTokens: 0, cachedInputTokens: 0, cacheWriteInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0, totalTokens: 0 };
    worker.model ??= row.model;
    worker.reasoningLevel ??= row.reasoningLevel;
    worker.inputTokens += row.inputTokens ?? 0;
    worker.cachedInputTokens += row.cachedInputTokens ?? 0;
    worker.cacheWriteInputTokens += row.cacheWriteInputTokens ?? 0;
    worker.outputTokens += row.outputTokens ?? 0;
    worker.reasoningOutputTokens += row.reasoningOutputTokens ?? 0;
    worker.totalTokens = worker.inputTokens + worker.outputTokens;
    byWorker.set(row.id, worker);
  }
  const workers = [...byWorker.values()];
  const rootWorker = workers.find(worker => worker.role === 'orchestrator');
  const timelinePoints = buildSessionUsageTimeline({
    boundaries: interactionRows,
    closing: {
      inputTokens: rootWorker?.inputTokens ?? null,
      cachedInputTokens: rootWorker?.cachedInputTokens ?? null,
      outputTokens: rootWorker?.outputTokens ?? null,
    },
    observedAt: row.lastObservedAt ?? row.completedAt ?? row.startedAt ?? new Date(0).toISOString(),
    live: false,
  });
  const byModel = new Map<string, { model: string; workerCount: number; inputTokens: number; cachedInputTokens: number; cacheWriteInputTokens: number; outputTokens: number; reasoningOutputTokens: number; totalTokens: number }>();
  for (const worker of workers) {
    const model = worker.model ?? 'unattributed';
    const aggregate = byModel.get(model) ?? { model, workerCount: 0, inputTokens: 0, cachedInputTokens: 0, cacheWriteInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0, totalTokens: 0 };
    aggregate.workerCount += 1;
    for (const key of ['inputTokens', 'cachedInputTokens', 'cacheWriteInputTokens', 'outputTokens', 'reasoningOutputTokens', 'totalTokens'] as const) aggregate[key] += worker[key] ?? 0;
    byModel.set(model, aggregate);
  }
  const offload = offloadRow ? {
    available: true,
    shellBatches: offloadRow.shell_batches,
    candidateBatches: offloadRow.candidate_batches,
    associatedInputTokens: offloadRow.associated_input_tokens,
    associatedCachedInputTokens: offloadRow.associated_cached_input_tokens,
    associatedOutputTokens: offloadRow.associated_output_tokens,
    associatedTotalTokens: offloadRow.associated_total_tokens,
    categories: {
      verification: offloadRow.verification_batches,
      build: offloadRow.build_batches,
      formatting: offloadRow.formatting_batches,
      script: offloadRow.script_batches,
      monitoring: offloadRow.monitoring_batches,
    },
    processPatterns: processRows.map(pattern => ({
      key: pattern.signature_key, label: pattern.label, runner: pattern.runner, operation: pattern.operation,
      batchCount: pattern.batch_count, successCount: pattern.success_count, failureCount: pattern.failure_count,
      unknownCount: pattern.unknown_count, outputBytes: pattern.output_bytes,
      maximumOutputBytes: pattern.maximum_output_bytes, outputMode: pattern.output_mode,
      recommendation: pattern.recommendation,
    })),
  } : {
    available: false,
    shellBatches: 0,
    candidateBatches: 0,
    associatedInputTokens: 0,
    associatedCachedInputTokens: 0,
    associatedOutputTokens: 0,
    associatedTotalTokens: 0,
    categories: { verification: 0, build: 0, formatting: 0, script: 0, monitoring: 0 }, processPatterns: [],
  };
  const directives = directiveRows.length ? {
    available: true, classifierVersion: 2,
    episodes: directiveRows.map(episode => ({
      key: episode.id, sequenceNumber: episode.sequenceNumber, status: episode.status,
      startedAt: episode.startedAt, completedAt: episode.completedAt,
      openingInteractionKey: episode.openingInteractionKey,
      openingKind: episode.openingKind,
      classificationConfidence: episode.classificationConfidence,
      preparation: {
        questions: episode.preparationQuestions, context: episode.preparationContext,
        approvals: episode.preparationApprovals, patternReferences: episode.preparationPatternReferences,
        skillsUsed: preparationSkills.filter(skill => skill.episodeId === episode.id).map(skill => skill.skillName),
      },
      corrections: episode.corrections,
      context: {
        tokensAtStart: episode.contextTokensAtStart ?? 0, window: episode.contextWindow,
        percentAtStart: episode.contextWindow && episode.contextTokensAtStart !== null ? Math.min(100, episode.contextTokensAtStart / episode.contextWindow * 100) : null,
        peakPercent: episode.peakContextPercent,
      },
      usageAtStart: {
        inputTokens: episode.openingInputTokens ?? 0,
        cachedInputTokens: episode.openingCachedInputTokens ?? 0,
        outputTokens: episode.openingOutputTokens ?? 0,
      },
      discovery: {
        agentsReferences: episode.agentsReferences, skillReferences: episode.skillReferences,
        skillsUsed: directiveSkills.filter(skill => skill.episodeId === episode.id).map(skill => skill.skillName),
        firstPatternLatencyMs: episode.firstPatternLatencyMs,
        patternBeforeFirstChange: episode.patternBeforeFirstChange === null ? null : Boolean(episode.patternBeforeFirstChange),
      },
      execution: {
        toolCalls: episode.toolCalls, fileChanges: episode.fileChanges, webSearches: episode.webSearches,
        delegations: episode.delegations, compactions: episode.compactions, verificationBatches: episode.verificationBatches,
      },
    })),
  } : { available: false, classifierVersion: 2, episodes: [] };
  const { lastObservedAt: _lastObservedAt, ...reviewRow } = row;
  return { ...reviewRow, evidence: Object.fromEntries(groups.map(group => [group.type, Number(group.count)])), usageAvailable: workers.length > 0, workerUsage: workers, modelUsage: [...byModel.values()], offload, directives, usageTimeline: { available: timelinePoints.length > 0, points: timelinePoints }, repositoryTraversal: buildSessionRepositoryTraversalReport(pathTouchRows.map(touch => ({ ...touch, promptKey: touch.promptKey ?? undefined }))) };
}

export function createSessionManager({
  root,
  database,
  source = { list: listCodexStoredSessions, read: readCodexStoredSession, telemetry: readCodexSessionTelemetry, workers: readCodexWorkerUsage },
}: { root: string; database?: Kysely<Database>; source?: Source }) {
  const path = databasePath(root);
  if (!database) migrate({ path });
  const db = database ?? createDatabase(path);

  async function listImported() {
    const rows = await db.selectFrom('sessions').select('id').orderBy('updated_at', 'desc').execute();
    return (await Promise.all(rows.map(row => review(db, row.id)))).filter(Boolean);
  }

  const imports = new Map<string, Promise<Awaited<ReturnType<typeof review>>>>();

  async function importCodexUnlocked(externalId: string) {
    if (!/^[a-zA-Z0-9-]{8,100}$/.test(externalId)) throw new Error('Invalid Codex session ID.');
    const thread = await source.read(externalId);
    const telemetry = source.telemetry ? await source.telemetry(externalId) : null;
    const workers = telemetry?.workers ?? (source.workers ? await source.workers(externalId) : []);
    const offload = telemetry?.offload ?? (source.offload ? await source.offload(externalId) : null);
    const directives = telemetry?.directives ?? (source.directives ? await source.directives(externalId) : null);
    const pathTouches = telemetry?.pathTouches ?? (source.pathTouches ? await source.pathTouches(externalId) : []);
    const normalizedPathTouches = pathTouches.slice(0, 1_000).flatMap(touch => {
      const path = normalizeSessionRepositoryPath(touch.path);
      if (!path || path.length > 500 || !['read', 'search', 'change', 'check'].includes(touch.kind) || Number.isNaN(Date.parse(touch.occurredAt)) || !touch.sourceKey.trim()) return [];
      return [{
        ...touch,
        sourceKey: touch.sourceKey.slice(0, 500),
        promptKey: touch.promptKey?.slice(0, 200) ?? null,
        path,
        occurredAt: new Date(touch.occurredAt).toISOString(),
      }];
    });
    const id = stableId('session', `codex:${externalId}`);
    const threadId = stableId('thread', `codex:${externalId}`);
    const safeTitle = `Codex session ${externalId.slice(0, 8)}`;
    const now = new Date().toISOString();
    const startedAt = thread.createdAt ?? now;
    const normalizedStatus = sessionStatus(thread.status);
    const terminal = normalizedStatus === 'completed' || normalizedStatus === 'failed' || normalizedStatus === 'interrupted';
    const observedAt = thread.updatedAt ?? now;
    const completedAt = terminal ? observedAt : null;
    const events = thread.turns.flatMap((turn, turnIndex) => turn.items.map((item, itemIndex) => ({ turn, turnIndex, item, itemIndex })));
    await db.transaction().execute(async transaction => {
      const existingSession = await transaction.selectFrom('sessions').selectAll().where('id', '=', id).executeTakeFirst();
      const existingEvents = await transaction.selectFrom('session_events')
        .select(['source_event_key', 'sequence_number']).where('session_id', '=', id).execute();
      const existingKeys = new Set(existingEvents.map(event => event.source_event_key));
      const canAppendEvents = !existingSession || existingSession.observed_sequence === existingSession.durable_sequence;
      let nextSequence = Math.max(existingSession?.observed_sequence ?? 0, ...existingEvents.map(event => event.sequence_number), 0);
      const newEvents = canAppendEvents ? events.filter(({ turn, item }) => !existingKeys.has(`import:${turn.id}:${item.id}`)) : [];
      const importedStatus = existingSession && existingSession.telemetry_level !== 'imported' ? existingSession.status : normalizedStatus;
      const importedCompletedAt = existingSession && existingSession.telemetry_level !== 'imported' ? existingSession.completed_at : completedAt;
      const observedSequence = nextSequence + newEvents.length;
      const durableSequence = canAppendEvents ? observedSequence : existingSession?.durable_sequence ?? 0;
      await transaction.insertInto('sessions').values({
        id, title: safeTitle, status: importedStatus, telemetry_level: existingSession?.telemetry_level ?? 'imported',
        observed_sequence: observedSequence, durable_sequence: durableSequence, created_at: existingSession?.created_at ?? now,
        started_at: existingSession?.started_at ?? startedAt, last_observed_at: observedAt,
        last_persisted_at: now, completed_at: importedCompletedAt, updated_at: now,
      }).onConflict(conflict => conflict.column('id').doUpdateSet({
        title: safeTitle, status: importedStatus, telemetry_level: existingSession?.telemetry_level ?? 'imported',
        observed_sequence: observedSequence, durable_sequence: durableSequence,
        last_observed_at: observedAt, last_persisted_at: now, completed_at: importedCompletedAt, updated_at: now,
      })).execute();
      await transaction.insertInto('session_sources').values({
        id: stableId('source', `codex:${externalId}`), session_id: id, platform: 'codex', external_session_id: externalId,
        source_kind: 'imported', adapter_version: 'codex-app-server-v2', sync_status: 'synced',
        sync_cursor: String(durableSequence), last_synced_at: now, sync_error: null,
      }).onConflict(conflict => conflict.columns(['platform', 'external_session_id']).doUpdateSet({
        adapter_version: 'codex-app-server-v2', sync_status: 'synced', sync_cursor: String(durableSequence),
        last_synced_at: now, sync_error: null,
      })).execute();
      if (thread.repositoryName) await transaction.insertInto('session_repositories').values({
        session_id: id, repository_name: thread.repositoryName, base_revision: thread.revision,
        final_revision: thread.revision, guidance_revision: null, working_tree_dirty: null, attached_at: now,
      }).onConflict(conflict => conflict.column('session_id').doUpdateSet({
        repository_name: thread.repositoryName!, base_revision: thread.revision,
        final_revision: thread.revision, attached_at: now,
      })).execute();
      await transaction.insertInto('session_threads').values({
        id: threadId, session_id: id, external_thread_id: externalId, parent_thread_id: null, role: 'orchestrator',
        status: normalizedStatus, started_at: startedAt, completed_at: completedAt,
        display_name: 'Main agent',
      }).onConflict(conflict => conflict.columns(['session_id', 'external_thread_id']).doUpdateSet({
        status: normalizedStatus, completed_at: completedAt, display_name: 'Main agent',
      })).execute();
      const rootWorker = workers.find(worker => worker.externalThreadId === externalId);
      const rootUsageTurnId = rootWorker && thread.turns.length ? stableId('turn', `${externalId}:${thread.turns.at(-1)!.id}`) : null;
      for (const [index, turn] of thread.turns.entries()) {
        const turnId = stableId('turn', `${externalId}:${turn.id}`);
        await transaction.insertInto('session_turns').values({
          id: turnId, thread_id: threadId, external_turn_id: turn.id, sequence_number: index + 1,
          provider: 'codex', model: null, reasoning_level: null, status: turnStatus(turn.status),
          started_at: null, completed_at: null, duration_ms: null,
        }).onConflict(conflict => conflict.columns(['thread_id', 'external_turn_id']).doUpdateSet({
          status: turnStatus(turn.status),
        })).execute();
        if (turnId !== rootUsageTurnId) await transaction.insertInto('turn_usage_snapshots').values({
          id: randomUUID(), turn_id: turnId, source_event_key: `import:${turn.id}:usage-unavailable`, measurement: 'unavailable',
          input_tokens: null, cached_input_tokens: null, output_tokens: null, reasoning_output_tokens: null, observed_at: observedAt,
          cache_write_input_tokens: null,
        }).onConflict(conflict => conflict.columns(['turn_id', 'source_event_key']).doNothing()).execute();
      }
      for (const [workerIndex, worker] of workers.entries()) {
        if (worker.externalThreadId === externalId) continue;
        const workerThreadId = stableId('thread', `codex:${worker.externalThreadId}`);
        await transaction.insertInto('session_threads').values({
          id: workerThreadId, session_id: id, external_thread_id: worker.externalThreadId,
          parent_thread_id: null, role: 'other', status: terminal ? 'completed' : 'idle',
          started_at: null, completed_at: completedAt, display_name: worker.nickname ?? `Worker ${workerIndex + 1}`,
        }).onConflict(conflict => conflict.columns(['session_id', 'external_thread_id']).doUpdateSet({
          status: terminal ? 'completed' : 'idle', completed_at: completedAt,
          display_name: worker.nickname ?? `Worker ${workerIndex + 1}`,
        })).execute();
      }
      for (const worker of workers) {
        if (worker.externalThreadId === externalId) continue;
        const workerThreadId = stableId('thread', `codex:${worker.externalThreadId}`);
        const parentThreadId = worker.parentExternalThreadId
          ? stableId('thread', `codex:${worker.parentExternalThreadId}`) : threadId;
        const parent = await transaction.selectFrom('session_threads').select('id').where('id', '=', parentThreadId).executeTakeFirst();
        await transaction.updateTable('session_threads').set({ parent_thread_id: parent?.id ?? threadId })
          .where('id', '=', workerThreadId).execute();
      }
      for (const worker of workers) {
        const isRoot = worker.externalThreadId === externalId;
        const workerThreadId = isRoot ? threadId : stableId('thread', `codex:${worker.externalThreadId}`);
        let usageTurnId: string;
        if (isRoot && thread.turns.length) usageTurnId = stableId('turn', `${externalId}:${thread.turns.at(-1)!.id}`);
        else {
          usageTurnId = stableId('turn', `${worker.externalThreadId}:worker-usage`);
          await transaction.insertInto('session_turns').values({
            id: usageTurnId, thread_id: workerThreadId, external_turn_id: 'worker-usage', sequence_number: 1,
            provider: 'codex', model: worker.model, reasoning_level: worker.reasoningLevel, status: 'completed',
            started_at: null, completed_at: completedAt, duration_ms: null,
          }).onConflict(conflict => conflict.columns(['thread_id', 'external_turn_id']).doUpdateSet({
            model: worker.model, reasoning_level: worker.reasoningLevel, status: terminal ? 'completed' : 'unknown',
          })).execute();
        }
        await transaction.insertInto('turn_usage_snapshots').values({
          id: randomUUID(), turn_id: usageTurnId, source_event_key: `local-rollout:${worker.externalThreadId}:final`, measurement: 'exact-stored',
          input_tokens: worker.inputTokens, cached_input_tokens: worker.cachedInputTokens,
          cache_write_input_tokens: worker.cacheWriteInputTokens, output_tokens: worker.outputTokens,
          reasoning_output_tokens: worker.reasoningOutputTokens, observed_at: observedAt,
        }).onConflict(conflict => conflict.columns(['turn_id', 'source_event_key']).doUpdateSet({
          measurement: 'exact-stored', input_tokens: worker.inputTokens, cached_input_tokens: worker.cachedInputTokens,
          cache_write_input_tokens: worker.cacheWriteInputTokens, output_tokens: worker.outputTokens,
          reasoning_output_tokens: worker.reasoningOutputTokens, observed_at: observedAt,
        })).execute();
        await transaction.updateTable('session_turns').set({ model: worker.model, reasoning_level: worker.reasoningLevel }).where('id', '=', usageTurnId).execute();
      }
      if (offload) await transaction.insertInto('session_offload_summaries').values({
        session_id: id, measurement: 'exact-stored', shell_batches: offload.shellBatches,
        candidate_batches: offload.candidateBatches, associated_input_tokens: offload.associatedInputTokens,
        associated_cached_input_tokens: offload.associatedCachedInputTokens,
        associated_output_tokens: offload.associatedOutputTokens, associated_total_tokens: offload.associatedTotalTokens,
        verification_batches: offload.categories.verification, build_batches: offload.categories.build,
        formatting_batches: offload.categories.formatting, script_batches: offload.categories.script,
        monitoring_batches: offload.categories.monitoring, observed_at: observedAt,
      }).onConflict(conflict => conflict.column('session_id').doUpdateSet({
        measurement: 'exact-stored', shell_batches: offload.shellBatches,
        candidate_batches: offload.candidateBatches, associated_input_tokens: offload.associatedInputTokens,
        associated_cached_input_tokens: offload.associatedCachedInputTokens,
        associated_output_tokens: offload.associatedOutputTokens, associated_total_tokens: offload.associatedTotalTokens,
        verification_batches: offload.categories.verification, build_batches: offload.categories.build,
        formatting_batches: offload.categories.formatting, script_batches: offload.categories.script,
        monitoring_batches: offload.categories.monitoring, observed_at: observedAt,
      })).execute();
      if (offload) {
        await transaction.deleteFrom('session_offload_processes').where('session_id', '=', id).execute();
        if (offload.processPatterns.length) await transaction.insertInto('session_offload_processes').values(offload.processPatterns.map(pattern => ({
          session_id: id, signature_key: pattern.key, runner: pattern.runner, operation: pattern.operation,
          label: pattern.label, batch_count: pattern.batchCount, success_count: pattern.successCount,
          failure_count: pattern.failureCount, unknown_count: pattern.unknownCount,
          output_bytes: pattern.outputBytes, maximum_output_bytes: pattern.maximumOutputBytes,
          output_mode: pattern.outputMode, recommendation: pattern.recommendation, classifier_version: 1,
        }))).execute();
      }
      if (directives) {
        // Directive episodes are a derived projection. Rebuild the projection
        // when the classifier changes so stale, no-change candidates cannot
        // remain visible as scored directives.
        await transaction.deleteFrom('session_interactions').where('session_id', '=', id).execute();
        for (const interaction of directives.interactions) {
          const interactionId = stableId('interaction', `codex:${externalId}:${interaction.sourceKey}`);
          await transaction.insertInto('session_interactions').values({
            id: interactionId, session_id: id, source_interaction_key: interaction.sourceKey,
            sequence_number: interaction.sequenceNumber, kind: interaction.kind, occurred_at: interaction.occurredAt,
            classifier_version: directives.classifierVersion, confidence: interaction.confidence,
            context_tokens: interaction.contextTokens, context_window: interaction.contextWindow,
            input_tokens: interaction.inputTokens, cached_input_tokens: interaction.cachedInputTokens,
            output_tokens: interaction.outputTokens,
          }).onConflict(conflict => conflict.columns(['session_id', 'source_interaction_key']).doUpdateSet({
            sequence_number: interaction.sequenceNumber, kind: interaction.kind, occurred_at: interaction.occurredAt,
            classifier_version: directives.classifierVersion, confidence: interaction.confidence,
            context_tokens: interaction.contextTokens, context_window: interaction.contextWindow,
            input_tokens: interaction.inputTokens, cached_input_tokens: interaction.cachedInputTokens,
            output_tokens: interaction.outputTokens,
          })).execute();
        }
        for (const episode of directives.episodes) {
          const episodeId = stableId('episode', `codex:${externalId}:${episode.key}`);
          const openingInteractionId = stableId('interaction', `codex:${externalId}:${episode.openingInteractionKey}`);
          await transaction.insertInto('session_directive_episodes').values({
            id: episodeId, session_id: id, opening_interaction_id: openingInteractionId,
            sequence_number: episode.sequenceNumber, status: episode.status, started_at: episode.startedAt,
            completed_at: episode.completedAt, classification_confidence: episode.classificationConfidence,
            measurement: 'derived', preparation_questions: episode.preparation.questions,
            preparation_context: episode.preparation.context, preparation_approvals: episode.preparation.approvals,
            preparation_pattern_references: episode.preparation.patternReferences,
            correction_count: episode.corrections, context_tokens_at_start: episode.context.tokensAtStart,
            context_window: episode.context.window, peak_context_percent: episode.context.peakPercent,
            agents_references: episode.discovery.agentsReferences, skill_references: episode.discovery.skillReferences,
            first_pattern_latency_ms: episode.discovery.firstPatternLatencyMs,
            pattern_before_first_change: episode.discovery.patternBeforeFirstChange === null ? null : episode.discovery.patternBeforeFirstChange ? 1 : 0,
            tool_calls: episode.execution.toolCalls, file_changes: episode.execution.fileChanges,
            web_searches: episode.execution.webSearches, delegations: episode.execution.delegations,
            compactions: episode.execution.compactions, verification_batches: episode.execution.verificationBatches,
            classifier_version: directives.classifierVersion,
          }).onConflict(conflict => conflict.columns(['session_id', 'sequence_number']).doUpdateSet({
            status: episode.status, completed_at: episode.completedAt,
            classification_confidence: episode.classificationConfidence, measurement: 'derived',
            preparation_questions: episode.preparation.questions, preparation_context: episode.preparation.context,
            preparation_approvals: episode.preparation.approvals, correction_count: episode.corrections,
            preparation_pattern_references: episode.preparation.patternReferences,
            context_tokens_at_start: episode.context.tokensAtStart, context_window: episode.context.window,
            peak_context_percent: episode.context.peakPercent, agents_references: episode.discovery.agentsReferences,
            skill_references: episode.discovery.skillReferences, first_pattern_latency_ms: episode.discovery.firstPatternLatencyMs,
            pattern_before_first_change: episode.discovery.patternBeforeFirstChange === null ? null : episode.discovery.patternBeforeFirstChange ? 1 : 0,
            tool_calls: episode.execution.toolCalls, file_changes: episode.execution.fileChanges,
            web_searches: episode.execution.webSearches, delegations: episode.execution.delegations,
            compactions: episode.execution.compactions, verification_batches: episode.execution.verificationBatches,
            classifier_version: directives.classifierVersion,
          })).execute();
          await transaction.deleteFrom('session_episode_skills').where('episode_id', '=', episodeId).execute();
          if (episode.discovery.skillsUsed.length) await transaction.insertInto('session_episode_skills').values(episode.discovery.skillsUsed.map(skillName => ({ episode_id: episodeId, skill_name: skillName }))).execute();
          if (episode.preparation.skillsUsed.length) await transaction.insertInto('session_episode_preparation_skills').values(episode.preparation.skillsUsed.map(skillName => ({ episode_id: episodeId, skill_name: skillName }))).execute();
        }
      }
      if (telemetry || source.pathTouches) {
        await transaction.deleteFrom('session_path_touches').where('session_id', '=', id).execute();
        if (normalizedPathTouches.length) await transaction.insertInto('session_path_touches').values(normalizedPathTouches.map((touch, index) => ({
          id: stableId('path-touch', `codex:${externalId}:${touch.sourceKey}`),
          session_id: id,
          sequence_number: index + 1,
          source_touch_key: touch.sourceKey,
          prompt_key: touch.promptKey ?? null,
          file_path: touch.path,
          touch_kind: touch.kind,
          occurred_at: touch.occurredAt,
        }))).execute();
      }
      if (newEvents.length) await transaction.insertInto('session_events').values(newEvents.map(({ turn, item }) => ({
        id: randomUUID(), session_id: id, thread_id: threadId, turn_id: stableId('turn', `${externalId}:${turn.id}`),
        sequence_number: ++nextSequence, source_event_key: `import:${turn.id}:${item.id}`, event_type: item.type,
        status: item.status, occurred_at: observedAt, summary: null, evidence_json: null,
      }))).execute();
    });
    return review(db, id);
  }

  function importCodex(externalId: string) {
    const previous = imports.get(externalId) ?? Promise.resolve(null);
    const current = previous.catch(() => null).then(() => importCodexUnlocked(externalId));
    imports.set(externalId, current);
    return current.finally(() => { if (imports.get(externalId) === current) imports.delete(externalId); });
  }

  return {
    listSourceSessions: () => source.list(),
    listImported,
    get: (id: string) => /^[a-zA-Z0-9-]+$/.test(id) ? review(db, id) : null,
    importCodex,
  };
}
