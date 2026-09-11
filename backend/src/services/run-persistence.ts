import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, isAbsolute, relative, resolve, sep } from 'node:path';
import type { Kysely } from 'kysely';
import type { Database } from '../db/database.js';

type Json = Record<string, any>;
type NormalizedEvent = {
  id: string;
  pass_id: string;
  sequence_number: number;
  event_type: string;
  status: string | null;
  occurred_at: string;
  summary: string | null;
  payload_json: string | null;
};
type ChangedFile = {
  change_type: 'added' | 'updated' | 'deleted' | 'renamed';
  lines_added: number | null;
  lines_removed: number | null;
};

const terminalStatuses = new Set(['completed', 'failed', 'cancelled', 'timed-out', 'interrupted']);
const statusValues = new Set([
  'queued',
  'preparing',
  'running',
  'evaluating',
  'completed',
  'failed',
  'cancelled',
  'timed-out',
  'interrupted',
]);

export interface NormalizedTemporaryRun {
  id: string;
  status: string;
  normalized: boolean;
}

export interface ImportedRun {
  id: string;
  status: string;
  imported: boolean;
}

export interface ImportResultsOptions {
  resultsRoot: string;
  runId?: string;
  replaceExisting?: boolean;
}

export interface CreateRunMetadata {
  id: string;
  repositoryName: string;
  baseRevision: string;
  guidanceRevision?: string | null;
  featureType: 'frontend' | 'backend' | 'full-stack';
  description: string;
  preparedPrompt: string;
  promptTemplateVersion: string;
  evaluationTemplate: string;
  readiness?: { status: 'ready' | 'ready-with-limitations' | 'not-evaluable'; fingerprint: string; evidence: unknown; findings: string[] };
  requestedRepetitions?: number;
  requestedReviewPasses?: number;
  provider: string;
  agent: string;
  reasoningLevel: string;
  createdAt?: string;
}

function json(path: string): Json | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function text(path: string) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}
function compact(value: unknown, length = 2000) {
  const source = String(value ?? '').replace(/\s+/g, ' ').trim();
  return source.length > length ? `${source.slice(0, length - 1)}…` : source;
}
function safeJson(value: unknown, length = 12_000) {
  const source = JSON.stringify(value ?? {});
  return source.length > length ? JSON.stringify({ truncated: true, preview: source.slice(0, length - 32) }) : source;
}
function eventTime(index: number, createdAt: string) {
  return new Date(new Date(createdAt).getTime() + index).toISOString();
}

function normalizedStatus(value: unknown, fallback = 'failed') {
  return statusValues.has(String(value)) ? String(value) : fallback;
}

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function runStatus(webRun: Json | null, comparison: Json | null, results: Json[]) {
  if (comparison) return 'completed';
  if (results.length) {
    if (results.some(result => result.agent?.timedOut)) return 'timed-out';
    if (results.some(result => Number(result.agent?.exitCode) !== 0)) return 'failed';
    if (results.every(result => result.grade)) return 'completed';
    return 'completed';
  }
  const status = String(webRun?.status ?? 'interrupted');
  return status === 'running' ? 'interrupted' : normalizedStatus(status, 'failed');
}

function attemptStatus(result: Json | null, run: string) {
  if (!result) return run === 'interrupted' ? 'interrupted' : run;
  if (result.agent?.timedOut) return 'timed-out';
  if (Number(result.agent?.exitCode) !== 0) return 'failed';
  return result.grade ? 'completed' : 'completed';
}

function evidencePath(value: unknown, roots: Array<unknown> = []) {
  const source = String(value ?? '');
  if (!isAbsolute(source)) return source;
  for (const rawRoot of roots) {
    if (!rawRoot || !isAbsolute(String(rawRoot))) continue;
    const candidate = relative(resolve(String(rawRoot)), resolve(source));
    if (candidate && candidate !== '..' && !candidate.startsWith(`..${sep}`) && !isAbsolute(candidate)) {
      return candidate;
    }
  }
  return basename(source);
}

function scrubText(value: unknown, roots: Array<unknown> = [], length = 2000) {
  let source = String(value ?? '');
  const absoluteRoots = roots
    .filter(value => value && isAbsolute(String(value)))
    .sort((left, right) => String(right).length - String(left).length);
  for (const rawRoot of absoluteRoots) {
    source = source.replaceAll(String(rawRoot), '[local-path]');
  }
  source = source.replace(/((?:--?(?:token|password|secret|api[-_]?key)|authorization)[=:\s]+)([^\s]+)/gi, '$1[redacted]');
  return compact(source, length);
}

