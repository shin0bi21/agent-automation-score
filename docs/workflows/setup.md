# Local setup

## Requirements

- Node.js 22 or newer
- Git
- an authenticated CLI or API configuration for the selected agent provider
- tools required by the attached target repository
- Docker Desktop, or Docker Engine with Compose, when using the optional container runtime or a target-owned Docker scenario

## Prepare the application

```bash
npm install
npm run db:migrate
npm run db:status
```

Start the host application with `npm start` whenever Session Review should read sessions from the desktop Codex application. The preflight reports the resolved Codex home and stored-session count before the web server starts.

The SQLite database is created under ignored `data/` storage by default. Do not commit database, WAL, run, log, or provider credential files.

Validate the checkout before a real run:

```bash
npm run validate:skills
npm run validate:docs
npm run backend:check
npm test
npm run web:check
npm run test:web
```

Use a dry run to validate a scenario and matrix without spending provider tokens. A real run uses the permissions and provider authentication of the terminal user.

## Docker setup

Docker is an isolated alternative for Benchmark Lab and container-owned Codex usage. It does not mount the host Codex home because that directory contains credentials and private session data. Use the native `npm start` path for host Session Review.

Docker is an alternative to installing Node.js dependencies on the host. Copy the non-secret template and replace both placeholder paths with absolute host paths:

```bash
cp .env.example .env
mkdir -p /absolute/path/to/agent-insights-runtime
docker compose config
docker compose build
```

`AGENT_INSIGHTS_REPOSITORY_PATH` identifies the one attached Git repository. `AGENT_INSIGHTS_RUNTIME_PATH` is a dedicated disposable worktree directory. Both are mounted at the same absolute paths inside the container; do not point either value at a home directory or broad source root.

Authenticate the container-installed Codex provider into its dedicated named volume:

```bash
docker compose run --rm app codex
```

Complete sign-in, then exit the interactive CLI. Start the default application stack without host Docker access:

```bash
docker compose up -d
docker compose ps
```

Open `http://127.0.0.1:4173`. The container is Linux, so the macOS folder picker is unavailable; enter the exact `AGENT_INSIGHTS_REPOSITORY_PATH` value and select **Connect**.

Sessions shown by this container come only from its `codex_state` volume. Resetting that volume resets the container's session list; it does not affect or import sessions from the desktop Codex application.

If the selected target repository or scenario launches Docker, set this only after confirming that the repository and prompt are trusted:

```bash
AGENT_INSIGHTS_DOCKER_SOCKET_PATH=/var/run/docker.sock
docker compose up -d
```

The socket setting grants the application host-level container control. Leave it as `/dev/null` for ordinary runs. Docker Desktop or the host daemon must be allowed to share both configured paths.

The image includes Node.js, npm, Git, SSH, Codex, and Docker CLI. A target repository that requires another language or operating-system package needs a deliberate Dockerfile extension; use the native startup path until that toolchain is supported.
