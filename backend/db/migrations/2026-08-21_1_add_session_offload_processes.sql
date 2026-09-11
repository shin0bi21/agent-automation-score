CREATE TABLE session_offload_processes (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  signature_key TEXT NOT NULL,
  runner TEXT NOT NULL CHECK (runner IN ('package-manager', 'git-host', 'script', 'language-tool', 'container')),
  operation TEXT NOT NULL CHECK (operation IN ('test', 'check', 'lint', 'typecheck', 'build', 'format', 'deploy', 'pr-checks', 'monitor', 'script')),
  label TEXT NOT NULL,
  batch_count INTEGER NOT NULL CHECK (batch_count >= 0),
  success_count INTEGER NOT NULL CHECK (success_count >= 0),
  failure_count INTEGER NOT NULL CHECK (failure_count >= 0),
  unknown_count INTEGER NOT NULL CHECK (unknown_count >= 0),
  output_bytes INTEGER NOT NULL CHECK (output_bytes >= 0),
  maximum_output_bytes INTEGER NOT NULL CHECK (maximum_output_bytes >= 0),
  output_mode TEXT NOT NULL CHECK (output_mode IN ('final-state', 'summary-errors')),
  recommendation TEXT NOT NULL,
  classifier_version INTEGER NOT NULL CHECK (classifier_version >= 1),
  PRIMARY KEY (session_id, signature_key)
);

CREATE INDEX idx_session_offload_processes_output
  ON session_offload_processes(session_id, output_bytes DESC);
