#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import process from 'node:process';
import {
  ensureDirectory,
  parseJsonLines,
  readJson,
  runCommand,
  spawnWithCapture,
  summarizeEvents,
  writeJson,
} from './agent-benchmark-lib.js';
import { grade } from './grade-agent-benchmark.js';

const HARNESS_ROOT = resolve(import.meta.dirname, '../..');
const BENCHMARKS_ROOT = resolve(HARNESS_ROOT, 'benchmarks');
const FEATURE_TYPES = ['frontend', 'backend', 'full-stack'];

function usage() {
  console.log(`Usage: npx tsx backend/src/run-agent-benchmark.ts --scenario ID [options]

Options:
  --repo PATH           Target Git repository (required).
  --models CSV          Override the manifest model list.
  --reasoning-efforts CSV  Override reasoning levels (for example: low,medium,high).
  --repetitions N       Override repetition count.
  --base-ref REF        Revision shared by every run (default: scenario baseline).
  --output-dir PATH     Retained diagnostic directory (default: system runtime directory).
  --prompt-file PATH    Override the scenario prompt with a prepared prompt file.
  --feature-type TYPE   Scope evaluation to frontend, backend, or full-stack.
  --timeout-minutes N   Override per-agent timeout.
  --codex-bin PATH      Codex executable (default: codex).
  --skip-setup          Do not install dependencies before agent execution.
  --keep-worktrees      Preserve every worktree.
  --skip-evaluation     Capture agent output without running evaluator commands.
  --dry-run             Validate and print the matrix without invoking Codex.
  -h, --help            Show help.`);
}

export function parseArguments(argv: string[]): any {
  const options: any = {
    keepWorktrees: false,
    skipEvaluation: false,
    skipSetup: false,
    dryRun: false,
    codexBin: process.env.CODEX_BIN ?? 'codex',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '-h' || value === '--help') return { help: true };
    if (value === '--keep-worktrees') { options.keepWorktrees = true; continue; }
    if (value === '--skip-evaluation') { options.skipEvaluation = true; continue; }
    if (value === '--skip-setup') { options.skipSetup = true; continue; }
    if (value === '--dry-run') { options.dryRun = true; continue; }
    const next = argv[++index];
    if (!next) throw new Error(`${value} requires a value.`);
    if (value === '--scenario') options.scenario = next;
    else if (value === '--repo') options.repo = resolve(next);
    else if (value === '--models') options.models = next.split(',').map(model => model.trim()).filter(Boolean);
    else if (value === '--reasoning-efforts') options.reasoningEfforts = next.split(',').map(effort => effort.trim()).filter(Boolean);
    else if (value === '--repetitions') options.repetitions = Number(next);
    else if (value === '--base-ref') options.baseRef = next;
    else if (value === '--output-dir') options.outputDir = next;
    else if (value === '--prompt-file') options.promptFile = resolve(next);
    else if (value === '--feature-type') options.featureType = next;
    else if (value === '--timeout-minutes') options.timeoutMinutes = Number(next);
    else if (value === '--codex-bin') options.codexBin = next;
    else throw new Error(`Unknown option ${value}.`);
  }
  if (!options.scenario) throw new Error('--scenario is required.');
  if (!options.repo) throw new Error('--repo is required.');
  if (options.featureType !== undefined && !FEATURE_TYPES.includes(options.featureType)) {
    throw new Error('--feature-type must be frontend, backend, or full-stack.');
  }
  if (options.repetitions !== undefined && (!Number.isInteger(options.repetitions) || options.repetitions < 1)) {
    throw new Error('--repetitions must be a positive integer.');
  }
  if (options.timeoutMinutes !== undefined && (!Number.isFinite(options.timeoutMinutes) || options.timeoutMinutes <= 0)) {
    throw new Error('--timeout-minutes must be positive.');
  }
  return options;
}

export function codexArguments({ model, reasoningEffort, worktree, finalPath }) {
  return [
    'exec', '--ephemeral', '--json', '--model', model,
    '-c', `model_reasoning_effort="${reasoningEffort}"`,
    '--approve-for-me', '--cd', worktree,
    '--output-last-message', finalPath, '-',
  ];
}

