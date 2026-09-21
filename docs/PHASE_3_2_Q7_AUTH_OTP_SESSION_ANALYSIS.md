# Q7 ANALYSIS — Authentication, OTP Security and Session Architecture

**Status:** ANALYSIS ONLY (not a lock)  
**Mode:** Documentation / analysis only — **no application implementation**  
**Depends on:** Phase 3.1 §D phone uniqueness, §E OTP security principles; Phase 2.5 phone+OTP direction  
**Must not reopen:** Q1, Q2, Q4, Q5, Q6 locks; **Q3 remains OPEN**

---

## Document control

| Item | Value |
|------|--------|
| Decision ID | Q7 (analysis) |
| Scope | Auth, OTP, sessions, admin auth, rate limits, phone identity |
| Implementation | Forbidden in this phase |
| Numeric policy | Proposed defaults remain **OPEN** — not locked |

**Proposed defaults (Phase 2.5 / prior design — NOT locked):**

| Setting | Proposed |
|---------|----------|
| OTP TTL | 300 s |
| Max attempts / OTP | 5 |
| Resend cooldown | 60 s |
| Max OTP requests | 5 / hour |
| Lockout | 900 s |
| OTP hashing | HMAC-SHA256 |

---

# 1. Current authentication implementation

## Primary files

| Path | Role |
|------|------|
| `artifacts/api-server/src/lib/auth.ts` | Phone normalize, OTP create/verify, customer/admin tokens, `requireCustomer` / `requireAdmin` |
| `artifacts/api-server/src/routes/auth.ts` | Customer register/login/OTP/me/logout + rate limiters |
| `artifacts/api-server/src/routes/admin.ts` | Admin login/me + admin APIs via `requireAdmin` |
| `artifacts/api-server/src/lib/rateLimit.ts` | In-memory rate limiter |
| `artifacts/api-server/src/lib/sms.ts` | Eskiz SMS or dev console delivery |
| `lib/db/src/bootstrap.ts` | Creates `customers`, `auth_otps`, `admin_users`, `audit_log` |
| `lib/db/src/password.ts` | scrypt password hash/verify |
| `lib/db/src/seed.ts` | Demo customer + admin credentials |
| `artifacts/soglom-apteka/app/login.tsx` | **Phone + password** UI (not OTP) |
| `artifacts/soglom-apteka/app/register.tsx` + `verify-otp.tsx` | Register → OTP flow |
| `artifacts/admin-web/src/App.tsx` | Admin email/password login |

## What exists today

| Capability | Status |
|------------|--------|
| Customer phone + password register | `POST /api/auth/register` |
| Customer phone + password login | `POST /api/auth/login` |
| OTP request | `POST /api/auth/otp/request` (`login` \| `register`) |
| OTP verify → token | `POST /api/auth/otp/verify` |
| Customer session token | Custom HMAC bearer (not JWT) |
| Admin email + password | `POST /api/admin/login` |
| Admin session token | Separate HMAC bearer |
| `GET /api/auth/me` | Bearer or Telegram auto-provision path |
| `POST /api/auth/logout` | Client-side only (no server revoke) |
| Passport / OAuth / JWT library | **Absent** |
| Refresh tokens | **Absent** |
| Device/session tables | **Absent** |
| Redis auth usage | **Absent** (docs mention Redis; code uses in-memory Map) |

## Auth model summary

```
CUSTOMER: phone (+ password and/or OTP) → HMAC customer token (30 days)
ADMIN:    email + password              → HMAC admin token (12 hours)
TELEGRAM: x-telegram-id header/query    → auto-find or auto-create customer (bypasses OTP)
```

**Doc vs app mismatch:** `PRODUCTION.md` describes login as phone → SMS OTP; current mini-app **login screen uses password**. OTP login API exists but is not the primary login UI path.

---

# 2. Phone identity findings

| Aspect | Repository reality |
|--------|-------------------|
| Field | `customers.phone` `text NOT NULL` |
| Unique on phone | **No** UNIQUE constraint |
| Unique identity today | `telegram_id` UNIQUE (app users: `app:{normalizedDigits}`) |
| `phone_e164` column | **Missing** (Phase 3.1 target only) |
| Stored format | Display string e.g. `+998 90 123 45 67` (spaces) — **not** strict E.164 storage |
| Normalization | Server `normalizePhone`: strip non-digits; 9→`998…`; 12 if starts `998`; 11 starting `8` → `998…` |
| Validity rule for OTP/register | length 12 and starts with `998` |
| Phone as identity | Effectively yes via `app:{phone}` telegramId + display phone lookup |
| Phone change | No dedicated change/audit flow found |
| Old phone audit | Not present |

