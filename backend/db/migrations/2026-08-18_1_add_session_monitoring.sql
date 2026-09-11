PRAGMA foreign_keys = ON;

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  title TEXT,
  status TEXT NOT NULL CHECK (status IN ('active', 'idle', 'completed', 'failed', 'interrupted')),
  telemetry_level TEXT NOT NULL CHECK (telemetry_level IN ('full', 'imported', 'partial')),
  observed_sequence INTEGER NOT NULL DEFAULT 0 CHECK (observed_sequence >= 0),
  durable_sequence INTEGER NOT NULL DEFAULT 0 CHECK (durable_sequence >= 0 AND durable_sequence <= observed_sequence),
  created_at TEXT NOT NULL,
  started_at TEXT,
  last_observed_at TEXT,
  last_persisted_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL,
  CHECK (
    (status IN ('active', 'idle') AND completed_at IS NULL)
    OR (status IN ('completed', 'failed', 'interrupted') AND completed_at IS NOT NULL)
  )
);

CREATE TABLE session_sources (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (length(trim(platform)) > 0),
  external_session_id TEXT NOT NULL CHECK (length(trim(external_session_id)) > 0),
  source_kind TEXT NOT NULL CHECK (source_kind IN ('cli', 'ide', 'desktop', 'cloud', 'imported', 'unknown')),
  adapter_version TEXT NOT NULL,
  sync_status TEXT NOT NULL CHECK (sync_status IN ('connected', 'syncing', 'synced', 'error', 'disconnected')),
  sync_cursor TEXT,
  last_synced_at TEXT,
  sync_error TEXT,
  UNIQUE (platform, external_session_id)
);

CREATE TABLE session_repositories (
  session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  repository_name TEXT NOT NULL CHECK (length(trim(repository_name)) > 0),
  base_revision TEXT,
  final_revision TEXT,
  guidance_revision TEXT,
  working_tree_dirty INTEGER CHECK (working_tree_dirty IS NULL OR working_tree_dirty IN (0, 1)),
  attached_at TEXT NOT NULL
);

CREATE TABLE session_threads (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  external_thread_id TEXT NOT NULL CHECK (length(trim(external_thread_id)) > 0),
  parent_thread_id TEXT REFERENCES session_threads(id) ON DELETE SET NULL,
  role TEXT NOT NULL CHECK (role IN ('orchestrator', 'implementer', 'researcher', 'tester', 'reviewer', 'other')),
  status TEXT NOT NULL CHECK (status IN ('active', 'idle', 'completed', 'failed', 'interrupted', 'unknown')),
  started_at TEXT,
  completed_at TEXT,
  UNIQUE (session_id, external_thread_id),
  CHECK (parent_thread_id IS NULL OR parent_thread_id <> id)
);

CREATE TABLE session_turns (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES session_threads(id) ON DELETE CASCADE,
  external_turn_id TEXT NOT NULL CHECK (length(trim(external_turn_id)) > 0),
  sequence_number INTEGER NOT NULL CHECK (sequence_number >= 1),
  provider TEXT,
  model TEXT,
  reasoning_level TEXT,
  status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'failed', 'interrupted', 'unknown')),
  started_at TEXT,
  completed_at TEXT,
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  UNIQUE (thread_id, external_turn_id),
  UNIQUE (thread_id, sequence_number)
);

CREATE TABLE turn_usage_snapshots (
  id TEXT PRIMARY KEY,
  turn_id TEXT NOT NULL REFERENCES session_turns(id) ON DELETE CASCADE,
  source_event_key TEXT NOT NULL CHECK (length(trim(source_event_key)) > 0),
  measurement TEXT NOT NULL CHECK (measurement IN ('exact-live', 'exact-stored', 'derived', 'unavailable')),
  input_tokens INTEGER CHECK (input_tokens IS NULL OR input_tokens >= 0),
  cached_input_tokens INTEGER CHECK (cached_input_tokens IS NULL OR cached_input_tokens >= 0),
  output_tokens INTEGER CHECK (output_tokens IS NULL OR output_tokens >= 0),
  reasoning_output_tokens INTEGER CHECK (reasoning_output_tokens IS NULL OR reasoning_output_tokens >= 0),
  observed_at TEXT NOT NULL,
  UNIQUE (turn_id, source_event_key),
  CHECK (
    measurement <> 'unavailable'
    OR (input_tokens IS NULL AND cached_input_tokens IS NULL AND output_tokens IS NULL AND reasoning_output_tokens IS NULL)
  )
);

CREATE TABLE session_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  thread_id TEXT REFERENCES session_threads(id) ON DELETE CASCADE,
  turn_id TEXT REFERENCES session_turns(id) ON DELETE CASCADE,
  sequence_number INTEGER NOT NULL CHECK (sequence_number >= 1),
  source_event_key TEXT NOT NULL CHECK (length(trim(source_event_key)) > 0),
  event_type TEXT NOT NULL CHECK (length(trim(event_type)) > 0),
  status TEXT,
  occurred_at TEXT NOT NULL,
  summary TEXT,
  evidence_json TEXT,
  UNIQUE (session_id, sequence_number),
  UNIQUE (session_id, source_event_key)
);

