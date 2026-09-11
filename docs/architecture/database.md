# Database and migrations

SQLite is the durable local source of truth for run history and reports. Kysely provides typed queries; migrations remain plain forward-only SQL.

## Storage boundary

The default database is `data/agent-insights.sqlite`, which is ignored by Git. `AGENT_INSIGHTS_DB_PATH` may point tests or packaged builds at another local file.

The database stores repository names and Git revisions, never absolute repository paths. It stores prepared prompts and normalized evidence, not byte-for-byte provider transcripts or private chain-of-thought.

## Schema ownership

| Tables | Responsibility |
|---|---|
| `runs`, `run_agent_setup` | Request, repository revision, provider configuration, status, and timestamps |
| `run_attempts` | Independent repetitions or retries |
| `run_passes` | Initial work and ordered review loops within an attempt |
| `pass_token_usage`, `pass_phases`, `pass_events` | Usage and bounded execution history |
| `pass_checks`, `pass_changes` | Verification and changed-file evidence |
| `pass_evaluations` | Score at a specific pass |
| `structural_findings`, `implementation_findings`, `execution_findings` | What was missing, built, or inefficient |
| `run_recommendations` | Evidence-linked documentation, skill, workflow, testing, or architecture improvements |
| `attempt_summary`, `run_summary` | Read models for reports and comparisons |
| `sessions`, `session_sources`, `session_repositories` | Provider-neutral observed-session identity, coverage, synchronization, and optional revision context |
| `session_threads`, `session_turns` | Orchestrator/subagent hierarchy and per-turn model attribution |
| `turn_usage_snapshots`, `session_events` | Periodic usage and bounded normalized live evidence with replay keys |
| `session_checks`, `session_changes` | Verification and repository-relative change evidence observed during a session |
| `session_offload_summaries` | Content-free shell-batch classification and candidate-associated token estimates for frozen reviews |
| `session_offload_processes` | Privacy-safe normalized process patterns, outcomes, output volume, and quiet-output recommendations |
| `session_interactions`, `session_directive_episodes`, `session_episode_skills`, `session_episode_preparation_skills` | Content-free prompt telemetry snapshots, change-backed directive metrics, and prior/in-episode skill attribution |
| `session_path_touches` | Ordered repository-relative read, search, change, and check targets used to derive bounded traversal trees and movement reports |
| `session_summary` | Durable session watermarks, counts, and latest per-turn usage projection |

Live session state is rendered from memory rather than by polling SQLite after every provider event. Routine evidence is transaction-batched; lifecycle events, idle, shutdown, and terminal transitions flush immediately. `observed_sequence` and `durable_sequence` expose whether a renderer snapshot includes evidence that is not yet committed. Source event keys and sync cursors advance transactionally so reconnect replay cannot duplicate evidence or skip past a failed write.

Token counts are nullable and carry a measurement classification. Unavailable imported usage remains `NULL`; it is never projected as zero. Session rows do not require repository or benchmark fields. Existing `runs`, attempts, and passes remain the controlled Benchmark Lab subtype rather than being overloaded for observed sessions.

## Migration contract

Migration files live under `backend/db/migrations/` and use `YYYY-MM-DD_#_description.sql`. They run in lexical order and are tracked in `schema_migrations` with a SHA-256 checksum.

- Never edit or rename a migration after it has been applied outside a confirmed disposable local database.
- Encode stable invariants with foreign keys, unique constraints, checks, and indexes.
- Preserve history deliberately when choosing cascade or deletion behavior.
- Keep each migration transactionally complete and add a new forward migration for later corrections.
- Update `backend/src/db/database.ts` when the typed schema changes; use `npm run db:types` only when the generator is configured against the intended database.

## Commands

```bash
npm run db:migrate
npm run db:status
npm run db:import-results
```

`db:import-results` is the idempotent, one-time compatibility path for unimported `results/web-runs` history. Verify normalized records before deleting the ignored legacy input. Database and WAL files remain untracked. SQLite is the only durable application store; web-managed raw provider output is removed after successful normalization, while standalone CLI diagnostics remain at their printed path until the operator removes them.
