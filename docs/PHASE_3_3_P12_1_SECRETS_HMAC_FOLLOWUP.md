# P12.1 / P12.28 — Secret encryption-at-rest & Legacy HMAC follow-up

## Secret encryption-at-rest (updated Phase 12.28)

| Item | Status |
|------|--------|
| Branch Payme/Click secrets storage | Text columns on `branches` (`payme_key`, `click_secret`); values stored as `enc:v1:` AES-256-GCM ciphertext when `MERCHANT_SECRET_KEK` is configured |
| Runtime handling | Decrypt → `WeakMap` — never returned in public/admin DTOs as plaintext or ciphertext |
| Log / audit redaction | Logger redacts payme/click secret paths; branch.update audit stores credential-updated booleans only |
| Application crypto boundary | **IMPLEMENTED** — `artifacts/api-server/src/lib/merchantSecretCrypto.ts` |
| Cloud KMS / Vault SDK in repo | **Absent** (intentionally not invented) |
| Production without KEK | **Fail closed** |
| Risky production-wide migration this batch | **Not performed** (correct — no production credentials in workspace) |

**Risk remaining:** Until ops injects `MERCHANT_SECRET_KEK` and migrates legacy plaintext rows, staging/prod must not enable merchant PSP with plaintext columns.

**OPS follow-up:**

1. Inject 32-byte KEK as `MERCHANT_SECRET_KEK` (base64 or hex) from approved secret manager / KMS.
2. Migrate existing plaintext → `enc:v1:` (Admin re-save or controlled migrate helper).
3. Clear `MERCHANT_SECRET_ALLOW_PLAINTEXT_READ` after cutover.
4. Optionally wrap KEK with cloud KMS when provider is chosen — do not invent SDK here.

Constant:
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
