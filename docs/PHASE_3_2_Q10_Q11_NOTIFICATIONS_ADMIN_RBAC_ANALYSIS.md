# Q10 + Q11 BATCH ANALYSIS — Notifications and Admin/RBAC

**Status:** ANALYSIS ONLY (not a lock)  
**Mode:** Documentation / analysis only — **no application implementation**  
**Must not reopen:** Q1–Q9; **Q3 remains OPEN**

---

## Document control

| Item | Value |
|------|--------|
| Decision IDs | Q10 (notifications), Q11 (admin/RBAC) |
| Implementation | Forbidden in this phase |
| Verdict Q10 | Only **synchronous Eskiz OTP SMS** exists; commerce notifications/outbox/push absent |
| Verdict Q11 | Admin AuthN works; AuthZ is effectively **`requireAdmin` only** (role-string decorative) |

---

# Q10 — Notifications

## 1. Current implementation

| Area | Exists | Partial | Missing |
|------|--------|---------|---------|
| SMS | Eskiz OTP only | — | Non-OTP SMS |
| OTP SMS | Yes (`sms.ts` + `createOtp`) | Dev bypass / `devCode` | Production-hardened path (Q7) |
| Push | — | — | Expo/FCM/OneSignal |
| Telegram notify | — | Telegram = identity/WebApp only | Outbound bot messages |
| Email | — | Admin email = login id; Eskiz email = API login | Customer/admin notify mailer |
| Order/payment/delivery/cashback/loyalty/admin notify | — | Spec lists events | All triggers |
| Notification tables | — | — | `notifications` / `notification_logs` |
| Notification service | SMS helper only | — | Domain notification service |
| Preferences / read-unread / history | — | Profile stub UI (“yoqilgan”) | Persistence |
| Templates / i18n | Hardcoded Uz OTP text | App i18n for label only | Template catalog |
| Queue / outbox / workers | — | Spec mentions BullMQ/Redis | All |
| Delivery/failure status of notifies | — | Eskiz HTTP fail → 502 on OTP request | Durable result tracking |

**Primary files:** `artifacts/api-server/src/lib/sms.ts`, `auth.ts` OTP path, `routes/auth.ts`, mobile register/verify-otp.

## 2. Existing providers

| Provider | Use |
|----------|-----|
| Eskiz.uz | OTP SMS send (+ token cache) |
| Dev console | When Eskiz credentials unset — logs OTP plaintext |

No push, email, or Telegram message providers in code. Do not invent contracts.

## 3. Existing notification flows

```text
POST /api/auth/otp/request
  → rate limit + DB cooldown
  → generate OTP / store hash
  → sendSms (synchronous, blocks request)
  → return ok (+ devCode in dev)
```

**No** flows for: order created/confirmed, payment success/fail, delivery updates, cashback earn/use, loyalty tier, admin alerts.

Commerce side effects (orders, payments, delivery, cashback) mutate state **without** notifying the customer.

## 4. Queue / background processing

| Capability | Status |
|------------|--------|
| Outbox table | Missing |
| BullMQ / Redis workers | Missing |
| Cron / scheduled notify | Missing |
| Async dispatch after commit | Missing |

OTP SMS is **synchronous** inside the HTTP request (opposite of target commerce-notification pattern).

## 5. Retry / idempotency

| Concern | Current | Risk |
|---------|---------|------|
| OTP SMS send fail | Throws 502; no automatic retry | User stuck; possible orphan OTP row |
| OTP resend | 60s DB cooldown + HTTP 8/15min | Weak multi-instance (Q7) |
| Order confirmation notify | N/A | — |
| Payment / delivery / cashback notify | N/A | — |
| Duplicate provider callbacks | Payment/delivery stubs | Separate Q8/Q9 gaps |

**Boundary (required):** notification failure must **not** rollback or corrupt order, payment, inventory, or cashback. Specs already state this; code has no notify layer yet so commerce commits without notify — boundary is vacuously true today, but must remain when notifications are added (outbox after commit).

## 6. Notification history

No in-app inbox, no `notification_logs`, no read/unread, no delivery receipts persisted for SMS beyond Eskiz provider-side.

## 7. Security

| Risk | Detail |
|------|--------|
| OTP in logs/API | Dev `console.info` + `devCode` (Q7 gap) |
| Sensitive data in future notifies | Must not include payment secrets, OTP codes, unnecessary PII |
| Telegram auto-provision | Auth identity bypass (Q7) — not a notify channel |
| Unauthenticated “events” that might later spur notify | Delivery status / simulate-success / FOM — if wired carelessly could spam or leak |

Preserve Q7: OTP never plaintext in production; no prod bypass.

## 8. Scalability

