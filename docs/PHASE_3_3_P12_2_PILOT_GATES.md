# P12.2 — Pilot Gate Closure (verifiable vs external ops)

**Production Payme/Click:** DISABLED  
**FOM inventory writer:** OFF  
**External delivery:** CONTRACT_PENDING  

---

## 1. Payme / Click sandbox harness

**Repository:** `artifacts/api-server/src/scripts/sandbox-e2e-harness.ts`  
**Run:** `pnpm sandbox:e2e`

### Required environment (never commit values)

| Variable | Provider | Purpose |
|----------|----------|---------|
| `PAYME_SANDBOX_KEY` | Payme | Sandbox merchant key (Basic auth) |
| `PAYME_SANDBOX_MERCHANT_ID` | Payme | Sandbox merchant id |
| `CLICK_SANDBOX_SECRET` | Click | Sandbox sign secret |
| `CLICK_SANDBOX_SERVICE_ID` | Click | Service id |
| `CLICK_SANDBOX_MERCHANT_ID` | Click | Merchant id |
| `SANDBOX_E2E_RUN=1` | both | Explicit opt-in to attempt live network E2E |
| `TEST_DATABASE_URL` or `DATABASE_URL` | both | Intent/order fixture DB (test only) |

### Setup steps (staging)

1. Create Payme test merchant at https://test.paycom.uz/ — copy key/merchant id into staging secrets.  
2. Create Click test shop — copy secret/service/merchant into staging secrets.  
3. Register merchant callback URLs to staging HTTPS API.  
4. Seed one unpaid online order + payment intent on **test** DB.  
5. Set `SANDBOX_E2E_RUN=1` on staging runner only.  
6. Run `pnpm sandbox:e2e` — expect real CheckPerform→Create→Perform / Prepare→Complete → P7 capture.

### Current evidence (this machine)

Credentials: **absent** → `PAYME_SANDBOX_E2E_PENDING` / `CLICK_SANDBOX_E2E_PENDING`  
Harness: **executable**  
Status: **REPOSITORY READY** · **EXTERNAL OPS REQUIRED** for live network PASS

---

## 2. Managed PostgreSQL backup / PITR

**In-repo logical drill:** `pnpm backup:drill` (PGlite migration restore) — proves schema restore path only.  

**Managed provider backups / PITR:** **NOT_PROVEN** from repository (no IaC for Neon/Supabase/Yandex).

### Operational checklist (EXTERNAL OPS)

| Gate | Owner action | Evidence |
|------|----------------|----------|
| Automated backups ON | Provider console | Screenshot / API status |
| Retention ≥ 7–30d | Provider setting | Documented value |
| PITR enabled | Provider setting | Window (e.g. 7d) |
| RPO target | Ops | e.g. ≤ 24h |
| RTO target | Ops | e.g. ≤ 4h |
| Restore into empty **staging** DB | Ops | Ticket + row counts |
| Verify tables | Ops | orders, payments, payment_*, cashback_ledger, product_stocks, reservations, branches, audit_log |

**BACKUP_PITR = NOT_PROVEN** (managed) · **PARTIAL** (in-repo logical drill PASS)

---

## 3. GitHub required checks + image build

### CI jobs (repository)

| Job | Covers |
|-----|--------|
| `typecheck` | install + full typecheck |
| `build-and-test` | build, DB/API tests, migrations, backup drill |
| `docker-image` | `docker build` (no push, no secrets) |

### Branch protection (EXTERNAL OPS)

GitHub Settings → Branches → require:

1. `Typecheck`  
2. `Build + tests + migration + backup drill`  
3. `Docker image build`  

Until toggled by a repo admin: **GITHUB_REQUIRED_CHECKS = EXTERNAL_OPS_REQUIRED**  
Exact UI steps: `docs/GITHUB_REQUIRED_CHECKS.md`

---

## 4. Docker image

- `Dockerfile` multi-stage, non-root, fail-closed PSP/worker defaults  
- Local Docker CLI: **not installed** on agent host → image build **NOT_PROVEN** locally  
- CI job builds image on ubuntu-latest runners (no push)

---

## 5. Secret encryption-at-rest

| Item | Status |
|------|--------|
| `branches.payme_key` / `click_secret` | Plaintext at rest |
| Access | `branchPaymentMerchant` resolver + WeakMap only |
| API/log leakage | Redacted / stripped |
| KMS/vault in repo | **Absent** |
| Homemade crypto | **Forbidden / not invented** |

