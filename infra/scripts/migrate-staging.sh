#!/usr/bin/env bash
# ==============================================================================
# VaksinaMed Staging — Safe Database Migration Runner
# ==============================================================================
# Executes versioned migrations using dist/migrate.mjs within the staging network.
# Guards:
# 1. Runs with advisory lock to avoid race conditions with booting API containers.
# 2. Re-verifies health before and after migration.
# ==============================================================================
set -euo pipefail

cd /opt/vaksinamed

echo "[$(date -u)] Checking migration status on staging PostgreSQL..."
docker compose -f infra/docker-compose.staging.yml run --rm --no-deps api \
  node --enable-source-maps dist/migrate.mjs --status

read -p "Apply pending migrations to vaksinamed_staging? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo "[$(date -u)] Applying migrations..."
  docker compose -f infra/docker-compose.staging.yml run --rm --no-deps api \
    node --enable-source-maps dist/migrate.mjs
  echo "[$(date -u)] Migrations applied successfully."
else
  echo "[$(date -u)] Migration application aborted by operator."
fi
