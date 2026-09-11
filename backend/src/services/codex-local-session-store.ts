import { createReadStream, existsSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, isAbsolute, relative, resolve, sep } from 'node:path';
import DatabaseDriver from 'better-sqlite3';
import { extractRepositoryPathTouches, type ObservedRepositoryPathTouch } from './codex-path-observation.js';
import { buildSessionRepositoryTraversalReport, type SessionRepositoryTraversalReport } from './session-path-report.js';
import { buildSessionUsageTimeline, type SessionUsageTimelinePoint } from './session-usage-timeline.js';

export type CodexWorkerUsage = {
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
  active: boolean;
  updatedAt: string;
};

const offloadCategories = ['verification', 'build', 'formatting', 'script', 'monitoring'] as const;
type OffloadCategory = typeof offloadCategories[number];
const processRunners = ['package-manager', 'git-host', 'script', 'language-tool', 'container'] as const;
const processOperations = ['test', 'check', 'lint', 'typecheck', 'build', 'format', 'deploy', 'pr-checks', 'monitor', 'script'] as const;
type ProcessRunner = typeof processRunners[number];
type ProcessOperation = typeof processOperations[number];
export type CodexProcessPattern = {
  key: string;
  label: string;
  runner: ProcessRunner;
  operation: ProcessOperation;
  batchCount: number;
  successCount: number;
  failureCount: number;
  unknownCount: number;
  outputBytes: number;
  maximumOutputBytes: number;
  outputMode: 'final-state' | 'summary-errors';
  recommendation: string;
};
export type CodexOffloadSummary = {
  available: true;
  shellBatches: number;
  candidateBatches: number;
  associatedInputTokens: number;
  associatedCachedInputTokens: number;
  associatedOutputTokens: number;
  associatedTotalTokens: number;
  categories: Record<OffloadCategory, number>;
  processPatterns: CodexProcessPattern[];
};

export type SessionInteractionKind = 'directive' | 'question' | 'correction' | 'approval' | 'context' | 'mixed';
export type CodexDirectiveEpisode = {
  key: string;
  sequenceNumber: number;
  status: 'active' | 'completed';
  startedAt: string;
  completedAt: string | null;
  openingInteractionKey: string;
  openingKind: SessionInteractionKind;
  classificationConfidence: number;
  preparation: { questions: number; context: number; approvals: number; patternReferences: number; skillsUsed: string[] };
  corrections: number;
  context: { tokensAtStart: number; window: number | null; percentAtStart: number | null; peakPercent: number | null };
  usageAtStart: { inputTokens: number; cachedInputTokens: number; outputTokens: number };
  discovery: {
    agentsReferences: number;
    skillReferences: number;
    skillsUsed: string[];
    firstPatternLatencyMs: number | null;
    patternBeforeFirstChange: boolean | null;
  };
  execution: {
    toolCalls: number;
    fileChanges: number;
    webSearches: number;
    delegations: number;
    compactions: number;
    verificationBatches: number;
  };
};

export type CodexDirectiveSummary = {
  available: true;
  classifierVersion: 2;
  interactions: Array<{
    sourceKey: string;
    sequenceNumber: number;
    kind: SessionInteractionKind;
    occurredAt: string;
    confidence: number;
    contextTokens: number;
    contextWindow: number | null;
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
  }>;
  episodes: CodexDirectiveEpisode[];
};

export type CodexLiveSessionSnapshot = {
  externalId: string;
  title: string;
  repositoryName: string | null;
  status: 'active' | 'idle';
  observedAt: string;
  contextWindow: number | null;
  contextTokens: number;
  contextPercent: number | null;
  turnCount: number;
  completedTurnCount: number;
  evidence: Record<string, number>;
  guidance: {
    available: true;
    agentsReads: number;
    skillReads: number;
    skillsUsed: string[];
    promptCount: number;
    promptsWithSkillRead: number;
    averageSkillReadLatencyMs: number | null;
    currentPromptHasSkillRead: boolean | null;
  };
  offload: CodexOffloadSummary;
  directives: CodexDirectiveSummary;
  usageTimeline: { available: boolean; points: SessionUsageTimelinePoint[] };
  repositoryTraversal: SessionRepositoryTraversalReport;
  workers: CodexWorkerUsage[];
};

export type CodexSessionTelemetry = CodexLiveSessionSnapshot & { pathTouches: ObservedRepositoryPathTouch[] };

type UsageCounters = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

type WorkerRow = {
  id: string;
  parent_id: string | null;
  model: string | null;
  reasoning_effort: string | null;
  agent_nickname: string | null;
  agent_role: string | null;
  rollout_path: string;
  title?: string | null;
  cwd?: string | null;
};

