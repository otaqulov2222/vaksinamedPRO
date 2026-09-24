# Cashback Production Incident Runbook

**Status:** OPERATIONAL DOCUMENTATION  
**Audience:** engineering on-call, payments ops, HQ admins with financial escalation, platform ops  
**Scope:** Universal Cashback 2.0 incident detection, investigation, containment, and post-incident verification  
**Engine status:** LOCKED — do not redesign EARN / USE / REVERSAL / 30% cap / SoT tables during incidents  

### Hard rules (do not violate)

| Rule | Detail |
|------|--------|
| Financial SoT | `cashback_accounts` + `cashback_ledger` + `commercial_transactions` only |
| Legacy mirror | `customers.balance` is **not** financial authority |
| History rewrite | Never DELETE / TRUNCATE ledger or invent commercial IDs |
| Client amounts | Never trust client-submitted `cashbackAmount` / balance |
| Redis | Abuse control only — never cashback SoT |
| PGlite | Never production recovery database |
| Fake evidence | PENDING / OPEN ≠ PASS |

### Related documents

| Document | Role |
|----------|------|
| [`UNIVERSAL_CASHBACK_2_0_ARCHITECTURE_LOCK.md`](UNIVERSAL_CASHBACK_2_0_ARCHITECTURE_LOCK.md) | Locked SoT + source types + engine semantics |
| [`PHASE_3_3_P6_CASHBACK_ARCHITECTURE_LOCK.md`](PHASE_3_3_P6_CASHBACK_ARCHITECTURE_LOCK.md) | P6 architecture lock ancestry |
| [`PRODUCTION_OPS_RUNBOOK.md`](PRODUCTION_OPS_RUNBOOK.md) | Broader production gates / PSP / backup |
| `.env.example` | Env names only (no secrets) |

### Code anchors (actual repository)

| Concern | Location |
|---------|----------|
| Authoritative writers | `artifacts/api-server/src/lib/cashbackFinance.ts` — `earnCashback`, `useCashback`, `reverseCashbackEntry`, `refundOrderCashback` |
| Authoritative balance | `getAuthoritativeBalance` |
| Legacy mirror | `mirrorLegacyBalance` → `customers.balance` |
| Integrity (read-only) | `inspectCashbackIntegrity`, `runCashbackIntegrityCheck` |
| Integrity CLI | `artifacts/api-server/src/scripts/cashback-integrity-check.ts` |
| Integrity worker job | `JOB_TYPES.CASHBACK_INTEGRITY` = `cashback_integrity` |
| History API | `cashbackHistory.ts` + `GET /api/loyalty/cashback-history` |
| Alert codes | `artifacts/api-server/src/lib/alerts.ts` |
| Redis rate limit | `redis.ts` + `rateLimit.ts` (non-financial) |
| Staff refund audit | `POST /orders/:id/refund-cashback` → `audit_log` |

---

## 1. Purpose

Give operators a **repeatable, architecture-accurate** procedure when cashback financial anomalies, display mismatches, isolation breaches, Redis rate-limit outages, or PostgreSQL unavailability are suspected.

This runbook does **not** invent new admin correction APIs, cloud monitors, or financial writers.

---

## 2. Scope

| In scope | Out of scope |
|----------|--------------|
| Cashback balance / ledger / commercial identity incidents | Redesigning cashback engine |
| History API / UI balance mismatches | Changing payment, Payme, Click, FOM contracts |
| Customer isolation / AuthZ failures involving cashback | Inventing FOM_POS receipt identity |
| Redis rate-limit unavailability (abuse layer) | Treating Redis as money SoT |
| Evidence collection + escalation | Implementing controlled correction UI in this doc |

---

## 3. Source of truth

```
CUSTOMER
  → commercial_transactions   (sourceType + sourceKey)
  → cashback engine           (EARN | USE | REVERSAL)
  → cashback_ledger
  → cashback_accounts.balance
  → UI / API presentation
```

