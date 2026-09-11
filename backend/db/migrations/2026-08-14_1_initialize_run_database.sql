PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL
);

CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  repository_name TEXT NOT NULL,
  base_revision TEXT NOT NULL,
  guidance_revision TEXT,
  working_tree_dirty INTEGER NOT NULL DEFAULT 0 CHECK (working_tree_dirty IN (0, 1)),
  feature_type TEXT NOT NULL CHECK (feature_type IN ('frontend', 'backend', 'full-stack')),
  description TEXT NOT NULL,
  prepared_prompt TEXT NOT NULL,
  prompt_template_version TEXT NOT NULL,
  evaluation_template TEXT NOT NULL,
  requested_repetitions INTEGER NOT NULL DEFAULT 1 CHECK (requested_repetitions >= 1),
  requested_review_passes INTEGER NOT NULL DEFAULT 0 CHECK (requested_review_passes >= 0),
  status TEXT NOT NULL CHECK (status IN ('queued', 'preparing', 'running', 'evaluating', 'completed', 'failed', 'cancelled', 'timed-out', 'interrupted')),
  runner_version TEXT,
  provider_cli_version TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT
);

CREATE TABLE run_agent_setup (
  run_id TEXT PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  agent TEXT NOT NULL,
  reasoning_level TEXT NOT NULL
);

CREATE TABLE run_attempts (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL CHECK (attempt_number >= 1),
  status TEXT NOT NULL CHECK (status IN ('queued', 'preparing', 'running', 'evaluating', 'completed', 'failed', 'cancelled', 'timed-out', 'interrupted')),
  started_at TEXT,
  completed_at TEXT,
  failure_summary TEXT,
  UNIQUE (run_id, attempt_number)
);

CREATE TABLE run_passes (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES run_attempts(id) ON DELETE CASCADE,
  pass_number INTEGER NOT NULL CHECK (pass_number >= 0),
  pass_type TEXT NOT NULL CHECK (pass_type IN ('initial', 'review')),
  status TEXT NOT NULL CHECK (status IN ('queued', 'preparing', 'running', 'evaluating', 'completed', 'failed', 'cancelled', 'timed-out', 'interrupted')),
  started_at TEXT,
  completed_at TEXT,
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  final_response TEXT,
  UNIQUE (attempt_id, pass_number),
  CHECK ((pass_number = 0 AND pass_type = 'initial') OR (pass_number > 0 AND pass_type = 'review'))
);

CREATE TABLE pass_token_usage (
  pass_id TEXT PRIMARY KEY REFERENCES run_passes(id) ON DELETE CASCADE,
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  cached_input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (cached_input_tokens >= 0 AND cached_input_tokens <= input_tokens),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  reasoning_output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (reasoning_output_tokens >= 0)
);

CREATE TABLE pass_phases (
  id TEXT PRIMARY KEY,
  pass_id TEXT NOT NULL REFERENCES run_passes(id) ON DELETE CASCADE,
  phase_number INTEGER NOT NULL CHECK (phase_number >= 1),
  phase TEXT NOT NULL CHECK (phase IN ('guidance', 'discovery', 'planning', 'implementation', 'testing', 'repair', 'verification')),
  started_at TEXT,
  completed_at TEXT,
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  summary TEXT NOT NULL,
  outcome TEXT,
  UNIQUE (pass_id, phase_number)
);

CREATE TABLE pass_events (
  id TEXT PRIMARY KEY,
  pass_id TEXT NOT NULL REFERENCES run_passes(id) ON DELETE CASCADE,
  sequence_number INTEGER NOT NULL CHECK (sequence_number >= 1),
  event_type TEXT NOT NULL CHECK (event_type IN ('agent-update', 'command-started', 'command-completed', 'files-changed', 'check-started', 'check-completed', 'error', 'retry', 'pass-completed')),
  status TEXT,
  occurred_at TEXT NOT NULL,
  summary TEXT,
  payload_json TEXT,
  UNIQUE (pass_id, sequence_number)
);

CREATE TABLE pass_checks (
  id TEXT PRIMARY KEY,
  pass_id TEXT NOT NULL REFERENCES run_passes(id) ON DELETE CASCADE,
  check_type TEXT NOT NULL CHECK (check_type IN ('build', 'typecheck', 'unit-tests', 'integration-tests', 'static-analysis', 'pattern-check')),
  command_label TEXT,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'passed', 'failed', 'skipped')),
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  tests_passed INTEGER CHECK (tests_passed IS NULL OR tests_passed >= 0),
  tests_failed INTEGER CHECK (tests_failed IS NULL OR tests_failed >= 0),
  tests_skipped INTEGER CHECK (tests_skipped IS NULL OR tests_skipped >= 0),
  summary TEXT
);

