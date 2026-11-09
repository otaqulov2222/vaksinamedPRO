#!/bin/bash
set -euo pipefail
set -a
. /var/www/vaksinamed/.env
set +a
echo "=== FLAGS ==="
echo "APP_ENV=${APP_ENV:-} PAYME=${PAYME_MERCHANT_API_ENABLED:-} CLICK=${CLICK_MERCHANT_API_ENABLED:-} SIM=${ALLOW_PAYMENT_SIMULATE:-} PAYME_LIVE=${PAYME_LIVE:-} CLICK_LIVE=${CLICK_LIVE:-}"
echo "=== BRANCH MERCHANTS (presence only) ==="
psql "$DATABASE_URL" -Atc "
SELECT id || '|' || coalesce(code,'') || '|' || coalesce(name,'')
  || '|payme=' || CASE WHEN length(trim(coalesce(payme_merchant_id,'')))>0 OR length(trim(coalesce(payme_key,'')))>0 THEN 'yes' ELSE 'no' END
  || '|click=' || CASE WHEN length(trim(coalesce(click_merchant_id,'')))>0 OR length(trim(coalesce(click_service_id,'')))>0 OR length(trim(coalesce(click_secret,'')))>0 THEN 'yes' ELSE 'no' END
FROM branches
ORDER BY id;
" | awk -F'|' '$0 ~ /payme=yes/ || $0 ~ /click=yes/ {print}'
echo "=== COUNTS ==="
psql "$DATABASE_URL" -Atc "
SELECT
  count(*) FILTER (WHERE length(trim(coalesce(payme_merchant_id,'')))>0 OR length(trim(coalesce(payme_key,'')))>0) AS payme_n,
  count(*) FILTER (WHERE length(trim(coalesce(click_merchant_id,'')))>0 OR length(trim(coalesce(click_service_id,'')))>0 OR length(trim(coalesce(click_secret,'')))>0) AS click_n,
  count(*) AS total
FROM branches;
"
echo "=== METHODS ==="
curl -fsS https://77-83-206-192.sslip.io/api/payments/methods || true
echo
