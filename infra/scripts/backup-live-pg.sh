#!/usr/bin/env bash
# =============================================================================
# VaksinaMed live/staging VPS — local PostgreSQL logical backup
# Target host: Eskiz (host Postgres, not docker-compose).
# Cron/systemd: daily. Restore drill: --restore-drill
# =============================================================================
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/vaksinamed/pg}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
DB_NAME="${DB_NAME:-vaksinamed_staging}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DUMP_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.dump"
LOG_TAG="vaksinamed-pg-backup"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; logger -t "$LOG_TAG" "$*" 2>/dev/null || true; }

mkdir -p "${BACKUP_DIR}"
chown root:postgres "${BACKUP_DIR}"
chmod 750 "${BACKUP_DIR}"

if [[ "${1:-}" == "--restore-drill" ]]; then
  LATEST="$(ls -1t "${BACKUP_DIR}/${DB_NAME}_"*.dump 2>/dev/null | head -1 || true)"
  if [[ -z "${LATEST}" ]]; then
    log "ERROR: no dump found in ${BACKUP_DIR} for restore drill"
    exit 1
  fi
  DRILL_DB="${DB_NAME}_restore_drill"
  TMP_DUMP="$(mktemp /tmp/${DB_NAME}_restore_XXXXXX.dump)"
  cp -f "${LATEST}" "${TMP_DUMP}"
  chmod 644 "${TMP_DUMP}"
  log "restore drill from ${LATEST} → ${DRILL_DB}"
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DRILL_DB}' AND pid <> pg_backend_pid();" >/dev/null || true
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${DRILL_DB};"
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${DRILL_DB};"
  sudo -u postgres pg_restore --dbname="${DRILL_DB}" --no-owner --no-acl "${TMP_DUMP}"
  TABLES="$(sudo -u postgres psql -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';" "${DRILL_DB}")"
  log "restore drill OK tables=${TABLES} db=${DRILL_DB}"
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${DRILL_DB};"
  rm -f "${TMP_DUMP}"
  log "restore drill cleaned up"
  exit 0
fi

log "starting pg_dump db=${DB_NAME}"
# Write as root: postgres cannot create files in root-owned BACKUP_DIR.
sudo -u postgres pg_dump \
  --format=custom \
  --compress=9 \
  "${DB_NAME}" > "${DUMP_FILE}"
chown root:postgres "${DUMP_FILE}"
chmod 640 "${DUMP_FILE}"

if [[ ! -s "${DUMP_FILE}" ]]; then
  log "ERROR: dump missing or empty: ${DUMP_FILE}"
  rm -f "${DUMP_FILE}"
  exit 1
fi

BYTES="$(stat -c%s "${DUMP_FILE}")"
if [[ "${BYTES}" -lt 1024 ]]; then
  log "ERROR: dump too small (${BYTES} bytes)"
  rm -f "${DUMP_FILE}"
  exit 1
fi

# Integrity check without restoring (file TOC only — run as root)
pg_restore --list "${DUMP_FILE}" >/dev/null
log "dump OK file=${DUMP_FILE} bytes=${BYTES}"

find "${BACKUP_DIR}" -name "${DB_NAME}_*.dump" -type f -mtime "+${RETENTION_DAYS}" -delete
REMAINING="$(ls -1 "${BACKUP_DIR}/${DB_NAME}_"*.dump 2>/dev/null | wc -l | tr -d ' ')"
log "backup completed retention_days=${RETENTION_DAYS} remaining=${REMAINING}"