**Phase 3.1 already identified:** `UNIQUE(phone_e164)` after deterministic duplicate cleanup — **still not implemented**. Confirmed: schema/seed have no phone uniqueness.

**Risk:** Telegram auto-create uses placeholder phone `+998 90 000 00 00`; loyalty/Telegram paths can collide on phone display without uniqueness.

---

# 3. OTP storage / security findings

| Question | Finding |
|----------|---------|
| Storage form | **B / keyed hash:** SHA-256 hex of `` `${phone}:${code}:${CUSTOMER_SECRET}` `` via `createHash("sha256")` — **not** plaintext, **not** bcrypt, **not** HMAC-SHA256 (`createHmac`) |
| Column | `auth_otps.code` stores the **hash** (column name is misleading) |
| Plaintext in DB | No (hash only) |
| Plaintext in API | Yes when SMS provider is `"dev"` → response includes `devCode` |
| Plaintext in logs | Yes: `console.info([SMS:dev] +phone → text)` includes OTP body |
| Plaintext in UI | Yes: `verify-otp.tsx` can show “Dev kod” / hint from `devCode` |
| Encryption at rest | No separate encryption layer |

### Leak surface

| Surface | Risk |
|---------|------|
| DB `auth_otps.code` | Hash only — lower risk if secret strong |
| API `devCode` | **High** if shipped without Eskiz |
| SMS console log | **High** in multi-tenant hosts / shared logs |
| Mobile AsyncStorage | Token stored; OTP hint may remain in nav params |
| Error messages | Generic wrong/expired — OK; purpose-based existence messages leak (see §8) |

**Note:** Phase 3.1 §E still says “plaintext OTP as used today” — **slightly outdated**: code already hashes at rest; remaining gaps are attempts, production bypass gating, column naming, and leak surfaces.

---

# 4. OTP generation

| Property | Value |
|----------|-------|
| Length | 6 digits |
| Alphabet | Numeric |
| Source | `crypto.randomInt(100000, 999999)` |
| Cryptographic | Node crypto CSPRNG — acceptable |
| Predictable | Not from weak RNG; range excludes `000000` from generation |
| Collision | Possible across time/users (6-digit space); mitigated by phone+hash+purpose+expiry match |
| Test-only generation | No — same generator always |
| Production bypass | Separate path: accept `000000` when `ESKIZ_EMAIL` unset |

---

# 5. OTP expiration

| Property | Current |
|----------|---------|
| TTL | **5 minutes** (`Date.now() + 5 * 60 * 1000`); API `expiresIn: 300` |
| Storage | `auth_otps.expires_at` `timestamptz` |
| Check | SQL `expires_at > now()` |
| Timezone | DB `now()` vs ISO string insert — server/DB clock dependent |
| Expired reuse | Rejected by query (no row) |
| Atomic consume | **Not fully atomic:** SELECT then DELETE in separate statements — race possible under concurrency |

**Compare to proposed 300 s:** code already uses **300 seconds**. Still **OPEN** as business lock (do not treat as Q7 locked policy).

---

# 6. Attempt limits

| Property | Current |
|----------|---------|
| Max verification attempts | **None** |
| Per-challenge counter | **Missing** (no `attempt_count`) |
| Per-phone / IP attempt lockout | **Missing** |
| Failed attempt effect | Wrong code → 401; challenge remains until expiry |
| Success effect | `DELETE FROM auth_otps WHERE phone = …` (all OTPs for phone) |
| Proposed 5 attempts / 900 s lockout | **Not implemented** |

---

# 7. Resend / rate limiting

| Control | Current |
|---------|---------|
| Resend cooldown (DB) | **60 s** — reject if OTP created for phone within 60 s |
| Resend cooldown (UI) | **60 s** countdown |
| OTP HTTP rate limit | **8 / 15 min** per `ip + phone` (in-memory) |
| Auth HTTP rate limit | **30 / 15 min** per `ip` (register/login/verify) |
| Requests/hour policy (5/hour) | **Not** as a dedicated policy (8/15min ≈ different shape) |
| Requests/day | **None** |
| Device rate limit | **None** |
| Distributed rate limit | **None** (process Map) |
| SMS cost control | Weak under multi-instance + IP rotation |

