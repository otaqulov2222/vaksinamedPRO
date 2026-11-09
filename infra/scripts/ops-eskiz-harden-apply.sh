#!/usr/bin/env bash
# =============================================================================
# Eskiz VPS self-managed hardening (NOT cloud managed PITR/Redis/KMS).
# Safe defaults: localhost-only services, Redis AUTH, logical restore drill,
# optional WAL archive for local continuous recovery.
#
# Usage:
#   bash ops-eskiz-harden-apply.sh --apply
#   bash ops-eskiz-harden-apply.sh --apply --enable-wal
# =============================================================================
set -euo pipefail

APPLY=0
ENABLE_WAL=0
for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=1 ;;
    --enable-wal) ENABLE_WAL=1 ;;
    *) echo "Unknown arg: $arg"; exit 2 ;;
  esac
done

if [[ "$APPLY" != "1" ]]; then
  echo "Dry mode. Pass --apply to execute."
  exit 0
fi

ENV_FILE="/var/www/vaksinamed/.env"
BACKUP_SCRIPT="/usr/local/bin/vaksinamed-pg-backup.sh"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
LOG_TAG="vaksinamed-harden"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; logger -t "$LOG_TAG" "$*" 2>/dev/null || true; }

[[ -f "$ENV_FILE" ]] || { echo "Missing $ENV_FILE"; exit 1; }
cp -a "$ENV_FILE" "${ENV_FILE}.bak.${STAMP}"
chmod 600 "${ENV_FILE}.bak.${STAMP}"
log "env backup → ${ENV_FILE}.bak.${STAMP}"

# ── 1) Redis AUTH (localhost bind already OK) ────────────────────────────────
REDIS_CONF="/etc/redis/redis.conf"
CURRENT_PASS="$(redis-cli -h 127.0.0.1 CONFIG GET requirepass | tail -1 || true)"
if [[ -n "${CURRENT_PASS}" ]]; then
  REDIS_PASS="$CURRENT_PASS"
  log "redis requirepass already set (reusing, not printing)"
else
  REDIS_PASS="$(openssl rand -hex 32)"
  log "generated new redis requirepass"
fi

# Persist to redis.conf
if grep -qE '^requirepass ' "$REDIS_CONF"; then
  sed -i -E "s|^requirepass .*|requirepass ${REDIS_PASS}|" "$REDIS_CONF"
elif grep -qE '^# *requirepass ' "$REDIS_CONF"; then
  sed -i -E "s|^# *requirepass .*|requirepass ${REDIS_PASS}|" "$REDIS_CONF"
else
  printf '\nrequirepass %s\n' "$REDIS_PASS" >> "$REDIS_CONF"
fi

# Live set (before API restart)
redis-cli -h 127.0.0.1 CONFIG SET requirepass "$REDIS_PASS" >/dev/null
redis-cli -h 127.0.0.1 -a "$REDIS_PASS" --no-auth-warning PING | grep -q PONG
log "redis AUTH active"

# Update REDIS_URL in .env (hex password → no URL encoding needed)
NEW_REDIS_URL="redis://:${REDIS_PASS}@127.0.0.1:6379/0"
python3 - <<PY
from pathlib import Path
path = Path("$ENV_FILE")
text = path.read_text()
import re
if re.search(r"^REDIS_URL=", text, re.M):
    text = re.sub(r"^REDIS_URL=.*$", "REDIS_URL=${NEW_REDIS_URL}", text, count=1, flags=re.M)
else:
    text = text.rstrip() + "\nREDIS_URL=${NEW_REDIS_URL}\n"
path.write_text(text)
path.chmod(0o600)
print("REDIS_URL updated (auth=yes, host=127.0.0.1)")
PY

systemctl restart vaksinamed-api
systemctl restart vaksinamed-worker || true
sleep 2
systemctl is-active vaksinamed-api
redis-cli -h 127.0.0.1 -a "$REDIS_PASS" --no-auth-warning PING | grep -q PONG
curl -fsS -o /dev/null -w "healthz_http=%{http_code}\n" http://127.0.0.1:5000/api/healthz || \
  curl -fsS -o /dev/null -w "healthz_http=%{http_code}\n" http://127.0.0.1:3000/api/healthz || true
