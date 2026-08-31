# AI Fashion backend — Express + Prisma + local matting (onnxruntime).
# Migrations run automatically on boot (prisma migrate deploy).

FROM node:22-slim AS build
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

FROM node:22-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY prisma ./prisma
COPY assets ./assets

# uploads (user images) and models (matting weights) live on volumes.
VOLUME ["/app/uploads", "/app/models"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -fsS http://localhost:3000/api/health || exit 1

CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/index.js"]
