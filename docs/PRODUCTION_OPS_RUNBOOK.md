# Production Operations Runbook

**Git checkpoint (code + docs baseline):** `662862b`
**Audience:** engineering leads, DevOps, payments ops, mobile release owners
**Scope:** operational gates and cutover procedures after P1–P13.1 technical validation

### Hard rules (do not violate)

| Rule | Status at checkpoint |
|------|----------------------|
| Production Payme merchant API | **OFF** (`PAYME_MERCHANT_API_ENABLED` must stay `0` until §3 GO) |
| Production Click merchant API | **OFF** (`CLICK_MERCHANT_API_ENABLED` must stay `0` until §3 GO) |
| FOM inventory writer | **OFF** (`FOM_INVENTORY_WRITER_ENABLED = false` in code; do not enable) |
| External delivery provider | **DISABLED** until verified contract (§5) |
| Secrets in git | **Forbidden** — never commit `.env`, keys, or dumps |
| Fake evidence | **Forbidden** — PENDING ≠ PASS |

### Related documents

| Doc | Role |
|-----|------|
| `docs/FINAL_PRODUCTION_CLOSURE.md` | Gate assessment snapshot |
| `docs/PHASE_3_3_P12_2_PILOT_GATES.md` | Pilot / sandbox / PITR checklist |
| `docs/PHASE_3_3_P12_1_SECRETS_HMAC_FOLLOWUP.md` | Secrets + HMAC follow-up |
| `docs/GITHUB_REQUIRED_CHECKS.md` | Branch protection UI steps |
| `docs/PHASE_3_3_P13_1_HTTP_REAL_PG.md` | Local HTTP + real PG load evidence |
| `docs/CASHBACK_PRODUCTION_INCIDENT_RUNBOOK.md` | Cashback SoT incidents (drift, duplicates, isolation, Redis≠money) |
| `.env.example` | Env variable names only (no values) |

### Evidence template (use for every gate)

| Field | Fill when closing |
|-------|-------------------|
| Gate name | |
| Result | PASS / PENDING / FAIL / NOT_PROVEN |
| Owner | name / role |
| Timestamp (UTC) | |
| Evidence link | ticket, screenshot, report path (non-secret) |
| Rollback plan | how to undo |

---

## 1. Pre-production gates

Technical code readiness (P1–P13.1, typecheck, API/admin build, security tests, concurrency) is **in-repo**. The gates below are **external / staging ops**.

### 1.1 Managed PostgreSQL backups / PITR

| Item | Detail |
|------|--------|
| In-repo | `pnpm backup:drill` — **logical / schema path only** (PGlite). Does **not** prove managed PITR. |
| Required | Cloud provider automated backups **ON**; PITR (or continuous WAL) enabled; retention documented |
| Evidence to close | Provider console/API status; retention days; PITR window |
| Owner | Database / platform ops |
| Rollback | N/A (enable backups; do not disable without replacement) |
| Current | **NOT_PROVEN** / EXTERNAL |

### 1.2 Restore drill

| Item | Detail |
|------|--------|
| Required | Restore into an **empty staging** database from backup/PITR |
| Verify tables | `orders`, `payments`, `payment_intents`, `payment_captures`, `payment_refunds`, `cashback_ledger`, `product_stocks`, `reservations`, `branches`, audit/session tables as applicable |
| Evidence | Ticket ID + row-count / smoke checklist |
| Owner | Database ops + eng |
| Current | **NOT_PROVEN** (managed) |

### 1.3 RPO / RTO

| Item | Detail |
|------|--------|
| Required | Written RPO (e.g. ≤ 24h) and RTO (e.g. ≤ 4h) agreed by ops + product |
| Evidence | Signed runbook section or ticket with measured restore time |
| Current | **NOT_PROVEN** — do not invent targets as proven |

### 1.4 GitHub main branch protection + required CI checks

