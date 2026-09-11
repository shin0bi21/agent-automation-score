# Stack guide

| Boundary | Technology | Repository owner |
|---|---|---|
| Browser | React 19, TypeScript, Vite | `frontend/` |
| Local API | Express 5, TypeScript | `backend/src/http/` |
| Persistence | SQLite, Kysely, better-sqlite3 | `backend/src/db/`, `backend/db/` |
| Agent execution | Provider CLI or API, currently Codex CLI | benchmark runner and provider boundary |
| Isolation | Git detached worktrees; optional target-owned Docker Compose | benchmark runner |
| Tests | Node test runner and Vitest | `backend/test/`, `frontend/src/` |
| CI | GitHub Actions | `.github/workflows/ci.yml` |
| Local packaging | Docker Compose, optional | `Dockerfile`, `docker-compose.yml` |

Use the repository's installed APIs and pinned versions. Do not add a framework, state library, router, database service, or desktop wrapper merely because a larger application uses one. Introduce a dependency only when it owns a current product requirement and its operational cost is documented.

See [Docker development](docker.md) before changing the image, Compose services, mounted paths, volumes, health check, or provider tooling.