| Layer | Authority | Notes |
|-------|-----------|-------|
| **Balance** | `cashback_accounts.balance` | Via `getAuthoritativeBalance` |
| **Ledger** | `cashback_ledger` | Entry types: `EARN`, `USE`, `REVERSAL` |
| **Commercial identity** | `commercial_transactions` | Unique `(source_type, source_key)` |
| **Writers** | `cashbackFinance.ts` only | No parallel balance engines |
| **`customers.balance`** | Legacy / derived **display mirror** | Updated by `mirrorLegacyBalance` for compatibility — **never** independent SoT |
| **`loyalty_ledger`** | Soft display history (non-SoT) | Must not be used to “fix” money |
| **Redis** | Rate limit / coordination | **Not** cashback SoT |
| **Mobile / AppContext** | Presentation | Must follow API authoritative balance |

**Invariant:** Never repair the ledger by editing `customers.balance`.  
**Invariant:** Never use `customers.balance` as financial source of truth.

### Stored commercial `sourceType` values (actual)

| `sourceType` | Meaning | Do not |
|--------------|---------|--------|
| `ORDER` | App checkout; FOM confirm-pos earn for same order uses **same** `order:{id}` key | Invent a second key for the same sale |
| `POS` | Walk-in kassa / Admin POS (`receipt:{receiptId}`) | Relabel as FOM_POS manually |
| `SYSTEM` | Registration / system grants | Fake as a commercial sale |
| `FOM_POS` | Reserved external walk-in identity | Invent receipt IDs; without stable identity → `CONTRACT_PENDING` |

---

## 4. Severity levels

| Severity | Definition | Example |
|----------|------------|---------|
| **CRITICAL** | Confirmed financial integrity break **or** customer-to-customer data/financial exposure requiring immediate containment | Cross-customer cashback history; confirmed negative `cashback_accounts.balance` in production; mass ledger corruption |
| **HIGH** | Real-transaction integrity issue without proven multi-customer exposure | Ledger DRIFT on live accounts; duplicate EARN group on a paid commercial; isolation near-miss with blocked access |
| **MEDIUM** | Operational / abuse-control issue without confirmed financial loss | Redis rate-limit 503s; integrity job noise; single failed USE attempt already rejected |
| **LOW** | Logging, documentation, observability gaps | Missing dashboard; runbook clarity |

**Do not over-classify:** Normal idempotent EARN/USE/REVERSAL retries (`idempotent: true`) and normal `INSUFFICIENT_CASHBACK` rejections are **not** incidents by themselves — they are expected engine behavior. Escalate only when alerts, integrity scans, or customer reports indicate **actual** inconsistency or exposure.

---

## 5. Detection

### 5.1 Alert codes (structured logs)

| Alert code | Meaning | Typical severity seed |
|------------|---------|----------------------|
| `CASHBACK_LEDGER_DRIFT` | Integrity scan: account ≠ ledger net | HIGH until triaged |
| `CASHBACK_NEGATIVE_BALANCE_ATTEMPT` | USE/REVERSAL would go negative — **rejected** | MEDIUM (attempt) / escalate if balance already negative |
| `CASHBACK_DUPLICATE_EARN_ATTEMPT` | Concurrent/raced duplicate EARN path | MEDIUM if idempotent only; HIGH if integrity finds >1 EARN row |
| `CASHBACK_DUPLICATE_REVERSAL_ATTEMPT` | Second REVERSAL attempt on same entry | MEDIUM if idempotent; HIGH if two REVERSAL rows exist |
| `CASHBACK_OPERATION_FAILURE` | Unexpected cashback op failure / corrupt unique race | HIGH |
| `RATE_LIMITED` | Client hit configured limit | LOW / MEDIUM if abuse |
| `RATE_LIMIT_REDIS_UNAVAILABLE` | Production-like Redis down → 503 fail-closed | MEDIUM (availability) |

Logs emit `alert: true` + `alertCode`. **Never** log OTP, bearer tokens, card PAN/CVV, merchant secrets, API keys.

### 5.2 Integrity checker (read-only)

```text
pnpm --filter @workspace/api-server exec tsx src/scripts/cashback-integrity-check.ts
```

