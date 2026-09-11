CREATE TABLE session_offload_summaries (
  session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  measurement TEXT NOT NULL CHECK (measurement IN ('exact-live', 'exact-stored', 'derived')),
  shell_batches INTEGER NOT NULL CHECK (shell_batches >= 0),
  candidate_batches INTEGER NOT NULL CHECK (candidate_batches >= 0 AND candidate_batches <= shell_batches),
  associated_input_tokens INTEGER NOT NULL CHECK (associated_input_tokens >= 0),
  associated_cached_input_tokens INTEGER NOT NULL CHECK (associated_cached_input_tokens >= 0),
  associated_output_tokens INTEGER NOT NULL CHECK (associated_output_tokens >= 0),
  associated_total_tokens INTEGER NOT NULL CHECK (associated_total_tokens >= 0),
  verification_batches INTEGER NOT NULL CHECK (verification_batches >= 0),
  build_batches INTEGER NOT NULL CHECK (build_batches >= 0),
  formatting_batches INTEGER NOT NULL CHECK (formatting_batches >= 0),
  script_batches INTEGER NOT NULL CHECK (script_batches >= 0),
  monitoring_batches INTEGER NOT NULL CHECK (monitoring_batches >= 0),
  observed_at TEXT NOT NULL
);
