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

---

## Phase 12.33 — HMAC legacy closure audit (2026-09-28)

| Item | Status |
|------|--------|
| s1.* issuance on all logins | **DONE** |
| Dual-accept default | **ON** when ALLOW_LEGACY_HMAC_TOKENS / LEGACY_HMAC_DEADLINE unset |
| Mobile s1.*-only store proof | **NOT_PROVEN** / **OPS_REQUIRED** |
| Quiet period evidence | **NOT_PROVEN** |
| Legacy HMAC CLOSED | **No** — do not remove verify path |
| Strategy | **B deprecate** — keep dual-accept until runbook §6 complete |
| Safe to close now? | **No** |

See `docs/PRODUCTION_GAP_MATRIX.md` § Phase 12.33 and `docs/PRODUCTION_OPS_RUNBOOK.md` §6.

---

## Phase 12.34 — Mobile s1.* migration readiness (2026-09-28)

| Item | Status |
|------|--------|
| Mobile stores opaque API token | **READY_IN_REPO** |
| Mobile constructs legacy HMAC | **No** |
| New login issues s1 only | **DONE** |
| Refresh endpoint | **NOT_PRESENT** (re-login recovery) |
| MOBILE s1-ONLY PROOF | **NOT_PROVEN** |
| LEGACY HMAC RETIREMENT | **OPS_REQUIRED** — dual-accept **not** disabled this phase |
| Telemetry / quiet period | **NOT_PROVEN** |

Do not set `ALLOW_LEGACY_HMAC_TOKENS=0` until ops quiet-period evidence exists.

## Phase 12.39 — Operational retirement gate (2026-09-28)

| Item | Status |
|------|--------|
| Code migration (s1 issuance) | **READY_IN_REPO** / **DONE** |
| Tests (dual-accept / flag / deadline) | **TEST_VERIFIED** |
| Mobile/admin client HMAC construction | **Absent** (**READY_IN_REPO**) |
| Legacy HMAC issuance on login paths | **UNUSED / DEPRECATED** |
| LEGACY_HMAC_USAGE_TELEMETRY | **NOT_PROVEN** (no legacy-accept counter/event) |
| MOBILE_S1_POPULATION_PROOF | **NOT_PROVEN** |
| HMAC_QUIET_PERIOD | **NOT_PROVEN** |
| LEGACY_HMAC_DEADLINE | **NOT_CONFIGURED** in this workspace |
| ALLOW_LEGACY_HMAC_TOKENS set to 0? | **No** (left default ON) |
| HMAC RETIREMENT GATE | **OPS_REQUIRED** / **NOT_PROVEN** |

Do not disable dual-accept until telemetry + release population + quiet period evidence exist.

## Phase 12.42 — Merchant secret KMS operational gate (2026-09-28)

| Item | Status |
|------|--------|
| Application encryption boundary | **READY_IN_REPO** / **TEST_VERIFIED** |
| CURRENT_KEY_SOURCE | **ENVIRONMENT_KEK** |
| KMS_PROVIDER / KMS_BACKING | **MISSING** / **NOT_PROVEN** |
| MERCHANT_SECRET_KEK (workspace) | **MISSING** |
| Live rotation / IAM / private KMS network | **NOT_PROVEN** |
| MERCHANT SECRET KMS GATE | **OPS_REQUIRED** / **NOT_PROVEN** |
| Production PSP | **OFF** |

Do not invent AWS/GCP/Azure/Vault clients. Inject KEK from approved secret manager first; prefer KMS-wrapped KEK when provider is chosen.