| Item | Detail |
|------|--------|
| Workflow | `.github/workflows/ci.yml` (repository READY) |
| Required checks (exact names) | `Typecheck` · `Build + tests + migration + backup drill` · `Docker image build` |
| Procedure | See `docs/GITHUB_REQUIRED_CHECKS.md` |
| Owner | GitHub repository admin |
| Evidence | Settings screenshot / API export showing required checks on `main` |
| Current | Workflow **PASS** · protection **EXTERNAL_REQUIRED** |

### 1.5 KMS / Vault secret-at-rest

| Item | Detail |
|------|--------|
| Current storage | `branches.payme_key`, `branches.click_secret` — **plaintext at rest** |
| Mitigations in code | WeakMap runtime; DTO/log redaction |
| Required before prod merchant keys | Managed KMS / Vault / cloud secret manager; envelope encrypt columns; decrypt only in merchant resolver |
| Do not | Invent homemade AES without KMS-backed keys |
| Owner | SecOps + eng |
| Current | **BLOCKED** (KMS absent) · access isolation **PARTIAL** |
| Follow-up marker | `SECRET_ENCRYPTION_AT_REST_FOLLOW_UP` in payment merchant code |

### 1.6 Staging monitoring

| Metric | Required |
|--------|----------|
| API CPU / memory | Dashboard or host metrics |
| Worker CPU / memory | Same |
| PostgreSQL CPU / memory / connections | Provider dashboard + `pg_stat_activity` |
| Lock waits / deadlocks / slow queries | `pg_stat_statements` (or provider equivalent) |
| Queue depth | `worker_jobs` due/failed counts |
| Current | **INFRA_METRICS_NOT_PROVEN** / **QUERY_PROFILING_NOT_PROVEN** |

### 1.7 Failure recovery (staging drills)

| Drill | Expect |
|-------|--------|
| API restart under light write load | One capture per payment; no oversell; readiness recovers |
| Worker / `POST /api/workers/run-due` interrupt | SKIP LOCKED — no double job completion |
| Brief DB interruption | 503 readiness during outage; invariants after restore |
| Current | **FAILURE_RECOVERY_NOT_PROVEN** (P13.1) |

Fill evidence template per drill. Do not mark PASS without a dated staging run.

---

## 2. PSP sandbox E2E

**Command:** `pnpm sandbox:e2e`
**Harness:** `artifacts/api-server/src/scripts/sandbox-e2e-harness.ts`
**Report (local, gitignored):** `.data/sandbox-e2e/last-harness.json`

### Absolute statements

1. **PENDING is not PASS.** Exit code 0 with PENDING means credentials/fixture missing — not success.
2. **Production credentials must never be used for sandbox testing.** Use only sandbox/test merchant material.
3. Keep `PAYME_MERCHANT_API_ENABLED=0` and `CLICK_MERCHANT_API_ENABLED=0` during sandbox harness (harness refuses production enable).
4. Never commit sandbox or production secrets.

### 2.1 Payme sandbox

| Requirement | Notes |
|-------------|--------|
| Credentials (staging secrets only) | `PAYME_SANDBOX_KEY`, `PAYME_SANDBOX_MERCHANT_ID` (or documented `PAYME_TEST_*` aliases) |
| Merchant configuration | Test merchant (e.g. Payme test environment per ops process) |
| HTTPS callback | Staging API HTTPS URL registered with Payme for merchant callbacks |
| Opt-in | `SANDBOX_E2E_RUN=1` on staging runner only |
| DB fixture | `TEST_DATABASE_URL` or non-prod `DATABASE_URL`; unpaid order + payment intent |
| Lifecycle to prove | CheckPerform → Create → Perform → P7 capture |
| Callback verification | Merchant webhook auth succeeds; intent/order payment axis consistent |
| Idempotency | Repeat settle/callback → **exactly one** effective capture |
| Final state | Intent captured; order `paymentStatus` paid axis; no duplicate captures |

**Current (checkpoint machine):** credentials **absent** → `PAYME_SANDBOX_E2E = PENDING`.

