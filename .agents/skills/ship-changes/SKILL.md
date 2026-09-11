---
name: ship-changes
description: Ship approved Agent Insights changes through GitHub Issues, issue-numbered branches, isolated verification, commits, pull requests to develop, required checks, and merges. Use when the user explicitly asks to ship, commit and merge, split and ship, or finalize reviewed changes through the repository's GitHub workflow.
---

# Ship Changes

Ship reviewed concerns serially. Do not delegate operations that share Git or GitHub state. This workflow ends with clean, synchronized `develop`; it never authorizes a release to `main`, deployment, package publishing, or uploading local run data.

Enter only after an explicit shipping request. Read [`docs/workflows/shipping.md`](../../../docs/workflows/shipping.md) completely and follow [`docs/workflows/testing.md`](../../../docs/workflows/testing.md) for verification evidence.

Keep the shipping orchestrator on the strongest available tier. The only delegated prerequisite may be the complete read-only `map-changes` workflow under that skill’s single low-cost-worker policy. Never delegate mutable branch, stash, commit, push, pull-request, check-waiting, or merge operations.

## Audit

1. Confirm branch, upstream, complete tracked and untracked diff, stashes, existing issues, and open pull requests.
2. Reuse the latest `map-changes` concern map. Run that workflow first whenever no current map exists, even when the tree appears cohesive.
3. Require high- and medium-severity review findings to be resolved. Explicitly accept or defer remaining low-severity findings.
4. Verify local databases, temporary run data, logs, prompts, patches, repository paths, and credentials are ignored and absent from the diff and history.
5. Present the issue and branch groups before remote changes. A request to commit, push, ship, or merge authorizes only the feature workflow through `develop`.

## Ship one concern

1. Create or reuse a GitHub Issue with scope and acceptance criteria.
2. Synchronize `develop`, then create `<issue-number>-<short-description>`.
3. Preserve unrelated work with a named safety stash when necessary and restore only the approved concern.
4. Run the concern's narrow checks. For application changes run `npm test`; for frontend changes also run `npm run test:web`, `npm run web:check`, and `npm run web:build`; run `npm run validate:skills` when skills change; run `npm audit --audit-level=high` when dependencies change.
5. Run `git diff --check`, inspect the final diff and status, and commit with a concise issue reference.
6. Push and open a pull request to `develop` containing `Closes #<number>`. Use a temporary body file for multiline Markdown; never embed shell-sensitive Markdown directly in a command argument.
7. Wait for expected required checks. Treat missing checks as pending, never success. Inspect stalled Actions and stop with a concrete blocker rather than bypassing protection.
8. Merge only after checks pass, delete the feature branch, return to `develop`, fast-forward, and verify local `develop` equals `origin/develop` with a clean tree.

Only then start another concern. Never prepare several branches from the same pre-merge base. Report issues, branches, commits, pull requests, checks, merge state, leftovers, and recovery stashes.
