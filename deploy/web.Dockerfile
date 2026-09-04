# ZAUQ web — builds the Vite frontend and serves it with Caddy,
# which also terminates TLS and proxies /api and /vote to the backend.
# Build context: repo root. The frontend depends on the workspace package
# `packages/shared`, so the workspace root is installed, filtered to the
# frontend and what it needs.
#
# Both base images are pinned to full versions (Dependabot bumps them).

FROM node:22.23.2-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/shared/package.json ./packages/shared/
COPY frontend/package.json ./frontend/
RUN pnpm install --frozen-lockfile --filter ai-fashion-frontend...
COPY packages/shared ./packages/shared
COPY frontend ./frontend
RUN pnpm --filter ai-fashion-frontend build

FROM caddy:2.11.4
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/frontend/dist /srv/www
