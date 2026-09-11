import type { Insertable, Kysely, Updateable } from 'kysely';
import type { BenchmarkSchedulesTable, Database } from '../db/database.js';

export type BenchmarkFeatureType = 'frontend' | 'backend' | 'full-stack';
export type BenchmarkOccurrenceOutcome = 'started' | 'skipped' | 'failed';

export interface CreateBenchmarkSchedule {
  id: string;
  repositoryName: string;
  scenarioId: string;
  scenarioVersion: number;
  scenarioFingerprint: string;
  provider: string;
  model: string;
  reasoning: string;
  featureType: BenchmarkFeatureType;
  description: string;
  intervalMinutes: number;
  enabled?: boolean;
  tokenCostConsentAt: string | null;
  nextRunAt: string;
  createdAt: string;
}

export interface UpdateBenchmarkSchedule {
  repositoryName?: string;
  scenarioId?: string;
  scenarioVersion?: number;
  scenarioFingerprint?: string;
  provider?: string;
  model?: string;
  reasoning?: string;
  featureType?: BenchmarkFeatureType;
  description?: string;
  intervalMinutes?: number;
  enabled?: boolean;
  tokenCostConsentAt?: string | null;
  nextRunAt?: string;
  updatedAt: string;
}

export interface RecordBenchmarkOccurrence {
  id: string;
  scheduleId: string;
  plannedAt: string;
  outcome: BenchmarkOccurrenceOutcome;
  runId?: string | null;
  reason?: string | null;
  createdAt: string;
}

function scheduleUpdate(input: UpdateBenchmarkSchedule): Updateable<BenchmarkSchedulesTable> {
  return {
    repository_name: input.repositoryName,
    scenario_id: input.scenarioId,
    scenario_version: input.scenarioVersion,
    scenario_fingerprint: input.scenarioFingerprint,
    provider: input.provider,
    model: input.model,
    reasoning: input.reasoning,
    feature_type: input.featureType,
    description: input.description,
    interval_minutes: input.intervalMinutes,
    enabled: input.enabled === undefined ? undefined : input.enabled ? 1 : 0,
    token_cost_consent_at: input.tokenCostConsentAt,
    next_run_at: input.nextRunAt,
    updated_at: input.updatedAt,
  };
}

export function createBenchmarkSchedulePersistence(database: Kysely<Database>) {
  function scheduleInsert(input: CreateBenchmarkSchedule): Insertable<BenchmarkSchedulesTable> {
    return {
      id: input.id,
      repository_name: input.repositoryName,
      scenario_id: input.scenarioId,
      scenario_version: input.scenarioVersion,
      scenario_fingerprint: input.scenarioFingerprint,
      provider: input.provider,
      model: input.model,
      reasoning: input.reasoning,
      feature_type: input.featureType,
      description: input.description,
      interval_minutes: input.intervalMinutes,
      enabled: input.enabled === false ? 0 : 1,
      token_cost_consent_at: input.tokenCostConsentAt,
      next_run_at: input.nextRunAt,
      created_at: input.createdAt,
      updated_at: input.createdAt,
    };
  }

  async function createSchedules(inputs: CreateBenchmarkSchedule[]) {
    if (inputs.length === 0) return [];
    await database.transaction().execute(transaction => transaction
      .insertInto('benchmark_schedules')
      .values(inputs.map(scheduleInsert))
      .execute());
    return database.selectFrom('benchmark_schedules')
      .selectAll()
      .where('id', 'in', inputs.map(input => input.id))
      .execute();
  }

  async function createSchedule(input: CreateBenchmarkSchedule) {
    await createSchedules([input]);
    return getSchedule(input.id);
  }

  function getSchedule(id: string) {
    return database.selectFrom('benchmark_schedules').selectAll().where('id', '=', id).executeTakeFirst();
  }

  function listSchedules() {
    return database.selectFrom('benchmark_schedules').selectAll().orderBy('created_at', 'desc').execute();
  }

  async function updateSchedule(id: string, input: UpdateBenchmarkSchedule) {
    const result = await database.updateTable('benchmark_schedules')
      .set(scheduleUpdate(input))
      .where('id', '=', id)
      .executeTakeFirst();
    return Number(result.numUpdatedRows) > 0;
  }

  function listDueSchedules(at: string, limit = 25) {
    return database.selectFrom('benchmark_schedules')
      .selectAll()
      .where('enabled', '=', 1)
      .where('token_cost_consent_at', 'is not', null)
      .where('next_run_at', '<=', at)
      .orderBy('next_run_at', 'asc')
      .limit(limit)
      .execute();
  }

  async function advanceSchedule(id: string, expectedNextRunAt: string, nextRunAt: string, updatedAt: string) {
    const result = await database.updateTable('benchmark_schedules')
      .set({ next_run_at: nextRunAt, updated_at: updatedAt })
      .where('id', '=', id)
      .where('enabled', '=', 1)
      .where('next_run_at', '=', expectedNextRunAt)
      .executeTakeFirst();
    return Number(result.numUpdatedRows) > 0;
  }

  async function recordOccurrence(input: RecordBenchmarkOccurrence) {
    const result = await database.insertInto('benchmark_schedule_occurrences').values({
      id: input.id,
      schedule_id: input.scheduleId,
      planned_at: input.plannedAt,
      outcome: input.outcome,
      run_id: input.runId ?? null,
      reason: input.reason ?? null,
      created_at: input.createdAt,
    }).onConflict(conflict => conflict.columns(['schedule_id', 'planned_at']).doNothing()).executeTakeFirst();
    return Number(result.numInsertedOrUpdatedRows) > 0;
  }

  function listOccurrences(scheduleId: string, limit = 100) {
    return database.selectFrom('benchmark_schedule_occurrences')
      .selectAll()
      .where('schedule_id', '=', scheduleId)
      .orderBy('planned_at', 'desc')
      .limit(limit)
      .execute();
  }

  async function linkOccurrenceRun(scheduleId: string, plannedAt: string, runId: string) {
    const result = await database.updateTable('benchmark_schedule_occurrences')
      .set({ run_id: runId })
      .where('schedule_id', '=', scheduleId)
      .where('planned_at', '=', plannedAt)
      .executeTakeFirst();
    return Number(result.numUpdatedRows) > 0;
  }

  function listTrendPoints(scheduleId: string, limit = 100) {
    return database.selectFrom('benchmark_schedule_occurrences as occurrence')
      .leftJoin('run_summary as summary', 'summary.run_id', 'occurrence.run_id')
      .select([
        'occurrence.id as occurrence_id',
        'occurrence.planned_at',
        'occurrence.outcome',
        'occurrence.run_id',
        'occurrence.reason',
        'summary.status as run_status',
        'summary.average_score',
        'summary.duration_ms',
        'summary.input_tokens',
        'summary.cached_input_tokens',
        'summary.output_tokens',
        'summary.failed_command_count',
        'summary.retry_count',
      ])
      .where('occurrence.schedule_id', '=', scheduleId)
      .orderBy('occurrence.planned_at', 'desc')
      .limit(limit)
      .execute();
  }

  return {
    createSchedule,
    createSchedules,
    getSchedule,
    listSchedules,
    updateSchedule,
    listDueSchedules,
    advanceSchedule,
    recordOccurrence,
    listOccurrences,
    linkOccurrenceRun,
    listTrendPoints,
  };
}