Or enqueue worker job type `cashback_integrity` (`JOB_TYPES.CASHBACK_INTEGRITY`).

| Result | Meaning |
|--------|---------|
| `MATCH` | Account balances reconcile to ledger net |
| `DRIFT` | One or more `cashback_accounts.balance` ≠ ledger net |
| `INVALID` | Duplicate EARN/USE commercial signals detected |

**Critical:** The checker **never** auto-repairs (`autoRepaired: false`). Report → alert → **manual investigation**.

---

## 6. Reconciliation formula

```text
ledgerNet =
  SUM(EARN)
  − SUM(USE)
  + SUM(REVERSAL)

Compare to: cashback_accounts.balance

Result: MATCH | DRIFT
```

- Amounts are integer UZS (soʻm).  
- Never automatically rewrite `cashback_accounts` or delete ledger rows to force MATCH.  
- Preserve original records for audit.

---

## 7. Investigation baseline (every cashback incident)

1. Record **environment** (`APP_ENV` / staging vs production) and **UTC timestamp**.  
2. Capture **customer internal ID** (if policy allows), **account id**, **balance**.  
3. List related **`cashback_ledger`** rows (`id`, `entry_type`, `amount`, `commercial_transaction_id`, `reverses_entry_id`, `idempotency_key`, `actor`, `reason`, `created_at`).  
4. List related **`commercial_transactions`** (`id`, `source_type`, `source_key`, `order_id`, `amount`, `meta`).  
5. If order-linked: `orders.id`, `orders.code`, payment/fulfillment axes (do not invent status transitions).  
6. If POS-linked: `pos_sales.receipt_id`, branch id.  
7. Run reconciliation (§6) for the affected customer.  
8. Collect alert codes / request or worker job ids — **redact secrets**.  
9. Classify severity (§4) and escalate (§19).

---

## 8. Containment principles

| Principle | Practice |
|-----------|----------|
| Minimize blast radius | Prefer freezing **the affected commercial path** (specific order/POS flow) over global cashback shutdown |
| Preserve evidence | Do not delete rows; snapshot query results into the incident ticket |
| No silent repair | No balance overwrites without authorized controlled correction |
| AuthZ | Continue to authorize via `requireCustomer(req)` / staff RBAC — never client `customerId` |
| Redis vs money | Redis outage ≠ license to edit cashback balances |

Exact product kill-switches (feature flags) depend on deployment; do **not** invent flags here. Document any temporary containment action taken.

---

## 9. Incident playbooks

### 9.1 NEGATIVE BALANCE

Distinguish carefully:

| Signal | Meaning | Action |
|--------|---------|--------|
| **NEGATIVE ATTEMPT** | Engine rejected USE/REVERSAL (`INSUFFICIENT_CASHBACK` / `INSUFFICIENT_FOR_REVERSAL`); alert `CASHBACK_NEGATIVE_BALANCE_ATTEMPT` | Usually **not** a balance corruption. Confirm account still ≥ 0. Log for abuse patterns. |
| **ACTUAL NEGATIVE BALANCE** | `cashback_accounts.balance < 0` observed in DB | Treat as **HIGH/CRITICAL**. Contain → investigate → escalate for controlled correction. |

**Steps (actual negative):**

1. Contain further spend/earn on the affected account if ops can safely do so without destructive SQL.  
2. Identify customer / `cashback_accounts` row.  
3. List all ledger entries for that customer.  
4. Inspect concurrent USE races and REVERSAL of EARN (clawback) paths.  
5. Inspect linked commercial transaction(s).  
6. Compute `ledgerNet` (§6) vs account balance.  
7. Preserve all history — **do not DELETE**.  
8. **Do not** overwrite balance to “make it zero” without approved controlled correction (§16).  
9. Escalate with evidence pack (§17).

### 9.2 LEDGER DRIFT

When `ledgerNet != cashback_accounts.balance` (integrity `DRIFT` / alert `CASHBACK_LEDGER_DRIFT`):

