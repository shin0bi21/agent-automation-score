# Adding or changing an evaluator

Read the automation-readiness and comparison-report feature contracts plus [`evidence-and-reports.md`](../../architecture/evidence-and-reports.md).

Classify every measure as universal, template-specific, scenario-specific, or reference-derived before assigning points. Universal scoring may cover discoverability, deterministic setup, isolation, verification, evidence quality, and successful execution. Framework and folder expectations belong to an explicitly applicable template or scenario.

- Prefer executable behavioral evidence over text markers.
- Use structural checks only when a repository contract makes ownership meaningful.
- Version prompts, guidance, baselines, checks, weights, references, and templates.
- Reject or separate comparisons across incompatible versions.
- Emit structured evidence for every result and distinguish repository gaps, implementation failures, evaluator limitations, and environment failures.
- Tie recommendations to observed evidence and state confidence.

Add deterministic tests for parsing, scoring, aggregation, version compatibility, and applicability. Run a dry run before spending provider tokens; run a real matrix only when explicitly intended.
