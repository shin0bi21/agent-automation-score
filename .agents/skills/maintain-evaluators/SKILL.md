---
name: maintain-evaluators
description: Add, change, calibrate, or review benchmark scenarios, evaluator checks, scoring weights, automation-readiness measures, reference comparisons, templates, evidence, and generated reports. Use for changes under benchmarks, grading and comparison code, score methodology, framework templates, report recommendations, or benchmark fairness and reproducibility.
---

# Maintain Evaluators

1. Read `docs/features/automation-readiness.md`, `docs/features/comparison-reports.md`, `docs/development/evaluators/adding-an-evaluator.md`, and `docs/architecture/evidence-and-reports.md` completely.
2. Classify each measure as universal, template-specific, scenario-specific, or reference-derived before assigning points.
3. Define applicability, evidence, failure semantics, versioning, and environmental prerequisites.
4. Prefer executable behavioral evidence. Use structural checks only for documented ownership contracts, never as universal framework assumptions.
5. Keep repository readiness, agent outcome, evaluator limitations, and environment failures separate in data and reports.
6. Add deterministic tests for parsing, scoring, aggregation, and incompatible-version rejection.
7. Run `npm test` and a dry run. Run a real agent matrix only when explicitly intended because it consumes time and provider resources.
8. Document what the score can and cannot establish. Do not infer reliability from one repetition.

## Orchestrate evaluator work

Keep the primary orchestrator on the strongest available model and reasoning tier. Delegate bounded, independent measurement, fixture inventory, and check-tracing lanes to lower-cost workers at low reasoning. Escalate a worker only when its lane demonstrates non-obvious statistical, concurrency, security, or evaluator-design complexity. Keep scoring decisions, applicability, integration, and final validity judgments with the primary orchestrator.