**Compare to proposed 60 s / 5 per hour:** 60 s matches code; 5/hour does **not** match (code uses 8/15min).

---

# 8. Enumeration risks

OTP request (`createOtp`) **explicitly distinguishes**:

| Purpose | Existing user | Missing user |
|---------|---------------|--------------|
| `register` | **409** “allaqachon ro‘yxatdan o‘tgan” | proceed |
| `login` | proceed | **404** “topilmadi” |

**Attacker can learn** whether a phone is registered.  
Admin login uses generic “Email yoki parol noto‘g‘ri” — better.  
Timing differences not measured; assume classic enumeration risk on customer OTP.

**Recommendation (direction only):** generic “if eligible, SMS sent” responses for OTP request; same timing path for exist/missing where product allows.

---

# 9. Session / token architecture

| Question | Finding |
|----------|---------|
| JWT | **No** |
| Opaque DB sessions | **No** |
| Access token | Custom HMAC string bearer |
| Refresh token | **No** |
| Cookies | **No** (Bearer header) |
| Client storage | Customer: AsyncStorage `vaksinamed-customer-token`; Admin: `localStorage` `vm-admin-token` |
| Customer TTL | **30 days** |
| Admin TTL | **12 hours** |
| Rotation | **No** |
| Revocation | **No** server-side |
| Session listing | **No** |
| Device id | **No** |

**Customer token format:** `{customerId}:{expMs}:{hmacSha256Hex}`  
**Admin token format:** `{userId}:{role}:{branchId}:{expMs}:{hmacSha256Hex}`

---

# 10. Multi-device behavior

| Capability | Today |
|------------|-------|
| Multiple devices | Implicitly allowed (same long-lived token can be copied; new logins issue new tokens; old tokens remain valid until expiry) |
| Simultaneous sessions | Unlimited (no session registry) |
| Invalidate old device on new login | **No** |
| Logout one device | Client clears local token only |
| Logout all devices | **Not supported** |
| Suspicious device detection | **No** |

**Target requirement (direction, not locked):** revocable device/session records; logout-one / logout-all; optional max active sessions — values OPEN.

---

# 11. Token security

| Risk | Detail |
|------|--------|
| Default secrets | `CUSTOMER_SECRET` / `ADMIN_SECRET` fall back to hardcoded strings if env unset |
| OTP hash shares `CUSTOMER_SECRET` | Compromise of customer secret affects tokens **and** OTP hashes |
| Long-lived customer token | 30 days, non-revocable → stolen token usable until expiry |
| No refresh/rotation | No reuse detection |
| Frontend storage | AsyncStorage / localStorage — XSS/device theft risk (platform typical) |
| Admin role in token | Role embedded; `requireAdmin` reloads user by id but does **not** re-validate role vs token claim for RBAC |

Do **not** print real secrets; none were read from live `.env` for this analysis.

---

# 12. Logout / revocation

| Action | Effect |
|--------|--------|
| `POST /auth/logout` | `{ ok: true }` — **no** denylist, **no** session delete |
| Client logout | Clears local token |
| Access token after “logout” | Remains valid until natural expiry if stolen/copied |
| Refresh token | N/A |

**Security limitation (documented):** long-lived non-revocable HMAC tokens cannot be invalidated server-side today.

---

# 13. Admin authentication

| Aspect | Finding |
|--------|---------|
| Mechanism | Separate from customer: **email + password** (scrypt) |
| OTP / MFA for admin | **None** |
| Routes | `/api/admin/login`, `/api/admin/me`, many `/api/admin/*` gated by `requireAdmin` |
| Rate limit on admin login | **None** |
| Token | Separate `ADMIN_SECRET`, 12h |
| Stronger step-up for privileged actions | **Not found** |

POS staff uses **admin** bearer + branch assertion in POS helpers.

---

# 14. RBAC relationship

```
AUTHENTICATION  →  who is this principal?   (token / password / OTP / telegram)
AUTHORIZATION   →  what may they do?        (roles / permissions)
```