**SECRET_AT_REST = BLOCKED** (no verified KMS) · **PARTIAL** (access isolation)  
Follow-up: vault/KMS then encrypt columns — see `PHASE_3_3_P12_1_SECRETS_HMAC_FOLLOWUP.md`

**Production requirement:** use managed secret store (AWS KMS / GCP KMS / HashiCorp Vault / provider secret manager) to encrypt column ciphertext before INSERT/UPDATE; decrypt only inside `getPaymentMerchantSecretMaterial`. No application-side homemade AES without KMS-backed key.

---

## 6. Legacy HMAC

| Item | Detail |
|------|--------|
| Paths | `auth.ts` customer/admin legacy parse when `allowLegacyHmacTokens()` |
| New logins | `s1.*` sessions only |
| Safe to close now? | **No** without mobile refresh proof |

**HMAC_LEGACY = PENDING_MOBILE_REFRESH**

Closure gate:

1. Ship mobile build that only stores `s1.*`  
2. Set `LEGACY_HMAC_DEADLINE`  
3. After quiet period → `ALLOW_LEGACY_HMAC_TOKENS=0`

---

## 7. External delivery

**DELIVERY_EXTERNAL = CONTRACT_PENDING**  
Internal courier/pickup remain functional. No invented vendor API.

---

## 8. FOM inventory writer

**MUST REMAIN OFF** (`FOM_INVENTORY_WRITER_ENABLED = false`)

Future verified stock contract checklist (do not implement without vendor contract):

| Requirement | Notes |
|-------------|--------|
| Event identity | Stable vendor id — no invent |
| Branch identity | FOM branch → internal branch map |
| SKU/barcode | Explicit product map; unknown → reject |
| Quantity | Integer; delta vs absolute |
| Semantics | Physical only vs available; never overwrite reserved blindly |
| Timestamp | UTC event + sync time |
| Update mode | Absolute vs incremental |
| Retry / duplicate | Idempotent unique constraint |
| Auth | Existing webhook secret pattern |
| Reconciliation | Diff report before cutover |

---

## Pilot gate decision (this batch)

| Gate | Decision |
|------|----------|
| PILOT SANDBOX | **NOT READY** (live PSP network PENDING — credentials EXTERNAL OPS) — harness REPOSITORY READY |
| CONTROLLED STAGING REHEARSAL | **NOT READY** until sandbox E2E PASS + managed backup evidence + required checks |
| PRODUCTION | **NOT READY** |

P13 remains **CONDITIONAL READY** for planning only — not cutover.

---

## 9. Validation evidence (P12.2 local run)

| Suite | Result |
|-------|--------|
| typecheck | **PASS** |
| build (api-server + admin-web) | **PASS** |
| build (Expo / mockup recursive) | **SKIPPED** in CI (Replit Metro / PORT); not pilot blockers |
| migration artifacts 0000–0008 | **PASS** |
| backup drill (PGlite logical) | **PASS** (`BACKUP_DRILL=PASS`) |
| DB tests (P1–P10 incl.) | **PASS** 173/173 |
| API contracts (P4–P12.2) | **PASS** 113/113 |
| security | **PASS** |
| sandbox harness | **PENDING** (no credentials) |
| Docker image local | **NOT_PROVEN** (Docker CLI absent) |
| Docker image CI job | **REPOSITORY READY** (no push) |
| Managed PITR | **NOT_PROVEN** |
| GitHub required checks toggle | **EXTERNAL_OPS_REQUIRED** |

---

## Distilled returns

| Key | Value |
|-----|-------|
| PAYME_SANDBOX_E2E | PENDING |
| CLICK_SANDBOX_E2E | PENDING |
| BACKUP_PITR | PARTIAL (logical drill) / NOT_PROVEN (managed) |
| GITHUB_REQUIRED_CHECKS | EXTERNAL_OPS_REQUIRED |
| SECRET_AT_REST | BLOCKED (KMS absent) · PARTIAL (resolver isolation) |
| HMAC_LEGACY | PENDING_MOBILE_REFRESH |
| DELIVERY_EXTERNAL | CONTRACT_PENDING |
| FOM inventory writer | OFF |

**FINAL LINE:**  
P12.2 COMPLETE — PILOT GATES CLOSED WHERE VERIFIABLE — EXTERNAL OPS ITEMS EXPLICIT — PRODUCTION REMAINS DISABLED.

