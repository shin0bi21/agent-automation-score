CREATE TABLE benchmark_schedules (
  id TEXT PRIMARY KEY,
  repository_name TEXT NOT NULL,
  scenario_id TEXT NOT NULL,
  scenario_version INTEGER NOT NULL CHECK (scenario_version >= 1),
  scenario_fingerprint TEXT NOT NULL CHECK (length(scenario_fingerprint) = 64),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  reasoning TEXT NOT NULL,
  feature_type TEXT NOT NULL CHECK (feature_type IN ('frontend', 'backend', 'full-stack')),
  description TEXT NOT NULL,
  interval_minutes INTEGER NOT NULL CHECK (interval_minutes > 0),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  token_cost_consent_at TEXT,
  next_run_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (enabled = 0 OR token_cost_consent_at IS NOT NULL)
);

CREATE TABLE benchmark_schedule_occurrences (
  id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL REFERENCES benchmark_schedules(id),
  planned_at TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('started', 'skipped', 'failed')),
  run_id TEXT REFERENCES runs(id) ON DELETE SET NULL,
  reason TEXT CHECK (reason IS NULL OR length(reason) <= 500),
  created_at TEXT NOT NULL,
  UNIQUE (schedule_id, planned_at)
);

CREATE INDEX idx_benchmark_schedules_due
  ON benchmark_schedules(enabled, next_run_at);
CREATE INDEX idx_benchmark_schedule_occurrences_schedule
  ON benchmark_schedule_occurrences(schedule_id, planned_at);
CREATE INDEX idx_benchmark_schedule_occurrences_run
  ON benchmark_schedule_occurrences(run_id);