**Harness note:** Even with env present, live network PASS requires approved staging fixture; do not invent PASS.

### 2.2 Click sandbox

| Requirement | Notes |
|-------------|--------|
| Credentials | `CLICK_SANDBOX_SECRET`, `CLICK_SANDBOX_SERVICE_ID`, `CLICK_SANDBOX_MERCHANT_ID` |
| Merchant configuration | Click test shop / service |
| HTTPS callback | Staging HTTPS Prepare/Complete endpoints registered |
| Opt-in | `SANDBOX_E2E_RUN=1` |
| DB fixture | Same as Payme — non-prod only |
| Lifecycle to prove | Prepare → Complete → P7 capture |
| Callback verification | Sign verification succeeds; intent/order consistent |
| Idempotency | Duplicate Complete → one capture |
| Final state | Captured once; refund path still subject to outbound contract limits |

**Current:** `CLICK_SANDBOX_E2E = PENDING`.

### 2.3 Closing the sandbox gate

| Field | Value when closed |
|-------|-------------------|
| Result | **PASS** only if harness (or approved staging script) records real network settle for **both** providers |
| Owner | Payments ops |
| Evidence | Non-secret report excerpt + staging ticket; `.data` reports stay local/gitignored |
| Rollback | Unset `SANDBOX_E2E_RUN`; rotate compromised sandbox keys |

---

## 3. Production PSP cutover

**Do not start until:** sandbox E2E **PASS**, secret-at-rest path agreed, staging monitoring + failure drills acceptable, branch protection ON.

Do **not invent** provider-specific JSON fields beyond what existing merchant modules already implement. Use official Payme/Click docs + in-repo merchant API modules for field mapping.

### Controlled sequence

| Step | Action | Rollback |
|------|--------|----------|
| 1 | Provision production secrets in KMS/Vault / secret manager (not git, not plaintext tickets) | Revoke secrets |
| 2 | Verify secret-at-rest (encrypted columns or vault injection) before writing merchant keys to DB | Do not write plaintext prod keys if KMS pending |
| 3 | Configure per-branch merchant IDs / keys via admin/ops process already supported | Clear branch merchant config |
| 4 | Configure **production** HTTPS callback URLs at provider consoles | Point callbacks back to staging or disable |
| 5 | Verify webhook authentication (Basic / MD5 sign as implemented) with a **pilot** payment | Disable merchant flags |
| 6 | Reconciliation process: compare provider statements vs `payment_captures` / intents (ops cadence) | Pause new online payments |
| 7 | Pilot branch selection: one or few branches only | Remove pilot merchant keys |
| 8 | Transaction monitoring: captures, failures, duplicates, refunds | Feature-flag off |
| 9 | Enable `PAYME_MERCHANT_API_ENABLED=1` / `CLICK_MERCHANT_API_ENABLED=1` **explicitly and separately** after pilot proof | Set flags to `0` immediately |

### Disable / rollback procedure

1. Set `PAYME_MERCHANT_API_ENABLED=0` and/or `CLICK_MERCHANT_API_ENABLED=0`.
2. Confirm readiness/health and stop new online checkouts for affected provider.
3. Do not delete historical payment rows.
4. Open incident (§7); reconcile in-flight intents manually per finance process.

### Outbound refund / advanced APIs

Where code marks `CONTRACT_PENDING`, do not assume provider outbound refund is automated. Finance may use provider console until contract closed.

---

## 4. FOM inventory cutover

### Writer status

**MUST REMAIN OFF** until every contract row below is verified and a signed cutover ticket exists.

Commercial FOM sale / cashback paths may already operate without stock writes. Barcodes received without stock contract must not mutate inventory.

### Required external contract evidence

