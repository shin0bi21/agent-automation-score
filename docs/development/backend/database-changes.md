# Database changes

Read [`docs/architecture/database.md`](../../architecture/database.md) completely before changing persistence.

## Design the stored contract

- Store only information needed to reproduce, compare, explain, or operate runs.
- Keep absolute repository paths and credentials out of durable records.
- Model repetitions as attempts and review iterations as passes.
- Encode stable cardinality, status, uniqueness, and deletion rules in SQLite constraints.
- Keep report evidence normalized enough to query across runs; do not add an artifact blob table as a shortcut.

## Change migrations safely

Add a forward-only SQL migration under `backend/db/migrations/`. Never edit an applied migration unless every affected database is confirmed disposable and reset. Update `backend/src/db/database.ts`, persistence queries, import behavior, projections, and tests together.

Run:

```bash
npm run db:migrate
npm run db:status
npm run backend:check
npm test
```

Inspect `PRAGMA foreign_key_check` and the affected summary view when relationships or aggregates change.
