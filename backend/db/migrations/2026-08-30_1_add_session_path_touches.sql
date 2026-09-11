CREATE TABLE session_path_touches (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  sequence_number INTEGER NOT NULL CHECK (sequence_number >= 1),
  source_touch_key TEXT NOT NULL CHECK (length(trim(source_touch_key)) > 0),
  prompt_key TEXT,
  file_path TEXT NOT NULL CHECK (
    length(trim(file_path)) > 0
    AND file_path NOT LIKE '/%'
    AND file_path NOT LIKE '../%'
    AND file_path NOT LIKE '%/../%'
    AND instr(file_path, '\') = 0
  ),
  touch_kind TEXT NOT NULL CHECK (touch_kind IN ('read', 'search', 'change', 'check')),
  occurred_at TEXT NOT NULL,
  UNIQUE (session_id, source_touch_key, file_path)
);

CREATE INDEX idx_session_path_touches_sequence
  ON session_path_touches(session_id, sequence_number);

CREATE INDEX idx_session_path_touches_path
  ON session_path_touches(session_id, file_path);
