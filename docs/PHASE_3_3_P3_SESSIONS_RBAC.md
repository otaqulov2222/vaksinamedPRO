# P3 — Sessions + Admin RBAC + Authorization

Status: **IMPLEMENTED**  
Scope: sessions, dual-accept token migration, logout revocation, minimal RBAC, branch scope AuthZ, auth audit events.  
Out of scope: P4 inventory, P5 order state, cashback redesign, real Payme/Click, delivery redesign, FOM contract, notifications, Expo UI redesign, MFA, Redis.

## Session architecture

PostgreSQL table `auth_sessions` is the durable source of truth.

| Field | Purpose |
|-------|---------|
| `public_id` | Opaque session id in bearer |
| `actor_type` / `actor_id` | `customer` or `admin` + PK |
| `token_hash` | SHA-256 of `publicId:secret` (raw secret never stored) |
| `expires_at` / `revoked_at` / `last_seen_at` | lifecycle |
| `device_label` / `user_agent` | optional metadata |

Bearer format for new sessions: `s1.{publicId}.{secret}`

- Customer TTL: 30 days (parity with prior HMAC)
- Admin TTL: 12 hours (parity with prior HMAC)
- Multi-device: multiple concurrent sessions per actor; each independently revocable
- Logout: `POST /auth/logout` and `POST /admin/logout` revoke matching session (idempotent; no existence leak)

## Dual-accept / migration policy

1. **New** login/register/OTP/admin login always issues `s1.*` sessions.
2. **Legacy** HMAC tokens (`id:exp:sig` customer / `id:role:branch:exp:sig` admin) remain accepted while dual-accept is open.
3. Close the window:
   - `ALLOW_LEGACY_HMAC_TOKENS=0`, or
   - `LEGACY_HMAC_DEADLINE=<ISO>` (reject after timestamp)
4. Recommended: set deadline at deploy (≤ one mobile release cycle), then disable legacy after clients refresh.
5. Unset deadline = dual-accept remains on for compatibility (documented residual risk until closed).

## RBAC

Tables: `auth_roles`, `auth_permissions`, `auth_role_permissions`, `auth_events`.

Roles (current behavior only):

- `super_admin` — HQ global (all current admin permissions)
- `cashier` — branch-scoped POS / order confirm / delivery update

Legacy labels `admin` / `hq` normalize to `super_admin` (migration + login path). No silent privilege expansion.

Permissions use `resource:action` and are enforced server-side via `requirePermission`. Clients never supply role/permission/branch authority.

## Branch scope

- Cashiers: forced to `admin_users.branch_id` for POS sales list, void, confirm-pos, delivery status, POS sale branch.
- HQ (`super_admin` / legacy admin): global access where permission grants it.
- Catalog product list remains readable by staff with `products:read` (global catalog, not branch-filtered).

## Rate limiting

Unchanged in-memory limits. **Not** sufficient for multi-instance production; Redis deferred to infrastructure phase.

## Auth audit

`auth_events` records login success/failure, logout, session create/revoke, authz denials. Never stores passwords, OTP, tokens, or secrets. Logger redacts `authorization` / token fields.
