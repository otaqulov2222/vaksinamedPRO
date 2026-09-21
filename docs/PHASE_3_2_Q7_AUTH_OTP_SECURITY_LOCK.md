# Q7 LOCK — Authentication and OTP Security Architecture

**Status:** LOCKED (technical security architecture principles only)  
**Mode:** Documentation / design only — **no application implementation**  
**Depends on:** Phase 3.1 §D phone uniqueness, §E OTP security; Phase 2.5 PHONE + OTP direction; Q7 analysis  
**Does not lock:** Any numeric TTL, attempt, rate, lockout, or token-lifetime values  
**Must not reopen:** Q1, Q2, Q4, Q5, Q6; **Q3 remains OPEN**

---

## Document control

| Item | Value |
|------|--------|
| Decision ID | Q7 |
| Scope | Auth / OTP / session / admin hardening / identity boundaries |
| Implementation | Forbidden in this phase |
| Schema / migrations / API / UI / `.env` | Not modified in this phase |
| Prior analysis | [`PHASE_3_2_Q7_AUTH_OTP_SESSION_ANALYSIS.md`](PHASE_3_2_Q7_AUTH_OTP_SESSION_ANALYSIS.md) |

---

# IMPORTANT

**Do NOT lock numeric security policy values.**

## MUST remain OPEN

- OTP TTL exact value  
- OTP attempt count  
- OTP resend cooldown  
- OTP requests/hour  
- IP/device rate limits  
- lockout duration  
- access token lifetime  
- refresh token lifetime  
- maximum devices  
- admin MFA policy  
- suspicious-login policy  
- SMS provider retry/fallback policy  
- token format (JWT vs opaque)  
- final Telegram linking UX  
- final password/PIN secondary-auth design  

Proposed Phase 2.5 defaults (300s / 5 attempts / 60s / 5/hour / 900s lockout) remain **proposals only**.

---

# LOCKED decisions

## 1. Phone identity direction

**LOCKED:**

Phone number is a **first-class customer identity**.

Production phone identity must be normalized to **E.164**.

**Target invariant:**

```text
UNIQUE(phone_e164)
```

Existing duplicate phones must be **deterministically reconciled** before the unique constraint is introduced.

Do **not** perform migration in this phase.

Survivor selection: do not invent a new algorithm here beyond the Phase 3.1 direction — existing **orders, cashback, loyalty, addresses**, and related records must remain attached to the surviving identity (soft-merge absorbed accounts; do not destroy history).

---

## 2. OTP production security

**LOCKED:**

| Rule | Status |
|------|--------|
| Production OTP must **never** be stored plaintext | LOCKED |
| Verification uses secure server-side HMAC/hash (exact algorithm = implementation design) | LOCKED |
| OTP is **single-use** | LOCKED |
| OTP **expires** | LOCKED |
| Expired OTP cannot authenticate | LOCKED |
| Successful verification invalidates the challenge | LOCKED |
| Failed attempts must eventually be **limited** | LOCKED |
| OTP request/resend must be **rate-limited** | LOCKED |
| OTP verification must be **concurrency-safe** | LOCKED |

Exact numeric limits remain **OPEN**.

---

## 3. No production OTP bypass

**LOCKED:**

Production authentication must **not** contain a universal OTP bypass such as:

- `000000`  
- `devCode`  
- hardcoded test OTP  
- SMS-disabled shortcut  
- development authentication bypass  

Development/test mechanisms must be **isolated** from production behavior.

**Known gap (do not remove now):** repository currently allows `devCode` / `000000` when Eskiz is unset — **mandatory future implementation work**.

---

## 4. No OTP secret logging

**LOCKED:**

Real OTP values must never be written to:

- application logs  
- console logs  
- API responses  
- analytics  
- audit records  
- database plaintext fields  
- client debug output  

SMS provider payloads must be handled without exposing OTP secrets in application logs.

**Known gap:** current `dev`-mode plaintext leakage (`devCode`, SMS `console.info`) — implementation work.

---

## 5. Distributed rate limiting

**LOCKED:**

Authentication abuse protection must work across **multiple API instances**.

In-memory-only rate limiting is **NOT** sufficient for the target multi-instance production architecture.

Rate limiting must use a **shared/distributed** mechanism or gateway-level mechanism.

Redis is an acceptable architectural candidate for temporary / rate-limit state.

Exact limits remain **OPEN**. Do not implement now.