CREATE TABLE session_checks (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  turn_id TEXT REFERENCES session_turns(id) ON DELETE CASCADE,
  source_event_key TEXT NOT NULL CHECK (length(trim(source_event_key)) > 0),
  check_type TEXT NOT NULL CHECK (check_type IN ('build', 'typecheck', 'unit-tests', 'integration-tests', 'static-analysis', 'pattern-check', 'other')),
  command_label TEXT,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'passed', 'failed', 'skipped', 'unknown')),
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  tests_passed INTEGER CHECK (tests_passed IS NULL OR tests_passed >= 0),
  tests_failed INTEGER CHECK (tests_failed IS NULL OR tests_failed >= 0),
  tests_skipped INTEGER CHECK (tests_skipped IS NULL OR tests_skipped >= 0),
  occurred_at TEXT NOT NULL,
  summary TEXT,
  UNIQUE (session_id, source_event_key)
);

CREATE TABLE session_changes (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  turn_id TEXT REFERENCES session_turns(id) ON DELETE CASCADE,
  source_event_key TEXT NOT NULL CHECK (length(trim(source_event_key)) > 0),
  file_path TEXT NOT NULL CHECK (length(trim(file_path)) > 0),
  previous_file_path TEXT,
  change_type TEXT NOT NULL CHECK (change_type IN ('added', 'updated', 'deleted', 'renamed')),
  lines_added INTEGER CHECK (lines_added IS NULL OR lines_added >= 0),
  lines_removed INTEGER CHECK (lines_removed IS NULL OR lines_removed >= 0),
  occurred_at TEXT NOT NULL,
  UNIQUE (session_id, source_event_key, file_path)
);

CREATE INDEX idx_sessions_status_observed ON sessions(status, last_observed_at);
CREATE INDEX idx_session_sources_sync ON session_sources(sync_status, last_synced_at);
CREATE INDEX idx_session_threads_parent ON session_threads(parent_thread_id);
CREATE INDEX idx_session_turns_thread_sequence ON session_turns(thread_id, sequence_number);
CREATE INDEX idx_turn_usage_observed ON turn_usage_snapshots(turn_id, observed_at);
CREATE INDEX idx_session_events_session_sequence ON session_events(session_id, sequence_number);
CREATE INDEX idx_session_events_turn_sequence ON session_events(turn_id, sequence_number);
CREATE INDEX idx_session_checks_session_time ON session_checks(session_id, occurred_at);
CREATE INDEX idx_session_changes_session_path ON session_changes(session_id, file_path);

CREATE VIEW session_summary AS
WITH latest_turn_usage AS (
  SELECT usage.*
  FROM turn_usage_snapshots AS usage
  WHERE usage.id = (
    SELECT candidate.id
    FROM turn_usage_snapshots AS candidate
    WHERE candidate.turn_id = usage.turn_id
    ORDER BY candidate.observed_at DESC, candidate.id DESC
    LIMIT 1
  )
),
thread_totals AS (
  SELECT session_id, COUNT(*) AS thread_count
  FROM session_threads
  GROUP BY session_id
),
turn_totals AS (
  SELECT threads.session_id, COUNT(*) AS turn_count
  FROM session_threads AS threads
  JOIN session_turns AS turns ON turns.thread_id = threads.id
  GROUP BY threads.session_id
),
event_totals AS (
  SELECT session_id, COUNT(*) AS event_count
  FROM session_events
  GROUP BY session_id
),
check_totals AS (
  SELECT session_id, COUNT(*) AS check_count
  FROM session_checks
  GROUP BY session_id
),
change_totals AS (
  SELECT session_id, COUNT(*) AS changed_file_event_count
  FROM session_changes
  GROUP BY session_id
),
usage_totals AS (
  SELECT
    threads.session_id,
    COUNT(usage.id) AS usage_count,
    SUM(usage.input_tokens) AS input_tokens,
    SUM(usage.cached_input_tokens) AS cached_input_tokens,
    SUM(usage.output_tokens) AS output_tokens,
    SUM(usage.reasoning_output_tokens) AS reasoning_output_tokens
  FROM session_threads AS threads
  JOIN session_turns AS turns ON turns.thread_id = threads.id
  JOIN latest_turn_usage AS usage ON usage.turn_id = turns.id
  GROUP BY threads.session_id
)
SELECT
  sessions.id AS session_id,
  sessions.status,
  sessions.telemetry_level,
  sessions.observed_sequence,
  sessions.durable_sequence,
  sessions.started_at,
  sessions.last_observed_at,
  sessions.last_persisted_at,
  sessions.completed_at,
  COALESCE(thread_totals.thread_count, 0) AS thread_count,
  COALESCE(turn_totals.turn_count, 0) AS turn_count,
  COALESCE(event_totals.event_count, 0) AS event_count,
  COALESCE(check_totals.check_count, 0) AS check_count,
  COALESCE(change_totals.changed_file_event_count, 0) AS changed_file_event_count,
  CASE WHEN COALESCE(usage_totals.usage_count, 0) = 0 THEN NULL ELSE usage_totals.input_tokens END AS input_tokens,
  CASE WHEN COALESCE(usage_totals.usage_count, 0) = 0 THEN NULL ELSE usage_totals.cached_input_tokens END AS cached_input_tokens,
  CASE WHEN COALESCE(usage_totals.usage_count, 0) = 0 THEN NULL ELSE usage_totals.output_tokens END AS output_tokens,
  CASE WHEN COALESCE(usage_totals.usage_count, 0) = 0 THEN NULL ELSE usage_totals.reasoning_output_tokens END AS reasoning_output_tokens
FROM sessions
LEFT JOIN thread_totals ON thread_totals.session_id = sessions.id
LEFT JOIN turn_totals ON turn_totals.session_id = sessions.id
LEFT JOIN event_totals ON event_totals.session_id = sessions.id
LEFT JOIN check_totals ON check_totals.session_id = sessions.id
LEFT JOIN change_totals ON change_totals.session_id = sessions.id
LEFT JOIN usage_totals ON usage_totals.session_id = sessions.id;
