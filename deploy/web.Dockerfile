# AI Fashion web — builds the Vite frontend and serves it with Caddy,
# which also terminates TLS and proxies /api and /vote to the backend.
# Build context: repo root.

FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
RUN corepack prepare pnpm@10.11.0 --activate && pnpm install --frozen-lockfile
COPY frontend/ ./
RUN pnpm build

FROM caddy:2
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv/www
