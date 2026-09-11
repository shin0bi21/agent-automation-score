# Frontend architecture

The frontend is a React and TypeScript application built with Vite and Tailwind CSS 4. It presents repository connection, run setup, live activity, history, settings, and reports while treating the localhost API as its only privileged boundary.

Unless stated otherwise, paths are relative to `frontend/`.

```text
React page → product components → common interaction primitives
     │
     └── typed API adapter → localhost Express API
```

## Ownership map

| Path | Owns |
|---|---|
| `src/main.tsx` | React root and application bootstrap |
| `src/App.tsx` | Route-like view selection, top-level run orchestration, and cross-page state |
| `src/pages/` | Home, History, and Settings composition plus page-specific components |
| `src/components/` | Run-specific product components reused across pages |
| `src/api.ts` | Typed HTTP requests to the localhost API |
| `src/types.ts` | Browser-facing provider, repository, run, activity, and report contracts |
| `src/common/components/` | Reusable product-agnostic interaction primitives |
| `src/styles.css` | Minimal Tailwind import and `data-theme` dark-mode variant |
| `src/ui.ts` | Shared Tailwind utility strings for recurring product treatments |

Pages own their view composition. Page-only components stay under that page, while components used by multiple pages live under `src/components/`. Keep `common/components` limited to reusable product-agnostic interaction primitives.

## Boundary rules

- All HTTP requests go through `src/api.ts`; components do not construct service URLs ad hoc.
- Browser types use normalized provider-neutral objects, never raw Codex event shapes.
- Repository paths are transient connection input. Active job inspection may show runtime-only repository and worktree paths from the loopback service; completed records expose the durable repository name, not a stored absolute path.
- Remote run state comes from the API. Local React state owns view selection, form input, open overlays, and appearance preferences.
- Reusable interaction primitives belong under `common/components`; run-specific report content may compose them without moving privileged logic into the browser.
- Components must not reveal private chain-of-thought. Live activity is limited to explicit messages, commands, file changes, checks, and outcomes.
- Production presentation uses Tailwind utilities only. Keep `src/styles.css` limited to the
  Tailwind entry and dark-mode variant; do not add component stylesheets or authored selectors.
- Theme utilities use the root `data-theme="dark"` attribute so the persisted appearance
  preference remains independent from the operating-system theme.

## Interaction and accessibility

Floating menus calculate upward or downward placement from available viewport space, close when their scroll context moves, and keep overflow inside a bounded panel. Dialog-style reports lock background scrolling and remain keyboard dismissible. Live activity is a named, keyboard-focusable scroll region with a bounded height.

Use semantic buttons, labels, fieldsets, status regions, dialogs, and visible focus states. Put browser geometry, focus, scrolling, and pointer behavior behind focused tests when jsdom cannot establish the behavior reliably.

## Verification

Run `npm run test:web`, `npm run web:check`, and `npm run web:build`. Add focused component tests beside reusable components and keep application tests for workflow composition.
