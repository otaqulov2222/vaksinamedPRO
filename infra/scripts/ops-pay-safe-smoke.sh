#!/bin/bash
# Safe Payme/Click smoke for pilot branch — READ/PROBE only.
# Does NOT create orders, does NOT capture money, does NOT edit .env / DB secrets.
set -euo pipefail

BASE="${BASE_URL:-https://77-83-206-192.sslip.io}"
BRANCH_ID="${PILOT_BRANCH_ID:-94}"

pass=0
fail=0
ok() { echo "PASS  $*"; pass=$((pass+1)); }
bad() { echo "FAIL  $*"; fail=$((fail+1)); }

echo "=== SAFE PAYMENT SMOKE (no writes to business state) ==="
echo "base=$BASE branchId=$BRANCH_ID"

# 1) Methods for pilot branch
methods=$(curl -fsS --max-time 15 "$BASE/api/payments/methods?branchId=$BRANCH_ID")
echo "$methods" | grep -q '"id":"payme"[^}]*"available":true' && ok "payme available for branch $BRANCH_ID" || bad "payme not available: $methods"
echo "$methods" | grep -q '"id":"click"[^}]*"available":true' && ok "click available for branch $BRANCH_ID" || bad "click not available: $methods"
echo "$methods" | grep -q '"notes":{"payme":"ready","click":"ready"}' && ok "notes ready/ready" || bad "notes not ready: $methods"

# 2) Other branch should NOT suddenly look configured without branch keys
other=$(curl -fsS --max-time 15 "$BASE/api/payments/methods?branchId=1")
echo "$other" | grep -q '"payme":"merchant_keys_missing"\|"configured":false' && ok "non-pilot branch stays unconfigured (branch 1)" || echo "WARN  branch 1 response: $other"

# 3) Merchant endpoints respond (invalid auth → provider error, not 5xx)
payme_body='{"id":1,"method":"CheckPerformTransaction","params":{"amount":100000,"account":{"order_id":"SAFE-SMOKE-NOOP"}}}'
payme_code=$(curl -sS -o /tmp/vm-payme-smoke.json -w "%{http_code}" --max-time 15 \
  -X POST "$BASE/api/payments/payme/merchant" \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic $(printf 'Paycom:invalid-smoke' | base64 -w0 2>/dev/null || printf 'Paycom:invalid-smoke' | base64)" \
  -d "$payme_body" || true)
payme_json=$(cat /tmp/vm-payme-smoke.json 2>/dev/null || true)
if [[ "$payme_code" =~ ^2 ]]; then
  ok "payme merchant HTTP $payme_code (handled)"
else
  # Some stacks return 401/403 for bad basic auth — still not 5xx
  if [[ "$payme_code" =~ ^[45] ]] && [[ ! "$payme_code" =~ ^5 ]]; then
    ok "payme merchant HTTP $payme_code (auth rejected cleanly)"
  else
    bad "payme merchant HTTP $payme_code body=${payme_json:0:200}"
  fi
fi
echo "$payme_json" | grep -qiE 'error|AccessDeny|-32504|auth' && ok "payme rejects invalid auth without crash" || echo "INFO payme body=${payme_json:0:180}"

click_code=$(curl -sS -o /tmp/vm-click-smoke.json -w "%{http_code}" --max-time 15 \
  -X POST "$BASE/api/payments/click/merchant" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data "click_trans_id=1&service_id=0&merchant_trans_id=SAFE-SMOKE&amount=1000&action=0&sign_time=2026-01-01&sign_string=deadbeef" || true)
click_json=$(cat /tmp/vm-click-smoke.json 2>/dev/null || true)
if [[ "$click_code" =~ ^2 ]]; then
  ok "click merchant HTTP $click_code (handled)"
else
  if [[ "$click_code" =~ ^[45] ]] && [[ ! "$click_code" =~ ^5 ]]; then
    ok "click merchant HTTP $click_code (rejected cleanly)"
  else
    bad "click merchant HTTP $click_code body=${click_json:0:200}"
  fi
fi
echo "$click_json" | grep -qiE 'error|sign|-1|Access' && ok "click rejects bad signature without crash" || echo "INFO click body=${click_json:0:180}"

# 4) Health still up after probes
health=$(curl -fsS --max-time 10 "$BASE/api/healthz")
echo "$health" | grep -q '"status":"ok"' && ok "healthz still ok" || bad "healthz broken: $health"
echo "$health" | grep -q '"database":"up"' && ok "database still up" || bad "database not up: $health"

echo "=== SUMMARY pass=$pass fail=$fail ==="
if [[ "$fail" -gt 0 ]]; then
  exit 1
fi
exit 0
