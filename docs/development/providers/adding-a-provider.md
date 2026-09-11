# Adding an agent provider

Read [`providers-and-execution.md`](../../architecture/providers-and-execution.md) first.

A provider adapter must expose identity, available models and reasoning options, availability diagnostics, execution, normalized activity, usage, final output, cancellation, and failure classification.

1. Define the provider-neutral contract and fake transport tests.
2. Implement authentication and availability diagnostics without persisting credentials.
3. Build commands with argument arrays or use a typed API client; never interpolate shell input.
4. Normalize provider events and usage before they reach run persistence or the browser.
5. Map timeouts, cancellation, permission failures, and provider failures to stable run outcomes.
6. Add the provider to discovery without branching repository connection, evaluation, or reports by platform.

Exercise one real opt-in smoke run before declaring the provider operational. Document exact authentication, permissions, supported options, limitations, and cost implications.
