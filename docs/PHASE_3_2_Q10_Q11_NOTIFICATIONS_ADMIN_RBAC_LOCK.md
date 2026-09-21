# Q10 + Q11 LOCK — Notifications and Admin/RBAC Architecture

**Status:** LOCKED (technical architecture principles only)  
**Mode:** Documentation / design only — **no application implementation**  
**Depends on:** Q7 auth/OTP; Q8 payment; Q9 delivery; Q10/Q11 analysis  
**Does not lock:** Provider-specific contracts, numeric thresholds, or final business policies  
**Must not reopen:** Q1–Q9; **Q3 remains OPEN**

---

## Document control

| Item | Value |
|------|--------|
| Decision IDs | Q10 (notifications), Q11 (admin/RBAC) |
| Implementation | Forbidden in this phase |
| Schema / migrations / API / UI / `.env` | Not modified in this phase |
| Prior analysis | [`PHASE_3_2_Q10_Q11_NOTIFICATIONS_ADMIN_RBAC_ANALYSIS.md`](PHASE_3_2_Q10_Q11_NOTIFICATIONS_ADMIN_RBAC_ANALYSIS.md) |

---

# IMPORTANT

**Do NOT lock** provider-specific or business-policy details that remain OPEN (channels, role catalog, MFA rollout, retry counts, etc.).

---

# Q10 — Notifications architecture

## 1. Notification failure isolation

**LOCKED:**

Notification failure must **NOT** rollback or corrupt:

- orders  
- payments  
- inventory  
- reservations  
- cashback  
- loyalty  

A notification is a **side effect** of a business event, not the source of truth for the business transaction.

Example: order completed → notification provider fails → order must **not** revert to incomplete.

---

## 2. Asynchronous commerce notifications

**LOCKED target architecture:**

```text
Business Event
  → durable Outbox / Event
  → Background Job
  → Notification Provider
  → Delivery Result
  → Retry / Dead Letter handling
```

Commerce notifications should **not** require synchronous provider delivery inside the main financial/order transaction.

---

## 3. Durable outbox / event direction

**LOCKED:**

Important commerce events should eventually be represented by a durable event/outbox mechanism before asynchronous notification processing.

**Example event types** (catalog OPEN):

- order created / confirmed / cancelled  
- payment confirmed / failed  
- delivery assigned / out for delivery / completed  
- cashback earned / reversed  

Exact event catalog remains **OPEN**.

---

## 4. Notification idempotency

**LOCKED:**

Repeated business events, worker retries, provider retries, and process restarts must not unintentionally create duplicate notification effects.

Notification dispatch must have a stable logical identity / idempotency strategy.

Examples that must be safe under retry: same order confirmation, payment confirmation, delivery completion, cashback event.

---

## 5. Retry safety

**LOCKED:**

Notification delivery must eventually support: retry, backoff, failure classification, dead-letter / unresolved state.

A temporary provider/network failure must not permanently lose an important notification.

Exact retry counts and timing remain **OPEN**.

---

## 6. Provider abstraction

**LOCKED:**

Notification business logic must not be tightly coupled to one provider.

Architecture must support separate provider adapters for channels such as: SMS, Push, Telegram, Email.

Current Eskiz OTP integration remains a provider implementation.

Do **not** invent future provider contracts.

---

## 7. OTP boundary

**LOCKED (preserve Q7):**

OTP remains an authentication/security flow.

Notification infrastructure must **NEVER** expose OTP codes in:

- normal notification history  
- analytics  
- logs  
- admin notification screens  
- notification payloads  
- audit records beyond what is strictly necessary  

Do not reopen Q7.

---

## 8. Secret / sensitive data boundary

**LOCKED:**

Notification payloads must not contain unnecessary sensitive information.

Never include: payment provider secrets, merchant credentials, OTP codes, authentication tokens, unnecessary personal data.

Notification workers must receive only the minimum data required to perform the notification.

---

## 9. Distributed notification safety

**LOCKED:**

The future notification system must be safe across multiple backend instances.

Do **not** rely on process-local queues, process-local notification state, or in-memory-only retry state for durable commerce notification guarantees.

---

## 10. Notification auditability

**LOCKED:**

Important notification attempts should eventually be auditable.

