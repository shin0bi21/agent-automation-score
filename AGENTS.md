# Agent instructions

## Start here

- Treat this repository as the workspace boundary and do not inspect target repositories unless the task names or authorizes them.
- Use `.agents/skills/develop-feature/` for product and application changes.
- Use `.agents/skills/maintain-evaluators/` for scenarios, scoring, comparison, report evidence, and automation-readiness changes.
- After implementation and before deep review or shipping, use `.agents/skills/map-changes/` to produce the authoritative concern map. A cohesive diff produces one concern; a mixed diff produces multiple concerns.
- Use `.agents/skills/review-changes/` for repeatable concern-level review and `.agents/skills/ship-changes/` for issue, branch, verification, pull-request, check, and merge workflows.
- Follow `implementation → concern map → concern review and focused verification → explicitly authorized concern pull request to develop → separately authorized release pull request to main`. Treat every arrow as a handoff boundary. Deployment and package publication always require separate explicit authorization.
- A request for full implementation authorizes implementation, concern mapping, review, fixes, and re-review. It does not authorize shipping, release, deployment, or package publication.
- Ship mixed work serially. Complete one concern through merge, return to clean synchronized `develop`, and only then prepare the next concern.
- Use `.agents/skills/maintain-ci/` for GitHub Actions, required checks, branch policy, runner composition, caching, and CI performance work.
- Read the applicable contract under `docs/features/` before changing established behavior.
- Start feature work in `docs/development/adding-a-feature.md` or `docs/development/updating-a-feature.md`, then follow only the linked boundary guides that apply.
- Use `docs/architecture/README.md` to select the frontend, backend, database, provider/execution, evidence/report, or CI contract before changing that boundary.
- Enter operational procedures through `docs/workflows/README.md`. Read `docs/workflows/local-development.md` before running the web service and `docs/workflows/running-benchmarks.md` before an actual agent benchmark.
- Read `docs/workflows/ci.md` before changing workflows, required checks, or branch policy.
- Read `docs/workflows/review.md` before reviewing and `docs/workflows/shipping.md` before shipping accumulated changes.

## Product invariants

- Keep repository discovery, skills, run state, normalized evidence, and reports agent-platform-neutral.
- Put agent-specific authentication, models, command construction, events, usage, cancellation, and errors behind a provider adapter.
- Never require target repositories to copy this repository's documentation or folder structure.
- Separate universal automation-readiness evidence from template- or scenario-specific expectations.
- Never execute candidate work in the attached repository's working tree; use a pinned revision and isolated worktree.
- Preserve prompts and normalized events, checks, timing, usage, changes, evaluations, findings, and recommendations in the local database so reports remain auditable. Treat raw provider output and runner artifacts as temporary execution data and remove them after successful normalization.
- Bind the local service to loopback by default and validate all repository and artifact paths at the server boundary.
- Treat PDF as a view of structured report data, not the report's source of truth.

## Verification

- Run `npm test` for backend runner, evaluator, provider, or discovery changes.
- Run `npm run backend:check`, `npm run web:check`, and `npm run test:web` for server or frontend changes.
- Validate changed skills with `npm run validate:skills`.
- Use a dry run before spending agent tokens on a changed scenario or matrix.
- Do not claim an agent, check, or template works unless that exact path was exercised.
