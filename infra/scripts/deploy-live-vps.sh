#!/usr/bin/env bash
# =============================================================================
# VaksinaMed live VPS auto-deploy (Eskiz / 77.83.206.192)
# Pulls origin/main, rebuilds customer web + API, restarts API.
# Safe to run from cron/systemd every minute — no-ops when already up to date.
# =============================================================================
set -euo pipefail

ROOT="${VAKSINAMED_ROOT:-/var/www/vaksinamed}"
PUBLIC_API_URL="${EXPO_PUBLIC_API_URL:-https://77-83-206-192.sslip.io}"
LOCK_FILE="/var/lock/vaksinamed-live-deploy.lock"
LOG_TAG="vaksinamed-live-deploy"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  log "another deploy is running — skip"
  exit 0
fi

cd "$ROOT"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  log "ERROR: $ROOT is not a git checkout"
  exit 1
fi

# Keep machine-local secrets out of git operations
git fetch --prune origin main

LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse origin/main)"

if [[ "$LOCAL" == "$REMOTE" ]]; then
  log "already on origin/main ($LOCAL) — nothing to do"
  exit 0
fi

log "updating $LOCAL → $REMOTE"

# Source of truth is GitHub. Preserve only untracked env files.
# Discard dirty tracked files left from manual SCP experiments.
git reset --hard origin/main
git clean -fd --exclude=.env --exclude='**/.env' --exclude=uploads --exclude='artifacts/soglom-apteka/dist'

# Install if lockfile / package graph changed (ignore broken Windows-only preinstall issues)
if command -v pnpm >/dev/null 2>&1; then
  log "pnpm install (prefer offline)"
  pnpm install --frozen-lockfile --ignore-scripts || pnpm install --ignore-scripts || true
fi

log "building customer web (API=$PUBLIC_API_URL)"
(
  cd "$ROOT/artifacts/soglom-apteka"
  EXPO_PUBLIC_API_URL="$PUBLIC_API_URL" node scripts/export-web.mjs
)

log "building API"
(
  cd "$ROOT/artifacts/api-server"
  node ./build.mjs
)

if systemctl is-enabled vaksinamed-api >/dev/null 2>&1; then
  log "restarting vaksinamed-api"
  systemctl restart vaksinamed-api
  sleep 1
  systemctl is-active vaksinamed-api >/dev/null
fi

if systemctl is-enabled vaksinamed-worker >/dev/null 2>&1; then
  log "restarting vaksinamed-worker"
  systemctl restart vaksinamed-worker || true
fi

ENTRY="$(grep -oE 'entry-[a-f0-9]+\.js' "$ROOT/artifacts/soglom-apteka/dist/index.html" | head -1 || true)"
log "SUCCESS deployed $(git rev-parse --short HEAD) web=${ENTRY:-unknown}"
logger -t "$LOG_TAG" "deployed $(git rev-parse --short HEAD) entry=${ENTRY:-unknown}"
