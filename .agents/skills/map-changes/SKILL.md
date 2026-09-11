---
name: map-changes
description: Map the Agent Insights working tree into one or more independently reviewable and shippable concerns before deep review, repeated verification, commits, or pull requests. Use after implementation, when asked to organize changes, and before reviewing or shipping accumulated work.
---

# Map Changes

Produce one read-only concern map before review or shipping. A cohesive working tree produces one concern; a mixed tree produces multiple independently reviewable concerns. Do not edit, test, stash, commit, or make remote changes.

Read [`docs/workflows/review.md`](../../../docs/workflows/review.md) for concern boundaries and [`docs/workflows/shipping.md`](../../../docs/workflows/shipping.md) for the serial shipping boundary this map must support.

When delegation and tier selection are available, assign this complete read-only workflow to one lower-cost worker at low reasoning. Do not use multiple mapping workers. Keep the primary orchestrator on the strongest available tier to verify the returned map against the complete inventory and own downstream decisions. If delegation is unavailable, run it directly.

1. Inspect branch status and every tracked and untracked path. Distinguish intentional source changes from the ignored local SQLite database, temporary run data, and generated frontend output.
2. Group independently reviewable and shippable behavior, not directories. Keep one feature's frontend, backend, tests, contracts, and documentation together when they implement one outcome.
3. Separate provider adapters, evaluator methodology, product features, workflow tooling, and unrelated fixes when they can ship independently. Record dependencies and hunk-level ownership where concerns share files.
4. For each concern record its acceptance scope, exact paths or hunks, dependencies, authoritative checks, unresolved questions, and work that must remain local or uncommitted.
5. Order concerns safely. Shared foundations precede consumers; evaluator schema changes precede reports that consume them.
6. Return one compact concern map for `review-changes` and `ship-changes`. Include the acceptance scope, paths or hunks, dependencies, migration/generated-file ownership, focused checks, unresolved questions, and local-only artifacts for every concern.

The map is a logical plan, not permission to review, fix, ship, or deploy. Downstream workflows reuse it unless the diff materially changes. Shipping prepares and merges one concern at a time from freshly synchronized `develop`; only then may it prepare the next concern.

Never include the local SQLite database, temporary run data, prompts, patches, logs, repository paths, or credentials in a concern intended for GitHub.