function token(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function safeRolloutPath(codexHome: string, value: string) {
  const sessionsRoot = realpathSync(resolve(codexHome, 'sessions'));
  const path = realpathSync(value);
  if (path !== sessionsRoot && !path.startsWith(`${sessionsRoot}${sep}`)) {
    throw new Error('Codex rollout path is outside the session store.');
  }
  return path;
}

type RolloutState = {
  usage: Record<string, unknown> | null;
  contextWindow: number | null;
  contextTokens: number;
  activeTurns: number;
  turnCount: number;
  completedTurnCount: number;
  evidence: Record<string, number>;
  promptTimes: number[];
  skillReadTimes: number[];
  skillsUsed: Set<string>;
  agentsReads: number;
  interactions: CodexDirectiveSummary['interactions'];
  directiveEpisodes: CodexDirectiveEpisode[];
  repositoryRoot: string | null;
  pathTouches: ObservedRepositoryPathTouch[];
  preparation: {
    questions: number;
    context: number;
    approvals: number;
    corrections: number;
    agentsReferences: number;
    skillReferences: number;
    skillsUsed: Set<string>;
  };
  lastUsage: UsageCounters;
  pendingOffloadCandidate: boolean;
  pendingProcesses: Map<string, string[]>;
  offload: {
    shellBatches: number;
    candidateBatches: number;
    associatedInputTokens: number;
    associatedCachedInputTokens: number;
    associatedOutputTokens: number;
    associatedTotalTokens: number;
    categories: Record<OffloadCategory, number>;
    processPatterns: Map<string, CodexProcessPattern>;
  };
};

type RolloutCache = { inode: number; offset: number; state: RolloutState };
const rolloutCache = new Map<string, RolloutCache>();
const rolloutScans = new Map<string, Promise<ReturnType<typeof snapshotRollout>>>();
const maximumInitialRolloutBytes = 256 * 1024 * 1024;
const maximumHeuristicInputCharacters = 64 * 1024;
const maximumRolloutMessageBytes = 1024 * 1024;
const maximumProcessOutputCharacters = 64 * 1024;

function emptyRolloutState(repositoryRoot: string | null): RolloutState {
  return {
    usage: null,
    contextWindow: null,
    contextTokens: 0,
    activeTurns: 0,
    turnCount: 0,
    completedTurnCount: 0,
    evidence: {},
    promptTimes: [],
    skillReadTimes: [],
    skillsUsed: new Set(),
    agentsReads: 0,
    interactions: [],
    directiveEpisodes: [],
    repositoryRoot,
    pathTouches: [],
    preparation: { questions: 0, context: 0, approvals: 0, corrections: 0, agentsReferences: 0, skillReferences: 0, skillsUsed: new Set() },
    lastUsage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, totalTokens: 0 },
    pendingOffloadCandidate: false,
    pendingProcesses: new Map(),
    offload: {
      shellBatches: 0,
      candidateBatches: 0,
      associatedInputTokens: 0,
      associatedCachedInputTokens: 0,
      associatedOutputTokens: 0,
      associatedTotalTokens: 0,
      categories: { verification: 0, build: 0, formatting: 0, script: 0, monitoring: 0 },
      processPatterns: new Map(),
    },
  };
}

function usageCounters(value: Record<string, unknown>): UsageCounters {
  const inputTokens = token(value.input_tokens);
  const outputTokens = token(value.output_tokens);
  return {
    inputTokens,
    cachedInputTokens: token(value.cached_input_tokens),
    outputTokens,
    totalTokens: token(value.total_tokens) || inputTokens + outputTokens,
  };
}

function userMessageText(payload: Record<string, any>) {
  if (!Array.isArray(payload.content)) return '';
  return payload.content.flatMap((item: unknown) => item && typeof item === 'object' && typeof (item as { text?: unknown }).text === 'string' ? [(item as { text: string }).text] : []).join('\n').slice(0, maximumHeuristicInputCharacters);
}

