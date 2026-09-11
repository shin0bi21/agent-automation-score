---
name: review-changes
description: Review tracked and untracked Agent Insights changes for correctness, security, provider neutrality, path and subprocess safety, evaluator validity, accessibility, evidence integrity, tests, and consistency with repository contracts. Use when asked to review, audit, inspect, or assess current changes before fixing or shipping them.
---

# Review Changes

Review without editing, creating issues or branches, committing, or making remote changes. A clean review does not authorize shipping.

Read [`docs/workflows/review.md`](../../../docs/workflows/review.md) completely and follow [`docs/workflows/testing.md`](../../../docs/workflows/testing.md) for test ownership and evidence reuse.

For multiple substantial concerns, delegate independent read-only review lanes to lower-cost workers at low reasoning while the strongest primary orchestrator owns severity, deduplication, cross-boundary analysis, and the final report. Escalate only lanes with demonstrated architectural, security, concurrency, or debugging complexity. Do not delegate a small or tightly coupled review, and verify worker findings before reporting them.

Load only the references relevant to the concern:

- structure or ownership: `references/structure-and-ownership.md`;
- tests or claimed verification: `references/testing.md`;
- React rendering, overlays, or state: `references/react-state-and-interactions.md`;
- repository paths, processes, worktrees, or cleanup: `references/path-subprocess-and-isolation.md`;
- providers, evidence, evaluators, or reports: `references/provider-evidence-and-evaluators.md`;
- scripts, dependencies, CI interfaces, or generated output: `references/tooling-quality.md`.

1. Reuse the current `map-changes` concern map. If no current map exists, run the mapping workflow before deep review, even when the tree appears cohesive. Inspect the complete diff and map changed files to contracts under `docs/features/`, the selected documents under `docs/architecture/`, and `AGENTS.md`.
2. Review privileged boundaries first: repository path containment, loopback exposure, subprocess arguments, credentials, worktree isolation, cancellation, and cleanup.
3. Check that provider-specific behavior does not leak into provider-neutral UI, run, comparison, or report models.
4. For evaluators, check applicability, version compatibility, deterministic evidence, weights, false positives, and separation of repository, agent, evaluator, and environment failures.
5. For UI changes, check semantic HTML, keyboard use, live status, failure recovery, narrow layouts, and reduced motion.
6. Inspect tests and reuse exact, current verification evidence. Run only missing or stale narrow checks. Do not edit unless the user asks for fixes.
7. Check that ignored local run data, prompts, patches, paths, credentials, and databases cannot enter Git or remote storage.
8. Report findings by severity with file and line evidence, then list test gaps, concern boundaries, and residual risks. State clearly when no findings remain. A clean review does not authorize shipping.

Reuse focused checks when they cover the exact unchanged concern diff. If a finding is fixed or the concern materially changes, review that current state rather than repeating stale conclusions.

A review request authorizes the prerequisite mapping phase but not fixes, shipping, release, or deployment. After reporting findings, stop unless the current request explicitly authorizes fixes or full implementation.
