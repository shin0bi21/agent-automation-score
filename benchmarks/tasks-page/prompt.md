# Task: build Staff Tasks

Build a production-ready Tasks feature for staff in this repository. Work autonomously through implementation, focused verification, and a final self-review. Do not create GitHub issues, branches, commits, pull requests, or deployments.

Follow the repository's `AGENTS.md`, architecture documentation, existing shared components, authorization model, API conventions, migration rules, and testing patterns. Use the existing Accounts data page as the quality and interaction baseline for a list view; reuse the repository's shared calendar rather than creating another calendar system.

## Product contract

Staff need a Tasks page with equivalent table and calendar views. A task is assigned to a staff member, has a title and optional description, a category, a start/end date range, a workflow status, and optional program and cycle context. Program is optional, but when selected it constrains the available cycles.

Use these canonical finite values:

- statuses: `todo`, `in_progress`, `completed`, and `cancelled`;
- categories: `program_delivery`, `planning_prep`, `meeting`, `administration`, `outreach`, `maintenance`, and `other`.

Users must be able to find and filter tasks, sort and resize the table, switch views without losing their working context, add and edit tasks, change status, move or resize scheduled work, delete eligible tasks, and log time against a task. The page should summarize task hours and behave correctly for loading, empty, refresh, failure, and permission states.

Implement the backend persistence and API support required by the page. Administrators can read and mutate every task resource. Staff can read coworkers who share at least one program assignment, including those coworkers' programless tasks, but can mutate only their own tasks. Enforce visibility and write authorization on the server and expose explicit writable capabilities to the frontend.

Preserve historical tasks for inactive staff and prevent deletion once time has been logged. Active work is `todo` or `in_progress`; an in-progress task cannot be cancelled. Completed tasks and users without write capability cannot move or resize calendar items. Focused status or calendar placement updates must lock/re-read authoritative state and must not overwrite unrelated concurrent changes. Task-linked time must belong to the assignee, start a to-do task, and derive category/program/cycle context from the task instead of accepting contradictory client context.

Add semantic backend tests covering API behavior, authorization scope, lifecycle/destructive rules, task-linked time, and concurrent-field preservation. Add frontend tests covering page wiring, both views, permissions, preferences, modal workflows, placement/status payloads, and failure recovery. Register the new focused backend and frontend runners in the repository's composed test routing.

## Execution contract

- Read and follow `AGENTS.md` and the applicable repository skill completely, including every reference it requires for this scope.
- Before editing, create a compact acceptance ledger from the product contract and inspect the analogous Accounts, Timesheets, calendar, authorization, migration, and test-routing implementations.
- Choose the implementation order yourself, but preserve repository ownership boundaries and use shared primitives instead of parallel infrastructure.
- Before stopping, verify every acceptance-ledger item against implementation and tests. Review authorization, concurrency, destructive behavior, modal consistency, cache/state reconciliation, test adequacy, and maintainability.
- Inspect changed-suite routing with `scripts/tests/test-app.sh --plan-changed`, run the selected authoritative changed-scope verification, and repair failed gates before stopping unless an external permission or environment blocker genuinely prevents it.

## Evidence contract

Use jsdom for DOM behavior; do not run Playwright. Finish with a concise report of what changed, every check actually run and its outcome, any unrun check, and any genuine limitation. Never claim a gate passed based on a narrower substitute.
