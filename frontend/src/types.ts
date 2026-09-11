export type RunStatus =
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timed-out'
  | 'interrupted';

export interface AgentModel {
  id: string;
  label: string;
}

export interface AgentProvider {
  id: string;
  label: string;
  models: AgentModel[];
}

export interface RepositorySkill {
  name: string;
  description: string;
  path: string;
}

export interface RepositoryConnection {
  repo: string;
  skills: RepositorySkill[];
}

export interface RuntimeCapabilities {
  directoryPickerAvailable: boolean;
  repositoryPath: string | null;
}

export interface SessionSourceProbe {
  connected: true;
  loadedThreadIds: string[];
  storedThreadAvailable: boolean;
}

export interface StoredCodexSession {
  externalId: string;
  title: string;
  repositoryName: string | null;
  source: string;
  status: string;
  createdAt: string | null;
  updatedAt: string | null;
  branch: string | null;
  revision: string | null;
}

export interface RepositoryTraversalReport {
  available: boolean;
  limitation: string | null;
  totalFileHits: number;
  uniqueFiles: number;
  totalDirectoryVisits: number;
  directionCounts: Record<'down' | 'up' | 'cross' | 'same' | 'revisit', number>;
  directories: Array<{ id: string; path: string; parentId: string | null; depth: number; firstVisitOrder: number; visitCount: number }>;
  transitions: Array<{
    id: string;
    order: number;
    fromPath: string | null;
    toPath: string;
    direction: 'entry' | 'down' | 'up' | 'cross' | 'same' | 'revisit';
    hitCount: number;
    heuristic: { phase: string | null; reason: string | null; basis: string[]; confidence: 'low' | 'medium' | 'high' } | null;
  }>;
  directoriesTruncated: boolean;
  transitionsTruncated: boolean;
}

export interface LiveSessionSnapshot {
  externalId: string;
  title: string;
  repositoryName: string | null;
  status: string;
  observedAt: string;
  contextWindow: number | null;
  contextTokens: number;
  contextPercent: number | null;
  turnCount: number;
  completedTurnCount: number;
  evidence: Record<string, number>;
  guidance: {
    available: boolean;
    agentsReads: number;
    skillReads: number;
    skillsUsed: string[];
    promptCount: number;
    promptsWithSkillRead: number;
    averageSkillReadLatencyMs: number | null;
    currentPromptHasSkillRead: boolean | null;
  };
  offload: {
    available: boolean;
    shellBatches: number;
    candidateBatches: number;
    associatedInputTokens: number;
    associatedCachedInputTokens: number;
    associatedOutputTokens: number;
    associatedTotalTokens: number;
    categories: {
      verification: number;
      build: number;
      formatting: number;
      script: number;
      monitoring: number;
    };
    processPatterns: Array<{
      key: string;
      label: string;
      runner: 'package-manager' | 'git-host' | 'script' | 'language-tool' | 'container';
      operation: 'test' | 'check' | 'lint' | 'typecheck' | 'build' | 'format' | 'deploy' | 'pr-checks' | 'monitor' | 'script';
      batchCount: number;
      successCount: number;
      failureCount: number;
      unknownCount: number;
      outputBytes: number;
      maximumOutputBytes: number;
      outputMode: 'final-state' | 'summary-errors';
      recommendation: string;
    }>;
  };
  directives: DirectiveSummary;
  usageTimeline: UsageTimeline;
  repositoryTraversal: RepositoryTraversalReport;
  workers: LiveWorkerTokenUsage[];
}

export interface UsageTimeline {
  available: boolean;
  points: Array<{
    key: string;
    sequenceNumber: number;
    kind: 'directive' | 'question' | 'correction' | 'approval' | 'context' | 'mixed';
    status: 'active' | 'completed';
    measurement: 'exact-live' | 'exact-stored' | 'unavailable';
    startedAt: string;
    endedAt: string;
    durationMs: number;
    contextTokens: number | null;
    contextWindow: number | null;
    contextPercent: number | null;
    inputTokens: number | null;
    cachedInputTokens: number | null;
    newInputTokens: number | null;
    outputTokens: number | null;
  }>;
}

export interface DirectiveSummary {
  available: boolean;
  classifierVersion: number;
  episodes: DirectiveEpisode[];
}

export interface DirectiveEpisode {
  key: string;
  sequenceNumber: number;
  status: 'active' | 'completed';
  startedAt: string;
  completedAt: string | null;
  openingInteractionKey: string;
  openingKind: 'directive' | 'question' | 'correction' | 'approval' | 'context' | 'mixed';
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
}

