# Debugging

## Browser and API

- Confirm the printed Vite and API URLs; do not assume a preferred port when it was already occupied.
- Check `/api/providers` and `/api/runs` directly to separate API state from browser rendering.
- A refused connection means no listener is available at that address; identify stale or conflicting processes before restarting.
- Express returns JSON for API validation and not-found failures. Inspect the response before treating a frontend error as a provider failure.

## Database

- Run `npm run db:status` before debugging missing history.
- Inspect the ignored SQLite database selected by `AGENT_INSIGHTS_DB_PATH` or the default `data/` path.
- Use `PRAGMA foreign_key_check` after relationship changes.
- Compare `runs`, `run_attempts`, `run_passes`, evaluations, and summary views when a report projection looks incomplete.

## Agent runs

- Separate repository validation, provider availability, worktree preparation, agent execution, repository checks, evaluation, and normalization.
- Bounded live activity is user-facing progress; it is not private reasoning and may omit raw diagnostic detail.
- Repeated provider state-database warnings can be non-fatal. Process exit, timeout, missing output, evaluator failure, and normalization failure determine the run outcome.
- Failed patch applications are execution findings, not proof the whole run failed; inspect whether the agent recovered and whether final checks passed.
- When normalization fails, the backend retains the temporary directory and logs its exact path. Successful runs intentionally have no raw artifact directory.

Never paste credentials, full private repository contents, or hidden reasoning into an issue or report.

## Docker runtime

```bash
docker compose config
docker compose ps
docker compose logs --tail=100 app
curl --fail http://127.0.0.1:4173/api/health
```

- If Compose rejects interpolation, copy `.env.example` to `.env` and replace both absolute path placeholders.
- If repository validation fails, confirm the UI path exactly matches `AGENT_INSIGHTS_REPOSITORY_PATH` and inspect the bind mount from inside the app container.
- If the app is healthy but a target-owned Compose command fails, confirm `AGENT_INSIGHTS_DOCKER_SOCKET_PATH=/var/run/docker.sock`, the socket is mounted, and `AGENT_INSIGHTS_RUNTIME_PATH` is shared with Docker Desktop or the host daemon.
- If provider authentication is missing, rerun `docker compose run --rm app codex`; do not copy credentials into the image or `.env`.
- If port `4173` is occupied, change `AGENT_INSIGHTS_PORT` in `.env` and recreate the service. The published address must remain on `127.0.0.1`.
