# ZAUQ backend — Express + Prisma + local matting (onnxruntime).
#
# Migrations run on boot (prisma migrate deploy). deploy/deploy.sh also runs
# them from the freshly built image *before* the old backend is stopped;
# `migrate deploy` only applies pending migrations, so the second pass at
# boot is a no-op and a first boot on a new box still migrates on its own.
#
# The API runs as the unprivileged `node` user (uid 1000). The container
# starts as root only long enough for docker-entrypoint.sh to make sure the
# uploads/models volumes belong to that user (volumes created by the old
# root-run image are root-owned; named volumes only copy ownership from the
# image when they are first created), then drops privileges with setpriv.
#
# Base image pinned to a full version: bump deliberately (Dependabot opens
# the PR), never by re-resolving a floating tag on the VPS.

FROM node:22.23.2-slim AS build
# python3/make/g++ are only a fallback: bcrypt, sharp and onnxruntime-node
# all ship prebuilt linux-x64 glibc binaries, but if a download fails the
# install compiles from source instead of failing the deploy. Build stage
# only — nothing here reaches the runtime image.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
# Full install (not --prod): the prisma CLI that runs `migrate deploy` in
# the runtime image is a devDependency.
RUN pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

FROM node:22.23.2-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates curl fontconfig \
  && rm -rf /var/lib/apt/lists/*
# The Atelier faces, for server-rendered share cards.
COPY assets/fonts/*.ttf /usr/share/fonts/truetype/atelier/
RUN fc-cache -f
ENV NODE_ENV=production
WORKDIR /app
# --chown on each COPY instead of a trailing `chown -R`, which would
# duplicate the (large) node_modules into another layer.
COPY --chown=node:node --from=build /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/dist ./dist
COPY --chown=node:node package.json ./
COPY --chown=node:node prisma ./prisma
COPY --chown=node:node assets ./assets
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod 0755 /usr/local/bin/docker-entrypoint.sh \
  && chown node:node /app \
  && mkdir -p /app/uploads /app/models \
  && chown node:node /app/uploads /app/models

# uploads (user images) and models (matting weights) live on volumes.
VOLUME ["/app/uploads", "/app/models"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -fsS http://localhost:3000/api/health || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
# `exec` so node replaces the shell and receives SIGTERM directly — the
# graceful shutdown in src/index.ts never ran while sh sat in between.
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && exec node dist/index.js"]
