CREATE TABLE session_interactions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  source_interaction_key TEXT NOT NULL,
  sequence_number INTEGER NOT NULL CHECK (sequence_number >= 1),
  kind TEXT NOT NULL CHECK (kind IN ('directive', 'question', 'correction', 'approval', 'context', 'mixed')),
  occurred_at TEXT NOT NULL,
  classifier_version INTEGER NOT NULL CHECK (classifier_version >= 1),
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  UNIQUE (session_id, source_interaction_key),
  UNIQUE (session_id, sequence_number)
);

CREATE TABLE session_directive_episodes (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  opening_interaction_id TEXT NOT NULL REFERENCES session_interactions(id) ON DELETE CASCADE,
  sequence_number INTEGER NOT NULL CHECK (sequence_number >= 1),
  status TEXT NOT NULL CHECK (status IN ('active', 'completed')),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  classification_confidence REAL NOT NULL CHECK (classification_confidence >= 0 AND classification_confidence <= 1),
  measurement TEXT NOT NULL CHECK (measurement IN ('exact-live', 'exact-stored', 'derived', 'unavailable')),
  preparation_questions INTEGER NOT NULL CHECK (preparation_questions >= 0),
  preparation_context INTEGER NOT NULL CHECK (preparation_context >= 0),
  preparation_approvals INTEGER NOT NULL CHECK (preparation_approvals >= 0),
  correction_count INTEGER NOT NULL CHECK (correction_count >= 0),
  context_tokens_at_start INTEGER CHECK (context_tokens_at_start IS NULL OR context_tokens_at_start >= 0),
  context_window INTEGER CHECK (context_window IS NULL OR context_window > 0),
  peak_context_percent REAL CHECK (peak_context_percent IS NULL OR (peak_context_percent >= 0 AND peak_context_percent <= 100)),
  agents_references INTEGER NOT NULL CHECK (agents_references >= 0),
  skill_references INTEGER NOT NULL CHECK (skill_references >= 0),
  first_pattern_latency_ms INTEGER CHECK (first_pattern_latency_ms IS NULL OR first_pattern_latency_ms >= 0),
  pattern_before_first_change INTEGER CHECK (pattern_before_first_change IS NULL OR pattern_before_first_change IN (0, 1)),
  tool_calls INTEGER NOT NULL CHECK (tool_calls >= 0),
  file_changes INTEGER NOT NULL CHECK (file_changes >= 0),
  web_searches INTEGER NOT NULL CHECK (web_searches >= 0),
  delegations INTEGER NOT NULL CHECK (delegations >= 0),
  compactions INTEGER NOT NULL CHECK (compactions >= 0),
  verification_batches INTEGER NOT NULL CHECK (verification_batches >= 0),
  classifier_version INTEGER NOT NULL CHECK (classifier_version >= 1),
  UNIQUE (session_id, sequence_number),
  CHECK ((status = 'active' AND completed_at IS NULL) OR (status = 'completed' AND completed_at IS NOT NULL))
);

CREATE TABLE session_episode_skills (
  episode_id TEXT NOT NULL REFERENCES session_directive_episodes(id) ON DELETE CASCADE,
  skill_name TEXT NOT NULL CHECK (length(trim(skill_name)) > 0),
  PRIMARY KEY (episode_id, skill_name)
);

CREATE INDEX idx_session_interactions_session_time ON session_interactions(session_id, occurred_at);
CREATE INDEX idx_session_directive_episodes_session_sequence ON session_directive_episodes(session_id, sequence_number);
