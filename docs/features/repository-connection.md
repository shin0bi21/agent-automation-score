# Repository connection

Users connect a local Git repository by path or a native folder picker when the service runtime supports one. The localhost service owns native selection because browser directory APIs do not provide a usable absolute repository path. Container startup exposes the explicitly mounted repository path to the loopback UI as transient runtime configuration, so the user can connect it without retyping the mount. The service validates the repository boundary and discovers agent entry points and skills without assuming a framework or documentation layout. Current explicit skill roots are `.agents/skills` and `.codex/skills`; discovery should grow through adapters rather than unbounded filesystem scanning.

Connection requires a root `AGENTS.md` and at least one discoverable `SKILL.md`; it fails before execution when either is missing so the product never spends agent tokens on unguided guessing. Connection reports discovered guidance, skills, Git state, and compatible scenario or template capabilities. Connecting does not authorize mutation or execution. Invalid and unsupported repositories return actionable errors without leaking unrelated filesystem information.

## Implementation ownership

- Browser setup: `frontend/src/pages/Home/`, `frontend/src/App.tsx`, `frontend/src/api.ts`
- API and validation: `backend/src/http/app.ts`, `backend/src/benchmark-web-lib.ts`

## Changing this feature

Use [Adding a feature](../development/adding-a-feature.md) or [Updating a feature](../development/updating-a-feature.md) and read the frontend and backend architecture documents.