function changedFiles(directory: string, grade: Json | null, roots: Array<unknown> = []) {
  const entries = new Map<string, ChangedFile>();
  for (const line of text(resolve(directory, 'changed-files.txt')).split('\n')) {
    const [rawStatus, rawPath] = line.split('\t');
    if (!rawStatus || !rawPath) continue;
    let status: ChangedFile['change_type'] = 'updated';
    if (rawStatus.startsWith('A') || rawStatus === '?') status = 'added';
    else if (rawStatus.startsWith('D')) status = 'deleted';
    else if (rawStatus.startsWith('R')) status = 'renamed';
    entries.set(evidencePath(rawPath, roots), { change_type: status, lines_added: null, lines_removed: null });
  }
  for (const rawFile of grade?.files ?? []) {
    const file = evidencePath(rawFile, roots);
    if (!entries.has(file)) entries.set(file, { change_type: 'updated', lines_added: null, lines_removed: null });
  }
  return [...entries.entries()];
}

function checkType(check: Json): 'build' | 'typecheck' | 'unit-tests' | 'integration-tests' | 'static-analysis' | 'pattern-check' {
  const value = `${check.id ?? ''} ${(check.command ?? []).join(' ')}`.toLowerCase();
  if (/pattern/.test(value)) return 'pattern-check';
  if (/typecheck|\btsc\b/.test(value)) return 'typecheck';
  if (/build/.test(value)) return 'build';
  if (/integration|playwright|e2e/.test(value)) return 'integration-tests';
  if (/static|lint|diff/.test(value)) return 'static-analysis';
  return 'unit-tests';
}

function normalizeEvents(source: string, passId: string, createdAt: string, roots: Array<unknown> = []) {
  const rows: NormalizedEvent[] = [];
  for (const [index, line] of source.split('\n').entries()) {
    if (!line.trim()) continue;
    let event: Json;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    const item = event.item as Json | undefined;
    let eventType: string | null = null;
    let status: string | null = null;
    let summary = '';
    let payload: Json = {};
    if (item?.type === 'agent_message') {
      eventType = 'agent-update';
      status = 'completed';
      summary = scrubText(item.text, roots, 500);
      payload = { text: summary };
    } else if (item?.type === 'command_execution') {
      eventType = event.type === 'item.started' ? 'command-started' : 'command-completed';
      status = item.status === 'in_progress' ? 'running' : Number(item.exit_code) === 0 ? 'passed' : 'failed';
      summary = scrubText(item.command, roots, 500);
      payload = { command: summary, exitCode: item.exit_code };
    } else if (item?.type === 'file_change') {
      eventType = 'files-changed';
      status = item.status === 'in_progress' ? 'running' : 'completed';
      const changes = (item.changes ?? []).map((change: Json) => ({ ...change, path: evidencePath(change.path, roots) }));
      summary = `${item.status === 'in_progress' ? 'Updating' : 'Updated'} ${changes.length} file${changes.length === 1 ? '' : 's'}`;
      payload = { changes };
    } else if (event.type === 'turn.completed') {
      eventType = 'pass-completed';
      status = 'completed';
      summary = 'Agent turn completed.';
      payload = { usage: event.usage };
    } else if (event.type === 'turn.failed' || event.type === 'error') {
      eventType = 'error';
      status = 'failed';
      summary = scrubText(event.error?.message ?? event.message ?? 'Agent execution failed.', roots);
      payload = { type: event.type };
    }
    if (!eventType) continue;
    const sequence = rows.length + 1;
    rows.push({
      id: `${passId}:event:${sequence}`,
      pass_id: passId,
      sequence_number: sequence,
      event_type: eventType,
      status,
      occurred_at: eventTime(index, createdAt),
      summary,
      payload_json: safeJson(payload),
    });
  }
  return rows;
}

