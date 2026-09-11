# Evidence and reports

Reports are projections of normalized run data. They distinguish what the repository documents, what the agent implemented, what execution did, and what the evaluator can establish.

## Evidence layers

| Layer | Examples |
|---|---|
| Run configuration | Repository name and revisions, scope, prompt, provider, model, reasoning, repetition and review counts |
| Execution | Phases, bounded events, duration, usage, checks, file changes, retries, and failures |
| Structural findings | Required owners or contracts found or missing |
| Implementation findings | Reference-derived backend and frontend subsections with candidate and reference files |
| Execution findings | Failed commands, patch retries, late testing, inefficient search, and successful recovery |
| Recommendations | Documentation, skills, subagents, workflows, tests, or architecture changes tied to evidence |

Observed sessions add an evidence-coverage boundary. Each metric must distinguish exact live evidence, exact stored evidence, derived evidence, and unavailable telemetry. A live renderer may temporarily be ahead of SQLite; reports use only evidence at or below the durable watermark. Idle sessions remain resumable and do not receive a final review merely because no turn is active.

Session-health scoring, context drift, claim support, pattern discoverability, and implementation alignment are not interchangeable. They require separate applicability and versioned dimensions. Reference-derived alignment is available only when an applicable repository contract or pinned reference establishes the expectation; missing context is itself a finding, not permission to invent a universal folder pattern.

Universal automation readiness, template-specific patterns, scenario-specific grading, and reference-derived comparison must remain separate. A repository must not lose universal points because it does not use another repository's framework or folder layout.

## Report rules

- Show agent configuration, score, duration, and token totals before detail.
- Separate total usage from per-pass usage when review loops exist.
- Keep evidence distinct from recommendations and disclose evaluator limitations.
- Group implementation evidence by applicable backend and frontend subsections.
- Treat one successful run as capability evidence, not reliability evidence.
- Keep HTML, future PDF, and database queries consistent by deriving them from the same structured data.

Evaluator changes follow [`../development/evaluators/adding-an-evaluator.md`](../development/evaluators/adding-an-evaluator.md).
