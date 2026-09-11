# Frontend application workflows

`frontend/src/App.tsx` owns cross-page state, run orchestration, and view selection. `frontend/src/pages/Home`, `History`, and `Settings` own page composition. Home-only setup and current-run sections live under `pages/Home/components`; run presentation shared by Home and History lives under `src/components`.

## State ownership

- API run records are the authoritative remote state.
- The newest run appears on Home; History includes every run, including that newest run.
- Form input, selected view, theme, and open overlays are local UI state.
- Starting or retrying is disabled while a run is active.
- Historical retries require a newly connected repository when no transient path exists.

Use `src/api.ts` for every request and `src/types.ts` for normalized API contracts. Keep raw provider fields out of components.

Use Tailwind utilities directly in production components. Shared recurring treatments may live
as complete utility strings in `src/ui.ts`; component-specific layout remains beside the owning
markup. Do not introduce component CSS files or semantic styling selectors.

## Run presentation

Active runs may show bounded live activity and a troubleshooting disclosure. Completed runs expose their report and avoid duplicate job configuration. Failed, timed-out, interrupted, or cancelled runs expose Retry Run. Status is conveyed with text as well as color.

Keep report summary, agent overview, token summary, findings, and implementation detail derived from the same run projection.
