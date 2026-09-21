# Q15 + Q16 + Q17 BATCH ANALYSIS — Promotions/Pricing, Background Jobs/Queues, API Architecture

**Status:** ANALYSIS ONLY (not a lock)  
**Mode:** Documentation / analysis only — **no application implementation**  
**Must not reopen:** Q1–Q14; **Q3 remains OPEN**

---

## Document control

| Item | Value |
|------|--------|
| Decision IDs | Q15 (promotions/pricing), Q16 (jobs/outbox), Q17 (API reliability) |
| Implementation | Forbidden in this phase |
| Verdict | Promos are marketing-only; no job/outbox runtime; API is flat `/api` with thin middleware and major reliability gaps |

---

# Q15 — Promotions / Pricing

## 1. Current implementation

| Capability | Status |
|------------|--------|
| Marketing `promos` table | Exists (title/subtitle/tag/icon/active) |
| Discount / coupon engine | **Missing** |
| Promo codes | **Missing** |
| Product/category/brand/branch targeting | **Missing** |
| Cart/order-level discounts | **Missing** |
| Checkout total formula “− discounts” | **Unimplemented** (Q13 lock aspirational) |
| Rewards redeem | Points → balance / redeemed list — **not** order discount |
| Admin promo CRUD | GET list only |
| Mobile promos | Often **hardcoded**; API unused |

**Money:** integer UZS; cashback via `computeCashback` only.

## 2. Pricing flow

```text
Σ products.price × qty
- cashback USED (if requested)
+ DELIVERY_FEE (if delivery)
= payable total
```

Server-authoritative for posted totals. Client preview is non-authoritative. **No promotion term.**

## 3. Promotion model

Marketing cards ≠ pricing rules. No type, amount, %, dates, limits, stacking, precedence, or cashback/loyalty coupling tables.

Product base price and promotion remain conceptually separate (Q13) — promotion side empty.

## 4. Usage limits

N/A for discounts. Rewards: one-time code append to `redeemedRewards` only.

## 5. Concurrency

No promo usage counters. Cashback concurrency gaps remain under Q4/Q13 (not promo-specific).

## 6. Auditability

Order snapshots unit price + order totals; **no** applied-promo rule IDs / before-after discount audit.

## 7. Current gaps

- Promotion engine maturity  
- Stacking/priority policy  
- Usage-limit concurrency  
- Effective-date handling  
- Pricing auditability  
- Promotion snapshot on orders  

## 8. Target architecture

```text
Base product price
  + Promotion engine (deterministic, server-side, effective dates)
  + Cashback USE (Q4)
  + Delivery fee
  → payable total
  → commercial snapshot (immutable on order)
```

## 9. LOCKED candidates (not locked this turn)

- Client cannot decide final price/discount/promo/cashback/fee/total  
- Deterministic explainable pricing for same inputs  
- Base price ≠ promotion concept  
- Historical order pricing immutable  
- Effective periods enforced on server time  
- Usage limits concurrency-safe  
- Pricing decisions auditable/reconstructable  

## 10. OPEN business decisions

Stacking, priority, exclusive vs combinable, eligibility, usage limits, min order, max discount, branch/product targeting, cashback/loyalty/delivery-fee interaction, timezone/business-day details.

---

# Q16 — Background Jobs / Queues / Outbox

## 1. Current implementation

**No** BullMQ, Redis client, workers, outbox tables, cron modules, or job runners.

API is request-driven only (`index.ts` listen).

## 2. Existing queues/workers

**None.** Specs describe Redis/BullMQ; code does not.

## 3. Scheduled jobs

| Item | Status |
|------|--------|
| Rate-limit Map GC (`setInterval` 60s) | Process-local only |
| Reservation expiry | **Missing** (`reserved_until` field only) |
| OTP expired-row cleanup | **Missing** (delete-on-verify only) |
| Notification retry | **Missing** |
| Payment / inventory reconcile | **Missing** |
| Stale cart cleanup | **Missing** |

## 4. Outbox

**Missing** — conflicts with Q10 direction until implemented.

## 5. Retry

OTP SMS fails in-request (502). No bounded retry/backoff/DLQ for async work.

## 6. Idempotency

POS `receiptId` only for walk-in. No job-level idempotency keys. Workers must be designed at-least-once (direction).

## 7. DLQ

**Missing.**

## 8. Distributed processing

In-memory rate limits fail multi-instance. No shared queue. PostgreSQL remains truth for money/inventory/orders (Q1/Q8/Q4).

## 9. Observability

No job states (queued/running/failed/DLQ). Partial API logs via pino-http.

## 10. Current gaps

- no durable outbox  
- no worker architecture  
- no reliable queue  
- no retry/DLQ  
- no reservation expiry worker  
- no payment/inventory reconciliation workers  
- weak scheduled-job architecture  
- no notification jobs  

## 11. Target architecture

```text
Business commit (+ outbox row)
  → queue / worker(s)
  → idempotent handler
  → retry / backoff / DLQ
  → observability

Scheduled: reservation expiry, OTP cleanup, reconcile, notify retry
```

Redis/BullMQ OK for coordination; **not** money/inventory truth.

