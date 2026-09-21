# Q15 + Q16 + Q17 LOCK — Promotions/Pricing, Background Jobs/Outbox, API Architecture

**Status:** LOCKED (technical architecture principles only)  
**Mode:** Documentation / design only — **no application implementation**  
**Depends on:** Q10–Q14 locks; Q15–Q17 analysis  
**Does not lock:** Promotion stacking/eligibility numbers, retry counts, exact API version/error/idempotency formats  
**Must not reopen:** Q1–Q14; **Q3 remains OPEN**

---

## Document control

| Item | Value |
|------|--------|
| Decision IDs | Q15 (promotions/pricing), Q16 (jobs/outbox), Q17 (API reliability) |
| Implementation | Forbidden in this phase |
| Schema / migrations / API / UI / `.env` | Not modified in this phase |
| Prior analysis | [`PHASE_3_2_Q15_Q16_Q17_PROMOTIONS_JOBS_API_ANALYSIS.md`](PHASE_3_2_Q15_Q16_Q17_PROMOTIONS_JOBS_API_ANALYSIS.md) |

---

# Q15 — Promotions / pricing

## LOCKED

1. **Server is the authoritative pricing engine.**  
   Client must never determine final: product price, discount, promotion, cashback usage, delivery fee, order total.

2. **Pricing must be deterministic and explainable.**  
   Result should eventually be reproducible from: cart, customer context, branch, channel, effective time, applicable promotion configuration.

3. **Product base price and promotion/discount are separate concepts.**

4. **Historical order pricing is immutable.**  
   Changing today’s product price must not change old orders.

5. **Promotion effective dates are server-controlled.**  
   Expired promotions must not apply. Future promotions must not apply early.

6. **Promotion usage limits must be concurrency-safe.**  
   Concurrent requests must not bypass global / per-user / per-order limits.

7. **Promotion application must eventually be auditable.**  
   System must be able to explain why a discount was applied.

8. **Promotion calculation must not become inventory truth.**

9. **Promotion calculation must not become payment truth.**

10. **Promotion calculation must not bypass cashback/loyalty architecture** (Q4/Q6).

---

## Q15 OPEN business policy

- promotion stacking  
- priority  
- exclusive / combinable promotions  
- eligibility rules  
- minimum order  
- maximum discount  
- branch targeting  
- product / category targeting  
- cashback interaction  
- loyalty interaction  
- delivery fee promotions  
- exact usage limits  
- exact business timezone policy  

Do not invent answers.

---

## Q15 current gaps (future work)

Do not fix now: promotion engine maturity; stacking/priority policy; usage-limit concurrency; effective-date handling; pricing auditability; promotion snapshot on orders.

---

# Q16 — Background jobs / queues / outbox

## LOCKED

1. **Durable outbox/event architecture** is required for important asynchronous business events.

```text
BUSINESS TRANSACTION
  → COMMITTED BUSINESS STATE
  → DURABLE OUTBOX EVENT
  → WORKER / JOB
  → EXTERNAL EFFECT
```

2. Outbox event representing a committed business change must be persisted **transactionally** with that business change where appropriate.

3. Workers must assume **at-least-once** delivery/execution. Never depend on exactly-once execution.

4. Workers must be **idempotent**. Duplicate jobs/retries must not create duplicate business effects.

5. Retryable failures must eventually support: retry, backoff, failure classification, dead-letter/unresolved state.  
   Exact retry counts/timings remain **OPEN**.

6. **Multiple worker instances** must be supported. Do not rely on process-local memory for correctness.

7. Redis/BullMQ may be used for coordination/performance, but **never** become source of truth for: money, inventory, orders, reservations, cashback.

8. **Scheduled jobs must be safe to repeat** (reservation expiry, OTP cleanup, notification retry, payment/inventory reconciliation, stale cart cleanup, analytics aggregation). Repeated execution must not duplicate business effects.

9. Background jobs require **observability**: queued, running, succeeded, failed, retrying, dead-letter/unresolved.

10. Workers must **not** bypass authorization/domain boundaries. A worker is not automatically a super-admin.

11. Long-running/retryable provider work should not unnecessarily block synchronous HTTP requests.

---

## Q16 current gaps (future work)

Do not fix now:

- no durable outbox  
- no proper worker architecture  
- no reliable retry system  
- no DLQ  
- no reservation expiry worker  
- no payment reconciliation worker  
- no inventory reconciliation worker  
- weak scheduled-job architecture  
- missing job observability  

---

# Q17 — API architecture / reliability

## LOCKED

1. **Production API contracts must be versioned.**  
   Existing compatibility should be preserved during migration where practical.

2. **All untrusted input must be validated server-side**  
   (type, format, range, enum, ownership, branch scope, authorization, business state).

3. **Client validation is never sufficient** for security or business correctness.

4. **Production API errors must use a consistent machine-readable error model.**  
   Do not expose: stack traces, SQL errors, secrets, internal infrastructure details.