| Risk | Detail |
|------|--------|
| Sync SMS on request path | Latency + Eskiz timeout blocks auth |
| In-memory OTP rate limits | Fail across multi-instance (Q7) |
| No queue | Cannot absorb burst of order/payment notifies |
| No dead-letter | Failed sends disappear without ops visibility |

200→1000+ branches / thousands concurrent: commerce notifications **must** be async; OTP may stay near-real-time but still needs distributed rate limits and careful retry.

## 9. Current gaps

1. No commerce notification system  
2. No outbox / queue / workers / DLQ  
3. No push / email / Telegram outbound  
4. No notification tables / preferences / history  
5. No templates/localization for transactional events  
6. No idempotent notify keys per business event  
7. OTP path sync + prod hardening gaps (Q7)  
8. Profile “notifications” UI is stub  

## 10. Target architecture

```text
Business event (committed)
  → Outbox / domain event
  → Background job
  → Notification provider (SMS / push / …)
  → Delivery result
  → Retry / dead-letter
```

| Rule | Direction |
|------|-----------|
| Async for commerce | Yes — after durable commit |
| OTP | Near-real-time allowed; must obey Q7; prefer not to couple to commerce outbox incorrectly |
| Failure isolation | Notify fail ≠ finance/inventory rollback |
| Idempotency | One logical business event → at most one successful customer notification of that type (or explicit resend policy) |
| AuthZ | Workers use internal credentials; must not escalate via customer tokens |

## 11. LOCKED candidates (not locked this turn)

- Notification failure must not corrupt order/payment/inventory/cashback  
- Commerce notifications should be asynchronous (outbox/queue)  
- Notification dispatch must be idempotent against duplicate events/retries  
- OTP/auth notifications remain under Q7 security rules  
- Sensitive secrets/OTP must not appear in notification payloads/logs  
- Multi-instance requires distributed rate limiting for SMS abuse control  
- Notification attempts/results should be auditable/durable  

## 12. OPEN business decisions

1. Which channels (SMS / push / Telegram / email / in-app) for which events  
2. Mandatory vs optional notifications per event  
3. Customer preference model  
4. Quiet hours / marketing vs transactional  
5. OTP resend policy numerics (Q7 OPEN)  
6. Retry count / backoff / DLQ ops policy  
7. Localization rules  
8. Admin/staff alert policy  
9. Provider selection for push/SMS beyond Eskiz OTP  

---

# Q11 — Admin / RBAC

## 1. Current authentication

| Aspect | Reality |
|--------|---------|
| Method | Email + password (scrypt) |
| Token | Custom HMAC bearer, **12h**, embeds role/branchId |
| Gate | `requireAdmin` — reload user by id; **ignores token role for AuthZ** |
| Logout | Client clears `localStorage`; **no** server revocation |
| MFA | **Absent** |
| Login rate limit | **Absent** |
| Session registry | **Absent** (Q7 session gaps apply) |

POS staff use the **same** admin auth channel.

## 2. Current roles

**Seeded only:**

| Role | Notes |
|------|-------|
| `super_admin` | `branchId` null |
| `cashier` | `branchId` 12 |

Schema: free-text `role`. Spec roles (FINANCE_MANAGER, DELIVERY_OPERATOR, etc.) are **not** in runtime seed.

`assertStaffBranch` mentions `hq` / `admin` — **not** seeded; HQ bypass effectively via `!branchId`.

## 3. Current permissions

**Model classification:** **`requireAdmin` only** (role-only in name; no permission matrix).

| Layer | Status |
|-------|--------|
| RBAC tables | Missing |
| Permission strings | Missing |
| Role checks on admin routes | Missing |
| Beyond AuthN | Only `assertStaffBranch` on `POST /pos/sale` |

Any authenticated admin (including cashier) can hit essentially all `/api/admin/*` routes.

## 4. Branch isolation

| Area | Isolated? |
|------|-----------|
| POS sale | Yes (`assertStaffBranch`) |
| POS void / sales list / lookup | Weak or none |
| All `/admin/*` | **No** — cashier sees HQ-wide orders, customers, payments, audit, products |
| Branch PATCH (any branch) | Any admin |

**Required direction:** branch-scoped employee must not access another branch’s orders/inventory/payments/delivery ops unless explicitly authorized.

## 5. Sensitive access

| Resource | Access today |
|----------|--------------|
| Payme/Click secrets write | Any `requireAdmin` via `PATCH /admin/branches/:id` |
| Secrets in PATCH response | Returned **plaintext** |
| Public branch API | Keys masked; merchant IDs exposed |
| Finance-only gate | **Absent** |
| Refund permissions | No refund API; no permission concept |
| Cashback adjust / loyalty manage | No dedicated privileged APIs with RBAC |

## 6. Audit

