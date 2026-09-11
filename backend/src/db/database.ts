import type { Generated } from 'kysely';

export type SqliteBoolean = 0 | 1;

export interface SchemaMigrationsTable {
  version: string;
  checksum: string;
  applied_at: string;
}

export interface RunsTable {
  id: string;
  repository_name: string;
  base_revision: string;
  guidance_revision: string | null;
  working_tree_dirty: SqliteBoolean;
  feature_type: 'frontend' | 'backend' | 'full-stack';
  description: string;
  prepared_prompt: string;
  prompt_template_version: string;
  evaluation_template: string;
  evaluation_readiness_status: 'ready' | 'ready-with-limitations' | 'not-evaluable' | null;
  evaluation_readiness_fingerprint: string | null;
  evaluation_readiness_evidence_json: string | null;
  evaluation_readiness_findings_json: string | null;
  requested_repetitions: number;
  requested_review_passes: number;
  status: string;
  runner_version: string | null;
  provider_cli_version: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface RunAgentSetupTable {
  run_id: string;
  provider: string;
  agent: string;
  reasoning_level: string;
}

export interface RunAttemptsTable {
  id: string;
  run_id: string;
  attempt_number: number;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  failure_summary: string | null;
}

export interface RunPassesTable {
  id: string;
  attempt_id: string;
  pass_number: number;
  pass_type: 'initial' | 'review';
  status: string;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  final_response: string | null;
}

export interface PassTokenUsageTable {
  pass_id: string;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  reasoning_output_tokens: number;
}

export interface PassPhasesTable {
  id: string;
  pass_id: string;
  phase_number: number;
  phase: string;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  summary: string;
  outcome: string | null;
}

export interface PassEventsTable {
  id: string;
  pass_id: string;
  sequence_number: number;
  event_type: string;
  status: string | null;
  occurred_at: string;
  summary: string | null;
  payload_json: string | null;
}

export interface PassChecksTable {
  id: string;
  pass_id: string;
  check_type: string;
  command_label: string | null;
  status: string;
  duration_ms: number | null;
  tests_passed: number | null;
  tests_failed: number | null;
  tests_skipped: number | null;
  summary: string | null;
}

export interface PassChangesTable {
  id: string;
  pass_id: string;
  file_path: string;
  change_type: string;
  lines_added: number | null;
  lines_removed: number | null;
}

export interface PassEvaluationsTable {
  id: string;
  pass_id: string;
  score: number | null;
  evaluator_version: string;
  created_at: string;
}

export interface StructuralFindingsTable {
  id: string;
  evaluation_id: string;
  contract_id: string;
  label: string;
  implemented: SqliteBoolean;
  severity: string | null;
  evidence_json: string | null;
}

export interface ImplementationFindingsTable {
  id: string;
  evaluation_id: string;
  section_id: string;
  section_label: string;
  requirement_id: string;
  requirement_label: string;
  implemented: SqliteBoolean;
  candidate_files_json: string | null;
  reference_files_json: string | null;
}

export interface ExecutionFindingsTable {
  id: string;
  pass_id: string;
  category: string;
  severity: string | null;
  summary: string;
  recommendation: string | null;
  evidence_json: string | null;
}

export interface RunRecommendationsTable {
  id: string;
  run_id: string;
  attempt_id: string | null;
  pass_id: string | null;
  category: string;
  summary: string;
  evidence_json: string | null;
  created_at: string;
}

export interface AttemptSummaryView {
  attempt_id: string;
  run_id: string;
  attempt_number: number;
  status: string;
  initial_score: number | null;
  final_score: number | null;
  score_improvement: number | null;
  duration_ms: number;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  pass_count: number;
  review_pass_count: number;
  tests_passed: number;
  tests_failed: number;
  tests_skipped: number;
  failed_command_count: number;
  retry_count: number;
  changed_file_count: number;
}

export interface RunSummaryView {
  run_id: string;
  repository_name: string;
  status: string;
  requested_repetitions: number;
  requested_review_passes: number;
  attempt_count: number;
  average_score: number | null;
  minimum_score: number | null;
  maximum_score: number | null;
  score_variance: number | null;
  duration_ms: number;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  failed_command_count: number;
  retry_count: number;
  changed_file_count: number;
}

export type SessionStatus = 'active' | 'idle' | 'completed' | 'failed' | 'interrupted';
export type TelemetryLevel = 'full' | 'imported' | 'partial';
export type UsageMeasurement = 'exact-live' | 'exact-stored' | 'derived' | 'unavailable';

export interface SessionsTable {
  id: string;
  title: string | null;
  status: SessionStatus;
  telemetry_level: TelemetryLevel;
  observed_sequence: number;
  durable_sequence: number;
  created_at: string;
  started_at: string | null;
  last_observed_at: string | null;
  last_persisted_at: string | null;
  completed_at: string | null;
  updated_at: string;
}

export interface SessionSourcesTable {
  id: string;
  session_id: string;
  platform: string;
  external_session_id: string;
  source_kind: 'cli' | 'ide' | 'desktop' | 'cloud' | 'imported' | 'unknown';
  adapter_version: string;
  sync_status: 'connected' | 'syncing' | 'synced' | 'error' | 'disconnected';
  sync_cursor: string | null;
  last_synced_at: string | null;
  sync_error: string | null;
}

export interface SessionRepositoriesTable {
  session_id: string;
  repository_name: string;
  base_revision: string | null;
  final_revision: string | null;
  guidance_revision: string | null;
  working_tree_dirty: SqliteBoolean | null;
  attached_at: string;
}

export interface SessionThreadsTable {
  id: string;
  session_id: string;
  external_thread_id: string;
  parent_thread_id: string | null;
  role: 'orchestrator' | 'implementer' | 'researcher' | 'tester' | 'reviewer' | 'other';
  status: 'active' | 'idle' | 'completed' | 'failed' | 'interrupted' | 'unknown';
  started_at: string | null;
  completed_at: string | null;
  display_name: string | null;
}

export interface SessionTurnsTable {
  id: string;
  thread_id: string;
  external_turn_id: string;
  sequence_number: number;
  provider: string | null;
  model: string | null;
  reasoning_level: string | null;
  status: 'active' | 'completed' | 'failed' | 'interrupted' | 'unknown';
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
}

export interface TurnUsageSnapshotsTable {
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
}

export interface SessionEventsTable {
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
  evidence_json: string | null;
}

export interface SessionChecksTable {
  id: string;
  session_id: string;
  turn_id: string | null;
  source_event_key: string;
  check_type: 'build' | 'typecheck' | 'unit-tests' | 'integration-tests' | 'static-analysis' | 'pattern-check' | 'other';
  command_label: string | null;
  status: 'queued' | 'running' | 'passed' | 'failed' | 'skipped' | 'unknown';
  duration_ms: number | null;
  tests_passed: number | null;
  tests_failed: number | null;
  tests_skipped: number | null;
  occurred_at: string;
  summary: string | null;
}

export interface SessionChangesTable {
  id: string;
  session_id: string;
  turn_id: string | null;
  source_event_key: string;
  file_path: string;
  previous_file_path: string | null;
  change_type: 'added' | 'updated' | 'deleted' | 'renamed';
  lines_added: number | null;
  lines_removed: number | null;
  occurred_at: string;
}

export interface SessionPathTouchesTable {
  id: string;
  session_id: string;
  sequence_number: number;
  source_touch_key: string;
  prompt_key: string | null;
  file_path: string;
  touch_kind: 'read' | 'search' | 'change' | 'check';
  occurred_at: string;
}

export interface SessionOffloadSummariesTable {
  session_id: string;
  measurement: 'exact-live' | 'exact-stored' | 'derived';
  shell_batches: number;
  candidate_batches: number;
  associated_input_tokens: number;
  associated_cached_input_tokens: number;
  associated_output_tokens: number;
  associated_total_tokens: number;
  verification_batches: number;
  build_batches: number;
  formatting_batches: number;
  script_batches: number;
  monitoring_batches: number;
  observed_at: string;
}

export interface SessionOffloadProcessesTable {
  session_id: string;
  signature_key: string;
  runner: 'package-manager' | 'git-host' | 'script' | 'language-tool' | 'container';
  operation: 'test' | 'check' | 'lint' | 'typecheck' | 'build' | 'format' | 'deploy' | 'pr-checks' | 'monitor' | 'script';
  label: string;
  batch_count: number;
  success_count: number;
  failure_count: number;
  unknown_count: number;
  output_bytes: number;
  maximum_output_bytes: number;
  output_mode: 'final-state' | 'summary-errors';
  recommendation: string;
  classifier_version: number;
}

export interface SessionInteractionsTable {
  id: string;
  session_id: string;
  source_interaction_key: string;
  sequence_number: number;
  kind: 'directive' | 'question' | 'correction' | 'approval' | 'context' | 'mixed';
  occurred_at: string;
  classifier_version: number;
  confidence: number;
  context_tokens: number | null;
  context_window: number | null;
  input_tokens: number | null;
  cached_input_tokens: number | null;
  output_tokens: number | null;
}

export interface SessionDirectiveEpisodesTable {
  id: string;
  session_id: string;
  opening_interaction_id: string;
  sequence_number: number;
  status: 'active' | 'completed';
  started_at: string;
  completed_at: string | null;
  classification_confidence: number;
  measurement: 'exact-live' | 'exact-stored' | 'derived' | 'unavailable';
  preparation_questions: number;
  preparation_context: number;
  preparation_approvals: number;
  preparation_pattern_references: number;
  correction_count: number;
  context_tokens_at_start: number | null;
  context_window: number | null;
  peak_context_percent: number | null;
  agents_references: number;
  skill_references: number;
  first_pattern_latency_ms: number | null;
  pattern_before_first_change: 0 | 1 | null;
  tool_calls: number;
  file_changes: number;
  web_searches: number;
  delegations: number;
  compactions: number;
  verification_batches: number;
  classifier_version: number;
}

export interface SessionEpisodeSkillsTable {
  episode_id: string;
  skill_name: string;
}

export interface SessionEpisodePreparationSkillsTable {
  episode_id: string;
  skill_name: string;
}

export interface SessionSummaryView {
  session_id: string;
  status: SessionStatus;
  telemetry_level: TelemetryLevel;
  observed_sequence: number;
  durable_sequence: number;
  started_at: string | null;
  last_observed_at: string | null;
  last_persisted_at: string | null;
  completed_at: string | null;
  thread_count: number;
  turn_count: number;
  event_count: number;
  check_count: number;
  changed_file_event_count: number;
  input_tokens: number | null;
  cached_input_tokens: number | null;
  output_tokens: number | null;
  reasoning_output_tokens: number | null;
}

export interface BenchmarkSchedulesTable {
  id: string;
  repository_name: string;
  scenario_id: string;
  scenario_version: number;
  scenario_fingerprint: string;
  provider: string;
  model: string;
  reasoning: string;
  feature_type: 'frontend' | 'backend' | 'full-stack';
  description: string;
  interval_minutes: number;
  enabled: SqliteBoolean;
  token_cost_consent_at: string | null;
  next_run_at: string;
  created_at: string;
  updated_at: string;
}

export interface BenchmarkScheduleOccurrencesTable {
  id: string;
  schedule_id: string;
  planned_at: string;
  outcome: 'started' | 'skipped' | 'failed';
  run_id: string | null;
  reason: string | null;
  created_at: string;
}

export interface Database {
  schema_migrations: SchemaMigrationsTable;
  runs: RunsTable;
  run_agent_setup: RunAgentSetupTable;
  run_attempts: RunAttemptsTable;
  run_passes: RunPassesTable;
  pass_token_usage: PassTokenUsageTable;
  pass_phases: PassPhasesTable;
  pass_events: PassEventsTable;
  pass_checks: PassChecksTable;
  pass_changes: PassChangesTable;
  pass_evaluations: PassEvaluationsTable;
  structural_findings: StructuralFindingsTable;
  implementation_findings: ImplementationFindingsTable;
  execution_findings: ExecutionFindingsTable;
  run_recommendations: RunRecommendationsTable;
  attempt_summary: AttemptSummaryView;
  run_summary: RunSummaryView;
  sessions: SessionsTable;
  session_sources: SessionSourcesTable;
  session_repositories: SessionRepositoriesTable;
  session_threads: SessionThreadsTable;
  session_turns: SessionTurnsTable;
  turn_usage_snapshots: TurnUsageSnapshotsTable;
  session_events: SessionEventsTable;
  session_checks: SessionChecksTable;
  session_changes: SessionChangesTable;
  session_path_touches: SessionPathTouchesTable;
  session_offload_summaries: SessionOffloadSummariesTable;
  session_offload_processes: SessionOffloadProcessesTable;
  session_interactions: SessionInteractionsTable;
  session_directive_episodes: SessionDirectiveEpisodesTable;
  session_episode_skills: SessionEpisodeSkillsTable;
  session_episode_preparation_skills: SessionEpisodePreparationSkillsTable;
  session_summary: SessionSummaryView;
  benchmark_schedules: BenchmarkSchedulesTable;
  benchmark_schedule_occurrences: BenchmarkScheduleOccurrencesTable;
}

export type DatabaseId = Generated<string>;
