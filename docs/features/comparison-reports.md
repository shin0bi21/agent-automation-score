# Comparison reports

Reports are generated from structured run and evaluation data. They summarize outcome, reliability, duration, usage, failed checks, missed contracts, meaningful reference differences, and limitations.

Scenario reports include an implementation review grouped by applicable backend and frontend subsections. Each subsection shows matching candidate files beside files from the pinned reference revision, including migrations, routes, controllers, services, policies, focused tests, pages, components, component tests, and hooks. Reference evidence provides context and does not require byte-identical directory parity. Frontend-only and backend-only runs omit inapplicable sections and points.

Recommendations identify where repository instructions, feature contracts, examples, tests, evaluators, skills, or delegated work could improve future automation. Each recommendation cites evidence and confidence. Reports must separate repository-readiness gaps, agent implementation failures, evaluator limitations, and external environment failures.

Runs without a defensible evaluation contract retain duration and usage evidence but expose no performance score. Legacy runs that combined an arbitrary request with an unrelated pinned scenario are marked incompatible instead of presenting their structural misses as agent failures.

Longitudinal benchmark trends compare only compatible executions of the same pinned scenario version and agent configuration. Score, gate outcome, duration, cached input, new input, and output remain visible per scenario. One observation is capability evidence rather than a reliability claim. A diagnostic regression signal appears after two consecutive failures, a score at least 10 points below the recent compatible median, or duration or processed tokens at least 30% above that median. These thresholds are feedback, not a new score or proof of causation.

HTML is the primary interactive view. PDF export presents the same normalized report and does not introduce conclusions absent from the source data.

## Implementation ownership

- Evaluation data: `backend/src/grade-agent-benchmark.ts`
- Aggregation and persistence projection: `backend/src/services/run-persistence.ts`
- Browser report: `frontend/src/components/RunReportMenu/`
- Implementation detail: `frontend/src/components/ImplementationReview/`

## Changing this feature

Use [Updating a feature](../development/updating-a-feature.md) for presentation and persistence changes. Use the `maintain-evaluators` skill for scoring, applicability, evidence, or recommendation methodology.
