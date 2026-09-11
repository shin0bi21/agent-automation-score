# Updating a feature

Start with the owner of the behavior and inspect one current implementation plus its tests before editing.

## 1. Find the contract and data flow

Read the feature document, then trace only the affected path:

```text
React component → frontend API adapter → Express route → run manager/service → SQLite, provider, or evaluator
```

Read a reusable component's local README before changing its public interaction contract. Search all consumers when changing a browser type, API field, status, provider option, finding category, or database constraint.

## 2. Change the narrowest owner

- Stored shape or retention: add a migration and update Kysely types plus persistence projections.
- API request or response: update the Express boundary, browser types/API adapter, and boundary tests together.
- Run lifecycle: update state transitions, cleanup, interruption recovery, persisted evidence, and live UI behavior.
- Browser interaction: update the component or owning workflow and preserve keyboard, focus, scroll, and responsive behavior.
- Evaluation: keep universal, template, scenario, and reference-derived evidence separate.

Do not touch every layer automatically. Change only the owners of the behavior and their consumers.

## 3. Review and verify

Run focused tests during implementation, update the feature contract when behavior changes, and use [Testing](../workflows/testing.md) before handoff. Then follow the separate [review](../workflows/review.md) and [shipping](../workflows/shipping.md) handoffs.
