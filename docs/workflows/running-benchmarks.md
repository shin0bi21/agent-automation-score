# Running benchmarks

Real runs consume provider time and tokens. Validate the repository, scenario, matrix, and evaluator with a dry run first.

```bash
npx tsx backend/src/run-agent-benchmark.ts \
  --repo /absolute/path/to/repository \
  --scenario tasks-page \
  --dry-run
```

Run a single model and reasoning level before expanding a matrix:

```bash
npx tsx backend/src/run-agent-benchmark.ts \
  --repo /absolute/path/to/repository \
  --scenario tasks-page \
  --models gpt-5.6-luna \
  --reasoning-efforts low \
  --repetitions 1
```

The current `tasks-page` scenario is pinned to historical and guidance revisions from `my-webapp`. Its Compose overlay also assumes that repository's service names. It is not yet a generic arbitrary-repository scenario.

The `sharpness-core` suite groups three compact `my-webapp` scenarios covering frontend navigation semantics, backend policy ownership, and row-local mutation safety. Recurring runs require explicit token-cost consent in Benchmark Lab, execute serially while the local service is awake, and never backfill missed intervals. Reconnect the repository after restarting the service.

## Experimental discipline

- Keep scenario, prompt, guidance, baseline, evaluator, timeout, and provider version compatible across comparisons.
- Use independent repetitions to measure reliability and ordered review passes to measure iterative improvement.
- Start with Luna or Terra when optimizing cost; use Sol when measuring a stronger orchestrator or upper-bound capability.
- Record cached and uncached input separately from output.
- Do not infer reliability from one high score. Report sample size, score spread, gate failures, duration, and usage.
- Do not run a full matrix merely to verify code wiring; use fake providers, tests, and dry runs first.

Successful web runs normalize durable evidence into SQLite and remove temporary files. See [`benchmarks/README.md`](../../benchmarks/README.md) for benchmark-definition ownership.
