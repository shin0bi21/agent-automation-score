# Adding a feature

## 1. Define the product contract

Write down the workflow, states, failure behavior, permissions, durable evidence, cleanup, accessibility, and provider-neutral behavior. Add or update the narrowest document under [`docs/features/`](../features/README.md). Describe approved current behavior, not a speculative future system.

## 2. Start at the owning boundary

If the change affects stored run data, lifecycle, repository access, subprocesses, or API output, start with the backend and database contract. If the API already supports the workflow, start with the frontend.

- Persistence: [Database changes](backend/database-changes.md) and [run persistence](backend/run-persistence.md)
- Express and orchestration: [Backend architecture](../architecture/backend.md)
- Browser workflow: [Frontend application](frontend/application-workflows.md)
- Floating menus, dialogs, focus, or scrolling: [Frontend interactions](frontend/interactions.md)
- Provider integration: [Adding a provider](providers/adding-a-provider.md)
- Scoring and comparison: [Evaluator guide](evaluators/adding-an-evaluator.md)

Keep browser code responsible for interaction and presentation. Keep repository access, credentials, subprocesses, path validation, temporary files, and database writes in the localhost service. Normalize platform-specific data before it crosses the API.

## 3. Verify the behavior

Add unit tests for domain and parsing logic, persistence tests for normalized data, API tests for boundary changes, and component tests for interaction. Smoke-test the browser/service boundary. Do not launch a paid agent run unless actual execution is the behavior under test or the user explicitly authorizes the cost.

Use [Testing](../workflows/testing.md), update affected documentation, then follow the separate [review](../workflows/review.md) and [shipping](../workflows/shipping.md) handoffs.
