#!/usr/bin/env bash
# ==============================================================================
# VaksinaMed Staging — Safe Staging Catalog Data Seeder
# ==============================================================================
# Seeds branches, demo products, and branch stock records in the staging database.
#
# Safety & Invariants:
# 1. Strictly requires APP_ENV=staging and STAGING_DEMO_CATALOG_SEED_ENABLED=true.
# 2. Exclusively inserts into branches, products, and product_stocks.
# 3. Never touches users, orders, cashback, payments, or accounting records.
# 4. Completely idempotent: safe to re-run without creating duplicates.
# ==============================================================================
set -euo pipefail

cd /opt/vaksinamed

if [ -f "infra/docker-compose.staging.yml" ]; then
    COMPOSE_FILE="infra/docker-compose.staging.yml"
elif [ -f "docker-compose.staging.yml" ]; then
    COMPOSE_FILE="docker-compose.staging.yml"
else
    COMPOSE_FILE="infra/docker-compose.staging.yml"
fi

ENV_FILE=".env.staging"

echo "[$(date -u)] Initiating safe staging catalog seed..."
docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" run --rm --no-deps \
  -e APP_ENV=staging \
  -e STAGING_DEMO_CATALOG_SEED_ENABLED=true \
  api node --enable-source-maps dist/seed-staging-catalog.mjs

echo "[$(date -u)] Staging catalog seed finished successfully."
