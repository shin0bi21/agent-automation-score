# Backend architecture

The backend is a TypeScript localhost service. Express owns the HTTP boundary, orchestration code owns repository and agent execution, services own durable run persistence, and Kysely owns typed SQLite access.

Unless stated otherwise, paths are relative to `backend/`.

```text
HTTP request → Express app → run manager → provider execution / evaluator
                                  │
                                  └── persistence service → Kysely → SQLite
```

## Ownership map

| Path | Owns |
|---|---|
| `src/http/app.ts` | Express construction, request limits, routes, static assets, and JSON errors |
| `src/benchmark-web-server.ts` | Loopback server binding and process entry point |
| `src/benchmark-web-dev.ts` | Local backend watcher and Vite lifecycle |
| `src/benchmark-web-lib.ts` | Repository validation, skill discovery, prompt composition, and web-run orchestration |
| `src/run-agent-benchmark.ts` | Matrix execution, worktrees, provider invocation, and scenario lifecycle |
| `src/agent-benchmark-lib.ts` | Shared process capture, JSONL parsing, and benchmark utilities |
| `src/grade-agent-benchmark.ts` | Deterministic grading and reference-derived implementation review |
| `src/services/run-persistence.ts` | Normalized run import, lifecycle writes, and report projection |
| `src/db/` | SQLite configuration, Kysely types/client, and migration runtime |
| `db/` | Forward-only SQL migrations and operator scripts |

## Boundary rules

- Express handlers validate the external boundary and delegate behavior; they do not embed agent commands or SQL.
- Repository paths must resolve to a Git repository and remain inside the selected repository boundary for discovery.
- Never interpolate repository, prompt, or model values into a shell command. Use argument arrays and explicit working directories.
- Candidate work runs in a detached disposable worktree at a recorded revision.
- Provider-specific models, authentication, commands, events, and usage stay behind the provider boundary as it is extracted.
- Durable writes go through the persistence service. Active paths and bounded diagnostics may be returned transiently to the loopback browser, but must never enter durable run rows. Raw files may exist only while a run is active or when normalization fails and evidence must be retained for diagnosis.
- Express binds to loopback. Exposing this service to a network requires a separate authentication and threat-model design.

## Failure behavior

Malformed or invalid API input returns bounded JSON errors. Process exit, timeout, interruption, evaluator failure, and normalization failure are distinct outcomes. A normalization failure must retain its temporary directory and report the exact path; successful normalization removes it.

Run `npm test` and `npm run backend:check` after backend changes. Add API boundary tests for route or error changes and narrow unit tests for parsing, persistence, and lifecycle rules.
