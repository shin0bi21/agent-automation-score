# Path, subprocess, and isolation review

- Resolve and validate repository paths at the service boundary; never trust browser-provided containment.
- Use executable argument arrays, explicit `cwd`, bounded environment, timeouts, and cancellation. Reject shell interpolation.
- Never execute candidate work in the attached working tree; verify pinned revisions and detached worktree cleanup.
- Keep absolute repository and temporary paths out of durable database rows and completed API projections.
- Remove temporary files only after normalized persistence commits. Retain and report the exact directory when normalization fails.
- Verify cancellation stops the intended process group and cannot target an unrelated process.
- Confirm loopback binding and native picker behavior do not widen filesystem or network access.