CREATE TABLE pass_changes (
  id TEXT PRIMARY KEY,
  pass_id TEXT NOT NULL REFERENCES run_passes(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  change_type TEXT NOT NULL CHECK (change_type IN ('added', 'updated', 'deleted', 'renamed')),
  lines_added INTEGER CHECK (lines_added IS NULL OR lines_added >= 0),
  lines_removed INTEGER CHECK (lines_removed IS NULL OR lines_removed >= 0),
  UNIQUE (pass_id, file_path)
);

CREATE TABLE pass_evaluations (
  id TEXT PRIMARY KEY,
  pass_id TEXT NOT NULL REFERENCES run_passes(id) ON DELETE CASCADE,
  score REAL CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
  evaluator_version TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE structural_findings (
  id TEXT PRIMARY KEY,
  evaluation_id TEXT NOT NULL REFERENCES pass_evaluations(id) ON DELETE CASCADE,
  contract_id TEXT NOT NULL,
  label TEXT NOT NULL,
  implemented INTEGER NOT NULL CHECK (implemented IN (0, 1)),
  severity TEXT,
  evidence_json TEXT,
  UNIQUE (evaluation_id, contract_id)
);

CREATE TABLE implementation_findings (
  id TEXT PRIMARY KEY,
  evaluation_id TEXT NOT NULL REFERENCES pass_evaluations(id) ON DELETE CASCADE,
  section_id TEXT NOT NULL,
  section_label TEXT NOT NULL,
  requirement_id TEXT NOT NULL,
  requirement_label TEXT NOT NULL,
  implemented INTEGER NOT NULL CHECK (implemented IN (0, 1)),
  candidate_files_json TEXT,
  reference_files_json TEXT,
  UNIQUE (evaluation_id, section_id, requirement_id)
);

CREATE TABLE execution_findings (
  id TEXT PRIMARY KEY,
  pass_id TEXT NOT NULL REFERENCES run_passes(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('documentation-gap', 'pattern-discovery', 'failed-command', 'patch-retry', 'late-testing', 'scope-confusion', 'successful-recovery', 'inefficient-search')),
  severity TEXT,
  summary TEXT NOT NULL,
  recommendation TEXT,
  evidence_json TEXT
);

CREATE TABLE run_recommendations (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  attempt_id TEXT REFERENCES run_attempts(id) ON DELETE CASCADE,
  pass_id TEXT REFERENCES run_passes(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('documentation', 'skill', 'subagent', 'workflow', 'testing', 'architecture')),
  summary TEXT NOT NULL,
  evidence_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_run_attempts_run_id ON run_attempts(run_id, attempt_number);
CREATE INDEX idx_run_passes_attempt_id ON run_passes(attempt_id, pass_number);
CREATE INDEX idx_pass_events_pass_id ON pass_events(pass_id, sequence_number);
CREATE INDEX idx_pass_checks_pass_id ON pass_checks(pass_id);
CREATE INDEX idx_pass_changes_pass_id ON pass_changes(pass_id);
CREATE INDEX idx_pass_evaluations_pass_id ON pass_evaluations(pass_id, created_at);
CREATE INDEX idx_structural_findings_evaluation_id ON structural_findings(evaluation_id);
CREATE INDEX idx_implementation_findings_evaluation_id ON implementation_findings(evaluation_id);
CREATE INDEX idx_execution_findings_pass_id ON execution_findings(pass_id);
CREATE INDEX idx_run_recommendations_run_id ON run_recommendations(run_id);

CREATE VIEW attempt_summary AS
WITH pass_metrics AS (
  SELECT
    passes.id,
    passes.attempt_id,
    passes.pass_number,
    passes.pass_type,
    COALESCE(passes.duration_ms, 0) AS duration_ms,
    COALESCE(usage.input_tokens, 0) AS input_tokens,
    COALESCE(usage.cached_input_tokens, 0) AS cached_input_tokens,
    COALESCE(usage.output_tokens, 0) AS output_tokens,
    COALESCE((SELECT SUM(tests_passed) FROM pass_checks WHERE pass_id = passes.id), 0) AS tests_passed,
    COALESCE((SELECT SUM(tests_failed) FROM pass_checks WHERE pass_id = passes.id), 0) AS tests_failed,
    COALESCE((SELECT SUM(tests_skipped) FROM pass_checks WHERE pass_id = passes.id), 0) AS tests_skipped,
    COALESCE((SELECT COUNT(*) FROM pass_events WHERE pass_id = passes.id AND event_type = 'command-completed' AND status = 'failed'), 0) AS failed_command_count,
    COALESCE((SELECT COUNT(*) FROM pass_events WHERE pass_id = passes.id AND event_type = 'retry'), 0) AS retry_count,
    COALESCE((SELECT COUNT(*) FROM pass_changes WHERE pass_id = passes.id), 0) AS changed_file_count
  FROM run_passes AS passes
  LEFT JOIN pass_token_usage AS usage ON usage.pass_id = passes.id
)
SELECT
  attempts.id AS attempt_id,
  attempts.run_id,
  attempts.attempt_number,
  attempts.status,
  (SELECT evaluations.score FROM run_passes AS passes JOIN pass_evaluations AS evaluations ON evaluations.pass_id = passes.id WHERE passes.attempt_id = attempts.id AND passes.pass_number = 0 ORDER BY evaluations.created_at DESC LIMIT 1) AS initial_score,
  (SELECT evaluations.score FROM run_passes AS passes JOIN pass_evaluations AS evaluations ON evaluations.pass_id = passes.id WHERE passes.attempt_id = attempts.id ORDER BY passes.pass_number DESC, evaluations.created_at DESC LIMIT 1) AS final_score,
  (SELECT evaluations.score FROM run_passes AS passes JOIN pass_evaluations AS evaluations ON evaluations.pass_id = passes.id WHERE passes.attempt_id = attempts.id ORDER BY passes.pass_number DESC, evaluations.created_at DESC LIMIT 1) -
    (SELECT evaluations.score FROM run_passes AS passes JOIN pass_evaluations AS evaluations ON evaluations.pass_id = passes.id WHERE passes.attempt_id = attempts.id AND passes.pass_number = 0 ORDER BY evaluations.created_at DESC LIMIT 1) AS score_improvement,
  COALESCE(SUM(metrics.duration_ms), 0) AS duration_ms,
  COALESCE(SUM(metrics.input_tokens), 0) AS input_tokens,
  COALESCE(SUM(metrics.cached_input_tokens), 0) AS cached_input_tokens,
  COALESCE(SUM(metrics.output_tokens), 0) AS output_tokens,
  COUNT(metrics.id) AS pass_count,
  COALESCE(SUM(CASE WHEN metrics.pass_type = 'review' THEN 1 ELSE 0 END), 0) AS review_pass_count,
  COALESCE(SUM(metrics.tests_passed), 0) AS tests_passed,
  COALESCE(SUM(metrics.tests_failed), 0) AS tests_failed,
  COALESCE(SUM(metrics.tests_skipped), 0) AS tests_skipped,
  COALESCE(SUM(metrics.failed_command_count), 0) AS failed_command_count,
  COALESCE(SUM(metrics.retry_count), 0) AS retry_count,
  COALESCE(SUM(metrics.changed_file_count), 0) AS changed_file_count
FROM run_attempts AS attempts
LEFT JOIN pass_metrics AS metrics ON metrics.attempt_id = attempts.id
GROUP BY attempts.id;

CREATE VIEW run_summary AS
SELECT
  runs.id AS run_id,
  runs.repository_name,
  runs.status,
  runs.requested_repetitions,
  runs.requested_review_passes,
  COUNT(attempts.attempt_id) AS attempt_count,
  AVG(attempts.final_score) AS average_score,
  MIN(attempts.final_score) AS minimum_score,
  MAX(attempts.final_score) AS maximum_score,
  AVG(attempts.final_score * attempts.final_score) - AVG(attempts.final_score) * AVG(attempts.final_score) AS score_variance,
  COALESCE(SUM(attempts.duration_ms), 0) AS duration_ms,
  COALESCE(SUM(attempts.input_tokens), 0) AS input_tokens,
  COALESCE(SUM(attempts.cached_input_tokens), 0) AS cached_input_tokens,
  COALESCE(SUM(attempts.output_tokens), 0) AS output_tokens,
  COALESCE(SUM(attempts.failed_command_count), 0) AS failed_command_count,
  COALESCE(SUM(attempts.retry_count), 0) AS retry_count,
  COALESCE(SUM(attempts.changed_file_count), 0) AS changed_file_count
FROM runs
LEFT JOIN attempt_summary AS attempts ON attempts.run_id = runs.id
GROUP BY runs.id;