export interface LiveWorkerTokenUsage {
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
}

export interface SessionReview {
  id: string;
  title: string | null;
  status: string;
  telemetryLevel: 'full' | 'imported' | 'partial';
  observedSequence: number;
  durableSequence: number;
  startedAt: string | null;
  completedAt: string | null;
  turnCount: number;
  eventCount: number;
  checkCount: number;
  changedFileEventCount: number;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  platform: string;
  externalSessionId: string;
  usageTimeline: UsageTimeline;
  repositoryTraversal: RepositoryTraversalReport;
  repositoryName: string | null;
  evidence: Record<string, number>;
  offload: LiveSessionSnapshot['offload'];
  directives: DirectiveSummary;
  usageAvailable: boolean;
  workerUsage: WorkerTokenUsage[];
  modelUsage: ModelTokenUsage[];
}

export interface WorkerTokenUsage {
  id: string;
  name: string | null;
  role: string;
  model: string | null;
  reasoningLevel: string | null;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  cacheWriteInputTokens: number | null;
  outputTokens: number | null;
  reasoningOutputTokens: number | null;
  totalTokens: number;
}

export interface ModelTokenUsage {
  model: string;
  workerCount: number;
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
}

export interface ComparisonRow {
  medianScore: number | null;
  medianDurationMs: number | null;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  missedRequirements: Record<string, number>;
  implementationReview: ImplementationReviewSection[] | null;
}

export interface ImplementationReviewItem {
  id: string;
  label: string;
  implemented: boolean;
  candidateFiles: string[];
  referenceFiles: string[];
}

export interface ImplementationReviewSection {
  id: string;
  label: string;
  classification: 'reference-derived';
  items: ImplementationReviewItem[];
}

export interface RunActivityNode {
  id: string;
  parentId: string | null;
  kind: 'phase' | 'guidance' | 'skill' | 'agent_message' | 'command_execution' | 'file_change';
  label: string;
  detail: string;
  status: 'running' | 'completed' | 'failed';
}

export interface RunRecord {
  id: string;
  createdAt: string;
  repo?: string;
  repositoryName?: string;
  provider?: string;
  model: string;
  reasoningEffort: string;
  skill?: string | null;
  featureType?: FeatureType;
  description: string;
  scenarioId?: string;
  readiness?: Pick<BenchmarkReadiness, 'status' | 'fingerprint' | 'evidence' | 'findings'> | null;
  status: RunStatus;
  artifactPath?: string;
  progress?: string;
  activity?: RunActivityNode[];
  comparison: { comparison: ComparisonRow[] } | null;
}

export interface StartRunInput {
  repo: string;
  provider: string;
  model: string;
  reasoningEffort: string;
  featureType: FeatureType;
  description: string;
  scenarioId?: string;
}

export interface BenchmarkCatalog {
  scenarios: Array<{ id: string; version: number; title: string; featureType: FeatureType }>;
  suites: Array<{ id: string; version: number; title: string; scenarioIds: string[] }>;
}

export interface BenchmarkReadiness {
  status: 'ready' | 'ready-with-limitations' | 'not-evaluable';
  contractVersion: 1;
  fingerprint: string;
  scenarioId: string;
  baseRevision: string | null;
  evidence: { guidance: string[]; patternDocuments: string[]; analogues: string[]; inferredAnalogues: string[]; verification: string[] };
  findings: string[];
}

export interface BenchmarkTrendPoint {
  plannedAt: string;
  outcome: 'started' | 'skipped' | 'failed';
  runId: string | null;
  reason: string | null;
  runStatus: string | null;
  score: number | null;
  durationMs: number | null;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  newInputTokens: number | null;
  outputTokens: number | null;
}

export interface BenchmarkSchedule {
  id: string;
  repositoryName: string;
  scenarioId: string;
  scenarioVersion: number;
  scenarioFingerprint: string;
  provider: string;
  model: string;
  reasoningEffort: string;
  featureType: FeatureType;
  description: string;
  intervalMinutes: number;
  enabled: boolean;
  consentedAt: string | null;
  nextRunAt: string;
  connected: boolean;
  createdAt: string;
  updatedAt: string;
  trend: BenchmarkTrendPoint[];
}

export type FeatureType = 'frontend' | 'backend' | 'full-stack';
