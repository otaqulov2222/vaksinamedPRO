#!/bin/bash
set -euo pipefail
echo ===REDIS_PING===
redis-cli -h 127.0.0.1 ping
echo ===REDIS_URL_META===
python3 - <<'PY'
import re
env = open("/var/www/vaksinamed/.env").read()
m = re.search(r"^REDIS_URL=(.*)$", env, re.M)
url = (m.group(1).strip().strip('"').strip("'") if m else "")
print("REDIS_URL_SET", bool(url))
print("REDIS_SCHEME", url.split(":", 1)[0] if url else "MISSING")
print("REDIS_HAS_AUTH", "@" in url)
print("REDIS_HOST_HINT", "127.0.0.1" if "127.0.0.1" in url or "localhost" in url else "other")
PY
echo ===LOGIN_PROBES===
for i in 1 2 3; do
  code=$(curl -sS -o /tmp/vm-login-probe.json -w "%{http_code}" \
    -X POST http://127.0.0.1:5000/api/admin/login \
    -H "Content-Type: application/json" \
    -d '{"email":"ops-probe@example.com","password":"wrong"}' || true)
  echo "probe_$i http=$code"
done
echo ===REDIS_KEYS===
redis-cli -h 127.0.0.1 DBSIZE
redis-cli -h 127.0.0.1 --scan --pattern 'rl:*' | head -n 20
echo ===API_JOURNAL_REDIS===
journalctl -u vaksinamed-api -n 200 --no-pager | grep -iE 'redis|RATE_LIMIT' | tail -n 20 || true