---

## 6. Concurrency-safe OTP verification

**LOCKED:**

Two concurrent verification requests for the same OTP challenge must **not** both successfully consume/authenticate using the same single-use challenge.

Conceptual flow:

```text
verify
  → atomically validate challenge
  → atomically consume / invalidate
  → create authentication session / token
```

Must be safe under retries and concurrent requests.

**Known gap:** current SELECT-then-DELETE race — do not fix in this phase.

---

## 7. Revocable authenticated sessions

**LOCKED:**

Production authentication must support **revocable** authenticated sessions.

Logout must eventually invalidate the relevant session/token.

Architecture must support:

- logout current device/session  
- revoke session  
- revoke all sessions where required  
- session expiration  
- device/session identification  

Exact lifetimes remain **OPEN**.

**Known gap:** current HMAC bearer tokens remain valid after logout — implementation work.

---

## 8. Access / refresh token separation

**LOCKED (architecture):**

Authentication must distinguish **short-lived access credentials** from **renewable/revocable authentication state** where long-lived login is required.

If refresh tokens are used, they must support appropriate **rotation/revocation**.

**NOT locked:** JWT vs opaque token format.

---

## 9. Authentication vs authorization

**LOCKED:**

| Concern | Answers |
|---------|---------|
| **Authentication** | Who is this user? |
| **Authorization** | What is this user allowed to do? |

They must remain separate.

Future **RBAC** must be authoritative for privileged operations.

**Known gap:** current `requireAdmin` + weak branch check is insufficient as the final authorization architecture.

---

## 10. Admin authentication hardening direction

**LOCKED:**

Administrative authentication is security-sensitive and must have **stronger protection** than ordinary customer flows where appropriate.

Final design must support:

- rate limiting  
- secure credential handling  
- session revocation  
- RBAC  
- audit events  

Whether **mandatory MFA** is required remains **OPEN**.

**Known gaps:** admin login has no rate limit and no MFA — implementation / policy work.

---

## 11. Telegram identity boundary

**LOCKED:**

An external identity such as Telegram must **NOT** silently become an unverified replacement for the primary phone authentication identity.

Telegram may exist as a **linked/external** identity, but production account authentication and linking must use an **explicit verified** identity/linking flow.

Primary direction remains **PHONE + OTP** (Phase 2.5).

Do **not** decide exact Telegram linking UX now.  
Do **not** remove current `x-telegram-id` auto-provision behavior now.

**Known gap:** auto-create / OTP bypass via Telegram — security gap requiring implementation and business review.

---

## 12. Password auth transition direction

**LOCKED (direction only):**

The final customer authentication model must be reconciled with the approved **PHONE + OTP** decision.

Password authentication must not remain accidentally as a second **uncontrolled** production identity model.

Future password/PIN remains possible only as an **explicitly designed secondary** mechanism.

Do **not** immediately remove password authentication.

**Known gap:** repo still supports phone+password as primary login UI; OTP mainly for registration — design/implementation reconciliation required.

---

## 13. Phone enumeration protection

**LOCKED:**

Authentication endpoints should avoid unnecessarily revealing whether a phone number is registered.

Future production responses should use **generic behavior** where appropriate.

Exact wording **OPEN**.

**Known gap:** register → 409 if exists; login OTP → 404 if missing — enumeration risk; do not modify now.

---

## 14. Multi-device session model

**LOCKED:**

Architecture must explicitly represent authenticated **sessions/devices**, not unlimited untracked bearer tokens.

Must eventually support:

- session identity  
- device identity where appropriate  
- creation time  
- expiration  
- revocation  
- last activity where required  
- auditability  

Maximum number of devices remains **OPEN**.

---

## 15. Security event audit

**LOCKED:**

Security-sensitive authentication events must be auditable.

Target events include:

- OTP requested  
- OTP verification success / failure  
- login success / failure  
- logout  
- session revocation  
- phone change  
- admin login / admin authentication failure  
- suspicious authentication activity  

Do **not** store OTP secrets in these events.

**Known gap:** current `audit_log` does not cover authentication adequately.

---

## 16. Secrets management

**LOCKED:**

Authentication secrets, HMAC keys, provider credentials and similar secrets must:

- never be committed to source control  
- never be hardcoded into production code  
- never be returned to clients  
- never be logged  

Default/test credentials and hardcoded secret fallbacks are **production hardening gaps**.

