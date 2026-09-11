# Benchmark definitions

Scenarios are versioned executable experiments, not product documentation. Each scenario owns its prompt, pinned target and guidance revisions, model matrix defaults, evaluator checks, structural requirements, and timeouts.

Every scenario declares its applicable feature type and target-specific Docker Compose services. The runner uses that declaration to generate a temporary isolation override that removes host ports and assigns per-run container names so benchmark environments do not collide. Service assumptions are scenario-specific and must not become universal evaluator requirements. Versioned suite manifests under `suites/` group compatible representative scenarios for longitudinal runs; each scenario remains an independent scored experiment.

Product and contributor guidance belongs under `docs/`; reusable cross-scenario code belongs under `backend/src/`.

Do not compare results from different scenario versions as one experiment.
