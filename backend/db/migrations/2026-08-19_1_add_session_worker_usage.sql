ALTER TABLE session_threads ADD COLUMN display_name TEXT;
ALTER TABLE turn_usage_snapshots ADD COLUMN cache_write_input_tokens INTEGER
  CHECK (cache_write_input_tokens IS NULL OR cache_write_input_tokens >= 0);

CREATE INDEX idx_session_threads_session_role ON session_threads(session_id, role);
CREATE INDEX idx_session_turns_model ON session_turns(model);