Do not expose actual secrets in documentation.

---

## 17. Database vs Redis responsibilities

**LOCKED:**

| Store | Responsibility |
|-------|----------------|
| **PostgreSQL** | Authoritative customer identity; authoritative account/user records; persistent session records if used; durable security/audit records |
| **Redis (or equivalent)** | Rate limiting; temporary OTP state if chosen; short-lived locks; temporary abuse-control state |

Redis must **not** become the authoritative customer identity source.

---

## 18. Auth retry / idempotency safety

**LOCKED:**

Authentication must be safe under:

- repeated OTP verification  
- repeated login request  
- concurrent verification  
- network timeout + client retry  
- duplicate webhook/provider callbacks where applicable  

The same OTP challenge must not create uncontrolled multiple authentication effects.

---

# Current critical gaps (future work)

Do **not** fix in this phase:

1. `phone_e164` normalization / unique constraint  
2. Deterministic duplicate-phone cleanup  
3. `devCode` / `000000` production bypass  
4. OTP secret logging in dev mode  
5. OTP attempt counter  
6. OTP lockout  
7. Atomic OTP consumption  
8. Distributed rate limiting  
9. Revocable sessions  
10. Logout / session invalidation  
11. Access / refresh architecture  
12. Multi-device session registry  
13. Admin login rate limiting  
14. Admin MFA decision  
15. Stronger admin authorization / RBAC  
16. Telegram auto-provision / OTP bypass  
17. Phone enumeration protection  
18. Authentication security-event audit  
19. Secret / default credential cleanup  
20. Reconciliation of password authentication with PHONE + OTP architecture  

---

# LOCKED vs OPEN

## LOCKED

| # | Principle |
|---|-----------|
| 1 | Phone is first-class identity |
| 2 | E.164 normalization direction |
| 3 | Unique phone after duplicate cleanup |
| 4 | OTP never plaintext in production |
| 5 | OTP single-use |
| 6 | OTP expires |
| 7 | OTP attempts must be limited |
| 8 | OTP requests/resends must be rate-limited |
| 9 | OTP verification must be concurrency-safe |
| 10 | Production OTP bypasses are forbidden |
| 11 | OTP secrets must not be logged |
| 12 | Distributed rate limiting required for multi-instance |
| 13 | Authentication sessions must be revocable |
| 14 | Access vs renewable/revocable auth state separation (format OPEN) |
| 15 | Authentication and authorization are separate |
| 16 | Privileged admin ops require hardened authN/authZ |
| 17 | External identities (e.g. Telegram) cannot silently bypass primary verification |
| 18 | Auth endpoints should minimize account enumeration |
| 19 | Authenticated sessions/devices must be explicitly represented |
| 20 | Security-sensitive auth events must be auditable |
| 21 | Auth secrets never committed / logged / exposed |
| 22 | PostgreSQL remains authoritative for identity |
| 23 | Redis is temporary/distributed infrastructure, not identity truth |
| 24 | Auth retry / concurrent verify must be idempotent-safe |

## OPEN

| # | Decision |
|---|----------|
| 1 | Exact OTP TTL |
| 2 | Exact attempt limit |
| 3 | Exact resend cooldown |
| 4 | Exact request/hour limit |
| 5 | Exact lockout duration |
| 6 | Access token lifetime |
| 7 | Refresh token lifetime |
| 8 | Token format (JWT vs opaque) |
| 9 | Session / device maximum |
| 10 | Device policy details |
| 11 | Admin MFA |
| 12 | Suspicious-login policy |
| 13 | SMS provider retry/fallback |
| 14 | Final Telegram linking UX |
| 15 | Final password/PIN secondary-auth design |

---

# Consistency with prior locks

| Lock | Status |
|------|--------|
| Q1 inventory | Not reopened |
| Q2 three-axis order state | Not reopened |
| Q3 FOM semantics | Remains **OPEN** |
| Q4 cashback | Not reopened |
| Q5 refund/reversal safety | Not reopened |
| Q6 loyalty principles | Not reopened |
| Phase 3.1 §D / §E | Reinforced; numeric OTP policy still OPEN |

---

**Q7 LOCK COMPLETE — AUTH/OTP SECURITY ARCHITECTURE LOCKED — NUMERIC SECURITY POLICIES REMAIN OPEN — NO IMPLEMENTATION PERFORMED.**