1. Contain only if ongoing incorrect spends/earns are confirmed.  
2. Capture customer/account ID + timestamp.  
3. Export ledger + commercial rows for the account.  
4. Reconcile (§6).  
5. Hypothesis checklist:

| Hypothesis | How to check |
|------------|--------------|
| Duplicate EARN | Multiple `EARN` for same `commercial_transaction_id` |
| Missing REVERSAL | Cancel/void without `reverseCashbackEntry` |
| Incorrect USE | USE amount vs order/POS clamp / goods amount |
| Legacy / mirror confusion | Operator looked at `customers.balance` instead of account |
| Manual adjustment | Unexpected `ADJUSTMENT` or ad-hoc SQL (forbidden) |
| Race / unique repair failure | Concurrent paths + alert history |
| Data corruption | Impossible nets; missing commercial links |

6. Do **not** silently repair.  
7. Preserve originals.  
8. Escalate for **traceable** controlled correction (§16).

### 9.3 DUPLICATE EARN

**Invariant:** one eligible commercial transaction → **max one EARN**.

Check:

- `commercial_transaction_id`  
- `sourceType` / `sourceKey`  
- ledger `EARN` rows  
- DB unique constraints  
- retry history: HTTP, worker (`fom_retry`, order complete), client retry  

**Idempotent retry** (`earnCashback` returns `idempotent: true`) is **expected** — not an incident.

**True duplicate group** (integrity / DB shows >1 EARN for one commercial):

1. Identify the duplicate group.  
2. Preserve all rows.  
3. Determine which entry is authoritative (usually first committed EARN + matching commercial).  
4. Do **not** DELETE history.  
5. If correction approved: use existing **`reverseCashbackEntry` / `refundOrderCashback`** paths — do **not** invent a new correction mechanism.

### 9.4 DUPLICATE REVERSAL

**Invariant:** one original ledger entry → **max one REVERSAL** (`reverses_entry_id` uniqueness).

- Concurrent second reverse → idempotent existing REVERSAL / alert `CASHBACK_DUPLICATE_REVERSAL_ATTEMPT` is often expected.  
- If two REVERSAL rows exist for one original: preserve evidence; escalate; **do not** delete original EARN/USE; **do not** add another REVERSAL “to balance the count.”

### 9.5 INCORRECT CASHBACK USE (customer claim)

Verify in order:

1. Order / POS sale identity (server, not client).  
2. Eligible goods amount (exclude delivery where applicable).  
3. Configured `maxSpendRatio` (default **0.30** / 30%).  
4. Client requested amount (informational only).  
5. **Authoritative** amount actually written on USE ledger.  
6. Order/POS cashback-used fields.  
7. Cancel / REVERSAL status.

**Policy:** Client is **not** authoritative for cashback amount. Server clamps via `useCashback` + `eligibleGoodsAmount` / `clampCashbackSpend`. Operators must not “honor” a client-submitted amount against the ledger.

### 9.6 WRONG SOURCE (history UI)

Inspect:

- `commercial_transactions.source_type` / `source_key`  
- `cashback_ledger` link  
- order / POS sale / branch metadata  

Valid stored types: `ORDER` | `POS` | `SYSTEM` | `FOM_POS`.

- Do **not** manually relabel to `FOM_POS`.  
- `FOM_POS` without stable external receipt identity remains **`CONTRACT_PENDING`**.  
- History API (`getCustomerCashbackHistory`) is a **read-model** over SoT — do not create a second history source or “fix” UI offline.

### 9.7 CUSTOMER ISOLATION

If customer A appears to see customer B’s cashback → treat as **HIGH** or **CRITICAL** depending on confirmed exposure.

Immediately verify:

- `requireCustomer(req)` session ownership  
- ledger `customer_id`  
- order / POS / commercial `customer_id`  
- History route does not authorize via client `customerId` / `orderId` / `sourceKey`

Containment: revoke affected sessions if compromise suspected; preserve evidence; escalate security + eng.  
**Never** use client-provided IDs as AuthZ.

### 9.8 CASHBACK HISTORY API