export function createRunPersistence(database: Kysely<Database>) {
  async function createRun(metadata: CreateRunMetadata) {
    const createdAt = metadata.createdAt ?? new Date().toISOString();
    await database.transaction().execute(async trx => {
      await trx.insertInto('runs').values({
        id: metadata.id,
        repository_name: metadata.repositoryName,
        base_revision: metadata.baseRevision,
        guidance_revision: metadata.guidanceRevision ?? null,
        working_tree_dirty: 0,
        feature_type: metadata.featureType,
        description: metadata.description,
        prepared_prompt: metadata.preparedPrompt,
        prompt_template_version: metadata.promptTemplateVersion,
        evaluation_template: metadata.evaluationTemplate,
        evaluation_readiness_status: metadata.readiness?.status ?? null,
        evaluation_readiness_fingerprint: metadata.readiness?.fingerprint ?? null,
        evaluation_readiness_evidence_json: metadata.readiness ? safeJson(metadata.readiness.evidence) : null,
        evaluation_readiness_findings_json: metadata.readiness ? safeJson(metadata.readiness.findings) : null,
        requested_repetitions: metadata.requestedRepetitions ?? 1,
        requested_review_passes: metadata.requestedReviewPasses ?? 0,
        status: 'queued',
        runner_version: null,
        provider_cli_version: null,
        created_at: createdAt,
        started_at: null,
        completed_at: null,
      })
        .onConflict(conflict => conflict.column('id').doNothing())
        .execute();
      await trx
        .insertInto('run_agent_setup')
        .values({
          run_id: metadata.id,
          provider: metadata.provider,
          agent: metadata.agent,
          reasoning_level: metadata.reasoningLevel,
        })
        .onConflict(conflict => conflict.column('run_id').doUpdateSet({
          provider: metadata.provider,
          agent: metadata.agent,
          reasoning_level: metadata.reasoningLevel,
        }))
        .execute();
    });
  }

  async function updateRunStatus(id: string, status: string, completedAt: string | null = null) {
    const normalized = normalizedStatus(status);
    await database
      .updateTable('runs')
      .set({
        status: normalized,
        started_at: normalized === 'running' ? new Date().toISOString() : undefined,
        completed_at: completedAt ?? (terminalStatuses.has(normalized) ? new Date().toISOString() : undefined),
      })
      .where('id', '=', id)
      .execute();
  }

  async function normalizeTemporaryRun(
    directory: string,
    { replaceExisting = false }: { replaceExisting?: boolean } = {},
  ): Promise<NormalizedTemporaryRun | null> {
    const webRun = json(resolve(directory, 'web-run.json'));
    if (!webRun?.id) return null;
    const existing = await database
      .selectFrom('runs')
      .select('id')
      .where('id', '=', webRun.id)
      .executeTakeFirst();
    if (existing && !replaceExisting) {
      return { id: webRun.id, status: String(webRun.status ?? 'interrupted'), normalized: false };
    }
    const plan = json(resolve(directory, 'plan.json'));
    const comparison = json(resolve(directory, 'comparison.json'));
    const candidates = readdirSync(directory, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => ({
        directory: resolve(directory, entry.name),
        result: json(resolve(directory, entry.name, 'result.json')),
      }))
      .filter(entry => entry.result);
    const results = candidates.map(candidate => candidate.result as Json);
    const status = runStatus(webRun, comparison, results);
    const createdAt = String(webRun.createdAt ?? new Date().toISOString());
    const baseRevision = String(plan?.baseSha ?? results[0]?.productBaseSha ?? 'unknown');
    const repoPath = String(webRun.repo ?? plan?.repoRoot ?? 'unknown');
    const repositoryName = repoPath === 'unknown' ? 'Unknown repository' : basename(repoPath);
    const preparedPrompt = text(resolve(directory, 'prompt.md'));
    const normalizedReadiness = webRun.readiness ?? (preparedPrompt.includes('## User feature description') ? {
      status: 'not-evaluable', fingerprint: null, evidence: {},
      findings: ['Legacy run combined a pinned evaluator prompt with an arbitrary feature request; its score is incompatible.'],
    } : null);
    await database.transaction().execute(async trx => {
      if (existing) await trx.deleteFrom('runs').where('id', '=', webRun.id).execute();
      await trx.insertInto('runs').values({
        id: webRun.id, repository_name: repositoryName, base_revision: baseRevision,
        guidance_revision: plan?.guidance?.ref ?? results[0]?.guidance?.ref ?? null, working_tree_dirty: 0,
        feature_type: webRun.featureType ?? plan?.featureType ?? 'full-stack', description: String(webRun.description ?? ''),
        prepared_prompt: preparedPrompt, prompt_template_version: String(webRun.promptTemplateVersion ?? `legacy:${plan?.scenario ?? 'unknown'}`),
        evaluation_template: String(plan?.scenario ?? comparison?.scenario ?? 'unknown'),
        evaluation_readiness_status: normalizedReadiness?.status ?? null,
        evaluation_readiness_fingerprint: normalizedReadiness?.fingerprint ?? null,
        evaluation_readiness_evidence_json: normalizedReadiness ? safeJson(normalizedReadiness.evidence) : null,
        evaluation_readiness_findings_json: normalizedReadiness ? safeJson(normalizedReadiness.findings) : null,
        requested_repetitions: Number(plan?.matrix?.length ?? 1),
        requested_review_passes: 0, status, runner_version: 'legacy-artifact-import', provider_cli_version: null,
        created_at: createdAt, started_at: createdAt, completed_at: terminalStatuses.has(status) ? createdAt : null,
      }).execute();
      await trx.insertInto('run_agent_setup').values({
        run_id: webRun.id,
        provider: String(webRun.provider ?? 'unknown'),
        agent: String(webRun.model ?? 'unknown'),
        reasoning_level: String(webRun.reasoningEffort ?? 'unknown'),
      }).execute();
      if (!candidates.length) {
        const attemptId = `${webRun.id}:attempt:1`;
        await trx.insertInto('run_attempts').values({
          id: attemptId,
          run_id: webRun.id,
          attempt_number: 1,
          status,
          started_at: createdAt,
          completed_at: terminalStatuses.has(status) ? createdAt : null,
          failure_summary: scrubText(text(resolve(directory, 'runner.log')), [repoPath], 2000) || null,
        }).execute();
      }
      for (const [index, candidate] of candidates.entries()) {
        const result = candidate.result as Json;
        const grade = json(resolve(candidate.directory, 'grade.json'));
        const candidateStatus = attemptStatus(result, status);
        const attemptId = `${webRun.id}:attempt:${Number(result.repetition ?? index + 1)}`;
        const passId = `${attemptId}:pass:0`;
        const completedAt = terminalStatuses.has(candidateStatus) ? createdAt : null;
        const localRoots = [result.worktree, repoPath];
        await trx.insertInto('run_attempts').values({
          id: attemptId,
          run_id: webRun.id,
          attempt_number: Number(result.repetition ?? index + 1),
          status: candidateStatus,
          started_at: createdAt,
          completed_at: completedAt,
          failure_summary: candidateStatus === 'failed'
            ? scrubText(text(resolve(candidate.directory, 'progress.log')), localRoots, 2000) || null
            : null,
        }).execute();
        await trx.insertInto('run_passes').values({
          id: passId,
          attempt_id: attemptId,
          pass_number: 0,
          pass_type: 'initial',
          status: candidateStatus,
          started_at: createdAt,
          completed_at: completedAt,
          duration_ms: result.agent?.durationMs ?? null,
          final_response: scrubText(text(resolve(candidate.directory, 'final.md')), localRoots, 12_000) || null,
        }).execute();
        const usage = result.agent?.usage ?? {};
        await trx.insertInto('pass_token_usage').values({
          pass_id: passId,
          input_tokens: Number(usage.inputTokens ?? 0),
          cached_input_tokens: Number(usage.cachedInputTokens ?? 0),
          output_tokens: Number(usage.outputTokens ?? 0),
          reasoning_output_tokens: Number(usage.reasoningOutputTokens ?? 0),
        }).execute();
        const events = normalizeEvents(text(resolve(candidate.directory, 'events.jsonl')), passId, createdAt, localRoots);
        if (events.length) await trx.insertInto('pass_events').values(events).execute();
        const setup = json(resolve(candidate.directory, 'setup.json'));
        if (Array.isArray(setup)) {
          const setupEvents = setup.map((check: Json, setupIndex: number) => ({
            id: `${passId}:setup:${setupIndex + 1}`,
            pass_id: passId,
            sequence_number: events.length + setupIndex + 1,
            event_type: 'check-completed',
            status: Number(check.exitCode) === 0 ? 'passed' : 'failed',
            occurred_at: eventTime(events.length + setupIndex + 1, createdAt),
            summary: scrubText((check.command ?? []).join(' '), localRoots, 500),
            payload_json: safeJson({
              source: 'setup',
              exitCode: check.exitCode,
              durationMs: check.durationMs,
            }),
          }));
          if (setupEvents.length) await trx.insertInto('pass_events').values(setupEvents).execute();
        }
        if (grade) {
          for (const [checkIndex, check] of (grade.checks ?? []).entries()) {
            await trx.insertInto('pass_checks').values({
              id: `${passId}:check:${checkIndex + 1}`,
              pass_id: passId,
              check_type: checkType(check),
              command_label: scrubText((check.command ?? []).join(' '), localRoots, 1000) || null,
              status: check.passed ? 'passed' : 'failed',
              duration_ms: check.durationMs ?? null,
              tests_passed: null,
              tests_failed: null,
              tests_skipped: null,
              summary: scrubText(
                `${check.label ?? check.id ?? 'Check'}${check.stderr ? `: ${check.stderr}` : ''}`,
                localRoots,
                2000,
              ) || null,
            }).execute();
          }
          const evaluationId = `${passId}:evaluation:legacy`;
          await trx.insertInto('pass_evaluations').values({
            id: evaluationId,
            pass_id: passId,
            score: grade.percentage ?? null,
            evaluator_version: `${grade.scenario ?? 'unknown'}:${grade.scenarioVersion ?? 'legacy'}`,
            created_at: createdAt,
          }).execute();
          for (const requirement of grade.requirements ?? []) {
            await trx.insertInto('structural_findings').values({
              id: `${evaluationId}:contract:${requirement.id}`,
              evaluation_id: evaluationId,
              contract_id: requirement.id,
              label: requirement.label ?? requirement.id,
              implemented: requirement.passed ? 1 : 0,
              severity: requirement.passed ? null : 'warning',
              evidence_json: safeJson({
                points: requirement.points,
                earned: requirement.earned,
                missingFiles: (requirement.missingFiles ?? []).map(
                  (file: string) => evidencePath(file, localRoots),
                ),
                missingText: requirement.missingText ?? [],
              }),
            }).execute();
          }
          for (const section of grade.implementationReview ?? []) {
            for (const item of section.items ?? []) {
              await trx.insertInto('implementation_findings').values({
                id: `${evaluationId}:implementation:${section.id}:${item.id}`,
                evaluation_id: evaluationId,
                section_id: section.id,
                section_label: section.label,
                requirement_id: item.id,
                requirement_label: item.label,
                implemented: item.implemented ? 1 : 0,
                candidate_files_json: safeJson(
                  (item.candidateFiles ?? []).map((file: string) => evidencePath(file, localRoots)),
                ),
                reference_files_json: safeJson(
                  (item.referenceFiles ?? []).map((file: string) => evidencePath(file, localRoots)),
                ),
              }).execute();
            }
          }
        }
        for (const [fileIndex, entry] of changedFiles(candidate.directory, grade, localRoots).entries()) {
          const [filePath, change] = entry;
          await trx.insertInto('pass_changes').values({
            id: `${passId}:change:${fileIndex + 1}`,
            pass_id: passId,
            file_path: filePath,
            ...change,
          }).execute();
        }
      }
    });
    return { id: webRun.id, status, normalized: true };
  }

  async function importResults({ resultsRoot, runId, replaceExisting = false }: ImportResultsOptions) {
    if (!existsSync(resultsRoot)) return [];
    const directories = readdirSync(resultsRoot, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && (!runId || entry.name === runId))
      .map(entry => resolve(resultsRoot, entry.name));
    const imported: ImportedRun[] = [];
    for (const directory of directories) {
      const value = await normalizeTemporaryRun(directory, { replaceExisting });
      if (value) imported.push({ id: value.id, status: value.status, imported: value.normalized });
    }
    return imported;
  }

  async function getRun(id: string) {
    const run = await database
      .selectFrom('runs')
      .innerJoin('run_agent_setup', 'run_agent_setup.run_id', 'runs.id')
      .selectAll('runs')
      .select([
        'run_agent_setup.provider',
        'run_agent_setup.agent as model',
        'run_agent_setup.reasoning_level as reasoningEffort',
      ])
      .where('runs.id', '=', id)
      .executeTakeFirst();
    if (!run) return null;
    const summary = await database
      .selectFrom('run_summary')
      .selectAll()
      .where('run_id', '=', id)
      .executeTakeFirst();
    const attempts = await database
      .selectFrom('attempt_summary')
      .select(['final_score', 'duration_ms', 'pass_count'])
      .where('run_id', '=', id)
      .execute();
    const latestEvaluation = await database
      .selectFrom('pass_evaluations')
      .innerJoin('run_passes', 'run_passes.id', 'pass_evaluations.pass_id')
      .innerJoin('run_attempts', 'run_attempts.id', 'run_passes.attempt_id')
      .select(['pass_evaluations.id'])
      .where('run_attempts.run_id', '=', id)
      .orderBy('run_attempts.attempt_number', 'desc')
      .orderBy('run_passes.pass_number', 'desc')
      .orderBy('pass_evaluations.created_at', 'desc')
      .executeTakeFirst();
    const findings = latestEvaluation
      ? await database
        .selectFrom('implementation_findings')
        .selectAll()
        .where('evaluation_id', '=', latestEvaluation.id)
        .execute()
      : [];
    const structural = await database
      .selectFrom('structural_findings')
      .innerJoin('pass_evaluations', 'pass_evaluations.id', 'structural_findings.evaluation_id')
      .innerJoin('run_passes', 'run_passes.id', 'pass_evaluations.pass_id')
      .innerJoin('run_attempts', 'run_attempts.id', 'run_passes.attempt_id')
      .selectAll('structural_findings')
      .where('run_attempts.run_id', '=', id)
      .execute();
    const sections: Array<[string, {
      id: string;
      label: string;
      classification: string;
      items: any[];
    }]> = findings.map(finding => [finding.section_id, {
      id: finding.section_id,
      label: finding.section_label,
      classification: 'reference-derived',
      items: [],
    }]);
    const implementationReview = [...new Map(sections).values()];
    for (const section of implementationReview) {
      section.items = findings
        .filter(finding => finding.section_id === section.id)
        .map(finding => ({
          id: finding.requirement_id,
          label: finding.requirement_label,
          implemented: Boolean(finding.implemented),
          candidateFiles: JSON.parse(finding.candidate_files_json ?? '[]'),
          referenceFiles: JSON.parse(finding.reference_files_json ?? '[]'),
        }));
    }
    const missedRequirements = structural
      .filter(finding => !finding.implemented)
      .reduce<Record<string, number>>((counts, finding) => ({
        ...counts,
        [finding.contract_id]: (counts[finding.contract_id] ?? 0) + 1,
      }), {});
    const comparison = summary && latestEvaluation && run.evaluation_readiness_status !== 'not-evaluable' ? {
      comparison: [{
        medianScore: median(attempts.flatMap(attempt => (
          attempt.final_score === null ? [] : [attempt.final_score]
        ))),
        medianDurationMs: median(attempts.flatMap(attempt => (
          attempt.pass_count ? [attempt.duration_ms] : []
        ))),
        inputTokens: summary.input_tokens,
        cachedInputTokens: summary.cached_input_tokens,
        outputTokens: summary.output_tokens,
        missedRequirements,
        implementationReview,
      }],
    } : null;
    return {
      id: run.id,
      createdAt: run.created_at,
      status: run.status,
      repositoryName: run.repository_name,
      provider: run.provider,
      model: run.model,
      reasoningEffort: run.reasoningEffort,
      featureType: run.feature_type,
      description: run.description,
      scenarioId: run.evaluation_template,
      readiness: run.evaluation_readiness_status ? {
        status: run.evaluation_readiness_status,
        fingerprint: run.evaluation_readiness_fingerprint,
        evidence: JSON.parse(run.evaluation_readiness_evidence_json ?? '{}'),
        findings: JSON.parse(run.evaluation_readiness_findings_json ?? '[]'),
      } : null,
      preparedPrompt: run.prepared_prompt,
      comparison,
    };
  }

  async function listRuns() {
    const ids = await database.selectFrom('runs').select('id').orderBy('created_at', 'desc').execute();
    return (await Promise.all(ids.map(row => getRun(row.id)))).filter(Boolean);
  }

  return { createRun, updateRunStatus, normalizeTemporaryRun, importResults, getRun, listRuns };
}
