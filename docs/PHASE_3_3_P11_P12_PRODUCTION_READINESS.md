# P11 + P12 — Production Cutover & Ops Readiness

**Status:** READINESS DOCUMENTED (controlled cutover NOT executed)  
**Date context:** After P1–P10 implementation  
**Hard rules:** Payme/Click production OFF · FOM inventory writer OFF · Workers not auto-started · No destructive DB · No secret values in this doc

---

## 1. Payment providers (Payme / Click)

| Item | Status |
|------|--------|
| Inbound merchant APIs | Implemented (`POST /api/payments/payme/merchant`, `/click/merchant`) |
| Fail-closed flags | `PAYME_MERCHANT_API_ENABLED`, `CLICK_MERCHANT_API_ENABLED` — required in production-like |
| Live checkout hosts | `PAYME_LIVE` / `CLICK_LIVE` or explicit `*_CHECKOUT_BASE_URL` |
| Branch merchant mapping | Per-branch columns; no cross-branch fallback |
| Secrets | Branch DB fields; logger redaction; public DTOs strip keys |
| Idempotency | Intent/attempt/refund/webhook unique keys |
| Outbound PSP refund | `CONTRACT_PENDING` |
| Cashback on refund | `OPEN_NOT_AUTO` |
| Production enable | **MUST REMAIN OFF** until cutover checklist passes |

### MANUAL_OPS_REQUIRED (Payme/Click)

1. Register merchant callback URLs with vendor consoles  
2. Populate per-branch merchant IDs + secrets (staging first)  
3. Set enable flags only on staging → controlled branch(es) → production  
4. Sandbox E2E proof (`SANDBOX_E2E_PENDING` until credentials present)  
5. Reconciliation runbook ownership  

**Do not modify real credentials in repo.**

---

## 2. External delivery

| Layer | Status |
|-------|--------|
| Internal courier / pickup | Implemented (P8 lifecycle) |
| `DeliveryProviderAdapter` | Boundary present |
| External create/cancel/sync | `CONTRACT_PENDING` — no fake success |
| Production external provider | **DISABLED** until vendor contract |

Internal delivery continues independently of external provider.

---

## 3. FOM stock synchronization design (writer OFF)

PostgreSQL P4 inventory remains SoT (`physical` → `reserved` → `available`).

`FOM_INVENTORY_WRITER_ENABLED = false` (hardcoded). Commercial sale sync may run; stock writes must not.

### Required event shape (contract checklist — NOT implemented)

| Field | Requirement |
|-------|-------------|
| Event identity | Stable vendor event/receipt/line id (no invented IDs) |
| Branch identity | Verified FOM branch → internal `branch_id` mapping |
| SKU / barcode | Explicit map to `products`; unknown → reject/quarantine |
| Quantity | Integer; clarify delta vs absolute |
| Stock semantics | Physical only? Available? Reserved interaction? |
| Timestamp | UTC event time + sync time |
| Update mode | Absolute set vs incremental delta |
| Retry | Bounded; idempotent by event identity |
| Duplicate handling | Unique constraint / ignore duplicate |
| Authentication | Existing FOM webhook secret pattern (no new invent) |
| Reconciliation | Diff report FOM vs PG; no silent overwrite |

**Do not enable inventory writer without verified vendor contract + cutover gate.**

---

## 4. Worker production readiness

| Item | Status |
|------|--------|
| Auto-start on process boot | **No** |
| Queue | PostgreSQL `worker_jobs` (no BullMQ invent) |
| Production queue HTTP | Requires `ENABLE_BACKGROUND_WORKERS=1` |
| Manual expiry endpoints | Admin AuthZ (reservation/payment) |
| Retry / backoff | Yes; `DEAD` after max attempts |
| Graceful HTTP shutdown | SIGTERM/SIGINT close server |
| Multi-worker lock | Residual: select without `FOR UPDATE SKIP LOCKED` |

Production activation must be explicit (flag + ops cron calling `/workers/run-due`).

---

## 5. Legacy TypeScript debt (TS7030)

| Severity | Finding |
|----------|---------|
| **HIGH** | `tsc --noEmit` fails with ~18× `TS7030` (not all code paths return) on Express handlers |
| Files | `admin.ts`, `catalog.ts`, `orders.ts`, `payments.ts`, `pos.ts` (legacy pattern) |
| Pre-existing? | Yes — Express `res.json` without `return` + `next(error)` without `return` |
| Affects P4–P10 logic? | No (style / control-flow typing) |
| Blocks package esbuild build? | **No** (`api-server` `build.mjs` succeeds) |
| Blocks root `pnpm build`? | **Yes** (root runs typecheck first) |
| Fix approach | Safe mechanical `return` on success/catch paths — do not weaken `tsconfig` |
| Status this batch | Documented; risky bulk auto-fix deferred after corruption incident |

**CRITICAL:** none for runtime/esbuild artifact.  
**HIGH:** root typecheck gate until returns fixed.  
**MEDIUM/LOW:** N/A beyond style consistency.

---

## 6. Environment matrix

