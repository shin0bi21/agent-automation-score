ALTER TABLE runs ADD COLUMN evaluation_readiness_status TEXT CHECK (evaluation_readiness_status IN ('ready', 'ready-with-limitations', 'not-evaluable'));
ALTER TABLE runs ADD COLUMN evaluation_readiness_fingerprint TEXT;
ALTER TABLE runs ADD COLUMN evaluation_readiness_evidence_json TEXT;
ALTER TABLE runs ADD COLUMN evaluation_readiness_findings_json TEXT;

UPDATE runs
SET evaluation_readiness_status = 'not-evaluable',
    evaluation_readiness_findings_json = '["Legacy run combined a pinned evaluator prompt with an arbitrary feature request; its score is incompatible."]'
WHERE prepared_prompt LIKE '%## User feature description%';
