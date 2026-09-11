# Development handbook

Use this handbook when adding or changing product code. Feature documents explain current behavior; architecture documents explain why boundaries exist; this directory gives the implementation order.

1. Read the applicable contract under [`docs/features/`](../features/README.md).
2. Start with [Adding a feature](adding-a-feature.md) or [Updating a feature](updating-a-feature.md).
3. Follow only the backend, frontend, provider, or evaluator guides that own the change.
4. Use [Testing](../workflows/testing.md) for focused verification.
5. Finish with the separate [review](../workflows/review.md) and [shipping](../workflows/shipping.md) handoffs.

## Guide map

| Task | Guide |
|---|---|
| Understand the stack | [Stack guide](stack/README.md) |
| Change the container runtime | [Docker development](stack/docker.md) |
| Add product behavior | [Adding a feature](adding-a-feature.md) |
| Change existing behavior | [Updating a feature](updating-a-feature.md) |
| Change run persistence | [Database changes](backend/database-changes.md) and [run persistence](backend/run-persistence.md) |
| Change the Express boundary or orchestration | [Backend architecture](../architecture/backend.md) |
| Change the browser workflow | [Frontend application](frontend/application-workflows.md) |
| Add or change a reusable overlay | [Frontend interactions](frontend/interactions.md) |
| Add an agent platform | [Adding a provider](providers/adding-a-provider.md) |
| Change scoring or benchmark definitions | [Adding or changing an evaluator](evaluators/adding-an-evaluator.md) |
| Review mapped concerns | [Review](../workflows/review.md) |
| Ship approved concerns | [Shipping](../workflows/shipping.md) |

The source tree remains authoritative for exact filenames. Add documentation when it provides a durable contract, procedure, or ownership map—not merely a second inventory of code.
