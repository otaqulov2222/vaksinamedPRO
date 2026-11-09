#!/bin/bash
# Redis live verify — AUTH from REDIS_URL if present (never prints password).
set -euo pipefail

META="$(python3 - <<'PY'
import re
from urllib.parse import urlparse, unquote
from pathlib import Path
env = open("/var/www/vaksinamed/.env").read()
m = re.search(r"^REDIS_URL=(.*)$", env, re.M)
url = (m.group(1).strip().strip('"').strip("'") if m else "")
print(f"REDIS_URL_SET={'1' if url else '0'}")
print(f"REDIS_SCHEME={(url.split(':',1)[0] if url else 'MISSING')}")
host, port, passwd = "127.0.0.1", "6379", ""
if url:
    u = urlparse(url)
    host = u.hostname or "127.0.0.1"
    port = str(u.port or 6379)
    passwd = unquote(u.password) if u.password else ""
print(f"REDIS_HOST={host}")
print(f"REDIS_PORT={port}")
print(f"REDIS_HAS_AUTH={'1' if passwd else '0'}")
Path("/tmp/vm-redis-auth.env").write_text(passwd)
Path("/tmp/vm-redis-auth.env").chmod(0o600)
PY
)"

echo "===REDIS_META==="
echo "$META"

REDIS_HOST="$(echo "$META" | awk -F= '/^REDIS_HOST=/{print $2}')"
REDIS_PORT="$(echo "$META" | awk -F= '/^REDIS_PORT=/{print $2}')"
REDIS_PASS="$(cat /tmp/vm-redis-auth.env)"
rm -f /tmp/vm-redis-auth.env

AUTH_ARGS=()
if [[ -n "$REDIS_PASS" ]]; then
  AUTH_ARGS=(-a "$REDIS_PASS" --no-auth-warning)
fi

echo "===REDIS_PING==="
redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" "${AUTH_ARGS[@]}" ping

echo "===LOGIN_PROBES==="
for i in 1 2 3; do
  code=$(curl -sS -o /tmp/vm-login-probe.json -w "%{http_code}" \
    -X POST http://127.0.0.1:5000/api/admin/login \
    -H "Content-Type: application/json" \
    -d '{"email":"ops-probe@example.com","password":"wrong"}' || true)
  echo "probe_$i http=$code"
done

echo "===REDIS_KEYS==="
redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" "${AUTH_ARGS[@]}" DBSIZE
redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" "${AUTH_ARGS[@]}" --scan --pattern 'rl:*' | head -n 20 || true

echo "===API_JOURNAL_REDIS==="
journalctl -u vaksinamed-api -n 200 --no-pager | grep -iE 'redis|RATE_LIMIT' | tail -n 20 || true