5. **Mutation endpoints must use appropriate idempotency** where retries can create duplicate effects — especially: checkout, payment creation, payment callbacks, refunds, cashback, reservations, delivery events, notification dispatch.

6. **Collection endpoints must be bounded/paginated.**  
   No production API should return an unbounded catalog/order/customer dataset.

7. **All privileged endpoints require server-side authorization** (preserve Q11).

8. **External webhooks/callbacks must support:** authentication/signature verification, stable event identity, idempotency, duplicate/replay safety, invalid transition rejection, auditability.  
   Do not invent provider-specific contracts.

9. Production requests and important asynchronous events should support **correlation/request identifiers**.

10. **Long-running work** should move to asynchronous processing where appropriate (notifications, reconciliation, provider retries, heavy imports, heavy analytics).

11. If file uploads exist or are introduced: type validation, size limits, safe storage, access control, malware/security scanning where appropriate, safe non-executable storage.

12. Production API **observability** must eventually include: structured logs, request/correlation IDs, latency metrics, error metrics, endpoint metrics, provider error visibility.

13. **Health and readiness must be conceptually separated**  
    (process alive / application ready / critical dependency availability).  
    Health endpoints must not expose sensitive internals.

---

## Q17 current gaps (future work)

Do not fix now:

- API versioning gaps  
- inconsistent validation  
- inconsistent errors  
- missing idempotency  
- pagination gaps  
- webhook authentication/security gaps  
- missing correlation IDs  
- long synchronous operations  
- observability gaps  
- health/readiness gaps  
- sensitive field exposure risks  

---

# Cross-domain locks

**LOCKED:**

1. Pricing is server-authoritative  
2. Promotions cannot override inventory truth  
3. Jobs are not financial/inventory truth  
4. Workers are idempotent  
5. Outbox represents committed business events  
6. APIs cannot bypass RBAC  
7. Webhooks cannot bypass payment/FOM/delivery state rules  
8. Redis/queues are not money or inventory truth  
9. Long-running work belongs in background jobs where appropriate  
10. External callbacks must be authenticated and idempotent  
11. Important business operations need correlation IDs  
12. API collections must be bounded/paginated  

---

# LOCKED vs OPEN

## LOCKED

| # | Principle |
|---|-----------|
| 1 | Server-authoritative pricing |
| 2 | Deterministic pricing architecture |
| 3 | Immutable historical order pricing |
| 4 | Effective-date safety |
| 5 | Concurrency-safe promotion limits |
| 6 | Promotion auditability |
| 7 | Durable outbox direction |
| 8 | At-least-once worker safety |
| 9 | Worker idempotency |
| 10 | Retry/backoff capability |
| 11 | DLQ/unresolved failure capability |
| 12 | Distributed worker support |
| 13 | Repeat-safe scheduled jobs |
| 14 | Worker observability |
| 15 | Worker security boundaries |
| 16 | API versioning |
| 17 | Server-side validation |
| 18 | Safe error model |
| 19 | Mutation idempotency |
| 20 | Bounded pagination |
| 21 | Server-side authorization |
| 22 | Webhook authentication/idempotency |
| 23 | Correlation/request IDs |
| 24 | Async offload for long-running work |
| 25 | Upload security capability |
| 26 | API observability |
| 27 | Health/readiness architecture |

## OPEN

| # | Decision |
|---|----------|
| 1 | Promotion stacking |
| 2 | Promotion priority |
| 3 | Exact eligibility rules |
| 4 | Exact limits |
| 5 | Promotion/cashback interaction |
| 6 | Loyalty interaction |
| 7 | Delivery promotion policy |
| 8 | Exact outbox implementation |
| 9 | Redis vs BullMQ final choice |
| 10 | Retry counts/timing |
| 11 | DLQ retention |
| 12 | Exact API version format |
| 13 | Exact error schema |
| 14 | Exact idempotency-key format |
| 15 | Exact pagination mechanism |
| 16 | CORS policy |
| 17 | Exact metrics/SLOs |
| 18 | Exact health/readiness dependency policy |

---

# Consistency with prior locks

| Lock | Status |
|------|--------|
| Q1–Q2, Q4–Q14 | Not reopened |
| Q3 FOM | Remains **OPEN** |
| Q4/Q6 cashback/loyalty | Reinforced — pricing must not bypass |
| Q8/Q9 payment/delivery | Reinforced — webhooks cannot bypass state rules |
| Q10 notifications | Reinforced — outbox/worker direction |
| Q11 admin/RBAC | Reinforced — APIs/workers cannot bypass AuthZ |
| Q13 checkout | Reinforced — server pricing / snapshots |

---

**Q15 + Q16 + Q17 LOCK COMPLETE — PROMOTIONS/PRICING, BACKGROUND JOBS/OUTBOX, AND API ARCHITECTURE LOCKED — BUSINESS POLICIES REMAIN OPEN — NO IMPLEMENTATION PERFORMED.**
