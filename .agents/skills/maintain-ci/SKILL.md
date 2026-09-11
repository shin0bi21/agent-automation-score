---
name: maintain-ci
description: Assess, document, optimize, or change Agent Insights CI architecture, GitHub Actions workflows, branch policy, required checks, test composition, caching, and CI performance. Use for workflow failures, CI speed investigations, merge-gate changes, or edits under .github/workflows that affect automation behavior.
---

# Maintain CI

Evolve CI without weakening the merge gate or confusing local and remote verification ownership.

## Establish the execution path

1. Read `docs/workflows/ci.md` completely.
2. Read `docs/architecture/ci.md` when changing topology, ownership boundaries, or build behavior.
3. Inspect the affected workflow, its package scripts, and every command those scripts invoke.
4. Trace pull-request behavior for both `develop` and `main`.

Treat workflow YAML as orchestration and package scripts as the reproducible local interface.

## Preserve CI contracts

- Keep `develop` as the feature integration target. Permit pull requests to `main` only from `develop`.
- Preserve backend and frontend typechecks, tests, and production builds unless the user explicitly approves changing the gate.
- Keep workflow permissions minimal, runtime versions explicit, and required-check names stable.
- Preserve local commands for every check agents and contributors are expected to reproduce.
- Never treat a missing or unregistered required check as success.

## Optimize with evidence

Compare equivalent successful runs. Separate queue delay, wall time, runner consumption, failure rate, and time to merge. Prefer medians with sample sizes and disclose exclusions. Do not claim a durable improvement from a tiny or incomparable sample.

## Implement and verify

1. Keep changes at the narrowest ownership layer and avoid duplicating package commands in workflow YAML.
2. Verify triggers, branch filters, conditions, permissions, concurrency, caching, timeouts, and required-check names.
3. Run the affected local commands. For the complete current merge gate run `npm run validate:skills`, `npm run validate:docs`, `npm run backend:check`, `npm test`, `npm run web:check`, `npm run test:web`, `npm run backend:build`, and `npm run web:build`.
4. Run `npm run validate:skills` whenever repository skills change.
5. Update `docs/workflows/ci.md` and `docs/architecture/ci.md` when policy or ownership changes.

Report checks run, GitHub-only behavior that remains unverified, expected timing or runner-use effects, and branch-protection follow-up.
