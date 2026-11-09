#!/usr/bin/env bash
# Read-only audit for Eskiz self-managed hardening (no secret values printed).
set -euo pipefail

echo "=== PG ==="
systemctl is-active postgresql
sudo -u postgres psql -d postgres -tAc "SHOW wal_level;"
sudo -u postgres psql -d postgres -tAc "SHOW archive_mode;"
sudo -u postgres psql -d postgres -tAc "SHOW max_wal_senders;"
echo "--- backups ---"
ls -lah /var/backups/vaksinamed/pg 2>/dev/null | tail -12 || echo "missing backup dir"
systemctl is-enabled vaksinamed-pg-backup.timer 2>/dev/null || true
systemctl show vaksinamed-pg-backup.timer -p LastTriggerUSec -p NextElapseUSecRealtime --no-pager 2>/dev/null || true
journalctl -u vaksinamed-pg-backup.service -n 12 --no-pager 2>/dev/null || true
test -x /usr/local/bin/vaksinamed-pg-backup.sh && echo "backup_script=OK" || echo "backup_script=MISSING"

echo "=== REDIS ==="
systemctl is-active redis-server || systemctl is-active redis
REDIS_PASS="$(python3 - <<'PY'
import re
from urllib.parse import urlparse, unquote
env = open("/var/www/vaksinamed/.env").read()
m = re.search(r"^REDIS_URL=(.*)$", env, re.M)
url = (m.group(1).strip().strip('"').strip("'") if m else "")
u = urlparse(url) if url else None
print(unquote(u.password) if u and u.password else "")
PY
)"
AUTH_ARGS=()
if [[ -n "$REDIS_PASS" ]]; then AUTH_ARGS=(-a "$REDIS_PASS" --no-auth-warning); fi
redis-cli -h 127.0.0.1 "${AUTH_ARGS[@]}" PING
REQ="$(redis-cli -h 127.0.0.1 "${AUTH_ARGS[@]}" CONFIG GET requirepass | tail -1)"
if [[ -z "$REQ" ]]; then echo "requirepass=EMPTY"; else echo "requirepass=SET len=${#REQ}"; fi
grep -E '^(bind |requirepass |port |protected-mode |tls-)' /etc/redis/redis.conf 2>/dev/null | sed -E 's/^(requirepass ).*/\1***MASKED***/' | head -20
ss -lntp | grep -E ':6379|:5432' || true

echo "=== ENV presence ==="
python3 - <<'PY'
import re
env = open("/var/www/vaksinamed/.env").read()
for k in ["APP_ENV", "REDIS_URL", "DATABASE_URL", "MERCHANT_SECRET_KEK"]:
    m = re.search(rf"^{k}=(.*)$", env, re.M)
    v = (m.group(1).strip().strip('"').strip("'") if m else "")
    if k == "REDIS_URL":
        print(k, "SET" if v else "MISSING",
              f"scheme={v.split(':',1)[0] if v else '-'}",
              f"auth={'yes' if '@' in v else 'no'}",
              f"local={'yes' if ('127.0.0.1' in v or 'localhost' in v) else 'no'}")
    elif k == "MERCHANT_SECRET_KEK":
        print(k, "SET" if v else "MISSING", f"len={len(v)}" if v else "")
    elif k == "DATABASE_URL":
        print(k, "SET" if v else "MISSING", f"scheme={v.split(':',1)[0] if v else '-'}")
    else:
        print(k, v or "MISSING")
PY

echo "=== ENC rows (counts only) ==="
sudo -u postgres psql -d vaksinamed_staging -tAc \
  "SELECT 'payme_enc=' || COUNT(*) FILTER (WHERE payme_key LIKE 'enc:v1:%')
          || ' payme_plain=' || COUNT(*) FILTER (WHERE length(payme_key)>0 AND payme_key NOT LIKE 'enc:v1:%')
          || ' click_enc=' || COUNT(*) FILTER (WHERE click_secret LIKE 'enc:v1:%')
          || ' click_plain=' || COUNT(*) FILTER (WHERE length(click_secret)>0 AND click_secret NOT LIKE 'enc:v1:%')
   FROM branches;"

echo "=== DONE ==="