log "api restarted with REDIS_URL auth"

# ── 2) Logical restore drill ─────────────────────────────────────────────────
if [[ -x "$BACKUP_SCRIPT" ]]; then
  log "running restore drill"
  "$BACKUP_SCRIPT" --restore-drill
else
  log "WARN: backup script missing at $BACKUP_SCRIPT"
fi

# Fresh dump after harden
if [[ -x "$BACKUP_SCRIPT" ]]; then
  log "taking fresh logical dump"
  "$BACKUP_SCRIPT"
fi

# ── 3) Optional WAL archive (local continuous recovery; needs PG restart) ────
if [[ "$ENABLE_WAL" == "1" ]]; then
  DATA_DIR="$(sudo -u postgres psql -d postgres -tAc 'SHOW data_directory;')"
  WAL_DIR="/var/lib/postgresql/wal_archive"
  mkdir -p "$WAL_DIR"
  chown postgres:postgres "$WAL_DIR"
  chmod 700 "$WAL_DIR"

  CONF_DIR="$(dirname "$DATA_DIR")"
  # Ubuntu packages often use /etc/postgresql/<ver>/main/postgresql.conf
  PG_CONF="$(ls /etc/postgresql/*/main/postgresql.conf 2>/dev/null | head -1 || true)"
  [[ -n "$PG_CONF" ]] || { echo "postgresql.conf not found"; exit 1; }

  # Idempotent settings via conf.d drop-in
  DROP_IN_DIR="$(dirname "$PG_CONF")/conf.d"
  mkdir -p "$DROP_IN_DIR"
  cat > "$DROP_IN_DIR/99-vaksinamed-wal-archive.conf" <<EOF
# VaksinaMed Eskiz self-managed WAL archive (not cloud PITR)
wal_level = replica
archive_mode = on
archive_command = 'test ! -f ${WAL_DIR}/%f && cp %p ${WAL_DIR}/%f'
archive_timeout = 300
EOF
  chown postgres:postgres "$DROP_IN_DIR/99-vaksinamed-wal-archive.conf"
  chmod 644 "$DROP_IN_DIR/99-vaksinamed-wal-archive.conf"
  log "wrote WAL drop-in; restarting postgresql (brief downtime)"
  systemctl restart postgresql
  sleep 2
  systemctl is-active postgresql
  sudo -u postgres psql -d postgres -tAc "SHOW archive_mode;"
  sudo -u postgres psql -d postgres -tAc "SHOW archive_command;"
  # Force a switch to prove archive_command works
  sudo -u postgres psql -d postgres -c "SELECT pg_switch_wal();" >/dev/null
  sleep 1
  ARCH_COUNT="$(find "$WAL_DIR" -type f | wc -l | tr -d ' ')"
  log "wal_archive_files=${ARCH_COUNT}"
  systemctl restart vaksinamed-api
  systemctl restart vaksinamed-worker || true
  sleep 2
  systemctl is-active vaksinamed-api
fi

# ── 4) Evidence summary (no secrets) ─────────────────────────────────────────
python3 - <<'PY'
import re
env = open("/var/www/vaksinamed/.env").read()
m = re.search(r"^REDIS_URL=(.*)$", env, re.M)
v = (m.group(1).strip().strip('"').strip("'") if m else "")
print("EVIDENCE REDIS_URL_SET", bool(v))
print("EVIDENCE REDIS_AUTH", "@" in v)
print("EVIDENCE REDIS_LOCAL", "127.0.0.1" in v or "localhost" in v)
print("EVIDENCE KEK_SET", bool(re.search(r"^MERCHANT_SECRET_KEK=.+$", env, re.M)))
PY
echo "EVIDENCE REDIS_REQUIREPASS=$(redis-cli -h 127.0.0.1 -a "$REDIS_PASS" --no-auth-warning CONFIG GET requirepass | tail -1 | awk '{print (length($0)>0)?"SET":"EMPTY"}')"
echo "EVIDENCE ARCHIVE_MODE=$(sudo -u postgres psql -d postgres -tAc 'SHOW archive_mode;')"
echo "EVIDENCE BACKUPS=$(ls /var/backups/vaksinamed/pg/*.dump 2>/dev/null | wc -l | tr -d ' ')"
log "harden apply completed"