export function resolveFeatureType(override, manifestFeatureType) {
  const featureType = override ?? manifestFeatureType ?? 'full-stack';
  if (!FEATURE_TYPES.includes(featureType)) throw new Error(`Unsupported scenario feature type: ${String(featureType)}.`);
  return featureType;
}

export function dockerComposeIsolationOverride(services: unknown): string {
  if (!Array.isArray(services) || services.length === 0) {
    throw new Error('Scenario isolation requires at least one Docker Compose service.');
  }
  const normalized = services.map(service => {
    if (typeof service !== 'string' || !/^[a-zA-Z0-9._-]+$/.test(service)) {
      throw new Error(`Unsafe Docker Compose service name: ${String(service)}`);
    }
    return service;
  });
  return [
    'services:',
    ...normalized.flatMap(service => [
      `  ${service}:`,
      `    container_name: \${BENCHMARK_RUN_ID}_${service}`,
      '    ports: !reset []',
    ]),
    '',
  ].join('\n');
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

export function applyGuidanceSnapshot({ repoRoot, worktree, guidance }) {
  if (!guidance) return git(['rev-parse', 'HEAD'], worktree);
  const files = git(['ls-tree', '-r', '--name-only', guidance.ref, '--', ...guidance.paths], repoRoot)
    .split('\n').filter(Boolean);
  if (!files.length) throw new Error(`Guidance snapshot ${guidance.ref} did not resolve any files.`);
  for (const file of files) {
    ensureDirectory(dirname(resolve(worktree, file)));
    const contents = execFileSync('git', ['show', `${guidance.ref}:${file}`], { cwd: repoRoot });
    writeFileSync(resolve(worktree, file), contents);
  }
  // Guidance may introduce canonical documentation paths that the historical
  // product baseline ignored before those paths existed.
  git(['add', '--force', '--', ...files], worktree);
  let hasStagedChanges = false;
  try {
    execFileSync('git', ['diff', '--cached', '--quiet'], { cwd: worktree, stdio: 'ignore' });
  } catch (error) {
    if (error.status !== 1) throw error;
    hasStagedChanges = true;
  }
  if (!hasStagedChanges) return git(['rev-parse', 'HEAD'], worktree);
  execFileSync('git', ['-c', 'user.name=Agent Benchmark', '-c', 'user.email=benchmark@local.invalid', 'commit', '-m', 'benchmark: overlay pinned guidance'], {
    cwd: worktree,
    stdio: 'ignore',
  });
  return git(['rev-parse', 'HEAD'], worktree);
}

function timestamp() {
  return new Date().toISOString().replaceAll(':', '').replaceAll('.', '-');
}

export function comparison(results) {
  const groups = new Map();
  for (const result of results) {
    const key = `${result.model}\u0000${result.reasoningEffort}`;
    const values = groups.get(key) ?? [];
    values.push(result);
    groups.set(key, values);
  }
  return [...groups.values()].map(runs => {
    const { model, reasoningEffort } = runs[0];
    const successful = runs.filter(run => run.agent.exitCode === 0 && !run.agent.timedOut);
    const scores = runs.map(run => run.grade?.percentage).filter(value => typeof value === 'number').sort((a, b) => a - b);
    const durations = runs.map(run => run.agent.durationMs).sort((a, b) => a - b);
    const median = values => values.length ? values[Math.floor(values.length / 2)] : null;
    const mean = values => values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
    const meanScore = mean(scores);
    const scoreStdDev = meanScore === null ? null : Math.sqrt(mean(scores.map(score => (score - meanScore) ** 2)));
    const missedRequirements = {};
    for (const run of runs) {
      for (const id of run.grade?.failedRequirements ?? []) missedRequirements[id] = (missedRequirements[id] ?? 0) + 1;
    }
    return {
      model,
      reasoningEffort,
      runs: runs.length,
      successfulRuns: successful.length,
      medianScore: median(scores),
      meanScore: meanScore === null ? null : Math.round(meanScore * 10) / 10,
      minimumScore: scores[0] ?? null,
      maximumScore: scores.at(-1) ?? null,
      scoreStdDev: scoreStdDev === null ? null : Math.round(scoreStdDev * 10) / 10,
      allGatesPassRate: runs.length
        ? Math.round(1000 * runs.filter(run => run.grade?.failedChecks?.length === 0).length / runs.length) / 10
        : 0,
      missedRequirements,
      implementationReview: runs[0].grade?.implementationReview ?? null,
      medianDurationMs: median(durations),
      inputTokens: runs.reduce((total, run) => total + run.agent.usage.inputTokens, 0),
      cachedInputTokens: runs.reduce((total, run) => total + run.agent.usage.cachedInputTokens, 0),
      outputTokens: runs.reduce((total, run) => total + run.agent.usage.outputTokens, 0),
    };
  }).sort((a, b) => (b.medianScore ?? -1) - (a.medianScore ?? -1));
}

async function executeRun({ repoRoot, baseSha, scenarioPath, manifest, model, reasoningEffort, repetition, outputRoot, options, worktreeRoot }) {
  const safeModel = model.replaceAll(/[^a-zA-Z0-9.-]/g, '_');
  const safeEffort = reasoningEffort.replaceAll(/[^a-zA-Z0-9.-]/g, '_');
  const runId = `${safeModel}-${safeEffort}-run-${repetition}`;
  const runOutput = ensureDirectory(resolve(outputRoot, runId));
  const worktree = resolve(worktreeRoot, runId);
  git(['worktree', 'add', '--detach', worktree, baseSha], repoRoot);
  const runBaseSha = applyGuidanceSnapshot({ repoRoot, worktree, guidance: manifest.guidance });
  const composeOverride = resolve(worktree, 'logs/benchmark-compose.yml');
  ensureDirectory(resolve(worktree, 'logs'));
  writeFileSync(composeOverride, dockerComposeIsolationOverride(manifest.isolation?.dockerComposeServices));
  const composeProject = `agent-benchmark-${safeModel}-run-${repetition}`.toLowerCase().replaceAll(/[^a-z0-9_-]/g, '-');
  const benchmarkEnv = {
    ...process.env,
    BENCHMARK_RUN_ID: runId,
    COMPOSE_PROJECT_NAME: composeProject,
    COMPOSE_FILE: `${resolve(worktree, 'docker-compose.yml')}:${composeOverride}`,
  };
  writeFileSync(resolve(worktree, '.env'), [
    'DB_USER=root',
    'DB_PASSWORD=supersecretpassword',
    'DB_NAME=myapp_db',
    'JWT_SECRET=benchmark-jwt-secret-not-for-production',
    'REFRESH_SECRET=benchmark-refresh-secret-not-for-production',
    'NODE_ENV=development',
    'FRONTEND_URL=http://localhost:5173',
    '',
  ].join('\n'));
  const setup = [];
  if (!options.skipSetup) {
    const setupCommands: Array<[string, string[]]> = [
      ['npm', ['ci']],
      ['npm', ['ci', '--prefix', 'frontend']],
      ['npm', ['ci', '--prefix', 'backend']],
    ];
    for (const [command, args] of setupCommands) {
      const result = runCommand(command, args, {
        cwd: worktree,
        env: benchmarkEnv,
        maxBuffer: 50 * 1024 * 1024,
        timeoutMs: 10 * 60_000,
      });
      setup.push(result);
      if (result.exitCode !== 0) {
        writeJson(resolve(runOutput, 'setup.json'), setup);
        throw new Error(`Benchmark dependency setup failed for ${runId}: ${command} ${args.join(' ')}`);
      }
    }
  }
  writeJson(resolve(runOutput, 'setup.json'), setup);
  const prompt = readFileSync(options.promptFile ?? resolve(scenarioPath, manifest.promptFile), 'utf8');
  const stdoutPath = resolve(runOutput, 'events.jsonl');
  const stderrPath = resolve(runOutput, 'progress.log');
  const finalPath = resolve(worktree, '.benchmark-final.md');
  const codexArgs = codexArguments({ model, reasoningEffort, worktree, finalPath });
  const agent = await spawnWithCapture(options.codexBin, codexArgs, {
    cwd: worktree,
    env: benchmarkEnv,
    timeoutMs: options.timeoutMinutes * 60_000,
    stdoutPath,
    stderrPath,
    input: prompt,
  });
  const parsed = parseJsonLines(agent.stdout);
  const eventSummary = summarizeEvents(parsed.events);
  const finalMessage = existsSync(finalPath) ? readFileSync(finalPath, 'utf8') : eventSummary.finalMessage;
  rmSync(finalPath, { force: true });
  writeFileSync(resolve(runOutput, 'final.md'), finalMessage || eventSummary.finalMessage);
  const trackedChanges = git(['diff', '--name-status', runBaseSha], worktree);
  const untrackedChanges = git(['ls-files', '--others', '--exclude-standard'], worktree)
    .split('\n').filter(Boolean).map(file => `?\t${file}`).join('\n');
  const changedFiles = [trackedChanges, untrackedChanges].filter(Boolean).join('\n');
  writeFileSync(resolve(runOutput, 'changed-files.txt'), `${changedFiles}\n`);
  git(['add', '-N', '.'], worktree);
  const patch = execFileSync('git', ['diff', '--binary', '--no-ext-diff', runBaseSha], {
    cwd: worktree,
    encoding: 'utf8',
    maxBuffer: 100 * 1024 * 1024,
  });
  writeFileSync(resolve(runOutput, 'changes.patch'), patch);
  let gradeResult = null;
  if (!options.skipEvaluation && agent.exitCode === 0 && !agent.timedOut) {
    gradeResult = grade({ worktree, scenarioPath, baseSha: runBaseSha, featureType: options.featureType, env: benchmarkEnv });
    writeJson(resolve(runOutput, 'grade.json'), gradeResult);
  }
  const result = {
    runId,
    model,
    reasoningEffort,
    repetition,
    productBaseSha: baseSha,
    runBaseSha,
    guidance: manifest.guidance ?? null,
    worktree,
    agent: {
      exitCode: agent.exitCode,
      durationMs: agent.durationMs,
      timedOut: agent.timedOut,
      usage: eventSummary.usage,
      invalidEventLines: parsed.invalid.length,
    },
    grade: gradeResult ? {
      earned: gradeResult.earned,
      possible: gradeResult.possible,
      percentage: gradeResult.percentage,
      failedChecks: gradeResult.checks.filter(check => !check.passed).map(check => check.id),
      failedRequirements: gradeResult.requirements.filter(requirement => !requirement.passed).map(requirement => requirement.id),
      implementationReview: gradeResult.implementationReview,
    } : null,
  };
  writeJson(resolve(runOutput, 'result.json'), result);
  const failed = agent.exitCode !== 0 || agent.timedOut;
  runCommand('docker', ['compose', 'down', '--volumes', '--remove-orphans'], {
    cwd: worktree,
    env: benchmarkEnv,
    timeoutMs: 2 * 60_000,
  });
  if (!options.keepWorktrees && !failed) git(['worktree', 'remove', '--force', worktree], repoRoot);
  return result;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) { usage(); return; }
  const scenarioPath = resolve(BENCHMARKS_ROOT, options.scenario);
  const manifest = readJson(resolve(scenarioPath, 'manifest.json'));
  if (manifest.id !== options.scenario) throw new Error(`Scenario id mismatch: expected ${options.scenario}.`);
  const models = options.models ?? manifest.models;
  const reasoningEfforts = options.reasoningEfforts ?? manifest.reasoningEfforts;
  if (!Array.isArray(reasoningEfforts) || !reasoningEfforts.length) throw new Error('At least one reasoning effort is required.');
  const repetitions = options.repetitions ?? manifest.repetitions;
  options.timeoutMinutes ??= manifest.timeoutMinutes;
  const repoRoot = options.repo;
  const baseRef = options.baseRef ?? manifest.baseRef;
  if (!baseRef) throw new Error('A scenario baseRef or --base-ref is required.');
  const baseSha = git(['rev-parse', `${baseRef}^{commit}`], repoRoot);
  if (manifest.guidance) git(['rev-parse', `${manifest.guidance.ref}^{commit}`], repoRoot);
  const runtimeRoot = process.env.AGENT_INSIGHTS_RUNTIME_PATH ?? tmpdir();
  const outputRoot = resolve(options.outputDir ?? resolve(runtimeRoot, `${manifest.id}-benchmark-${timestamp()}`));
  const matrix = models.flatMap(model => reasoningEfforts.flatMap(reasoningEffort => (
    Array.from({ length: repetitions }, (_, index) => ({ model, reasoningEffort, repetition: index + 1 }))
  )));
  options.featureType = resolveFeatureType(options.featureType, manifest.featureType);
  const runPlan = {
    scenario: manifest.id,
    featureType: options.featureType,
    repoRoot,
    baseRef,
    baseSha,
    guidance: manifest.guidance ?? null,
    timeoutMinutes: options.timeoutMinutes,
    outputRoot,
    matrix,
  };
  if (options.dryRun) { console.log(JSON.stringify(runPlan, null, 2)); return; }
  ensureDirectory(outputRoot);
  writeJson(resolve(outputRoot, 'plan.json'), runPlan);
  const worktreeRoot = mkdtempSync(resolve(tmpdir(), `${basename(repoRoot)}-agent-benchmark-`));
  const results = [];
  try {
    for (const entry of matrix) {
      console.error(`[benchmark] ${entry.model} (${entry.reasoningEffort}) repetition ${entry.repetition}/${repetitions}`);
      results.push(await executeRun({ repoRoot, baseSha, scenarioPath, manifest, outputRoot, options, worktreeRoot, ...entry }));
    }
  } finally {
    git(['worktree', 'prune'], repoRoot);
  }
  const report = { ...runPlan, results, comparison: comparison(results) };
  writeJson(resolve(outputRoot, 'comparison.json'), report);
  const lines = [
    '# Agent benchmark comparison',
    '',
    `Scenario: ${manifest.title}`,
    '',
    '| Model | Reasoning | Runs | Median | Range | Std dev | All gates | Median duration | Output |',
    '|---|---|---:|---:|---:|---:|---:|---:|---:|',
  ];
  for (const row of report.comparison) {
    const columns = [
      row.model,
      row.reasoningEffort,
      `${row.successfulRuns}/${row.runs}`,
      `${row.medianScore ?? '—'}%`,
      `${row.minimumScore ?? '—'}–${row.maximumScore ?? '—'}%`,
      row.scoreStdDev ?? '—',
      `${row.allGatesPassRate}%`,
      `${row.medianDurationMs ?? '—'} ms`,
      row.outputTokens,
    ];
    lines.push(`| ${columns.join(' | ')} |`);
  }
  lines.push('', '## Recurring missed contracts', '');
  for (const row of report.comparison) {
    const misses = Object.entries(row.missedRequirements as Record<string, number>)
      .sort((a, b) => b[1] - a[1])
      .map(([id, count]) => `${id} (${count}/${row.runs})`)
      .join(', ');
    lines.push(`- ${row.model} / ${row.reasoningEffort}: ${misses || 'none'}`);
  }
  lines.push('', '## Implementation review', '');
  for (const row of report.comparison) {
    lines.push(`### ${row.model} / ${row.reasoningEffort}`, '');
    for (const section of row.implementationReview ?? []) {
      lines.push(`#### ${section.label}`, '', '| Subsection | Status | Agent output | Reference |', '|---|---|---|---|');
      for (const item of section.items) {
        lines.push(
          `| ${item.label} | ${item.implemented ? 'Implemented' : 'Missing'} | ${item.candidateFiles.join('<br>') || '—'} | ${item.referenceFiles.join('<br>') || '—'} |`,
        );
      }
      lines.push('');
    }
  }
  writeFileSync(resolve(outputRoot, 'comparison.md'), `${lines.join('\n')}\n`);
  console.log(resolve(outputRoot, 'comparison.md'));
  if (results.some(result => result.agent.exitCode !== 0 || result.agent.timedOut)) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exit(2);
  });
}
