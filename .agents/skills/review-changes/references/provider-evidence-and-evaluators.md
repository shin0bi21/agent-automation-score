# Provider, evidence, and evaluator review

- Keep provider authentication, model options, command/API transport, events, usage, cancellation, and errors behind the provider boundary.
- Normalize events and usage before persistence or UI presentation; never retain credentials or private chain-of-thought.
- Separate universal readiness, template-specific patterns, scenario checks, and reference-derived evidence.
- Verify version compatibility for prompt, guidance, baseline, evaluator, and reference inputs.
- Check score math, applicability, missing evidence, environment failures, and aggregation across attempts/passes.
- Tie recommendations to stored evidence and distinguish repository gaps, agent failures, evaluator limits, and environment failures.
- Treat one successful run as capability evidence, not reliability evidence.