`GET /api/loyalty/cashback-history` incorrect:

```text
API response
  ↓ compare
cashback_ledger
  ↓ join
commercial_transactions
  ↓ enrich
order / POS / branch metadata
```

Do not invent a parallel history store. Repair means fixing SoT or presentation bugs via normal engineering change control — not manual UI data patches.

### 9.9 CASHBACK BALANCE DISPLAY

If UI ≠ “backend”:

1. `cashback_accounts.balance`  
2. `getAuthoritativeBalance` / loyalty profile / `/auth/me` DTO  
3. Mobile `AppContext` mapping  
4. Optionally compare `customers.balance` **only** as mirror drift signal  

Classify: backend SoT vs API DTO vs client cache vs rendering vs legacy mirror confusion.  
**Do not trust** `customers.balance` as independent truth.

### 9.10 REDIS FAILURE

| Fact | Detail |
|------|--------|
| Redis role | Shared rate-limit storage (abuse control) |
| Not role | Cashback balance / ledger / commercial SoT |
| Production-like missing/down Redis | Fail-closed: startup requires `REDIS_URL`; requests may return **503** + `RATE_LIMIT_REDIS_UNAVAILABLE` — **no** in-memory fallback |
| Development | In-memory fallback when Redis unset |

**Do not** move cashback into Redis.  
**Do not** manually change cashback balances because Redis is down.  
PostgreSQL remains authoritative.  

**OPEN:** Real staging/production Redis operational gate remains **BLOCKED/OPEN** until live `REDIS_URL` verification passes (see ops Redis gate).

### 9.11 POSTGRESQL FAILURE

PostgreSQL is the financial Source of Truth.

| Never | Prefer |
|-------|--------|
| Reconstruct balances from mobile/cache | Wait for DB recovery |
| Destructive resets / TRUNCATE | Restore from managed backup/PITR |
| Use PGlite as production recovery | Empty staging restore drill from provider backup |

**OPEN — MANAGED POSTGRESQL BACKUP/PITR** until provider backups + restore drill are evidenced in [`PRODUCTION_OPS_RUNBOOK.md`](PRODUCTION_OPS_RUNBOOK.md).

---

## 10. Recovery guidance

1. Prefer **engine-native** paths already in code: `reverseCashbackEntry`, `refundOrderCashback` (staff), cancel/void flows that already reverse USE.  
2. Any balance correction must remain **ledger-backed** and auditable.  
3. After mechanical recovery, re-run integrity check until `MATCH` for affected accounts (or document residual DRIFT with ticket).  
4. Clear or annotate alerts with incident ID (do not delete historical alert evidence from the ticket).

---

## 11. Post-incident verification checklist

- [ ] No true duplicate EARN for the same commercial  
- [ ] No true duplicate REVERSAL for the same original entry  
- [ ] No actual negative `cashback_accounts.balance`  
- [ ] Reconciliation MATCH (or documented residual DRIFT + owner)  
- [ ] Customer isolation still holds (A ↛ B)  
- [ ] Source metadata integrity (`sourceType` / `sourceKey`)  
- [ ] History API matches SoT for sample customers  
- [ ] Mobile display uses authoritative balance  
- [ ] Relevant alerts understood / annotated  
- [ ] Idempotent retry of the original operation does not double-apply  

---

## 12. NEVER DO THIS (prohibited operations)

Never:

- DELETE `cashback_ledger` entries  
- TRUNCATE cashback / commercial tables  
- RESET the production database to “clear” an incident  
- Manually overwrite `cashback_accounts.balance` without approved controlled correction  
- Use `customers.balance` as financial authority or “repair” SoT by editing the mirror alone  
- Invent FOM receipts or commercial transaction IDs  
- Create fake cashback entries to “fix” UI  
- Modify production ledger from the mobile client  
- Disable idempotency or unique constraints  
- Use PGlite as a production database  
- Use in-memory rate limiting as production multi-instance authority  
- Enable FOM inventory writer without contract  
- Enable production PSP without controlled cutover  
- Relabel transactions to `FOM_POS` without stable vendor receipt identity  
- Automatically rewrite financial data from the integrity checker  