export function classifySessionInteraction(text: string, hasActiveDirective = false): { kind: SessionInteractionKind; confidence: number } {
  const value = text.trim().toLowerCase();
  if (!value || /^<(?:environment_context|permissions|skills_instructions|apps_instructions|plugins_instructions)\b/.test(value)) return { kind: 'context', confidence: 0.95 };
  if (/^(?:ok(?:ay)?|yes|yep|yeah|yea|yessir|sounds good|got it|perfect|cool|nice|thanks|thank you)[.!\s]*$/.test(value)) return { kind: 'approval', confidence: 0.95 };
  const correction = hasActiveDirective && /\b(?:actually|instead|rather than|don't|dont|do not|remove that|not that|should be|change that|correction)\b/.test(value);
  if (correction) return { kind: 'correction', confidence: 0.85 };
  const directive = /\b(?:please|can you|could you|let'?s|we need to|i want|go ahead|start|continue|add|remove|delete|change|update|fix|implement|build|create|make|move|keep|show|hide|review|check|find|look into|wire|persist|replace)\b/.test(value);
  const question = /\?|^(?:what|why|when|where|who|which|how|is|are|do|does|did|can|could|should|would|will)\b/.test(value);
  if (directive && question) return { kind: 'mixed', confidence: 0.7 };
  if (directive) return { kind: 'directive', confidence: 0.8 };
  if (question) return { kind: 'question', confidence: 0.85 };
  return { kind: 'context', confidence: 0.6 };
}

function activeDirective(state: RolloutState) {
  const episode = state.directiveEpisodes.at(-1);
  return episode?.status === 'active' ? episode : null;
}

function updateEpisodeContextPeak(state: RolloutState) {
  const episode = activeDirective(state);
  if (!episode || !state.contextWindow) return;
  const percent = Math.min(100, (state.contextTokens / state.contextWindow) * 100);
  episode.context.peakPercent = Math.max(episode.context.peakPercent ?? 0, percent);
}

function foldCandidateIntoPreparation(state: RolloutState, episode: CodexDirectiveEpisode) {
  if (episode.execution.fileChanges > 0) return;
  if (episode.openingKind === 'question' || episode.openingKind === 'mixed') state.preparation.questions += 1;
  else if (episode.openingKind === 'approval') state.preparation.approvals += 1;
  else if (episode.openingKind === 'correction') state.preparation.corrections += 1;
  else state.preparation.context += 1;
  state.preparation.corrections += episode.corrections;
  state.preparation.agentsReferences += episode.discovery.agentsReferences;
  state.preparation.skillReferences += episode.discovery.skillReferences;
  for (const skill of episode.discovery.skillsUsed) state.preparation.skillsUsed.add(skill);
}

function closePreviousCandidate(state: RolloutState, occurredAt: string) {
  const previous = state.directiveEpisodes.at(-1);
  if (!previous) return;
  if (previous.status === 'active') {
    previous.status = 'completed';
    previous.completedAt = occurredAt;
  }
  foldCandidateIntoPreparation(state, previous);
}

function applyUserInteraction(state: RolloutState, payload: Record<string, any>, timestamp: number) {
  const text = userMessageText(payload);
  if (/^<(?:environment_context|permissions|skills_instructions|apps_instructions|plugins_instructions)\b/i.test(text.trim())) {
    state.preparation.context += 1;
    return;
  }
  const classification = classifySessionInteraction(text, Boolean(activeDirective(state)));
  const sequenceNumber = state.interactions.length + 1;
  const sourceKey = typeof payload.id === 'string' && payload.id ? payload.id : `interaction:${sequenceNumber}`;
  const occurredAt = new Date(timestamp).toISOString();
  state.interactions.push({
    sourceKey, sequenceNumber, kind: classification.kind, occurredAt, confidence: classification.confidence,
    contextTokens: state.contextTokens, contextWindow: state.contextWindow,
    inputTokens: state.lastUsage.inputTokens, cachedInputTokens: state.lastUsage.cachedInputTokens,
    outputTokens: state.lastUsage.outputTokens,
  });
  closePreviousCandidate(state, occurredAt);
  const window = state.contextWindow;
  const percent = window ? Math.min(100, (state.contextTokens / window) * 100) : null;
  state.directiveEpisodes.push({
    key: `candidate:${sourceKey}`,
    sequenceNumber: state.directiveEpisodes.length + 1,
    status: 'active', startedAt: occurredAt, completedAt: null,
    openingInteractionKey: sourceKey, openingKind: classification.kind,
    classificationConfidence: classification.confidence,
    preparation: {
      questions: state.preparation.questions, context: state.preparation.context,
      approvals: state.preparation.approvals,
      patternReferences: state.preparation.agentsReferences + state.preparation.skillReferences,
      skillsUsed: [...state.preparation.skillsUsed].sort(),
    },
    corrections: state.preparation.corrections,
    context: { tokensAtStart: state.contextTokens, window, percentAtStart: percent, peakPercent: percent },
    usageAtStart: {
      inputTokens: state.lastUsage.inputTokens,
      cachedInputTokens: state.lastUsage.cachedInputTokens,
      outputTokens: state.lastUsage.outputTokens,
    },
    discovery: { agentsReferences: 0, skillReferences: 0, skillsUsed: [], firstPatternLatencyMs: null, patternBeforeFirstChange: null },
    execution: { toolCalls: 0, fileChanges: 0, webSearches: 0, delegations: 0, compactions: 0, verificationBatches: 0 },
  });
  state.preparation = { questions: 0, context: 0, approvals: 0, corrections: 0, agentsReferences: 0, skillReferences: 0, skillsUsed: new Set() };
}

function boundedToolInput(payload: Record<string, any>) {
  const raw = payload.input ?? payload.arguments;
  return typeof raw === 'string' ? raw.slice(0, maximumHeuristicInputCharacters) : '';
}

function toolCommand(payload: Record<string, any>) {
  const raw = boundedToolInput(payload);
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed.cmd === 'string') return parsed.cmd;
    if (typeof parsed.command === 'string') return parsed.command;
  } catch {
    // Some Codex tool calls store the command directly instead of JSON arguments.
  }
  return raw;
}

function executedCommandText(toolName: string, command: string) {
  if (!/(?:^|[._/])exec$/.test(toolName.toLowerCase()) || !/\btools\.(?:exec_command|write_stdin)\s*\(/.test(command)) return command;
  const commands: string[] = [];
  for (const match of command.matchAll(/\bcmd\s*:\s*"((?:\\.|[^"\\])*)"/g)) {
    try { commands.push(JSON.parse(`"${match[1]}"`)); } catch { /* Ignore malformed wrapper source. */ }
  }
  return commands.join('\n');
}

function offloadCategoriesFor(toolName: string, command: string): OffloadCategory[] {
  const name = toolName.toLowerCase();
  const value = command.toLowerCase();
  const categories: OffloadCategory[] = [];
  if (/(?:^|[._/])write_stdin$/.test(name) || /\b(?:gh\s+pr\s+checks\b.*--watch|tail\s+-f\b|docker\s+compose\s+logs\b.*(?:--follow|-f\b))/.test(value)) categories.push('monitoring');
  if (/\b(?:prettier|rustfmt)\b|\bcargo\s+fmt\b|\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?format(?=\s|$)|\beslint\b[^\n]*(?:--fix|--fix-dry-run)\b/.test(value)) categories.push('formatting');
  if (/\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test|check|lint|validate|typecheck)(?=[:\s]|$)|\b(?:pytest|vitest|jest|tsc)\b|\bcargo\s+(?:test|check|clippy)\b|\bgo\s+test\b/.test(value)) categories.push('verification');
  if (/\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?build(?=[:\s]|$)|\b(?:cargo|go)\s+build\b/.test(value)) categories.push('build');
  if (/(?:^|[\s;&|])(?:bash|sh|zsh)\s+[^\s;&|]+\.sh\b|(?:^|[\s;&|])(?:\.\/)?(?:scripts?|bin)\/[^\s;&|]+|\bnode\s+[^\s;&|]*(?:scripts?|bin)\/[^\s;&|]+/.test(value)) categories.push('script');
  return categories;
}