| Topic | Must be defined by vendor + product (do not invent) |
|-------|------------------------------------------------------|
| Authoritative source | Who wins on conflict: FOM vs internal SoT |
| Branch mapping | Stable FOM branch id → internal `branches` |
| SKU / barcode mapping | Explicit product map; unknown → **reject** |
| Quantity semantics | Integer; absolute vs delta; physical vs available |
| Reserved stock | Never blind-overwrite reserved |
| Event ID | Vendor-stable unique id |
| Timestamp | Event UTC + ingest time |
| Correction / reconciliation | Explicit correction events; pre-cutover diff report |
| Authentication / signature | Shared secret or signed webhook |
| Idempotency | Unique constraint / dedupe on event id |
| Retry semantics | Safe retries; no double apply |
| Cutover procedure | Dual-run / shadow → enable writer |
| Rollback | Disable writer flag; reconcile drift |

### Cutover / rollback (when contract exists)

1. Shadow mode / recon report PASS.
2. Enable writer only via deliberate code/config change + release (not ad-hoc).
3. Rollback: disable writer immediately; freeze FOM stock writes; inventory ops corrects drift.

---

## 5. Delivery provider cutover

### Status

Internal pickup / internal delivery axes may function. **External courier adapter remains `CONTRACT_PENDING`.** Keep external provider disabled until contract verified.

### Required contract evidence

| Topic | Must be verified |
|-------|------------------|
| Authentication | How we call / how they call us |
| Request / response schema | Exact fields from vendor docs (no invent) |
| Status mapping | Vendor statuses → internal fulfillment axis |
| Webhook / callback | URL, auth, payload |
| Retry | Client and server retry rules |
| Idempotency | Dedup key for create/update |
| Cancellation | Who can cancel; state machine |
| Refund interaction | Effect on payment/refund axes |
| Failure behavior | Timeouts, partial failure, compensation |

### Cutover / rollback

1. Contract signed + staging integration PASS.
2. Feature enable for pilot branches only.
3. Rollback: disable external adapter; fall back to internal/manual fulfillment.

---

## 6. Mobile HMAC migration

### Current design

| Item | Behavior |
|------|----------|
| New logins | Issue `s1.*` server sessions only |
| Legacy | Dual-accept when `allowLegacyHmacTokens()` allows |
| Risk | Closing dual-accept too early locks old mobile builds |

### Rollout sequence

| Step | Action | Evidence |
|------|--------|----------|
| 1 | Ship mobile release that **stores only** `s1.*` tokens | Store version + release notes |
| 2 | Set `LEGACY_HMAC_DEADLINE` (documented date) | Env / deploy config |
| 3 | Monitor `auth_events` / support for legacy token use | Metrics / ticket count |
| 4 | Quiet period ≥ one client release cycle with **zero** required legacy accepts | Log query / report |
| 5 | Set `ALLOW_LEGACY_HMAC_TOKENS=0` | Deploy change |
| 6 | Confirm login only via `s1.*` | Staging + prod smoke |

### Criteria to disable legacy HMAC

- Mobile `s1.*`-only in production stores.
- Quiet period complete.
- Owner sign-off on evidence template.

### Rollback

Re-enable dual-accept in **staging first**; production reopen only as emergency with SecOps approval (`ALLOW_LEGACY_HMAC_TOKENS=1` temporarily). Prefer forcing client upgrade over long dual-accept.

---

## 7. Incident / failure recovery

PostgreSQL is system of record. Redis is **non-authoritative**. Prefer fail-closed payments over silent double settle.

| Scenario | Immediate actions | Integrity checks |
|----------|-------------------|------------------|
| PSP outage | Keep merchant flags as-is or disable new online pay; show degrade message | No fake captures; reconcile when PSP returns |
| Webhook outage | Queue/retry per provider rules; do not manual double-capture | One capture per intent |
| PostgreSQL failure | API readiness 503; stop writes; restore per §1 | After restore: no negative stock; no multi-capture |
| Redis failure | Continue if sessions/DB SoT holds; expect higher DB load | Session validity via `auth_sessions` |
| Worker failure | Restart; re-run due jobs | No double SKIP LOCKED claim completion |
| FOM outage | Commercial webhook may fail; **do not** enable inventory writer as workaround | Cashback/ledger consistency |
| Delivery provider outage | Disable external adapter; fulfill manually/internal | Order fulfillment axis only |
| Duplicate payment attempt | Rely on intent idempotency + capture uniqueness | `payment_captures` count = 1 |
| Inventory mismatch | Freeze affected SKU/branch; reconcile physical/reserved/available | `physical >= reserved`, `available >= 0` |