Architecture should be able to distinguish: queued, processing, sent, delivered (where provider supports), failed, retrying, dead-letter/unresolved.

Exact notification history UI remains **OPEN**.

---

## 11. Notification preferences as separate policy

**LOCKED:**

Notification delivery preferences are separate from business-event truth.

A user may eventually configure channel preferences, but preference logic must not delete or alter the underlying order/payment/delivery event.

Exact preferences remain **OPEN**.

---

## 12. Localization as presentation concern

**LOCKED:**

Notification localization/templates must not alter business state.

Templates should eventually support localized presentation independently from core business events.

Exact languages and template management remain **OPEN**.

---

## Q10 LOCKED vs OPEN

### LOCKED

| # | Principle |
|---|-----------|
| 1 | Notification failure does not rollback business transactions |
| 2 | Commerce notifications are asynchronous |
| 3 | Durable outbox/event architecture is required |
| 4 | Notification dispatch is idempotent |
| 5 | Retry/DLQ capability is required |
| 6 | Provider abstraction is required |
| 7 | OTP remains under Q7 |
| 8 | Secrets/OTP must not leak into notifications |
| 9 | Multi-instance notification processing must be safe |
| 10 | Notification attempts are auditable |
| 11 | Preferences do not change business truth |
| 12 | Localization is separate from business logic |

### OPEN

| # | Decision |
|---|----------|
| 1 | Exact channels per event |
| 2 | Provider selection |
| 3 | Retry counts / timing |
| 4 | Template system |
| 5 | Notification preferences |
| 6 | Localization / languages |
| 7 | Admin notification alerts |
| 8 | Email / push / Telegram providers |
| 9 | Notification history UI |
| 10 | Exact commerce event catalog |

---

# Q11 — Admin / RBAC architecture

## 13. Authentication vs authorization

**LOCKED:**

| Concern | Answers |
|---------|---------|
| **Authentication** | Who is this actor? |
| **Authorization** | What is this actor allowed to do? |

They are separate concerns.

Successful admin authentication must **NOT** automatically grant unrestricted administrative access.

---

## 14. Server-side authorization

**LOCKED:**

All privileged operations must be authorized **server-side**.

Client UI hiding buttons is **NOT** authorization.

Backend must validate: actor, role, permission, resource, action, branch scope where applicable.

---

## 15. RBAC + optional branch scope

**LOCKED conceptual model:**

```text
USER
  → ROLE
  → PERMISSION
  → RESOURCE / ACTION
  → optional BRANCH SCOPE
```

A branch-scoped actor must not automatically receive HQ/global access.

Exact role catalog remains **OPEN**.

---

## 16. Branch isolation

**LOCKED:**

Branch-scoped staff must not access another branch's restricted operational data unless explicitly authorized.

Includes where applicable: orders, inventory, delivery operations, branch sales, branch payment operations, branch-specific customer information, branch reports.

Cross-branch access must be an **explicit** authorization decision.

---

## 17. Sensitive payment secret access

**LOCKED:**

Payment provider secrets must have **restricted** privileged access.

Normal cashier/admin access must **NOT** automatically grant access to: Payme secrets, Click secrets, provider credentials, merchant private credentials.

Payment secret access must be separated from ordinary operational permissions.

Final owner remains **OPEN**.

---

## 18. Auditability of privileged actions

**LOCKED:**

Privileged administrative operations must be auditable.

Where appropriate: actor, action, resource, resource ID, branch/scope, timestamp, result, relevant before/after values, reason where required by policy.

Do **not** store secrets in audit logs.

---

## 19. Admin session revocation direction

**LOCKED:**

Administrative sessions must eventually be **revocable**.

Logout/revocation must not merely return success while leaving an indefinitely valid credential active.

Exact session architecture and TTL remain **OPEN**.

---

## 20. Admin login abuse protection

**LOCKED:**

Administrative authentication must have server-side abuse protection.

Target capabilities: rate limiting, failed-login tracking, brute-force protection, auditability.

Exact thresholds remain **OPEN**.

---

## 21. MFA as security capability

**LOCKED:**

Architecture must be capable of supporting MFA for privileged administrative accounts.

Do **not** mandate the exact MFA mechanism or rollout policy yet.

