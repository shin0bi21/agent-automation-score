---
name: develop-feature
description: Add, change, fix, or refactor Agent Insights product behavior across its browser UI, localhost API, repository discovery, agent-provider boundary, run lifecycle, artifacts, and reports. Use for user-facing features, API endpoints, provider integrations, persistence, accessibility, and runner orchestration; use maintain-evaluators instead when the primary change is scoring or scenario methodology.
---

# Develop Feature

1. Read the applicable contract under `docs/features/` completely.
2. Classify the work as adding or updating behavior and read `docs/development/adding-a-feature.md` or `docs/development/updating-a-feature.md`.
3. Use `docs/architecture/README.md` and `docs/development/README.md` to select only the frontend, backend, database, provider, evaluator, and interaction guides that own the change. Enter operational procedures through `docs/workflows/README.md` and read `docs/workflows/local-development.md` before starting or restarting services.
4. Write a compact acceptance ledger covering states, failures, permissions, durable evidence and cleanup, accessibility, and provider neutrality.
5. Inspect one matching implementation and its tests before editing. Settle persisted and API contracts before their browser consumers.
6. Keep browser interaction separate from privileged local execution. Keep agent-specific behavior behind the provider boundary.
7. Add narrow tests for domain logic, persistence, boundary validation, and interaction as applicable. Preserve auditable normalized evidence without retaining private reasoning or unnecessary raw artifacts.
8. Use `docs/workflows/testing.md` to run the affected checks plus `git diff --check`. Run `npm run validate:skills` whenever repository skills change.
9. Verify the acceptance ledger and report checks actually run plus genuine limitations.

Do not make target repositories conform to this product's structure. Model repository capabilities and applicable templates explicitly.

## Orchestrate substantial work

Keep the primary orchestrator on the strongest available model and reasoning tier. Delegate bounded, independently useful implementation, inspection, and verification lanes to lower-cost workers at low reasoning by default. Escalate a worker only when its lane demonstrates architectural, concurrency, security, or debugging complexity—not merely because the overall feature is large.

The primary orchestrator owns product decisions, the acceptance ledger, shared contracts, integration, final verification, and user communication. Give workers the exact applicable contracts and paths, require concrete changed paths and evidence, avoid concurrent edits to the same files, and continue single-threaded for small or tightly coupled work.

## Hand off

Implementation, mapping, review, fixing, shipping, release, and deployment are separate phases. Stop after implementation unless the current request explicitly includes the next phase. A request for full implementation includes `map-changes`, review, authorized fixes, and re-review; it does not authorize shipping, release, deployment, or package publication.

Follow [`docs/workflows/review.md`](../../../docs/workflows/review.md) for review and [`docs/workflows/shipping.md`](../../../docs/workflows/shipping.md) for separately authorized shipping.
