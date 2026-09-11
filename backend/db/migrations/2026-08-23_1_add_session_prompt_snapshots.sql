ALTER TABLE session_interactions ADD COLUMN context_tokens INTEGER CHECK (context_tokens IS NULL OR context_tokens >= 0);
ALTER TABLE session_interactions ADD COLUMN context_window INTEGER CHECK (context_window IS NULL OR context_window > 0);
ALTER TABLE session_interactions ADD COLUMN input_tokens INTEGER CHECK (input_tokens IS NULL OR input_tokens >= 0);
ALTER TABLE session_interactions ADD COLUMN cached_input_tokens INTEGER CHECK (cached_input_tokens IS NULL OR cached_input_tokens >= 0);
ALTER TABLE session_interactions ADD COLUMN output_tokens INTEGER CHECK (output_tokens IS NULL OR output_tokens >= 0);

ALTER TABLE session_directive_episodes ADD COLUMN preparation_pattern_references INTEGER NOT NULL DEFAULT 0 CHECK (preparation_pattern_references >= 0);

CREATE TABLE session_episode_preparation_skills (
  episode_id TEXT NOT NULL REFERENCES session_directive_episodes(id) ON DELETE CASCADE,
  skill_name TEXT NOT NULL CHECK (length(trim(skill_name)) > 0),
  PRIMARY KEY (episode_id, skill_name)
);
