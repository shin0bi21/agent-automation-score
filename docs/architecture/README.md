# Architecture

Agent Insights is a local-first React application backed by an Express API and SQLite. The browser owns configuration and report presentation; the loopback service owns repository access, session sources, agent execution, isolated worktrees, evaluation, and persistence.

```text
Browser / React
      │ localhost HTTP
      ▼
Express API ── Kysely ── SQLite
      │
      ├── provider adapter ── agent CLI or API
      ├── Git worktree ── target repository tools
      └── evaluator ── normalized findings and reports
```

## Architecture map

| Area | Canonical document | Covers |
|---|---|---|
| Frontend | [frontend.md](frontend.md) | UI ownership, state, API boundary, shared components, and tests |
| Backend | [backend.md](backend.md) | Express composition, repository boundary, orchestration, services, and subprocess safety |
| Database | [database.md](database.md) | SQLite, migrations, normalized run records, transactions, and retention |
| Providers and execution | [providers-and-execution.md](providers-and-execution.md) | Provider neutrality, isolated worktrees, events, cancellation, and temporary files |
| Evidence and reports | [evidence-and-reports.md](evidence-and-reports.md) | Evaluations, findings, recommendations, comparison data, and presentation |
| Continuous integration | [ci.md](ci.md) | Merge-gate topology, branch flow, and command ownership |

This directory owns system-wide boundaries and invariants. Product behavior belongs under [`docs/features/`](../features/README.md), implementation procedures under [`docs/development/`](../development/README.md), and executable repository procedures under [`docs/workflows/`](../workflows/README.md).

## Stable boundaries

- The browser never reads repositories, credentials, Git state, or subprocess output directly.
- The service binds to `127.0.0.1` and validates repository and run input before privileged work.
- Repository discovery, run state, evidence, and reports remain agent-platform-neutral.
- Candidate changes run from a pinned revision in an isolated worktree, never in the attached working tree.
- SQLite is the durable local source of truth. Active paths and diagnostics may cross the loopback UI boundary transiently, but raw provider output and runner files are temporary execution data and absolute paths are never durable.
- PDF and browser reports are views of normalized report data, not independent sources of truth.
- Attached repositories are evaluated against their own documented contracts; they do not need this repository's layout.
