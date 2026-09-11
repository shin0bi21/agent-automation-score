import { execFileSync, spawn } from 'node:child_process';
import {
  closeSync,
  existsSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve, sep } from 'node:path';
import { writeJson } from './agent-benchmark-lib.js';
import { createDatabase } from './db/client.js';
import { databasePath } from './db/config.js';
import { migrate } from './db/migrator.js';
import { loadBenchmarkCatalog } from './services/benchmark-catalog.js';
import { createBenchmarkSchedulePersistence } from './services/benchmark-schedule-persistence.js';
import { assessBenchmarkReadiness } from './services/benchmark-readiness.js';
import { createRunPersistence } from './services/run-persistence.js';

export const ALLOWED_EFFORTS = ['low', 'medium', 'high'];
export const ALLOWED_FEATURE_TYPES = ['frontend', 'backend', 'full-stack'];
export const AGENT_PROVIDERS = {
  codex: {
    id: 'codex',
    label: 'Codex',
    models: [
      { id: 'gpt-5.6-sol', label: 'Sol' },
      { id: 'gpt-5.6-luna', label: 'Luna' },
      { id: 'gpt-5.6-terra', label: 'Terra' },
    ],
  },
};

export function providerCatalog() {
  return Object.values(AGENT_PROVIDERS).map(provider => ({ ...provider }));
}

function within(parent, child) {
  const prefix = `${resolve(parent)}${sep}`;
  return resolve(child) === resolve(parent) || resolve(child).startsWith(prefix);
}

export function validateRepository(repoPath) {
  const path = resolve(String(repoPath ?? ''));
  if (!repoPath || !existsSync(path) || !statSync(path).isDirectory()) throw new Error('Repository directory does not exist.');
  try {
    execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: path, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    throw new Error('Selected directory is not a Git repository.');
  }
  return path;
}

export function chooseRepositoryDirectory({ platform = process.platform, execute = execFileSync } = {}) {
  if (platform !== 'darwin') {
    throw new Error(
      'Native folder selection is currently available on macOS. Enter the repository path manually on this platform.',
    );
  }
  try {
    return execute('osascript', ['-e', 'POSIX path of (choose folder with prompt "Choose a Git repository")'], { encoding: 'utf8' }).trim().replace(/\/$/, '');
  } catch (error) {
    if (error?.status === 1) throw new Error('Folder selection was cancelled.');
    throw new Error('The native folder picker could not be opened.');
  }
}

export function validateRunTemporaryRoot(repo, temporaryRoot = tmpdir()) {
  const resolvedRoot = resolve(temporaryRoot);
  if (within(repo, resolvedRoot)) {
    throw new Error('Run temporary storage must be outside the attached repository.');
  }
  return resolvedRoot;
}

function skillMetadata(skillPath) {
  const source = readFileSync(skillPath, 'utf8');
  const frontmatter = source.match(/^---\s*\n([\s\S]*?)\n---/);
  const field = name => frontmatter?.[1].match(new RegExp(`^${name}:\\s*(.+)$`, 'm'))?.[1]?.trim() ?? '';
  return { name: field('name') || basename(dirname(skillPath)), description: field('description'), path: skillPath };
}

export function discoverSkills(repoPath) {
  const repo = validateRepository(repoPath);
  const roots = ['.agents/skills', '.codex/skills'].map(path => resolve(repo, path)).filter(existsSync);
  return roots.flatMap(root => readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => resolve(root, entry.name, 'SKILL.md'))
    .filter(path => existsSync(path) && within(repo, path))
    .map(skillMetadata));
}

export function validateAutomationGuidance(repoPath) {
  const repo = validateRepository(repoPath);
  const agentsPath = resolve(repo, 'AGENTS.md');
  if (!existsSync(agentsPath) || !statSync(agentsPath).isFile()) {
    throw new Error('Repository is not automation-ready: AGENTS.md is required.');
  }
  const skills = discoverSkills(repo);
  if (!skills.length) {
    throw new Error(
      'Repository is not automation-ready: add at least one SKILL.md under .agents/skills or .codex/skills.',
    );
  }
  return { repo, skills };
}

