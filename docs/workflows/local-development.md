# Local development

Use [Setup](setup.md) for first-time requirements and installation.

## Start and restart

Production-style local build:

```bash
npm start
```

This is the canonical Session Review startup path. It verifies the host Codex session source, then opens Agent Insights at `http://127.0.0.1:4173`. `npm run web` starts the same production-style application without the source preflight.

Check host-session discovery without starting the web service:

```bash
npm run sessions:check
```

Development watchers:

```bash
npm run web:dev
```

Open the Vite URL printed by the process, normally `http://127.0.0.1:5173`. Backend TypeScript changes restart the loopback API; frontend changes use Vite hot reload. When a stale process owns a port, identify that exact listener before stopping it and restart both boundaries together.

## Database commands

```bash
npm run db:migrate
npm run db:status
npm run db:import-results
```

SQLite is the only durable run store. `db:import-results` remains a one-time upgrade path for installations with unimported `results/web-runs`; verify the normalized data before removing the ignored source directory. Installations default to `data/agent-insights.sqlite`; override it with `AGENT_INSIGHTS_DB_PATH` for tests or packaging. Web-managed runner output is removed after successful normalization. Standalone CLI diagnostics remain at the printed path until explicitly removed.

## Run execution

The service runs with the terminal user's permissions and must remain on loopback. Active files live in the operating system's temporary directory and are deleted after successful normalization. A normalization failure retains the temporary directory and prints its path.

Preview scenario and matrix configuration with `--dry-run` before a real run. Docker is used only when the target scenario requires it. Do not call a run successful until the exact provider, evaluator, and report path has completed.

## Docker lifecycle

Docker uses an isolated `CODEX_HOME` in the `codex_state` volume. It can review sessions created inside that container-owned provider state, but it intentionally does not receive credentials or private sessions from the host Codex home. Use `npm start` when Session Review must show sessions from the desktop Codex application.

After completing [Docker setup](setup.md), use one consistent Compose file set for a session:

```bash
docker compose up -d
docker compose ps
docker compose logs --follow --tail=100 app
docker compose down
```

Rebuild after changing the Dockerfile, lockfile, compiled application code, or the pinned provider version:

```bash
docker compose up -d --build
```

Run database operations and inspect installed tools inside the container:

```bash
docker compose exec app node backend/dist/db/status-cli.js
docker compose exec app codex --version
docker compose exec app docker compose version
```

`app_data` retains SQLite and `codex_state` retains container-local provider authentication and sessions across ordinary restarts and `docker compose down`. Their default engine-level names are `agent-insights_app_data` and `agent-insights_codex_state`. Set `AGENT_INSIGHTS_APP_DATA_VOLUME` or `AGENT_INSIGHTS_CODEX_STATE_VOLUME` only when intentionally selecting different volumes. Deleting volumes erases that isolated local state and is not a routine restart operation.

For a trusted target-owned Docker scenario, set `AGENT_INSIGHTS_DOCKER_SOCKET_PATH=/var/run/docker.sock` in `.env` and recreate the service. Leave it as `/dev/null` otherwise. The host and container runtime paths must remain identical; changing `.env` requires recreating the service.
