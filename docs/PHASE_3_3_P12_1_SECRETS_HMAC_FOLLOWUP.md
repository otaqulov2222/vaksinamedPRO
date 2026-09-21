# P12.1 — Secret encryption-at-rest & Legacy HMAC follow-up

## Secret encryption-at-rest

| Item | Status |
|------|--------|
| Branch Payme/Click secrets storage | Plaintext columns on `branches` (`payme_key`, `click_secret`) |
| Runtime handling | Loaded into `WeakMap` — never returned in public DTOs |
| Log redaction | Logger redacts payme/click secret paths |
| KMS / vault abstraction in repo | **Absent** |
| Risky production-wide migration this batch | **Not performed** (correct) |

**Risk:** DB dump / backup / replica access exposes merchant secrets in plaintext.

**Follow-up task (do not invent KMS):**  
When a vault/KMS abstraction is chosen, encrypt `branches.payme_key` / `branches.click_secret` at rest with envelope encryption; keep `SECRET_ENCRYPTION_AT_REST_FOLLOW_UP` constant in `branchPaymentMerchant.ts` until cutover.

Constant already present:
`SECRET_ENCRYPTION_AT_REST_FOLLOW_UP` in `artifacts/api-server/src/lib/branchPaymentMerchant.ts`.

---

## Legacy HMAC dual-accept

| Item | Detail |
|------|--------|
| Where | `allowLegacyHmacTokens()` in `securityEnv.ts`; auth session acceptance |
| Why | Mobile clients may still hold pre-`s1.*` HMAC tokens |
| New routes | Issue `s1.*` sessions only; dual-accept is read-path compatibility |
| Safe to close now? | **No** without client refresh confirmation |

**Removal condition (narrowest):**

1. Set `LEGACY_HMAC_DEADLINE` to a date after current mobile release ships session tokens.  
2. Confirm no legacy tokens in auth_events / support tickets for ≥1 release cycle.  
3. Set `ALLOW_LEGACY_HMAC_TOKENS=0`.  
4. Keep flag available for emergency reopen in staging only.

Default remains dual-accept ON when unset — residual risk documented; not blindly removed in P12.1.