---

## 13. Controlled correction

Financial corrections must be:

- **Traceable** (ledger REVERSAL or equivalent engine write)  
- **Authorized** (named actor / staff role)  
- **Reasoned** (ticket + root cause)  
- **Linked** to original commercial / ledger entry  
- **Auditable** (prefer existing `audit_log` where the path already writes it, e.g. refund-cashback)  
- **Reversible where appropriate** (further REVERSAL policy remains Q5-aware — do not invent formulas)

**Do not invent a new admin correction API in this runbook.**

If a safe, dedicated HQ correction workflow is not available beyond existing reverse/refund paths:

| Item | Status |
|------|--------|
| Controlled financial correction workflow | **OPEN — CONTROLLED FINANCIAL CORRECTION WORKFLOW** |

Escalate product + eng for approved engine-native correction; do not improvise SQL balance fixes.

---

## 14. Evidence collection

### Collect

| Field | Example |
|-------|---------|
| Timestamp (UTC) | |
| Environment | staging / production |
| Customer internal ID | if policy allows |
| `commercialTransactionId` | |
| `orderId` / `orderCode` | if relevant |
| `sourceType` / `sourceKey` | |
| Ledger IDs + entry types + amounts | |
| Account balance + `ledgerNet` + MATCH/DRIFT | |
| Request / worker job identifiers | non-secret |
| Alert codes | e.g. `CASHBACK_LEDGER_DRIFT` |
| Integrity report excerpt | no secrets |

### Never collect / expose

- Passwords, OTP, bearer tokens, session secrets  
- Card PAN, CVV  
- Merchant / PSP secrets, API keys  
- Raw Redis keys that embed secrets (keys are hashed in-app; still do not dump Redis wholesale into tickets)  

---

## 15. Escalation

| Severity | Escalate to |
|----------|-------------|
| CRITICAL | Eng on-call + security (if isolation) + product owner + platform/DB ops |
| HIGH | Eng on-call + payments/cashback owner |
| MEDIUM | Eng on-call; document; schedule fix |
| LOW | Backlog / docs owner |

Include: severity, SoT reconciliation result, customer impact estimate, containment already taken, OPEN infra dependencies (Redis / PITR).

---

## 16. OPEN operational items (do not claim closed)

| # | Item | Status |
|---|------|--------|
| 1 | Real Redis staging/production configuration + live multi-instance gate | **OPEN / BLOCKED** until live verify |
| 2 | Managed PostgreSQL backup / PITR + restore drill | **OPEN** |
| 3 | FOM_POS stable external receipt contract | **OPEN** (`CONTRACT_PENDING`) |
| 4 | Q3 FOM pickup earn exact timing | **OPEN** |
| 5 | Infrastructure / cloud monitoring (beyond log `alertCode`) | **OPEN** |
| 6 | Dedicated cashback metrics dashboard | **OPEN** |
| 7 | Controlled financial correction workflow (beyond existing reverse/refund) | **OPEN** |

---

## 17. Quick operator cheat sheet

| Symptom | First check | SoT action |
|---------|-------------|------------|
| Balance “wrong” on phone | `getAuthoritativeBalance` / `cashback_accounts` | Ignore `customers.balance` as truth |
| History wrong source | `commercial_transactions.source_type` | Do not invent FOM_POS |
| Double earn suspected | Count EARN per commercial id | Prefer reverse path if approved |
| Drift alert | Integrity CLI / job | Never auto-repair |
| Redis 503 | `RATE_LIMIT_REDIS_UNAVAILABLE` | Restore Redis; do not edit money |
| PG down | Platform restore | No PGlite / no mobile reconstruct |

---

## Document control

| Item | Value |
|------|-------|
| Created for | Universal Cashback 2.0 production operations |
| Mode | Documentation / audit — financial engine untouched |
| Supersedes | N/A (complements `PRODUCTION_OPS_RUNBOOK.md`) |