## 12. LOCKED candidates (not locked this turn)

- Durable outbox when async required; transactional with business change  
- At-least-once + idempotent workers  
- Bounded retries + DLQ visibility  
- Multi-instance workers; no process-local correctness  
- Repeated scheduled jobs safe  
- Job observability  
- Workers respect authorization boundaries (Q11)  

## 13. OPEN decisions

Retry counts/timing; queue product (BullMQ vs other); worker deployment topology; monitoring UI; which events enter outbox first; retention for DLQ.

---

# Q17 — API Architecture / Reliability

## 1. Current API structure

Express 5, mount `app.use("/api", router)`, domain routers with flat paths.

Auth: customer HMAC / Telegram header; admin HMAC; POS QR HMAC.

Middleware: pino-http, permissive CORS, JSON/urlencoded, `{ message }` error handler.

## 2. Versioning

**None** — no `/api/v1`. Spec expects versioning.

## 3. Validation

Manual String/Number/allowlists. Zod package unused. No shared DTO layer.

## 4. Authorization

`requireCustomer` / `requireAdmin`; POS branch assert on sale only. Flat admin ACL (Q11 gap). Many privileged mutations unauthenticated (delivery status, simulate-success, FOM sale).

## 5. Error model

Mostly `{ message }` Uzbek strings. No stable error codes / requestId in body. HTML plain-text 404 on payment checkout. Health uses different shape.

## 6. Idempotency

No `Idempotency-Key`. POS receipt unique only. Checkout/payment/webhook/refund paths lack general idempotency (Q8/Q13 gaps).

## 7. Pagination

Essentially **absent** (catalog/admin/customer lists unbounded). POS sales `limit` capped 1–100 only.

## 8. Webhooks

Payme/Click stubs echo; FOM open; delivery status open. No signature verification, event IDs, or replay protection.

## 9. Observability

Pino + pino-http; Authorization redacted. No correlation ID in responses; limited metrics/SLA.

## 10. Health/readiness

`GET /api/healthz` — DB ping; degraded 503. No distinct liveness vs readiness vs dependency matrix beyond DB.

## 11. Current gaps

- API versioning  
- inconsistent validation  
- inconsistent errors  
- missing idempotency  
- pagination gaps  
- webhook security  
- correlation IDs  
- long sync ops (OTP SMS)  
- observability gaps  
- health/readiness depth  
- sensitive field exposure (`admin/customers` passwordHash; branch PATCH secrets)  
- file upload policy (no uploads yet — design when added)  

## 12. Target architecture

```text
/api/v{n}/...
  → authN
  → authZ (Q11)
  → validate input
  → idempotent mutations where needed
  → bounded collections
  → consistent errors + correlation ID
  → async offload (Q10/Q16)
  → verified webhooks (Q8/Q9)
```

## 13. LOCKED candidates (not locked this turn)

- Versioned public contracts  
- Server-side validation of all untrusted input  
- Consistent machine-readable errors; no secret leakage  
- Mutation idempotency where retries expected  
- Bounded pagination  
- Server-side AuthZ (Q11)  
- Webhook auth + idempotency + audit  
- Correlation/request IDs  
- Long work → jobs  
- File upload safety when introduced  
- API observability  
- Health vs readiness distinction  

## 14. OPEN decisions

Exact versioning scheme; error schema details; idempotency-key header format; page vs cursor; CORS allowlist; metrics backend; upload types/size; public vs private API surface catalog.

---

# Cross-domain risks

| Rule | Current risk |
|------|----------------|
| Pricing server-authoritative | Mostly true; promo term missing |
| Promotions cannot override inventory | Vacuous (no promo engine) |
| Jobs ≠ financial truth | No jobs — good default; must hold when added |
| Workers idempotent | N/A until workers exist |
| Outbox = committed events | Missing vs Q10 |
| APIs cannot bypass RBAC | Violated by open delivery/FOM/simulate |
| Webhooks cannot bypass state rules | Stubs/open endpoints |
| Redis ≠ money/inventory | Unused correctly today |
| Long work in jobs | OTP SMS sync |
| Callbacks authenticated/idempotent | Missing |
| Correlation IDs | Weak |
| Bounded collections | Violated |

---

# Final recommendation

| Domain | Priority |
|--------|----------|
| **Q15** | Design server promo engine + order pricing snapshot; keep stacking OPEN; preserve integer money |
| **Q16** | Introduce outbox + workers before commerce notify/reconcile/expiry; keep PG as truth |
| **Q17** | Version APIs; harden validation/errors/pagination/idempotency; secure webhooks; close unauthenticated privileged routes; fix sensitive leaks |

Do **not** implement in this phase. Separate Q15/Q16/Q17 LOCK steps after review.

---

## Consistency with prior locks

| Lock | Status |
|------|--------|
| Q1–Q14 | Not reopened |
| Q3 | Remains OPEN |
| Q10 outbox | Documented as unimplemented gap |
| Q11/Q8/Q13 | Gaps reinforced |

---

**Q15 + Q16 + Q17 ANALYSIS COMPLETE — NO IMPLEMENTATION PERFORMED — PROMOTIONS/JOBS/API READY FOR REVIEW.**