| Layer | Today |
|-------|-------|
| AuthN | Implemented (customer/admin tokens) |
| AuthZ | Thin: any valid admin passes most admin routes; POS `assertStaffBranch` uses role/branch heuristics |
| `admin_users.role` | Text (`super_admin`, `cashier` in seed) |
| `role_permissions` / `user_roles` tables | **Not present** (Phase 3.1 target) |
| Audited admin actions | Partial (`audit_log` for some branch/FOM events — not auth) |

**Do not mix:** OTP success ≠ permission grant beyond “authenticated customer/admin.”

---

# 15. Rate limiting architecture

| Location | Status |
|----------|--------|
| Application memory | **Yes** — `Map` in `rateLimit.ts` |
| Redis | **Not implemented** (comment says prod should use Redis) |
| PostgreSQL | Cooldown only via `auth_otps.created_at` query |
| External gateway | None in repo |

**Multi-instance impact:** each API instance has its own counters → effective limits = N × configured max under load balancer. **Fails** for thousands of concurrent users across many instances.

---

# 16. Multi-instance OTP safety

| Scenario | Behavior |
|----------|----------|
| Instance A creates OTP → Postgres | Visible to Instance B (DB-backed challenge) |
| Instance B verifies OTP | Reads same `auth_otps` — **works** across instances |
| Concurrent verify same code | Race: dual SELECT can succeed before DELETE — **not concurrency-safe** |
| Rate limits across instances | **Not shared** |

**Recommended principle to evaluate (not locked as implementation):**

- PostgreSQL = authoritative identity + durable OTP challenge (or challenge metadata)  
- Redis = distributed rate-limit / lock / temporary throttle state  
- OTP verify must be atomic/idempotent (e.g. single-statement consume or row lock)

---

# 17. Abuse / brute-force risks

| Scenario | Current protection | Gap |
|----------|-------------------|-----|
| A) Repeated OTP request one phone | 60s cooldown + 8/15min ip+phone | Weak multi-instance; no hourly cap |
| B) OTP spray many phones | Per key includes phone; IP still 8×phones | SMS cost abuse |
| C) Guess OTP | No attempt limit; 6-digit / 5 min | **High** |
| D) IP rotation | New buckets | Bypass memory limits |
| E) Device rotation | No device binding | Bypass |
| F) SMS provider abuse | Eskiz only when configured | Dev path free; prod needs provider-side + app limits |
| G) Interception/replay | Single-use on success delete | Replay after success blocked; concurrent race open |
| H) Concurrent verify | Non-atomic | Duplicate auth possible edge |
| I) Repeated successful login | New 30d tokens forever | Session sprawl |
| J) Password stuffing | authLimiter 30/15min/ip; demo password path | Admin login unlimited; seed passwords risky |

---

# 18. Development / production bypass findings

| Item | Classification |
|------|----------------|
| `devCode` in OTP JSON when SMS provider `dev` | **Dangerous if shipped** without Eskiz / production gate |
| UI shows Dev kod | **Dangerous if shipped** |
| `console.info` SMS with OTP | **Dangerous if shipped** / shared logs |
| Accept code `000000` when `!ESKIZ_EMAIL` | **Dangerous if shipped** — **not** gated on `NODE_ENV` |
| Seed customer `123456` / phone `+998 90 123 45 67` | **Development-only** if seed disabled in prod; **dangerous** if seed runs in prod |
| Special login path `998901234567` + `123456` | **Dangerous if shipped** |
| Hardcoded default HMAC secrets | **Dangerous if shipped** |
| Admin UI prefilled seed credentials | **Development convenience** — risky if prod build |
| Telegram auto-provision without OTP | **Unclear / dangerous** for production identity model |
| `randomInt` OTP generation | **Safe production behavior** |

---

# 19. Phone duplicate findings

| Source | Finding |
|--------|---------|
| Schema | `phone` not unique → duplicates **possible** |
| Seed | Single demo customer phone; no intentional duplicate rows in seed |
| Live DB | Not audited in this analysis (no migration / query run against production data) |
| Conceptual survivor (Phase 3.1) | Oldest `created_at`, then lowest `id`; reassign orders/cashback/loyalty/addresses; soft-merge absorbed users |
| Attachments | Orders, ledger, loyalty, sessions (when exist) must follow survivor — **do not migrate now** |

---

# 20. Audit / security events