export function composePrompt({ scenarioPrompt, featureType = 'full-stack', description }) {
  const requested = String(description ?? '').trim();
  if (!requested) throw new Error('Feature description is required.');
  if (!ALLOWED_FEATURE_TYPES.includes(featureType)) throw new Error('Unsupported feature type.');
  let scope = 'Implement the complete full-stack scope, including persistence, backend API, and frontend behavior.';
  if (featureType === 'frontend') {
    scope = 'Implement frontend scope only. Assume the required backend contracts already exist.';
  } else if (featureType === 'backend') {
    scope = 'Implement backend scope only. Assume the frontend consumer already exists.';
  }
  return [
    scenarioPrompt.trim(),
    `## Requested feature scope\n${scope}`,
    'Follow AGENTS.md and let its workflow choose the applicable repository skill. Do not guess when repository guidance is missing.',
    `## User feature description\n${requested}`,
  ].join('\n\n') + '\n';
}

function compactText(value, limit = 240) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function activityLabel(item) {
  if (item.type === 'agent_message') return 'Agent update';
  if (item.type === 'file_change') {
    const count = item.changes?.length ?? 0;
    const action = item.status === 'in_progress' ? 'Updating' : 'Updated';
    return `${action} ${count} ${count === 1 ? 'file' : 'files'}`;
  }
  const command = String(item.command ?? '');
  if (/\b(test|vitest|jest|playwright)\b/i.test(command)) return 'Running tests';
  if (/\b(build|tsc)\b/i.test(command)) return 'Checking the build';
  if (/\b(rg|grep|find|sed|head|tail)\b/i.test(command)) return 'Inspecting repository patterns';
  return item.status === 'in_progress' ? 'Running a command' : 'Command completed';
}

