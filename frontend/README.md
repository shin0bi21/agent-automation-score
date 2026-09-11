# Agent Insights frontend

React + TypeScript + Vite browser interface for repository setup, session connections, run progress, history, settings, and reports.

## Documentation

| Area | Canonical document |
|---|---|
| Frontend architecture | [`../docs/architecture/frontend.md`](../docs/architecture/frontend.md) |
| Product features | [`../docs/features/README.md`](../docs/features/README.md) |
| Development handbook | [`../docs/development/README.md`](../docs/development/README.md) |
| Application workflows | [`../docs/development/frontend/application-workflows.md`](../docs/development/frontend/application-workflows.md) |
| Interactions and overlays | [`../docs/development/frontend/interactions.md`](../docs/development/frontend/interactions.md) |
| Local development | [`../docs/workflows/local-development.md`](../docs/workflows/local-development.md) |
| Testing | [`../docs/workflows/testing.md`](../docs/workflows/testing.md) |

## Stack

| Concern | Technology |
|---|---|
| UI | React 19 |
| Language | TypeScript 5.9 |
| Build and development | Vite 7 with the official Tailwind CSS plugin |
| Styling | Tailwind CSS 4 utilities |
| Tests | Vitest, Testing Library, jsdom |

## Ownership

```text
App orchestration → page → product components → common primitives
        │
        └── typed API adapter → localhost API
```

- `src/App.tsx` owns view selection and cross-page run orchestration.
- `src/pages/` owns Home, History, Settings, and their page-specific components.
- `src/components/` owns run-specific product components reused across pages.
- `src/api.ts` owns every localhost HTTP request.
- `src/types.ts` owns normalized browser-facing contracts.
- `src/common/components/` owns reusable product-agnostic interaction primitives.
- Production components use Tailwind utilities for layout, appearance, responsive states,
  focus treatment, and the `data-theme="dark"` appearance variant.
- `src/styles.css` is the minimal Tailwind entry point. Do not add component stylesheets or
  authored selectors; put utilities on the element that owns the presentation.

The browser never accesses repositories, credentials, Git, subprocesses, or SQLite directly. It polls normalized run and session state from the API and keeps only transient interaction state locally.

Run `npm run test:web`, `npm run web:check`, and `npm run web:build` after frontend changes.