| Event | Audited today? |
|-------|----------------|
| OTP requested | **No** |
| OTP verified / failed | **No** |
| Login / logout | **No** |
| Session revoked | N/A / **No** |
| Phone changed | **No** |
| Admin login / failed admin login | **No** |
| Suspicious activity | **No** |

`audit_log` exists for some admin/FOM business actions only.

**Direction:** security event stream (or table) for auth lifecycle with actor, phone hash/last4, IP, device, outcome — no PII OTP content.

---

# 21. Business / security decisions required (OPEN)

1. OTP TTL  
2. OTP maximum attempts  
3. OTP resend cooldown  
4. OTP request rate per phone  
5. OTP request rate per IP/device  
6. Lockout duration  
7. Access token lifetime  
8. Refresh token lifetime  
9. Refresh token rotation  
10. Maximum active devices/sessions  
11. Logout-all behavior  
12. Phone-change verification policy  
13. Admin authentication method (password-only vs OTP/MFA)  
14. Admin MFA requirement  
15. Suspicious-login policy  
16. SMS provider retry/fallback policy  

Also OPEN (related): account-enumeration response strategy; whether password remains co-equal with OTP for customers; Telegram auto-provision in production.

**Do not invent final values.**

---

# 22. Recommended architecture (target direction)

```
IDENTITY          → users / customers / admin_users (PostgreSQL authoritative)
OTP CHALLENGE     → temporary verification challenge (hash, expiry, attempts, consume)
SESSION           → authenticated device/session (revocable)
AUTHORIZATION     → RBAC / permissions (separate from AuthN)
SECURITY EVENTS   → audit trail (auth + admin)
RATE LIMITING     → distributed abuse protection
```

| Concern | Owner |
|---------|--------|
| Identity, credentials, phone uniqueness, durable challenges/sessions | **PostgreSQL** |
| Rate limits, short locks, optional OTP throttle counters | **Redis** (temporary; not identity truth) |
| Deliver SMS | **SMS provider** (Eskiz); never log OTP in prod |
| Validate, normalize, issue/revoke sessions, enforce limits | **API** |
| Secure storage, no OTP in analytics, clear on logout | **Mobile** |

---

# 23. LOCKED vs OPEN (analysis recommendation — **not yet Q7 LOCK**)

## Candidates for future technical LOCK (principles only — no numbers)

| Principle | Rationale from repo + Phase 3.1 |
|-----------|----------------------------------|
| Phone identity normalized to E.164 | Required for uniqueness / OTP |
| Unique phone after deterministic duplicate cleanup | Phase 3.1 §D |
| OTP never stored plaintext in production | Already hashed; forbid plaintext/devCode leaks |
| OTP single-use | Partially present; must remain |
| OTP expiration required | Present; must remain |
| OTP attempt limiting required | Missing; required for brute-force |
| OTP resend/request rate limiting required | Partial; must be distributed |
| Production must not expose `devCode` / `000000` | Present bypass is dangerous |
| Authentication separated from authorization | Conceptual; RBAC incomplete |
| Sessions must be revocable | Not true today — required for logout-all |
| Distributed rate limiting for multi-instance | In-memory fails at scale |
| OTP verification concurrency-safe | Race exists today |
| Security-sensitive auth events auditable | Missing |
| Secrets never committed/logged | Defaults/hardcodes violate this |

## Remain OPEN (do not lock)

- All numeric TTL/attempt/rate/lockout/token lifetime values  
- Admin MFA yes/no  
- Max devices  
- Enumeration UX tradeoffs  
- Exact Redis vs PG split for OTP challenge storage  
- Whether customer password is deprecated in favor of OTP-only  

**This Q7 document does not lock the candidates above.** A separate Q7 LOCK step is required.

---

## Consistency with prior locks

| Lock | Status |
|------|--------|
| Q1–Q2, Q4–Q6 | Not reopened |
| Q3 FOM | Remains OPEN |
| Phase 3.1 §E OTP principles | Reinforced by findings; numeric values still OPEN (§16.10) |

---

## Evidence note

Phase 3.1 still describes OTP as plaintext “as used today.” Current code stores a **keyed SHA-256 hash**; gaps are attempt limits, production bypass gating, enumeration, revocation, distributed limits, and phone uniqueness.

---

**Q7 ANALYSIS COMPLETE — NO IMPLEMENTATION PERFORMED — AUTH/OTP SECURITY MODEL READY FOR REVIEW.**