function isShellBatch(toolName: string, command: string) {
  const name = toolName.toLowerCase();
  return /(?:^|[._/])(?:exec_command|write_stdin|shell|terminal)$/.test(name)
    || (/(?:^|[._/])exec$/.test(name) && /\btools\.(?:exec_command|write_stdin)\s*\(/.test(command));
}

function processRecommendation(operation: ProcessOperation) {
  if (operation === 'pr-checks' || operation === 'monitor') return {
    outputMode: 'final-state' as const,
    recommendation: 'Poll outside model context; return the final state and failed check names only.',
  };
  if (operation === 'deploy' || operation === 'build' || operation === 'test' || operation === 'check' || operation === 'lint' || operation === 'typecheck' || operation === 'format') return {
    outputMode: 'summary-errors' as const,
    recommendation: 'Return exit status and a compact summary on success; include a bounded error excerpt on failure.',
  };
  return {
    outputMode: 'summary-errors' as const,
    recommendation: 'Return exit status first and reveal bounded process details only when needed.',
  };
}

function processPatternsFor(command: string) {
  const value = command.toLowerCase();
  const patterns = new Map<string, { runner: ProcessRunner; operation: ProcessOperation; label: string }>();
  const add = (runner: ProcessRunner, operation: ProcessOperation, label: string) => patterns.set(`${runner}:${operation}`, { runner, operation, label });
  if (/\bgh\s+pr\s+checks\b/.test(value)) add('git-host', 'pr-checks', 'GitHub pull-request checks');
  if (/\b(?:gh\s+(?:run\s+watch|pr\s+checks\b.*--watch)|tail\s+-f\b|docker\s+compose\s+logs\b.*(?:--follow|-f\b))/.test(value)) add('git-host', 'monitor', 'Process or check monitoring');
  if (/\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:deploy|release|publish)(?=[:\s]|$)|(?:^|[\s;&|])(?:bash|sh|zsh)\s+[^\s;&|]*deploy[^\s;&|]*\.sh\b|(?:^|[\s;&|])\.\/(?:scripts?\/)?deploy[^\s;&|]*/.test(value)) add('script', 'deploy', 'Deployment script');
  for (const operation of ['test', 'check', 'lint', 'typecheck', 'build', 'format'] as const) {
    if (new RegExp(`\\b(?:npm|pnpm|yarn|bun)\\s+(?:run\\s+)?${operation}(?=[:\\s]|$)`).test(value)) add('package-manager', operation, `Package-manager ${operation}`);
  }
  if (/\b(?:pytest|vitest|jest)\b|\bcargo\s+test\b|\bgo\s+test\b/.test(value)) add('language-tool', 'test', 'Language test runner');
  if (/\btsc\b|\bcargo\s+(?:check|clippy)\b/.test(value)) add('language-tool', 'check', 'Language static check');
  if (/\b(?:docker|podman)\s+(?:compose\s+)?build\b/.test(value)) add('container', 'build', 'Container build');
  if (/(?:^|[\s;&|])(?:bash|sh|zsh)\s+[^\s;&|]+\.sh\b|(?:^|[\s;&|])(?:node|tsx|python3?)\s+(?:\.\/)?(?:scripts?|bin)\/[^\s;&|]+|(?:^|[\s;&|])\.\/(?:scripts?|bin)\/[^\s;&|]+/.test(value)) add('script', 'script', 'Project script');
  return [...patterns.entries()].map(([key, pattern]) => ({ key, ...pattern }));
}

function outputTexts(output: unknown) {
  if (typeof output === 'string') return [output.slice(0, maximumProcessOutputCharacters)];
  if (!Array.isArray(output)) return [];
  let remaining = maximumProcessOutputCharacters;
  const texts: string[] = [];
  for (const item of output) {
    if (remaining <= 0) break;
    if (!item || typeof item !== 'object' || typeof (item as { text?: unknown }).text !== 'string') continue;
    const value = (item as { text: string }).text.slice(0, remaining);
    texts.push(value);
    remaining -= value.length;
  }
  return texts;
}

function processOutcome(output: unknown): 'success' | 'failure' | 'unknown' {
  for (const text of outputTexts(output)) {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      if (typeof parsed.exit_code === 'number') return parsed.exit_code === 0 ? 'success' : 'failure';
      if (parsed.timed_out === true) return 'failure';
    } catch { /* Tool output need not be structured JSON. */ }
  }
  return 'unknown';
}

