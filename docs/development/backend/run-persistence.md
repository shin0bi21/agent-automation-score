# Run persistence

`backend/src/services/run-persistence.ts` owns durable run writes, temporary-evidence normalization, and report-facing projections.

## Lifecycle

1. Create the run and agent setup before launching the provider.
2. Keep the absolute repository path and active temporary directory only in process memory.
3. Stream bounded live activity from temporary provider output while the run executes.
4. On completion, normalize attempts, passes, usage, events, checks, changes, evaluations, findings, and recommendations in one transaction.
5. Delete temporary files only after that transaction succeeds.
6. If normalization fails, mark the run failed and retain the exact temporary directory for diagnosis.

On service startup, unfinished queued, preparing, running, or evaluating records become interrupted. A retry requires the repository to be connected again when no active process-local path exists.

## Normalizing temporary evidence

Normalization is idempotent by run ID. Status precedence is comparison output, then candidate result, then stored terminal state; a stale `running` record becomes interrupted. Web-managed runs remove their temporary directory only after normalization succeeds. Standalone CLI runs retain their diagnostic directory at the printed path for explicit operator inspection and cleanup.

`npm run db:import-results` remains a one-time compatibility path for installations with unimported `results/web-runs` history. Verify run and pass counts, prompts, usage, evaluations, findings, and report projections before removing that source directory. The ignored legacy directory is not a second durable application store.

Do not persist raw chain-of-thought, full terminal streams, worktree paths, or byte-for-byte patches. Preserve bounded structured evidence that supports reports and optimization analysis.
