# Providers and run execution

Repository discovery, prompt composition, run state, evidence, comparisons, and reports are provider-neutral. A provider adapter owns platform-specific authentication, models, options, command or API transport, event parsing, usage, cancellation, and failure classification.

Codex is the first provider. Sol, Luna, and Terra are models exposed by that provider; they are not product-level run types.

Session sources are related but distinct from benchmark providers. They observe existing platform sessions and normalize supported telemetry without starting an agent turn. A connection or availability probe must never spend model tokens.

## Run lifecycle

```text
validate repository and guidance
  → record request and pinned revision
  → create temporary run directory and isolated worktree
  → invoke provider and normalize live activity
  → run repository checks and evaluator
  → commit normalized records to SQLite
  → remove temporary files and worktree
```

Retries are separate attempts. Review loops are ordered passes inside an attempt. Repetitions measure reliability across independent attempts; passes measure improvement from review within one attempt.

## Isolation and permissions

- Never mutate the attached repository working tree.
- Pin the base and guidance revisions used by the run.
- Give subprocesses explicit argument arrays, working directories, environment, timeouts, and cancellation behavior.
- Treat the provider as operating with the permissions of the local user who started the service.
- Do not store provider credentials or forward them to reports.
- Use an isolated Docker Compose project only when the selected target scenario requires it.

## Container boundary

The optional application container does not make host repositories or provider credentials globally available. Compose mounts one explicitly configured repository and a dedicated runtime directory at identical absolute host/container paths. Path symmetry lets a target-owned Compose project resolve isolated worktrees through the host Docker daemon.

Provider state and SQLite data use separate named volumes. The single Compose configuration maps `/dev/null` over the Docker socket location by default. Setting `AGENT_INSIGHTS_DOCKER_SOCKET_PATH=/var/run/docker.sock` enables target-owned Docker only for scenarios that require it; that socket grants host-level control and must be treated as a privileged opt-in. The browser remains published on host loopback even though Express binds to all container interfaces internally.

## Event normalization

The UI may receive bounded agent updates, command start/completion, file changes, checks, errors, retries, and completion. Raw provider diagnostics stay temporary. Explicit agent messages can be summarized, but hidden reasoning must not be requested, presented, or persisted.

Adding a provider follows [`../development/providers/adding-a-provider.md`](../development/providers/adding-a-provider.md).
