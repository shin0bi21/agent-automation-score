# Review

Implementation, mapping, review, fixing, shipping, release, and deployment are distinct phases. Completing code does not authorize commits, pull requests, merges, releases, or deployment. A clean review does not authorize shipping.

Follow [Testing](testing.md) for test ownership, focused checks, and evidence reuse.

## Establish the concern

Before deep review, use `map-changes` to map the complete working tree into one or more independently reviewable concerns. A cohesive diff still produces a one-concern map. Reuse that map as the source of truth unless the diff materially changes.

## Review the exact diff

Review tracked and untracked changes for correctness, security, provider neutrality, path and subprocess safety, evaluator validity, accessibility, evidence integrity, test adequacy, and alignment with the applicable feature and architecture contracts.

Reuse successful focused verification while it covers the exact unchanged concern. Run only missing or stale checks, plus `git diff --check`. Required GitHub checks are the full merge gate.

Report findings by severity with file and line evidence, then state test gaps, concern boundaries, and residual risks. Stop after the review unless the current request explicitly authorizes fixes or full implementation. If fixes materially change concern boundaries, return to `map-changes` before continuing.

Agents use the repository `map-changes` and `review-changes` skills for these phases.
