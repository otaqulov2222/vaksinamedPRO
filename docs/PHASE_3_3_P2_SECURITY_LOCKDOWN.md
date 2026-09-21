# P2 — Emergency Security Lockdown

**Status:** IMPLEMENTED  
**Mode:** Application security gates only — no domain redesign, no schema migrations  

## Fixed

- OTP `000000` / `devCode` / console OTP gated (`ALLOW_OTP_DEV_BYPASS`, never prod-like)
- `simulate-success` gated (`ALLOW_PAYMENT_SIMULATE`, never prod-like)
- Delivery status + confirm-pos require admin
- FOM sale requires `FOM_WEBHOOK_SECRET` in production/staging
- HMAC / POS secrets fail closed in production/staging
- Demo phone login gated
- Telegram auto-provision gated; header auth disabled in prod-like
- Admin HQ vs cashier minimal AuthZ (`requireHqAdmin`)
- `passwordHash` / payment secrets stripped from responses
- Webhooks non-mutating / 501 in production

## Local development

Set in `.env` (never commit):

```
ALLOW_OTP_DEV_BYPASS=1
ALLOW_PAYMENT_SIMULATE=1
```

Optional: `ALLOW_TELEGRAM_AUTO_PROVISION=1`, `FOM_WEBHOOK_SECRET=...`

## Deferred

Q7 sessions/revocation, Q8 real PSP, Q9 delivery domain, Q11 full RBAC, Redis rate limits, inventory/cashback/orders redesign.
