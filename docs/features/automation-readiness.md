# Automation readiness

Automation readiness estimates how reliably an agent can understand, change, verify, and explain a repository. It is not a score for copying Agent Insights's folder structure.

The universal score covers discoverable instructions, reproducible setup, safe isolation, clear task and ownership boundaries, deterministic verification, observable failures, and complete run evidence. Empirical agent success and consistency are reported separately from static readiness so a strong model does not hide weak repository guidance.

Optional templates add domain expectations such as React/Vite UI composition, full-stack CRUD layering, API compatibility, CLI behavior, libraries, or mobile applications. Template scores remain separate and state their applicability. Reference comparisons evaluate contracts, behavior, and repository-mandated ownership; they do not require byte-identical directories.

Before provider execution, Benchmark Lab deterministically builds a versioned, zero-token evaluation contract from pinned Git trees. It resolves task-relevant pattern documents, manifest-owned reference patterns, repeated task-named source paths across distinct ownership directories, and executable verification entry points. The result is `ready`, `ready-with-limitations`, or `not-evaluable`. A not-evaluable result blocks execution before an agent starts and produces no performance score. Missing pattern documentation is repository-readiness evidence, not an agent failure; generic agent guidance and a large repository cannot substitute for applicable documents or repeated examples. This discovery phase never calls an LLM or mutates the attached worktree.

## Implementation ownership

- Benchmark and evaluator configuration: `benchmarks/`
- Structural grading: `backend/src/grade-agent-benchmark.ts`
- Execution evidence: `backend/src/run-agent-benchmark.ts`
- Durable findings: `backend/src/services/run-persistence.ts`

## Changing this feature

Use the `maintain-evaluators` skill and [evaluator guide](../development/evaluators/adding-an-evaluator.md). Version scoring inputs and run a dry run before any paid matrix.