function observedSkillNames(command) {
  const names = new Set();
  const pluginRanges = [];
  for (const match of command.matchAll(/plugins[\\/]cache[\\/]([^\\/"'\s]+)[\\/][^\\/"'\s]+[\\/]skills[\\/](?:[^\\/"'\s]+[\\/])*([^\\/"'\s]+)[\\/]SKILL\.md/g)) {
    names.add(`${match[1]}:${match[2]}`);
    pluginRanges.push([match.index, match.index + match[0].length]);
  }
  for (const match of command.matchAll(/(?:\.agents[\\/]|\.codex[\\/])?skills[\\/](?:[^\\/"'\s]+[\\/])*([^\\/"'\s]+)[\\/]SKILL\.md/g)) {
    if (!pluginRanges.some(([start, end]) => match.index >= start && match.index < end)) names.add(match[1]);
  }
  return [...names];
}

export function parseAgentActivity(source, runStatus = 'completed') {
  const items = new Map();
  const routes = new Map();
  for (const line of String(source ?? '').split('\n')) {
    if (!line.trim()) continue;
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    const item = event.item;
    if (!item?.id || !['agent_message', 'command_execution', 'file_change'].includes(item.type)) continue;
    let status = 'completed';
    if (item.type !== 'agent_message') {
      if (item.status === 'in_progress') status = 'running';
      else if ((item.exit_code && item.exit_code !== 0) || item.status === 'failed') status = 'failed';
    }
    let detail = '';
    if (item.type === 'agent_message') detail = compactText(item.text, 500);
    if (item.type === 'command_execution') detail = compactText(item.command);
    if (item.type === 'file_change') {
      detail = (item.changes ?? [])
        .map(change => `${change.kind}: ${String(change.path).split('/').slice(-4).join('/')}`)
        .join('\n');
    }
    items.set(item.id, { id: item.id, parentId: 'agent-work', kind: item.type, label: activityLabel(item), detail, status });
    if (item.type === 'command_execution') {
      const command = String(item.command ?? '');
      if (/AGENTS\.md\b/.test(command)) routes.set('guidance-agents', { id: 'guidance-agents', parentId: 'guidance-routing', kind: 'guidance', label: 'Read repository guidance', detail: 'AGENTS.md', status });
      for (const name of observedSkillNames(command)) {
        routes.set(`guidance-skill-${name}`, { id: `guidance-skill-${name}`, parentId: 'guidance-routing', kind: 'skill', label: `Read skill: ${name}`, detail: 'Explicit SKILL.md read; extracted contents are not retained.', status });
      }
    }
  }
  const children = [...items.values()].slice(-50);
  if (!children.length) return [];
  const failed = children.some(item => item.status === 'failed');
  const status = runStatus === 'running' || children.some(item => item.status === 'running') ? 'running' : failed ? 'failed' : 'completed';
  const routing = [...routes.values()];
  return [
    ...(routing.length ? [{ id: 'guidance-routing', parentId: null, kind: 'phase', label: 'Guidance routing', detail: 'Observed guidance-file reads only.', status }, ...routing] : []),
    { id: 'agent-work', parentId: null, kind: 'phase', label: 'Agent work', detail: '', status },
    ...children,
  ];
}

export function benchmarkRunnerInvocation(root, environment = process.env) {
  if (environment.NODE_ENV === 'production') {
    return { command: process.execPath, args: [resolve(root, 'backend/dist/run-agent-benchmark.js')] };
  }
  return { command: process.execPath, args: ['--import', 'tsx', resolve(root, 'backend/src/run-agent-benchmark.ts')] };
}

function readFileTail(path, maximumBytes = 1_000_000) {
  const size = statSync(path).size;
  const length = Math.min(size, maximumBytes);
  const buffer = Buffer.alloc(length);
  const descriptor = openSync(path, 'r');
  try { readSync(descriptor, buffer, 0, length, size - length); }
  finally { closeSync(descriptor); }
  return buffer.toString('utf8');
}

export function createRunManager({ root, spawnProcess = spawn, schedulePollMs = 30_000 }) {
  const databaseFile = databasePath(root);
  migrate({ path: databaseFile });
  const database = createDatabase(databaseFile);
  const persistence = createRunPersistence(database);
  const schedulePersistence = createBenchmarkSchedulePersistence(database);
  const active = new Map();
  const catalog = loadBenchmarkCatalog(root);
  const scheduleRepositories = new Map();
  let starting = false;
  const ready = database
    .updateTable('runs')
    .set({ status: 'interrupted', completed_at: new Date().toISOString() })
    .where('status', 'in', ['queued', 'preparing', 'running', 'evaluating'])
    .execute();

  async function list() {
    await ready;
    const stored = await persistence.listRuns();
    return Promise.all(stored.map(run => active.has(run.id) ? get(run.id) : run));
  }

  async function get(id) {
    if (!/^[a-zA-Z0-9-]+$/.test(id)) return null;
    await ready;
    const stored = await persistence.getRun(id);
    if (!stored) return null;
    const live = active.get(id);
    if (!live) return { ...stored, progress: '', activity: [] };
    const directory = live.directory;
    const runnerLogPath = resolve(directory, 'runner.log');
    const candidateLogs = readdirSync(directory, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => resolve(directory, entry.name, 'progress.log'))
      .filter(existsSync);
    const eventLogs = readdirSync(directory, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => resolve(directory, entry.name, 'events.jsonl'))
      .filter(existsSync);
    const progressSections = [
      existsSync(runnerLogPath) ? `Runner\n${readFileSync(runnerLogPath, 'utf8')}` : '',
      ...candidateLogs.map(path => `Agent progress\n${readFileSync(path, 'utf8')}`),
    ].filter(Boolean);
    const status = live.status;
    return {
      ...stored,
      repo: live.repo,
      status,
      exitCode: live.exitCode,
      artifactPath: directory,
      progress: progressSections.join('\n\n').slice(-40_000),
      activity: eventLogs.flatMap(path => parseAgentActivity(readFileTail(path), status)),
    };
  }

  async function start(input) {
    if (starting || [...active.values()].some(run => run.status === 'running')) {
      const error: Error & { status?: number } = new Error('Another benchmark run is already active.');
      error.status = 409;
      throw error;
    }
    starting = true;
    try {
    await ready;
    const { repo } = validateAutomationGuidance(input.repo);
    const provider = AGENT_PROVIDERS[input.provider];
    if (!provider) throw new Error('Unsupported agent provider.');
    if (!provider.models.some(model => model.id === input.model)) throw new Error('Unsupported model for this provider.');
    if (!ALLOWED_EFFORTS.includes(input.reasoningEffort)) throw new Error('Unsupported reasoning effort.');
    if (typeof input.scenarioId !== 'string') throw new Error('Select a benchmark scenario before starting a run.');
    const scenario = catalog.scenario(input.scenarioId);
    const readiness = assessBenchmarkReadiness(repo, scenario);
    if (readiness.status === 'not-evaluable') {
      const error: Error & { status?: number } = new Error(`Benchmark not runnable: insufficient evaluation contract. ${readiness.findings.join(' ')}`);
      error.status = 422;
      throw error;
    }
    const featureType = input.featureType ?? scenario.featureType;
    if (!ALLOWED_FEATURE_TYPES.includes(featureType)) throw new Error('Unsupported feature type.');
    const id = `run-${new Date().toISOString().replaceAll(/[^0-9]/g, '').slice(0, 17)}-${Math.random().toString(36).slice(2, 7)}`;
    const directory = mkdtempSync(resolve(validateRunTemporaryRoot(repo), `agent-insights-${id}-`));
    const scenarioPrompt = readFileSync(scenario.promptFile, 'utf8');
    const prompt = composePrompt({ scenarioPrompt, featureType, description: scenario.title });
    const promptPath = resolve(directory, 'prompt.md');
    const logPath = resolve(directory, 'runner.log');
    writeFileSync(promptPath, prompt);
    writeFileSync(logPath, '');
    const config = {
      id,
      createdAt: new Date().toISOString(),
      status: 'running',
      repo,
      provider: provider.id,
      model: input.model,
      reasoningEffort: input.reasoningEffort,
      featureType,
      scenarioId: scenario.id,
      description: scenario.title,
      readinessFingerprint: readiness.fingerprint,
      promptTemplateVersion: `${scenario.id}:v${scenario.version}`,
      readiness,
    };
    writeJson(resolve(directory, 'web-run.json'), config);
    const baseRevision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
    await persistence.createRun({
      id,
      repositoryName: basename(repo),
      baseRevision,
      featureType,
      description: config.description,
      preparedPrompt: prompt,
      promptTemplateVersion: `${scenario.id}:v${scenario.version}`,
      evaluationTemplate: scenario.id,
      provider: provider.id,
      agent: input.model,
      reasoningLevel: input.reasoningEffort,
      readiness,
      createdAt: config.createdAt,
    });
    await persistence.updateRunStatus(id, 'running');
    const invocation = benchmarkRunnerInvocation(root);
    const args = [
      ...invocation.args,
      '--repo', repo,
      '--scenario', scenario.id,
      '--feature-type', featureType,
      '--models', input.model,
      '--reasoning-efforts', input.reasoningEffort,
      '--repetitions', '1',
      '--prompt-file', promptPath,
      '--output-dir', directory,
    ];
    const output = writeFileSync;
    const child = spawnProcess(invocation.command, args, { cwd: root, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    active.set(id, { status: 'running', exitCode: null, child, directory, repo });
    const append = chunk => output(logPath, chunk, { flag: 'a' });
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    child.on('close', async exitCode => {
      const status = exitCode === 0 ? 'completed' : 'failed';
      active.set(id, { status, exitCode, child: null, directory, repo });
      writeJson(resolve(directory, 'web-run.json'), { ...config, status, exitCode });
      try {
        await persistence.normalizeTemporaryRun(directory, { replaceExisting: true });
        if (input.scheduleOccurrence) {
          await schedulePersistence.linkOccurrenceRun(input.scheduleOccurrence.scheduleId, input.scheduleOccurrence.plannedAt, id);
        }
        active.delete(id);
        rmSync(directory, { recursive: true, force: true });
      } catch (error) {
        await persistence.updateRunStatus(id, 'failed');
        console.error(`Could not normalize run ${id}; temporary evidence retained at ${directory}.`, error);
      }
    });
    return await get(id);
    } finally {
      starting = false;
    }
  }

  function scheduleView(schedule) {
    return {
      id: schedule.id,
      repositoryName: schedule.repository_name,
      scenarioId: schedule.scenario_id,
      scenarioVersion: schedule.scenario_version,
      scenarioFingerprint: schedule.scenario_fingerprint,
      provider: schedule.provider,
      model: schedule.model,
      reasoningEffort: schedule.reasoning,
      featureType: schedule.feature_type,
      description: schedule.description,
      intervalMinutes: schedule.interval_minutes,
      enabled: Boolean(schedule.enabled),
      consentedAt: schedule.token_cost_consent_at,
      nextRunAt: schedule.next_run_at,
      connected: scheduleRepositories.has(schedule.id),
      createdAt: schedule.created_at,
      updatedAt: schedule.updated_at,
      trend: [],
    };
  }

  async function listSchedules() {
    await ready;
    return Promise.all((await schedulePersistence.listSchedules()).map(async schedule => ({
      ...scheduleView(schedule),
      trend: (await schedulePersistence.listTrendPoints(schedule.id, 24)).map(point => ({
        plannedAt: point.planned_at,
        outcome: point.outcome,
        runId: point.run_id,
        reason: point.reason,
        runStatus: point.run_status,
        score: point.average_score,
        durationMs: point.duration_ms,
        inputTokens: point.input_tokens,
        cachedInputTokens: point.cached_input_tokens,
        newInputTokens: point.input_tokens === null || point.cached_input_tokens === null ? null : Math.max(0, point.input_tokens - point.cached_input_tokens),
        outputTokens: point.output_tokens,
      })).reverse(),
    })));
  }

  async function createSuiteSchedule(input) {
    await ready;
    if (input.tokenCostConsent !== true) throw new Error('Recurring benchmarks require explicit token-cost consent.');
    const intervalMinutes = Number(input.intervalMinutes);
    if (!Number.isInteger(intervalMinutes) || intervalMinutes < 1440) throw new Error('Recurring benchmark interval must be at least one day.');
    const { repo } = validateAutomationGuidance(input.repo);
    const suite = catalog.suite(String(input.suiteId));
    const provider = AGENT_PROVIDERS[input.provider];
    if (!provider?.models.some(model => model.id === input.model)) throw new Error('Unsupported model for this provider.');
    if (!ALLOWED_EFFORTS.includes(input.reasoningEffort)) throw new Error('Unsupported reasoning effort.');
    const now = new Date();
    const nextRunAt = new Date(now.getTime() + intervalMinutes * 60_000).toISOString();
    const suiteScenarios = suite.scenarioIds.map(scenarioId => catalog.scenario(scenarioId));
    const blocked = suiteScenarios.map(scenario => assessBenchmarkReadiness(repo, scenario)).find(readiness => readiness.status === 'not-evaluable');
    if (blocked) throw new Error(`Benchmark suite is not runnable: ${blocked.scenarioId} has insufficient evaluation evidence. ${blocked.findings.join(' ')}`);
    const scheduleInputs = suiteScenarios.map(scenario => ({
        id: `schedule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        repositoryName: basename(repo),
        scenarioId: scenario.id,
        scenarioVersion: scenario.version,
        scenarioFingerprint: scenario.fingerprint,
        provider: provider.id,
        model: input.model,
        reasoning: input.reasoningEffort,
        featureType: scenario.featureType,
        description: scenario.title,
        intervalMinutes,
        enabled: true,
        tokenCostConsentAt: now.toISOString(),
        nextRunAt,
        createdAt: now.toISOString(),
      }));
    const createdSchedules = await schedulePersistence.createSchedules(scheduleInputs);
    for (const schedule of createdSchedules) scheduleRepositories.set(schedule.id, repo);
    const schedules = createdSchedules.map(scheduleView);
    return { suiteId: suite.id, schedules };
  }

  async function updateSchedule(id, input) {
    await ready;
    const schedule = await schedulePersistence.getSchedule(id);
    if (!schedule) return null;
    const currentScenario = catalog.scenario(schedule.scenario_id);
    if (input.enabled === true && (currentScenario.version !== schedule.scenario_version || currentScenario.fingerprint !== schedule.scenario_fingerprint)) {
      throw new Error('This schedule uses an outdated scenario version. Create a new compatible schedule.');
    }
    const now = new Date().toISOString();
    if (input.enabled === true && input.tokenCostConsent !== true) throw new Error('Enabling a recurring benchmark requires renewed token-cost consent.');
    if (input.repo) {
      const { repo } = validateAutomationGuidance(input.repo);
      if (basename(repo) !== schedule.repository_name) throw new Error('Reconnect the original repository for this schedule.');
      scheduleRepositories.set(id, repo);
    }
    if (input.enabled === true && !scheduleRepositories.has(id)) {
      throw new Error('Reconnect the original repository before enabling this schedule.');
    }
    if (input.enabled === false) scheduleRepositories.delete(id);
    await schedulePersistence.updateSchedule(id, {
      enabled: input.enabled,
      tokenCostConsentAt: input.enabled === true ? now : input.enabled === false ? null : undefined,
      updatedAt: now,
    });
    return scheduleView(await schedulePersistence.getSchedule(id));
  }

  function nextFutureRun(plannedAt, intervalMinutes, now) {
    let next = Date.parse(plannedAt);
    const step = intervalMinutes * 60_000;
    do { next += step; } while (next <= now);
    return new Date(next).toISOString();
  }

  async function runDueSchedule() {
    await ready;
    if (starting || [...active.values()].some(run => run.status === 'running')) return;
    const now = Date.now();
    const schedule = (await schedulePersistence.listDueSchedules(new Date(now).toISOString(), 1))[0];
    if (!schedule) return;
    const nextRunAt = nextFutureRun(schedule.next_run_at, schedule.interval_minutes, now);
    if (!await schedulePersistence.advanceSchedule(schedule.id, schedule.next_run_at, nextRunAt, new Date(now).toISOString())) return;
    const repo = scheduleRepositories.get(schedule.id);
    const occurrence = {
      id: `occurrence-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      scheduleId: schedule.id,
      plannedAt: schedule.next_run_at,
      createdAt: new Date(now).toISOString(),
    };
    const currentScenario = catalog.scenario(schedule.scenario_id);
    if (currentScenario.version !== schedule.scenario_version || currentScenario.fingerprint !== schedule.scenario_fingerprint) {
      await schedulePersistence.updateSchedule(schedule.id, { enabled: false, tokenCostConsentAt: null, updatedAt: new Date(now).toISOString() });
      await schedulePersistence.recordOccurrence({ ...occurrence, outcome: 'skipped', reason: 'Scenario version changed; create a new compatible schedule.' });
      return;
    }
    if (!repo) {
      await schedulePersistence.recordOccurrence({ ...occurrence, outcome: 'skipped', reason: 'Repository reconnect required after service restart.' });
      return;
    }
    try {
      const run = await start({
        repo,
        scenarioId: schedule.scenario_id,
        provider: schedule.provider,
        model: schedule.model,
        reasoningEffort: schedule.reasoning,
        featureType: schedule.feature_type,
        description: schedule.description,
        scheduleOccurrence: { scheduleId: schedule.id, plannedAt: schedule.next_run_at },
      });
      await schedulePersistence.recordOccurrence({ ...occurrence, outcome: 'started', runId: run.id });
    } catch (error) {
      console.error(`Scheduled benchmark ${schedule.id} could not start.`, error);
      await schedulePersistence.recordOccurrence({ ...occurrence, outcome: 'failed', reason: 'Scheduled benchmark could not start; review the local service log.' });
    }
  }

  const scheduleTimer = setInterval(() => {
    void runDueSchedule().catch(error => console.error('Recurring benchmark scheduler failed safely.', error));
  }, schedulePollMs);
  scheduleTimer.unref?.();

  return {
    get, list, start,
    catalog: () => ({ scenarios: catalog.scenarios.map(({ id, version, title, featureType }) => ({ id, version, title, featureType })), suites: catalog.suites }),
    readiness: input => {
      const { repo } = validateAutomationGuidance(input.repo);
      return assessBenchmarkReadiness(repo, catalog.scenario(String(input.scenarioId)));
    },
    listSchedules, createSuiteSchedule, updateSchedule, runDueSchedule,
    hasActiveRun: () => starting || [...active.values()].some(run => run.status === 'running'),
    close: () => { clearInterval(scheduleTimer); return database.destroy(); },
  };
}
