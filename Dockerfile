# syntax=docker/dockerfile:1.7

FROM docker:29-cli AS docker-cli

FROM node:22-bookworm-slim AS dependency-base
RUN apt-get update \
  && apt-get install -y --no-install-recommends build-essential python3 \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./

FROM dependency-base AS development-dependencies
RUN npm ci

FROM dependency-base AS production-dependencies
RUN npm ci --omit=dev

FROM development-dependencies AS build
COPY . .
RUN npm run web:build
RUN npm run backend:build

FROM node:22-bookworm-slim AS runtime
ARG CODEX_VERSION=0.147.0
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl git openssh-client \
  && rm -rf /var/lib/apt/lists/*
COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker-cli /usr/local/libexec/docker/cli-plugins/docker-compose /usr/local/libexec/docker/cli-plugins/docker-compose
RUN npm install --global "@openai/codex@${CODEX_VERSION}"

WORKDIR /app
COPY package.json package-lock.json ./
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/frontend/dist ./frontend/dist
COPY backend/db/migrations ./backend/db/migrations
COPY benchmarks ./benchmarks

RUN mkdir -p /data /root/.codex

ENV NODE_ENV=production \
  AGENT_INSIGHTS_HOST=0.0.0.0 \
  AGENT_INSIGHTS_DB_PATH=/data/agent-insights.sqlite \
  BENCHMARK_WEB_PORT=4173 \
  HOME=/root \
  CODEX_HOME=/root/.codex

EXPOSE 4173
VOLUME ["/data", "/root/.codex"]
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD curl --fail --silent http://127.0.0.1:4173/api/health || exit 1

CMD ["node", "backend/dist/benchmark-web-server.js"]
