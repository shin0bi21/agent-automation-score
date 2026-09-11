# Agent Insights backend

Express + TypeScript + Kysely/SQLite localhost service for repository discovery, session-source integration, agent execution, evaluation, and report persistence.

## Documentation

| Area | Canonical document |
|---|---|
| Backend architecture | [`../docs/architecture/backend.md`](../docs/architecture/backend.md) |
| Database and migrations | [`../docs/architecture/database.md`](../docs/architecture/database.md) |
| Providers and execution | [`../docs/architecture/providers-and-execution.md`](../docs/architecture/providers-and-execution.md) |
| Evidence and reports | [`../docs/architecture/evidence-and-reports.md`](../docs/architecture/evidence-and-reports.md) |
| Development handbook | [`../docs/development/README.md`](../docs/development/README.md) |
| Local development | [`../docs/workflows/local-development.md`](../docs/workflows/local-development.md) |
| Testing | [`../docs/workflows/testing.md`](../docs/workflows/testing.md) |

## Stack

| Concern | Technology |
|---|---|
| Runtime | Node.js 22+ |
| Framework | Express 5 |
| Language | TypeScript 5.9 |
| Database | SQLite with Kysely and better-sqlite3 |
| Tests | Node test runner |

## Module ownership

| Path | Responsibility |
|---|---|
| `src/http/app.ts` | Injectable Express application and API boundary |
| `src/benchmark-web-server.ts` | Loopback listener |
| `src/benchmark-web-lib.ts` | Repository discovery, prompt composition, and web-run orchestration |
| `src/run-agent-benchmark.ts` | Scenario matrix and isolated candidate execution |
| `src/grade-agent-benchmark.ts` | Evaluation and implementation review |
| `src/services/run-persistence.ts` | Run lifecycle persistence, legacy import, and report projections |
| `src/services/codex-session-source.ts` | No-token Codex App Server connection and observable-event normalization |
| `src/services/session-persistence.ts` | Provider-neutral live snapshots, replay-safe batching, and durable watermarks |
| `src/db/` | SQLite client, configuration, types, and migration runtime |
| `db/migrations/` | Forward-only schema migrations |
| `db/scripts/` | Migration status and legacy import commands |

## Local API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Report local service and container readiness |
| `GET` | `/api/providers` | List available provider models and options |
| `GET` | `/api/runtime` | Report directory-picker capability and the transient mounted repository path |
| `GET` | `/api/runs` | List persisted runs and report projections |
| `GET` | `/api/runs/:id` | Read one run |
| `POST` | `/api/runs` | Validate and start a run |
| `POST` | `/api/repository` | Validate guidance and discover repository skills |
| `POST` | `/api/pick-directory` | Open the supported native directory picker |
| `POST` | `/api/session-source/probe` | Verify Codex session access without starting a turn |
| `GET` | `/api/session-sources/codex/sessions` | List safe stored-session metadata from Codex |
| `POST` | `/api/sessions/import` | Normalize a stored Codex session into SQLite |
| `GET` | `/api/sessions/:id` | Read a normalized session review projection |

Routes in `src/http/app.ts` remain the source of truth. The service is designed for loopback use and has no remote-user authentication boundary.

Run `npm test` and `npm run backend:check` after backend changes.
