# Docker development

Docker is an optional packaging boundary for the existing application, not a second architecture. The image builds the Vite client and TypeScript backend, then runs the compiled Express service with SQLite, Git, Docker CLI tooling, and the currently pinned Codex CLI.

## File ownership

| Path | Owns |
|---|---|
| `Dockerfile` | Multi-stage dependencies, application builds, runtime tools, health check, and process command |
| `.dockerignore` | Build-context privacy and size boundary |
| `docker-compose.yml` | Loopback port, persistent application/provider volumes, explicit repository/runtime mounts, and environment-controlled Docker socket access |
| `.env.example` | Non-secret local paths, Docker access, and version template |

## Required invariants

- Keep host exposure on `127.0.0.1`; `0.0.0.0` is only the container-internal bind address.
- Mount exactly the selected repository rather than a home directory or broad source root.
- Mount the runtime directory at the same absolute path on host and container. Nested Docker receives host-resolvable worktree paths from that directory.
- Keep SQLite and provider state in separate named volumes. Explicit `AGENT_INSIGHTS_APP_DATA_VOLUME` and `AGENT_INSIGHTS_CODEX_STATE_VOLUME` overrides opt into different state. Never bake either into an image or commit them.
- Keep the host Codex home outside the container boundary. It contains credentials and private sessions; native `npm start` owns desktop Session Review, while Docker sees only its isolated `codex_state` volume.
- Keep the Docker socket unusable by default with `AGENT_INSIGHTS_DOCKER_SOCKET_PATH=/dev/null`. Opting into `/var/run/docker.sock` is privileged and only applies to trusted scenarios or repositories that launch Docker.
- Pin provider tooling through a build argument and document upgrades. Provider installation belongs in a replaceable image layer; application code remains provider-neutral.
- Run compiled backend code in production mode. Native development continues to use `tsx` and Vite watchers.
- Treat target-repository toolchains as an explicit compatibility boundary. The base image supplies Node.js, npm, Git, SSH, Codex, and Docker CLI; repositories that require other languages or system packages need a deliberate image extension or the native runtime.

## Changing the setup

Validate environment interpolation with `docker compose config` in both default and Docker-enabled modes, then build the image, start it, wait for a healthy service, inspect `/api/health`, verify the provider CLI version, and check database migration status inside the container. Test socket access separately because image success does not prove host Docker access or symmetric-path behavior.