function observedSkillNames(input: string) {
  const names = new Set<string>();
  const pluginRanges: Array<[number, number]> = [];
  const pluginPattern = /plugins[\\/]cache[\\/]([^\\/"'\s]+)[\\/][^\\/"'\s]+[\\/]skills[\\/](?:[^\\/"'\s]+[\\/])*([^\\/"'\s]+)[\\/]SKILL\.md/g;
  for (const match of input.matchAll(pluginPattern)) {
    names.add(`${match[1]}:${match[2]}`);
    pluginRanges.push([match.index, match.index + match[0].length]);
  }
  const skillPattern = /(?:\.agents[\\/]|\.codex[\\/])?skills[\\/](?:[^\\/"'\s]+[\\/])*([^\\/"'\s]+)[\\/]SKILL\.md/g;
  for (const match of input.matchAll(skillPattern)) {
    if (!pluginRanges.some(([start, end]) => match.index >= start && match.index < end)) names.add(match[1]);
  }
  return [...names];
}

function applyRolloutMessage(state: RolloutState, line: string) {
  if (Buffer.byteLength(line) > maximumRolloutMessageBytes) return true;
  let message: Record<string, any>;
  try { message = JSON.parse(line); } catch { return false; }
    const candidate = message?.payload?.info?.total_token_usage;
    if (candidate && typeof candidate === 'object') {
      const nextUsage = usageCounters(candidate);
      if (state.pendingOffloadCandidate) {
        state.offload.associatedInputTokens += Math.max(0, nextUsage.inputTokens - state.lastUsage.inputTokens);
        state.offload.associatedCachedInputTokens += Math.max(0, nextUsage.cachedInputTokens - state.lastUsage.cachedInputTokens);
        state.offload.associatedOutputTokens += Math.max(0, nextUsage.outputTokens - state.lastUsage.outputTokens);
        state.offload.associatedTotalTokens += Math.max(0, nextUsage.totalTokens - state.lastUsage.totalTokens);
      }
      state.pendingOffloadCandidate = false;
      state.lastUsage = nextUsage;
      state.usage = candidate;
      const window = message?.payload?.info?.model_context_window;
      state.contextWindow = typeof window === 'number' && Number.isSafeInteger(window) && window > 0 ? window : state.contextWindow;
      state.contextTokens = token(message?.payload?.info?.last_token_usage?.total_tokens);
      updateEpisodeContextPeak(state);
    }
    const type = message?.payload?.type;
    const timestamp = Date.parse(String(message?.timestamp ?? ''));
    if (message.type === 'response_item' && type === 'message' && message?.payload?.role === 'user' && Number.isFinite(timestamp)) {
      state.promptTimes.push(timestamp);
      applyUserInteraction(state, message.payload, timestamp);
    }
    if (message.type === 'response_item' && (type === 'custom_tool_call' || type === 'function_call')) {
      const input = boundedToolInput(message.payload);
      const agentsMatches = input.match(/AGENTS\.md\b/g);
      state.agentsReads += agentsMatches?.length ?? 0;
      const skillNames = observedSkillNames(input);
      for (const skillName of skillNames) {
        state.skillsUsed.add(skillName);
        if (Number.isFinite(timestamp)) state.skillReadTimes.push(timestamp);
      }
      const toolName = String(message?.payload?.name ?? message?.payload?.tool_name ?? '');
      const command = toolCommand(message.payload);
      const episode = activeDirective(state);
      if (state.repositoryRoot && Number.isFinite(timestamp) && state.pathTouches.length < 2_000) {
        let commandRoot = state.repositoryRoot;
        try {
          const argumentsObject = JSON.parse(boundedToolInput(message.payload));
          if (typeof argumentsObject.workdir === 'string') commandRoot = resolve(state.repositoryRoot, argumentsObject.workdir);
          else if (typeof argumentsObject.cwd === 'string') commandRoot = resolve(state.repositoryRoot, argumentsObject.cwd);
        } catch { /* Raw shell and patch inputs use the rollout working directory. */ }
        const callKey = typeof message?.payload?.call_id === 'string' ? message.payload.call_id : `tool:${timestamp}:${state.pathTouches.length}`;
        const touches = extractRepositoryPathTouches({
          toolName,
          command,
          repositoryRoot: commandRoot,
          occurredAt: new Date(timestamp).toISOString(),
          promptKey: episode?.openingInteractionKey ?? null,
          sourceKey: callKey,
        });
        state.pathTouches.push(...touches.flatMap(touch => {
          const absolutePath = resolve(commandRoot, touch.path);
          const repositoryPath = relative(state.repositoryRoot!, absolutePath).split(sep).join('/');
          if (repositoryPath === '..' || repositoryPath.startsWith('../') || isAbsolute(repositoryPath)) return [];
          return [{ ...touch, path: repositoryPath }];
        }).slice(0, 2_000 - state.pathTouches.length));
      }
      if (episode && Number.isFinite(timestamp)) {
        episode.execution.toolCalls += 1;
        episode.discovery.agentsReferences += agentsMatches?.length ?? 0;
        episode.discovery.skillReferences += skillNames.length;
        episode.discovery.skillsUsed = [...new Set([...episode.discovery.skillsUsed, ...skillNames])].sort();
        if ((agentsMatches?.length || skillNames.length) && episode.discovery.firstPatternLatencyMs === null) {
          episode.discovery.firstPatternLatencyMs = Math.max(0, timestamp - Date.parse(episode.startedAt));
          episode.discovery.patternBeforeFirstChange = episode.execution.fileChanges === 0;
        }
      }
      if (isShellBatch(toolName, command)) {
        state.offload.shellBatches += 1;
        const executedCommand = executedCommandText(toolName, command);
        const categories = offloadCategoriesFor(toolName, executedCommand);
        if (categories.length) {
          state.offload.candidateBatches += 1;
          for (const category of categories) state.offload.categories[category] += 1;
          state.pendingOffloadCandidate = true;
        }
        if (episode && categories.includes('verification')) episode.execution.verificationBatches += 1;
        const callId = typeof message?.payload?.call_id === 'string' ? message.payload.call_id : null;
        const patterns = processPatternsFor(executedCommand);
        if (callId && patterns.length) {
          state.pendingProcesses.set(callId, patterns.map(pattern => pattern.key));
          for (const pattern of patterns) {
            const recommendation = processRecommendation(pattern.operation);
            const current = state.offload.processPatterns.get(pattern.key) ?? {
              ...pattern, batchCount: 0, successCount: 0, failureCount: 0, unknownCount: 0,
              outputBytes: 0, maximumOutputBytes: 0, ...recommendation,
            };
            current.batchCount += 1;
            state.offload.processPatterns.set(pattern.key, current);
          }
        }
      }
    }
    if (message.type === 'response_item' && (type === 'custom_tool_call_output' || type === 'function_call_output')) {
      const callId = typeof message?.payload?.call_id === 'string' ? message.payload.call_id : null;
      const patternKeys = callId ? state.pendingProcesses.get(callId) : undefined;
      if (patternKeys) {
        const bytes = outputTexts(message.payload.output).reduce((sum, text) => sum + Buffer.byteLength(text), 0);
        const outcome = processOutcome(message.payload.output);
        for (const key of patternKeys) {
          const pattern = state.offload.processPatterns.get(key);
          if (!pattern) continue;
          pattern.outputBytes += bytes;
          pattern.maximumOutputBytes = Math.max(pattern.maximumOutputBytes, bytes);
          if (outcome === 'success') pattern.successCount += 1;
          else if (outcome === 'failure') pattern.failureCount += 1;
          else pattern.unknownCount += 1;
        }
        state.pendingProcesses.delete(callId!);
      }
    }
    if (message.type === 'event_msg' && type === 'task_started') { state.turnCount += 1; state.activeTurns += 1; }
    if (message.type === 'event_msg' && type === 'task_complete') {
      state.completedTurnCount += 1; state.activeTurns = Math.max(0, state.activeTurns - 1);
      const episode = activeDirective(state);
      if (episode && episode.status === 'active' && Number.isFinite(timestamp)) { episode.status = 'completed'; episode.completedAt = new Date(timestamp).toISOString(); }
    }
    const normalized = type === 'web_search_end' ? 'webSearch'
      : type === 'patch_apply_end' ? 'fileChange'
        : type === 'sub_agent_activity' ? 'delegation'
          : type === 'context_compacted' || message.type === 'compacted' ? 'contextCompaction'
            : message.type === 'response_item' && (type === 'custom_tool_call' || type === 'function_call') ? 'toolCall'
              : null;
    if (normalized) state.evidence[normalized] = (state.evidence[normalized] ?? 0) + 1;
    const episode = activeDirective(state);
    if (episode && normalized) {
      if (normalized === 'fileChange') episode.execution.fileChanges += 1;
      else if (normalized === 'webSearch') episode.execution.webSearches += 1;
      else if (normalized === 'delegation') episode.execution.delegations += 1;
      else if (normalized === 'contextCompaction') episode.execution.compactions += 1;
    }
    return true;
}

function snapshotRollout(state: RolloutState) {
  const changeBackedEpisodes = state.directiveEpisodes.filter(episode => episode.execution.fileChanges > 0);
  const processPatterns = new Map([...state.offload.processPatterns].map(([key, pattern]) => [key, { ...pattern }]));
  for (const keys of state.pendingProcesses.values()) {
    for (const key of keys) {
      const pattern = processPatterns.get(key);
      if (pattern) pattern.unknownCount += 1;
    }
  }
  return {
    usage: {
      inputTokens: token(state.usage?.input_tokens),
      cachedInputTokens: token(state.usage?.cached_input_tokens),
      cacheWriteInputTokens: token(state.usage?.cache_write_input_tokens),
      outputTokens: token(state.usage?.output_tokens),
      reasoningOutputTokens: token(state.usage?.reasoning_output_tokens),
      totalTokens: token(state.usage?.total_tokens),
    },
    contextWindow: state.contextWindow,
    contextTokens: state.contextTokens,
    active: state.activeTurns > 0,
    turnCount: state.turnCount,
    completedTurnCount: state.completedTurnCount,
    evidence: { ...state.evidence },
    guidance: { agentsReads: state.agentsReads, skillReadTimes: [...state.skillReadTimes], skillsUsed: [...state.skillsUsed], promptTimes: [...state.promptTimes] },
    directives: {
      available: true as const,
      classifierVersion: 2 as const,
      interactions: state.interactions.map(interaction => ({ ...interaction })),
      episodes: changeBackedEpisodes.map((episode, index) => ({
        ...episode,
        key: `directive:${episode.openingInteractionKey}`,
        sequenceNumber: index + 1,
        preparation: { ...episode.preparation, skillsUsed: [...episode.preparation.skillsUsed] },
        context: { ...episode.context },
        usageAtStart: { ...episode.usageAtStart },
        discovery: { ...episode.discovery, skillsUsed: [...episode.discovery.skillsUsed] },
        execution: { ...episode.execution },
      })),
    },
    pathTouches: state.pathTouches.map(touch => ({ ...touch })),
    offload: { ...state.offload, categories: { ...state.offload.categories }, processPatterns: [...processPatterns.values()] },
  };
}

async function scanRolloutIncrementally(path: string, repositoryRoot: string | null) {
  const metadata = statSync(path);
  if (!metadata.isFile()) throw new Error('Codex rollout is not a regular file.');
  const cacheKey = `${path}\0${repositoryRoot ?? ''}`;
  let cached = rolloutCache.get(cacheKey);
  if (!cached || cached.inode !== metadata.ino || metadata.size < cached.offset) {
    if (metadata.size > maximumInitialRolloutBytes) throw new Error('Codex rollout exceeds the safe initial scan limit.');
    cached = { inode: metadata.ino, offset: 0, state: emptyRolloutState(repositoryRoot) };
    rolloutCache.set(cacheKey, cached);
  }
  if (metadata.size === cached.offset) return snapshotRollout(cached.state);
  let buffer = '';
  let consumedBytes = 0;
  const stream = createReadStream(path, { encoding: 'utf8', start: cached.offset, end: metadata.size - 1 });
  for await (const chunk of stream) {
    buffer += chunk;
    let newline = buffer.indexOf('\n');
    while (newline >= 0) {
      const line = buffer.slice(0, newline);
      consumedBytes += Buffer.byteLength(buffer.slice(0, newline + 1));
      if (line.trim()) applyRolloutMessage(cached.state, line);
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf('\n');
    }
  }
  cached.offset += consumedBytes;
  if (buffer.trim() && applyRolloutMessage(cached.state, buffer)) cached.offset = metadata.size;
  return snapshotRollout(cached.state);
}

async function scanRollout(path: string, repositoryRoot: string | null = null) {
  const scanKey = `${path}\0${repositoryRoot ?? ''}`;
  const existing = rolloutScans.get(scanKey);
  if (existing) return existing;
  const scan = scanRolloutIncrementally(path, repositoryRoot).finally(() => rolloutScans.delete(scanKey));
  rolloutScans.set(scanKey, scan);
  return scan;
}

export async function readCodexWorkerUsage(externalThreadId: string, {
  codexHome = process.env.CODEX_HOME ?? resolve(homedir(), '.codex'),
}: { codexHome?: string } = {}): Promise<CodexWorkerUsage[]> {
  if (!/^[a-zA-Z0-9-]{8,100}$/.test(externalThreadId)) throw new Error('Invalid Codex session ID.');
  const statePath = resolve(codexHome, 'state_5.sqlite');
  if (!existsSync(statePath)) throw new Error('Codex local session state is unavailable.');
  const sqlite = new DatabaseDriver(statePath, { readonly: true, fileMustExist: true });
  try {
    const rows = sqlite.prepare(`
      WITH RECURSIVE worker_ids(id) AS (
        SELECT ?
        UNION
        SELECT edges.child_thread_id
        FROM thread_spawn_edges AS edges
        JOIN worker_ids ON worker_ids.id = edges.parent_thread_id
      )
      SELECT threads.id, CASE WHEN threads.id = ? THEN NULL ELSE parent_edge.parent_thread_id END AS parent_id,
        threads.model, threads.reasoning_effort,
        threads.agent_nickname, threads.agent_role, threads.rollout_path, threads.cwd
      FROM worker_ids JOIN threads ON threads.id = worker_ids.id
      LEFT JOIN thread_spawn_edges AS parent_edge ON parent_edge.child_thread_id = threads.id
      ORDER BY CASE WHEN threads.id = ? THEN 0 ELSE 1 END, threads.id
    `).all(externalThreadId, externalThreadId, externalThreadId) as WorkerRow[];
    if (rows.length > 100) throw new Error('Codex session has more workers than the safe monitoring limit.');
    const repositoryRoot = rows[0]?.cwd ?? null;
    return Promise.all(rows.map(async row => {
      const path = safeRolloutPath(codexHome, row.rollout_path);
      const scan = await scanRollout(path, repositoryRoot);
      return {
        externalThreadId: row.id,
        parentExternalThreadId: row.parent_id,
        nickname: row.agent_nickname,
        role: row.agent_role,
        model: row.model,
        reasoningLevel: row.reasoning_effort,
        ...scan.usage,
        active: scan.active,
        updatedAt: statSync(path).mtime.toISOString(),
      };
    }));
  } finally { sqlite.close(); }
}

export async function readCodexSessionTelemetry(externalThreadId: string, {
  codexHome = process.env.CODEX_HOME ?? resolve(homedir(), '.codex'),
}: { codexHome?: string } = {}): Promise<CodexSessionTelemetry> {
  if (!/^[a-zA-Z0-9-]{8,100}$/.test(externalThreadId)) throw new Error('Invalid Codex session ID.');
  const statePath = resolve(codexHome, 'state_5.sqlite');
  if (!existsSync(statePath)) throw new Error('Codex local session state is unavailable.');
  const sqlite = new DatabaseDriver(statePath, { readonly: true, fileMustExist: true });
  try {
    const rows = sqlite.prepare(`
      WITH RECURSIVE worker_ids(id) AS (
        SELECT ?
        UNION
        SELECT edges.child_thread_id
        FROM thread_spawn_edges AS edges JOIN worker_ids ON worker_ids.id = edges.parent_thread_id
      )
      SELECT threads.id, CASE WHEN threads.id = ? THEN NULL ELSE parent_edge.parent_thread_id END AS parent_id,
        threads.model, threads.reasoning_effort,
        threads.agent_nickname, threads.agent_role, threads.rollout_path, threads.title, threads.cwd
      FROM worker_ids JOIN threads ON threads.id = worker_ids.id
      LEFT JOIN thread_spawn_edges AS parent_edge ON parent_edge.child_thread_id = threads.id
      ORDER BY CASE WHEN threads.id = ? THEN 0 ELSE 1 END, threads.id
    `).all(externalThreadId, externalThreadId, externalThreadId) as WorkerRow[];
    if (!rows.length) throw new Error('Codex session was not found in the local store.');
    if (rows.length > 100) throw new Error('Codex session has more workers than the safe monitoring limit.');
    const repositoryRoot = rows[0].cwd ?? null;
    const scans = await Promise.all(rows.map(row => scanRollout(safeRolloutPath(codexHome, row.rollout_path), row.cwd ?? repositoryRoot)));
    const workers = rows.map((row, index) => ({
      externalThreadId: row.id,
      parentExternalThreadId: row.parent_id,
      nickname: row.agent_nickname,
      role: row.agent_role,
      model: row.model,
      reasoningLevel: row.reasoning_effort,
      ...scans[index].usage,
      active: scans[index].active,
      updatedAt: statSync(safeRolloutPath(codexHome, row.rollout_path)).mtime.toISOString(),
    }));
    const evidence: Record<string, number> = {};
    for (const scan of scans) for (const [key, count] of Object.entries(scan.evidence)) evidence[key] = (evidence[key] ?? 0) + count;
    const agentsReads = scans.reduce((sum, scan) => sum + scan.guidance.agentsReads, 0);
    const skillReadTimes = scans.flatMap(scan => scan.guidance.skillReadTimes).sort((a, b) => a - b);
    const promptTimes = scans.flatMap(scan => scan.guidance.promptTimes).sort((a, b) => a - b);
    const matchedLatencies = promptTimes.flatMap((promptTime, index) => {
      const nextPrompt = promptTimes[index + 1] ?? Number.POSITIVE_INFINITY;
      const skillTime = skillReadTimes.find(value => value >= promptTime && value < nextPrompt);
      return skillTime === undefined ? [] : [skillTime - promptTime];
    });
    const latestPrompt = promptTimes.at(-1);
    const contextWindow = scans[0].contextWindow;
    const contextTokens = scans[0].contextTokens;
    const offload = scans.reduce((total, scan) => {
      total.shellBatches += scan.offload.shellBatches;
      total.candidateBatches += scan.offload.candidateBatches;
      total.associatedInputTokens += scan.offload.associatedInputTokens;
      total.associatedCachedInputTokens += scan.offload.associatedCachedInputTokens;
      total.associatedOutputTokens += scan.offload.associatedOutputTokens;
      total.associatedTotalTokens += scan.offload.associatedTotalTokens;
      for (const category of offloadCategories) total.categories[category] += scan.offload.categories[category];
      for (const pattern of scan.offload.processPatterns) {
        const current = total.processPatterns.get(pattern.key) ?? { ...pattern, batchCount: 0, successCount: 0, failureCount: 0, unknownCount: 0, outputBytes: 0, maximumOutputBytes: 0 };
        current.batchCount += pattern.batchCount;
        current.successCount += pattern.successCount;
        current.failureCount += pattern.failureCount;
        current.unknownCount += pattern.unknownCount;
        current.outputBytes += pattern.outputBytes;
        current.maximumOutputBytes = Math.max(current.maximumOutputBytes, pattern.maximumOutputBytes);
        total.processPatterns.set(pattern.key, current);
      }
      return total;
    }, {
      available: true as const,
      shellBatches: 0,
      candidateBatches: 0,
      associatedInputTokens: 0,
      associatedCachedInputTokens: 0,
      associatedOutputTokens: 0,
      associatedTotalTokens: 0,
      categories: { verification: 0, build: 0, formatting: 0, script: 0, monitoring: 0 },
      processPatterns: new Map<string, CodexProcessPattern>(),
    });
    const normalizedOffload = { ...offload, processPatterns: [...offload.processPatterns.values()].sort((a, b) => b.outputBytes - a.outputBytes || b.batchCount - a.batchCount || a.label.localeCompare(b.label)) };
    const observedAt = new Date().toISOString();
    const root = scans[0];
    const usageTimeline = buildSessionUsageTimeline({
      boundaries: root.directives.interactions.map(interaction => ({
        key: interaction.sourceKey,
        sequenceNumber: interaction.sequenceNumber,
        kind: interaction.kind,
        occurredAt: interaction.occurredAt,
        contextTokens: interaction.contextTokens,
        contextWindow: interaction.contextWindow,
        inputTokens: interaction.inputTokens,
        cachedInputTokens: interaction.cachedInputTokens,
        outputTokens: interaction.outputTokens,
      })),
      closing: root.usage,
      observedAt,
      live: root.active,
    });
    const pathTouches = scans.flatMap((scan, index) => scan.pathTouches.flatMap(touch => {
      if (!repositoryRoot) return [];
      const path = relative(repositoryRoot, resolve(rows[index].cwd ?? repositoryRoot, touch.path)).split(sep).join('/');
      if (path === '..' || path.startsWith('../') || isAbsolute(path)) return [];
      return [{ ...touch, path, sourceKey: `${rows[index].id}:${touch.sourceKey}` }];
    }))
      .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
    return {
      externalId: externalThreadId,
      title: `Codex session ${externalThreadId.slice(0, 8)}`,
      repositoryName: rows[0].cwd ? basename(rows[0].cwd) : null,
      status: scans.some(scan => scan.active) ? 'active' : 'idle',
      observedAt,
      contextWindow,
      contextTokens,
      contextPercent: contextWindow ? Math.min(100, (contextTokens / contextWindow) * 100) : null,
      turnCount: scans.reduce((sum, scan) => sum + scan.turnCount, 0),
      completedTurnCount: scans.reduce((sum, scan) => sum + scan.completedTurnCount, 0),
      evidence,
      guidance: {
        available: true,
        agentsReads,
        skillReads: skillReadTimes.length,
        skillsUsed: [...new Set(scans.flatMap(scan => scan.guidance.skillsUsed))].sort(),
        promptCount: promptTimes.length,
        promptsWithSkillRead: matchedLatencies.length,
        averageSkillReadLatencyMs: matchedLatencies.length ? Math.round(matchedLatencies.reduce((sum, value) => sum + value, 0) / matchedLatencies.length) : null,
        currentPromptHasSkillRead: latestPrompt === undefined ? null : skillReadTimes.some(value => value >= latestPrompt),
      },
      offload: normalizedOffload,
      directives: scans[0].directives,
      usageTimeline: { available: usageTimeline.length > 0, points: usageTimeline },
      repositoryTraversal: buildSessionRepositoryTraversalReport(pathTouches),
      pathTouches,
      workers,
    };
  } finally { sqlite.close(); }
}

export async function readCodexLiveSession(externalThreadId: string, options: { codexHome?: string } = {}): Promise<CodexLiveSessionSnapshot> {
  const { pathTouches: _pathTouches, ...snapshot } = await readCodexSessionTelemetry(externalThreadId, options);
  return snapshot;
}
