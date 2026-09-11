# Benchmark runs

## Configuration

A run combines a repository revision, a selected versioned scenario, frontend/backend/full-stack scope, prepared prompt, provider and model setup, isolation policy, evaluator version, and optional template or reference. Manual runs select an explicit scenario; arbitrary feature text is never combined with an unrelated pinned evaluator. The target repository's `AGENTS.md` owns workflow and skill routing.

Repository connection performs a zero-token readiness preflight against the scenario's pinned revision. The UI shows guidance sources, pattern examples, verification routes, and limitations. Missing revisions, missing required check entry points, or the absence of both applicable guidance and comparable patterns make the scenario not evaluable and disable launch. The service recomputes the contract before spawning the provider. Its fingerprint and path-relative evidence are stored with the run; absolute paths and source contents are not.

The Home view contains the setup workflow and exactly one current card: the newest run. History contains every run, including that newest run, so it remains a complete archive.

## Lifecycle and isolation

Runs move through queued, preparing, running, evaluating, and a terminal completed, failed, cancelled, timed-out, or interrupted state. Candidate work executes in a detached disposable worktree and never in the attached working tree.

During execution, the API converts provider events into bounded agent updates, commands, file changes, checks, errors, retries, and completion. It must not present or retain private chain-of-thought. Live activity stays inside a keyboard-focusable bounded scroll region.

When an observable benchmark command explicitly reads `AGENTS.md` or a `SKILL.md`, live activity groups that event under Guidance routing. The view records the file route only; it does not retain extracted skill contents or infer time spent applying the guidance.

## Persistence and privacy

SQLite stores repository name and revisions, configuration, prepared prompt, usage, phases, bounded events, checks, changed-file evidence, evaluations, findings, and recommendations. Absolute repository and worktree paths are never durable; active job configuration may show them transiently through the loopback UI. Raw provider output, terminal logs, and patches are temporary and are removed after successful normalization.

A future remote runner or synchronization feature must require explicit opt-in and define transferred fields, authorization, retention, and deletion before implementation.

## Attempts, repetitions, and review passes

An attempt is one independent candidate execution. Repetitions create attempts for reliability measurement. A review loop creates an ordered pass inside the same attempt so the report can show quality and token usage by pass. Retrying an unsuccessful run creates a new run from the same visible configuration; it does not overwrite prior evidence.

## Recurring regression suites

A versioned regression suite groups several independently scored, pinned scenarios. Recurring execution is disabled until the user explicitly consents to repeated provider-token use. The minimum interval is one day and the recommended default is weekly with one repetition per scenario. Scenarios run serially and the backend rejects overlapping manual or scheduled runs. Every scheduled occurrence repeats the readiness gate, so contract drift or a missing verification route prevents provider execution.

Schedules operate only while the localhost service is awake. Absolute repository paths remain process-local; after a restart, each schedule requires the original repository to be reconnected before it can run again. Missed intervals are skipped and advanced to the next future boundary rather than backfilled. Disabling a schedule preserves its occurrence and trend history.

Each scenario is trended separately. Compatible points require the same scenario version, pinned baseline, guidance, reference, evaluator, prompt, provider, model, reasoning level, feature scope, and repetition setup. The UI shows score, run outcome, duration, cached input, new input, and output without reducing heterogeneous scenarios to one unsupported sharpness score.

## Retry and interruption

Failed, timed-out, cancelled, and interrupted cards expose Retry Run. Active process-local runs may reuse their connected repository path. Historical records do not persist that path, so the user must reconnect the repository before retrying after a restart or from durable history. Retry remains disabled while another run is active.

## Run presentation

Active and unsuccessful runs may expose transient job configuration and diagnostics. Completed runs omit duplicate job configuration because their report includes provider, model, reasoning, score, time, usage, findings, and implementation evidence. Completed state uses text and a successful visual treatment.

Anchored menus choose upward or downward placement from viewport space and close when their scroll context moves. Centered report dialogs lock background scrolling and keep their own overflow usable.

## Implementation ownership

- Browser orchestration: `frontend/src/App.tsx`
- Page composition: `frontend/src/pages/Home/`, `frontend/src/pages/History/`
- Shared run presentation: `frontend/src/components/`
- Typed transport: `frontend/src/api.ts`, `frontend/src/types.ts`
- Express boundary: `backend/src/http/app.ts`
- Run orchestration: `backend/src/benchmark-web-lib.ts`, `backend/src/run-agent-benchmark.ts`
- Persistence: `backend/src/services/run-persistence.ts`
- Database: `backend/db/`, `backend/src/db/`

## Changing this feature

Start with [Adding a feature](../development/adding-a-feature.md) or [Updating a feature](../development/updating-a-feature.md), then use the run-persistence and frontend-workflow guides as applicable.
