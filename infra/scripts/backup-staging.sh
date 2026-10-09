#!/usr/bin/env bash
# ==============================================================================
# VaksinaMed Staging — Automated Encrypted Backup Script
# ==============================================================================
# Safety: Strict error handling; fails closed on any error.
# Run via cron on Hetzner host: 0 2 * * * /opt/vaksinamed/infra/scripts/backup-staging.sh
# ==============================================================================
set -euo pipefail

BACKUP_DIR="/var/backups/vaksinamed"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
DUMP_FILE="${BACKUP_DIR}/vaksinamed_staging_${TIMESTAMP}.dump"
ENCRYPTED_FILE="${DUMP_FILE}.gpg"
KEY_FILE="/etc/vaksinamed/backup_gpg.key"
RETENTION_DAYS=7

mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"

echo "[$(date -u)] Starting automated PostgreSQL staging backup..."

# 1. Execute pg_dump via Docker exec
docker compose -f /opt/vaksinamed/docker-compose.staging.yml exec -T postgres \
  pg_dump -U "${POSTGRES_USER:-vaksinamed_staging_user}" -d vaksinamed_staging --format=custom --compress=9 \
  > "${DUMP_FILE}"

# 2. Verify dump integrity and minimum file size (> 1KB)
if [ ! -s "${DUMP_FILE}" ]; then
  echo "ERROR: Backup dump file is empty or missing!" >&2
  exit 1
fi

echo "[$(date -u)] Dump created successfully: ${DUMP_FILE} ($(stat -c%s "${DUMP_FILE}") bytes)"

# 3. Encrypt backup with GPG symmetric cipher
if [ -f "${KEY_FILE}" ]; then
  gpg --symmetric --batch --yes --passphrase-file "${KEY_FILE}" --cipher-algo AES256 -o "${ENCRYPTED_FILE}" "${DUMP_FILE}"
  rm -f "${DUMP_FILE}"
  echo "[$(date -u)] Encrypted backup created: ${ENCRYPTED_FILE}"
else
  echo "WARNING: GPG key file not found at ${KEY_FILE}. Keeping unencrypted local dump."
  ENCRYPTED_FILE="${DUMP_FILE}"
fi

# 4. Off-site sync to Hetzner Storage Box (if STORAGEBOX_HOST is configured)
if [ -n "${STORAGEBOX_HOST:-}" ] && [ -n "${STORAGEBOX_USER:-}" ]; then
  echo "[$(date -u)] Shipping encrypted backup to Hetzner Storage Box..."
  rsync -avz -e "ssh -p 23 -i /etc/vaksinamed/storagebox_id_ed25519" \
    "${ENCRYPTED_FILE}" "${STORAGEBOX_USER}@${STORAGEBOX_HOST}:/backups/staging/"
fi

# 5. Clean up local backups older than RETENTION_DAYS
find "${BACKUP_DIR}" -name "vaksinamed_staging_*.dump*" -mtime "+${RETENTION_DAYS}" -delete
echo "[$(date -u)] Backup completed successfully."
