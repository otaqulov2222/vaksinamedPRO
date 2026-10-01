# Production-safe multi-stage API image (cloud-neutral).
# Secrets MUST be injected at runtime via env — never bake secrets into layers.
#
# Build from monorepo root:
#   docker build -t vaksinamed-api .
#
# Run (example — secrets from env file not committed):
#   docker run --rm -p 5000:5000 --env-file .env.production vaksinamed-api

FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.15.0 --activate

# Full workspace members must exist for pnpm workspace install (even if unused in image).
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json .npmrc ./
COPY lib ./lib
COPY artifacts ./artifacts
COPY scripts ./scripts

RUN pnpm install --frozen-lockfile --filter @workspace/api-server... \
  && pnpm --filter @workspace/api-server run build

# Production-only node_modules: the bundle keeps ioredis and @electric-sql/pglite external (build.mjs).
FROM node:22-bookworm-slim AS prod-deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.15.0 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json .npmrc ./
COPY lib ./lib
COPY artifacts ./artifacts
COPY scripts ./scripts
RUN pnpm install --frozen-lockfile --prod --no-optional --filter @workspace/api-server...

FROM node:22-bookworm-slim AS runtime
# Mirrors the workspace layout so pnpm symlinks resolve and getMigrationsFolder() finds ../../lib/db/migrations.
WORKDIR /app/artifacts/api-server
ENV NODE_ENV=production
ENV APP_ENV=production
ENV PORT=5000
# Fail-closed defaults — operators must override explicitly
ENV PAYME_MERCHANT_API_ENABLED=0
ENV CLICK_MERCHANT_API_ENABLED=0
ENV ENABLE_BACKGROUND_WORKERS=0

RUN useradd --system --uid 10001 --create-home appuser \
  && apt-get update && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=prod-deps /app/node_modules /app/node_modules
COPY --from=prod-deps /app/artifacts/api-server/node_modules ./node_modules
COPY --from=build /app/artifacts/api-server/dist ./dist
COPY --from=build /app/artifacts/api-server/package.json ./package.json
COPY --from=build /app/lib/db/migrations /app/lib/db/migrations

USER appuser
EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/api/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# API by default. Worker (same image, no HTTP port — disable the HEALTHCHECK for it):
#   CMD ["node", "--enable-source-maps", "dist/worker.mjs"]  with ENABLE_BACKGROUND_WORKERS=1
# Migration release step (one-off, before API/worker rollout; `--status` is read-only):
#   CMD ["node", "--enable-source-maps", "dist/migrate.mjs"]
CMD ["node", "--enable-source-maps", "dist/index.mjs"]