| Variable / system | Dev | Staging | Production |
|-------------------|-----|---------|------------|
| `DATABASE_URL` | PGlite or local PG | Managed PG required | Managed PG required |
| Redis | Optional / deferred | Recommended for rate-limit | Recommended; not financial SoT |
| Queue | PG `worker_jobs`; manual | Flag + cron | `ENABLE_BACKGROUND_WORKERS=1` + cron |
| `PAYME_MERCHANT_API_ENABLED` | On by default (non-prod) | Explicit `1` | Explicit `1` only at cutover |
| `CLICK_MERCHANT_API_ENABLED` | On by default (non-prod) | Explicit `1` | Explicit `1` only at cutover |
| `PAYME_LIVE` / `CLICK_LIVE` | Off / test hosts | Off until sandbox proven | Off until cutover |
| FOM inventory writer | Hard OFF | Hard OFF | Hard OFF |
| `ENABLE_BACKGROUND_WORKERS` | Optional `_DEV` | Explicit | Explicit; default off |
| External delivery | CONTRACT_PENDING | CONTRACT_PENDING | DISABLED |
| Webhook URLs | localhost | Staging HTTPS | Production HTTPS |
| Secrets | `.env` local | Secret manager / env | Secret manager; never in git |
| Logging | debug/info | info | info/warn; redact secrets |
| `ALLOW_PAYMENT_SIMULATE` | Dev only | Never | Never |
| `ALLOW_OTP_DEV_BYPASS` | Dev only | Never | Never |

Production defaults are **fail-closed** for PSPs, FOM stock writer, payment simulate, and worker queue runner.

---

## 7. Cutover checklist

### PRE-CUTOVER

- [ ] Database backup taken + restore drill recorded  
- [ ] Migrations applied / `db:migrate:status` verified (0000–0008)  
- [ ] Env matrix verified (staging then prod)  
- [ ] Secrets present (ADMIN/CUSTOMER/POS/FOM webhook) — values not logged  
- [ ] Branch merchant IDs configured for pilot branch only  
- [ ] Callback URLs registered with Payme/Click  
- [ ] FOM inventory writer confirmed OFF  
- [ ] Workers not auto-started; flag policy agreed  
- [ ] Monitoring / log access ready  
- [ ] Rollback owners named  

### CUTOVER (controlled — one branch/provider first)

- [ ] Enable provider flag for staging pilot  
- [ ] Smoke: checkout → payment intent → merchant callback  
- [ ] Smoke: order / reservation / inventory axes  
- [ ] Smoke: internal delivery assign/status  
- [ ] Smoke: FOM sale (commercial) if applicable  
- [ ] Payment reconciliation sample  

### POST-CUTOVER

- [ ] Duplicate payment monitoring  
- [ ] Failed payment / webhook failures  
- [ ] Refund monitoring (internal records; PSP refund still pending)  
- [ ] FOM sale failures / unknown branch/SKU  
- [ ] Worker DEAD/FAILED jobs  
- [ ] DB errors / latency  

**Do not enable all branches automatically.**

---

## 8. Rollback controls (actual)

| Control | Available? |
|---------|------------|
| Disable `PAYME_MERCHANT_API_ENABLED` / `CLICK_*` | Yes — fail-closed immediately |
| Stop new payment initiation (flag / feature) | Yes via flags |
| Preserve financial / order / inventory / audit history | Yes — never delete |
| Application deploy rollback | Host-dependent (Replit today) |
| Migration down | **Not provided** — forward-only; roll forward with fix |
| Rollback migration data | Only when explicitly safe; never truncate financial tables |

---

## 9. Backup — BACKUP_GAP

In-repo: policy docs + `scripts/backup/` templates only.  
No scheduled managed backup, retention automation, or proven restore drill in CI.

Ops must attach provider-native backups (Neon/Supabase/Yandex/etc.) before production cutover.

---

## 10. Migration safety

- Versioned SQL `0000`–`0008` + journal — OK  
- `push-guard.mjs` blocks force push in prod/staging — OK  
- Forward-only; no migrate-down — OK (documented)  
- Destructive flags required — OK  

---

## 11. CI

GitHub Actions workflow added: install → typecheck (may fail on TS7030) → build packages → db tests → api tests → migrate status on PGlite path where applicable.

**Gap residual:** no staging deploy gate, no required status checks until repo enables Actions.

---

## 12. Deployment

Cloud-neutral: no Dockerfile/fly/render. Current: Replit autoscale.  
Recommended order: migrate → build → deploy API → health ready → enable workers cron (optional) → enable PSP flags (controlled).

---

## 13. Health / readiness

| Endpoint | Meaning |
|----------|---------|
| `GET /api/health/live` | Process up (no DB) |
| `GET /api/health/ready` | DB reachable |
| `GET /api/healthz` | Compat = readiness |

No secrets in responses.

---

## 14. Observability

| Area | Status |
|------|--------|
| Structured logs (Pino) + redaction | Present |
| Metrics / alerts / tracing | **OBS_GAP** |
| Job logs (id, entity, attempt, result) | Present on workers |

---

## Exact remaining work before P13

1. Fix TS7030 safely so root `pnpm build` typecheck passes  
2. Close BACKUP_GAP (provider backups + restore drill)  
3. Enable CI required checks on default branch  
4. Portable deploy artifact (Dockerfile or equivalent)  
5. Controlled staging PSP sandbox E2E  
6. Metrics/alerts minimum for payments/webhooks/workers  
7. Then P13 load + production cutover execution (still flag-gated)