### Severity / comms

| Severity | Example | Comms |
|----------|---------|-------|
| Sev-1 | Data corruption risk, multi-capture, negative stock | Page on-call; disable PSP flags |
| Sev-2 | Provider outage, webhook backlog | Status page; finance informed |
| Sev-3 | Single-branch config | Ticket; pilot only |

---

## 8. Final production GO / NO-GO checklist

Copy this table into the cutover ticket. **Leave PENDING blank — do not pre-fill PASS.**

| # | Gate | Result (PASS/PENDING/FAIL) | Owner | Timestamp (UTC) | Evidence | Rollback plan |
|---|------|----------------------------|-------|-----------------|----------|---------------|
| 1 | Code / CI green on release commit | | | | | Redeploy previous tag |
| 2 | Managed PG backup + PITR | | | | | N/A / alternate backup |
| 3 | Restore drill | | | | | Use prior snapshot |
| 4 | RPO/RTO documented | | | | | Revise targets |
| 5 | GitHub required checks on `main` | | | | | Keep protection on |
| 6 | KMS/Vault + secret-at-rest | | | | | Stop writing new plaintext keys |
| 7 | Staging monitoring | | | | | |
| 8 | Failure recovery drills | | | | | |
| 9 | Payme sandbox E2E | | | | | Unset SANDBOX_E2E_RUN |
| 10 | Click sandbox E2E | | | | | Same |
| 11 | Production Payme cutover (pilot) | | | | | `PAYME_MERCHANT_API_ENABLED=0` |
| 12 | Production Click cutover (pilot) | | | | | `CLICK_MERCHANT_API_ENABLED=0` |
| 13 | HMAC `s1.*` quiet period / legacy off | | | | | Reopen dual-accept emergency |
| 14 | FOM stock writer | **must be OFF** unless contract PASS | | | | Disable writer |
| 15 | External delivery | **disabled** unless contract PASS | | | | Disable adapter |

### GO criteria

All of 1–10 **PASS**, and 11–12 only if intentionally in scope for this cutover; 14–15 remain OFF or contract-PASS.

### NO-GO if any of

- Sandbox E2E still PENDING/FAIL and production PSP enable is requested
- Managed PITR / restore unproven
- Production secrets would be stored plaintext
- FOM writer or external delivery enabled without contract
- Branch protection missing on `main`

---

## Appendix A — Safe commands (non-production)

```bash
pnpm run typecheck
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/admin-web run build
pnpm test
pnpm test:security
pnpm backup:drill
pnpm sandbox:e2e          # PENDING without sandbox secrets — honest
pnpm p13:1                # local embedded PG HTTP load — not production capacity
```

## Appendix B — Checkpoint snapshot (do not treat as production GO)

| Item | At `662862b` |
|------|----------------|
| Real PG concurrency | PASS (prior P13) |
| HTTP + real PG (P13.1) | PASS (local) |
| Payme sandbox E2E | **PENDING** |
| Click sandbox E2E | **PENDING** |
| Production Payme/Click | **OFF** |
| FOM inventory writer | **OFF** |
| Delivery external | **CONTRACT_PENDING** |
| FOM stock contract | **CONTRACT_PENDING** |

**FINAL LINE:**
PRODUCTION OPS RUNBOOK — DOCUMENTATION ONLY — NO PRODUCTION PROVIDER ENABLED — PENDING GATES REMAIN PENDING.