| Audited | Not audited |
|---------|-------------|
| `branch.update` (weak payload) | Admin login/fail/logout |
| `pos.sale` / `pos.void` | Product CRUD |
| `fom.sale_confirmed` | Secret field changes detail |
| | Customer/order admin reads |
| | Delivery status / payment simulate |

Target privileged audit: actor, action, resource, branch, timestamp, before/after, reason where appropriate.

## 7. Security risks

1. Cashier ≡ superuser on HQ APIs  
2. No admin login rate limit / MFA (Q7 OPEN)  
3. Non-revocable 12h tokens  
4. Default `ADMIN_SECRET` fallback  
5. Payment secret write + cleartext response to any admin  
6. Token role claims unused → confusing AuthZ  
7. Unauthenticated privileged mutations outside admin router (delivery status, simulate-success, FOM) — cross-domain  
8. POS void cross-branch  
9. Privilege escalation if cashier `branchId` cleared  

## 8. Current gaps

1. No real RBAC (roles ≠ permissions)  
2. No branch-scoped admin data access  
3. No finance/secret ACL  
4. No admin MFA / login rate limit / revocation  
5. Incomplete privileged-action audit  
6. No courier/pharmacist/operator roles in runtime  
7. Admin UI does not hide HQ capabilities from cashiers  
8. Spec role catalog unimplemented  

## 9. Target RBAC architecture

```text
USER
  → ROLE(S)
  → PERMISSION(S)
  → RESOURCE / ACTION
  → optional BRANCH SCOPE
```

**Illustrative permissions (NOT locked names):**  
`orders.read` / `orders.manage` · `inventory.read` / `inventory.manage` · `payments.read` / `payments.refund` · `cashback.adjust` · `loyalty.manage` · `delivery.manage` · `products.manage` · `users.manage` · `reports.read` · `settings.manage` · payment-secret manage (restricted)

AuthN (Q7) remains separate from AuthZ (this domain).

## 10. LOCKED candidates (not locked this turn)

- Authentication ≠ authorization  
- Privileged admin operations require server-side authorization (not UI-only)  
- Branch-scoped roles must not access other branches without explicit grant  
- Payment secrets require restricted privileged access  
- Privileged actions must be auditable  
- Admin sessions should be revocable (align Q7)  
- Admin login abuse protection required (rate limit; MFA policy OPEN)  
- Courier / delivery actors require authorization (align Q9)  
- Notification workers must not bypass RBAC boundaries  

## 11. OPEN business decisions

1. Final role catalog  
2. Exact permission matrix  
3. Branch vs HQ scope rules  
4. Who may manage payment secrets  
5. Who may refund / adjust cashback / override loyalty  
6. Admin MFA mandatory or not  
7. Admin session lifetime / max devices  
8. Whether cashier may use admin web at all  
9. Cross-branch customer visibility  
10. Audit retention / reason-required actions  

---

# Cross-domain risks

| Interaction | Risk |
|-------------|------|
| Notifications ↔ Orders/Payments/Delivery/Cashback | Future notify must be after commit; fail independently; idempotent on duplicate events |
| Notifications ↔ Admin/RBAC | Staff alerts must not leak secrets; broadcast requires permission |
| Admin ↔ Delivery | Unauthenticated delivery complete bypasses both RBAC and Q9 |
| Admin ↔ Payment | Unauthenticated simulate-success + any-admin secret write |
| Admin ↔ Cashback | FOM/delivery complete can earn without finance role gates |
| Notification workers | Must use internal service identity; must not impersonate customers or escalate |

**Sensitive notification data:** never payment secrets, never OTP codes, minimize PII.

---

# Final recommendation

| Domain | Priority direction |
|--------|-------------------|
| **Q10** | Keep OTP SMS under Q7; introduce **outbox + async workers** before commerce notifications; isolate notify failures from finance/inventory |
| **Q11** | Replace flat `requireAdmin` with real **RBAC + branch scope**; restrict payment secrets; audit privileged actions; add admin login hardening |
| **Shared** | Close unauthenticated privileged endpoints (delivery/payment/FOM) as they undermine both notification integrity and RBAC |

Do **not** implement in this phase. Separate Q10/Q11 LOCK steps recommended after review.

---

## Consistency with prior locks

| Lock | Status |
|------|--------|
| Q1–Q2, Q4–Q9 | Not reopened |
| Q3 FOM | Remains OPEN |
| Q7 Auth/OTP | Reinforced for OTP SMS and admin AuthN gaps |
| Q8 Payment | Reinforced — secrets ACL + no client financial notify trust |
| Q9 Delivery | Reinforced — courier AuthZ + no unauthenticated complete |

---

**Q10 + Q11 ANALYSIS COMPLETE — NO IMPLEMENTATION PERFORMED — NOTIFICATIONS AND ADMIN/RBAC READY FOR REVIEW.**