---

## 22. Privilege escalation protection

**LOCKED:**

An actor must not be able to grant themselves permissions or modify their own authorization boundary unless explicitly authorized by a higher-trust administrative policy.

Protect: role assignment, permission assignment, branch scope, payment secret access, sensitive settings.

---

## 23. Courier authorization boundary

**LOCKED (preserve Q9):**

Courier access must be treated as a distinct authorization boundary.

Courier permissions must not automatically grant: payment administration, cashback adjustment, loyalty administration, global inventory management, customer administration.

Do not reopen Q9.

---

## 24. Worker / background job authorization

**LOCKED:**

Background workers must not bypass domain authorization boundaries simply because they run internally.

Workers should operate through explicit trusted capabilities/services.

A notification worker must not gain unrestricted admin permissions.

---

## 25. Current critical admin gaps (future work)

Do **not** fix in this phase:

1. Flat `requireAdmin` authorization  
2. Missing permission matrix  
3. Weak branch isolation  
4. Cashier ≈ superuser risk  
5. Payment secret ACL missing  
6. Payment secrets potentially exposed through admin APIs  
7. Missing admin MFA  
8. Missing admin login rate limiting  
9. Missing session revocation  
10. Privileged actions incompletely audited  
11. Courier authorization incomplete  
12. Unauthenticated privileged delivery/payment/FOM paths  
13. Cross-branch privilege risks  
14. POS cross-branch authorization risk  
15. Role assignment / permission escalation protection incomplete  

---

## Q11 LOCKED vs OPEN

### LOCKED

| # | Principle |
|---|-----------|
| 1 | Authentication and authorization are separate |
| 2 | Authorization is server-side |
| 3 | RBAC is the target authorization model |
| 4 | Branch scope is explicit |
| 5 | Branch isolation is mandatory |
| 6 | Sensitive payment secrets require restricted access |
| 7 | Privileged actions are auditable |
| 8 | Admin sessions must be revocable |
| 9 | Admin login requires abuse protection |
| 10 | MFA capability is required architecturally |
| 11 | Privilege escalation must be prevented |
| 12 | Courier authorization remains separate |
| 13 | Workers cannot bypass authorization boundaries |

### OPEN

| # | Decision |
|---|----------|
| 1 | Exact role catalog |
| 2 | Exact permission matrix |
| 3 | Exact branch scope model |
| 4 | MFA mechanism / policy |
| 5 | Session TTL |
| 6 | Session / device policy |
| 7 | Secret owners |
| 8 | Cashier admin-web capabilities |
| 9 | Cross-branch customer visibility |
| 10 | Admin UI structure |

---

# Cross-domain locks (Q10 ↔ Q11)

**LOCKED:**

Notifications ↔ Admin/RBAC must respect authorization and data-minimization boundaries.

Examples:

- notification worker cannot bypass authorization  
- admin notification access is permission-controlled  
- OTP must not appear in ordinary notification history  
- payment secrets must never enter notifications  
- delivery / cashback / payment notifications must be generated from trusted business events  

---

# Consistency with prior locks

| Lock | Status |
|------|--------|
| Q1 inventory | Not reopened |
| Q2 three-axis order state | Not reopened |
| Q3 FOM semantics | Remains **OPEN** |
| Q4 cashback | Not reopened |
| Q5 refund/reversal | Not reopened |
| Q6 loyalty | Not reopened |
| Q7 auth/OTP | Not reopened — OTP boundary reinforced |
| Q8 payment | Not reopened — secret ACL reinforced |
| Q9 delivery | Not reopened — courier AuthZ reinforced |

---

# Q10 current critical gaps (future work)

Do **not** fix in this phase:

1. No commerce notification system  
2. No durable outbox / async workers / DLQ  
3. No push / email / Telegram outbound  
4. No notification tables / preferences / history  
5. OTP sync path + Q7 hardening gaps  
6. In-memory-only rate limits for SMS abuse (multi-instance)  

---

**Q10 + Q11 LOCK COMPLETE — NOTIFICATIONS AND ADMIN/RBAC ARCHITECTURE LOCKED — BUSINESS POLICIES REMAIN OPEN — NO IMPLEMENTATION PERFORMED.**
