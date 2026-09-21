# P1 — Production Database Foundation + Test Harness

**Status:** IMPLEMENTED  
**Phase:** 3.3 P1 only — no P2+ domain work  
**Date context:** After Q1–Q24 locks + Implementation Master Plan  

---

## Summary

PostgreSQL is the production business database. Versioned Drizzle migrations replace bootstrap/`push --force` as the schema evolution path. PGlite remains available for **local demo only**. A Node.js `node:test` harness validates migrations and environment safety.

---

## Architecture

```text
APP_ENV / NODE_ENV
        │
        ├─ production/staging → PostgreSQL REQUIRED (migrations)
        │                        no auto-seed, secrets required
        ├─ test               → TEST_DATABASE_URL or in-memory PGlite tests
        │                        no demo seed
        └─ development
             ├─ DATABASE_URL postgres → migrations; seed only if ALLOW_DEMO_SEED=1
             └─ no URL                → PGlite demo + migrations + demo seed
```

**Schema source of truth for evolution:** `lib/db/migrations/` (ordered SQL + `meta/_journal.json`).  
**ORM models:** `lib/db/src/schema/*` (unchanged domain shape in P1).  
**Legacy:** `bootstrap.ts` deprecated; not used on startup.

---

## Migration workflow

| Command | Purpose |
|---------|---------|
| `pnpm db:migrate` | Apply pending migrations |
| `pnpm db:migrate:status` | Show journal (+ applied hashes if `DATABASE_URL` set) |
| `pnpm test` | Migration + safety tests |
| `pnpm --filter @workspace/db push` | Guarded; refuses `--force` unless emergency flag |

**Forbidden in production:** `drizzle-kit push --force` (guarded by `scripts/push-guard.mjs`).

### Fresh Postgres

1. Create empty database (e.g. `vaksinamed`).
2. Set `DATABASE_URL`, `APP_ENV`, secrets.
3. `pnpm db:migrate`
4. Start API (`pnpm dev:api`) — migrations also apply on boot for postgres/pglite.

### Existing local PGlite demo

Startup now runs migrations (`CREATE IF NOT EXISTS` baseline). Existing demo data is preserved. No mobile UI changes.

---

## Baseline schema notes / discrepancies

Recorded honestly (not fixed in P1):

| Item | Fact |
|------|------|
| `auth_otps` | Present in SQL baseline + bootstrap; **not** in Drizzle schema TS (raw SQL usage) |
| `product_stocks` | No `UNIQUE(branch_id, product_id)` yet (Q1 later) |
| `customers.phone` | Not E.164 unique yet (Q7 later) |
| Order/payment/cashback | Legacy single-axis / balance model (later phases) |
| Money | **integer** so‘m fields preserved (price, amount, balance, cashback_*) |
| Geo | `lat`/`lng` remain `double precision` (not money) |

---

## Seed scoping

| Environment | Auto demo seed |
|-------------|----------------|
| production / staging / test | **Never** |
| development + PGlite | Yes (default) |
| development + Postgres | Only if `ALLOW_DEMO_SEED=1` |

Demo passwords (`123456`, `vaksinamed`, `kassa123`) are **not** production credentials.

---

## Test architecture

- Runner: Node.js built-in `node:test` via `tsx`
- Location: `lib/db/tests/*.test.ts`
- Isolation: in-memory PGlite for migration tests (no personal/prod DB)
- Safety unit tests: seed gates, destructive guards, test URL naming

Optional future: set `TEST_DATABASE_URL=.../vaksinamed_test` for Postgres-parity CI (name must contain `test`).

---

## Health

`GET /api/healthz` returns connectivity + `driver` (`postgres` | `pglite`). No metrics/tracing (Q18 later).

---

## Intentionally NOT changed (P2+)

Expo UI, inventory reservation model, order three-axis, cashback ledger, payments, delivery AuthZ, FOM contracts, RBAC, notifications/outbox, cloud deploy.

---

## Related

- Master plan: `docs/PHASE_3_3_IMPLEMENTATION_MASTER_PLAN.md`
- Locks: Phase 3.1 §H, Q19
