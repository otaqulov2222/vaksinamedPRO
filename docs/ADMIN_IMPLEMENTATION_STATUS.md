# Admin Panel — Implementation Status

> Updated: 2026-09-25 (daily production checkpoint)  
> Primary: `docs/ADMIN_MASTER_SPECIFICATION.md`  
> UI/UX: `docs/ADMIN_UI_UX_AUDIT.md`, `docs/ADMIN_DESIGN_SYSTEM.md`  
> Production gaps: `docs/PRODUCTION_GAP_MATRIX.md`  
> Phase 11 audit: `docs/ADMIN_PHASE_11_MODULE_AUDIT.md`  

## Legend

| Status | Meaning |
|--------|---------|
| **IMPLEMENTED** | Real Admin UI + real API |
| **INTEGRATED** | Existing module wired into shell |
| **PARTIAL** | Real UI, incomplete |
| **API_ONLY** / **API_REQUIRED** | Needs backend work |
| **MISSING** | Not present |
| **CONTRACT_PENDING** | External blocker |
| **DISABLED** | Kill-switch off |
| **OPEN** | Follow-up |

---

## Daily checkpoint — 2026-09-25

| Gate | Status |
|------|--------|
| P0-1 Managed PG PITR + restore | **OPS_REQUIRED** (12.37 re-verified) |
| P0-2 Merchant secret encryption | App boundary **READY_IN_REPO**; managed KMS **OPS_REQUIRED** (12.42) |
| P0-3 Payme/Click sandbox E2E | **OPS_REQUIRED** (12.40 Payme + 12.41 Click PENDING/NOT_RUN) |
| P0-4 Redis live verify | **OPS_REQUIRED** (12.38 re-verified: provider MISSING; live NOT_PROVEN) |
| HMAC legacy retirement | **OPS_REQUIRED** (12.39: telemetry/quiet/population NOT_PROVEN) |
| Production enablement | **CLOSED** |
| FOM writer / FOM POS | OFF / **CONTRACT_PENDING** |

---

## Phase 13.0 refinement — Dashboard (Network Operations Center)

Faqat vizual kompozitsiya o‘zgardi; API, filtrlar, KPI hisoblari va endpointlar (`/api/admin/dashboard`, `/api/pos/sales`, `/api/admin/audit`) o‘zgarmagan.

- **Ko‘z oqimi:** biznes → buyurtmalar → tarmoq → operatsiyalar. Manba tartibi vizual tartibga teng.
- **KPI band (`.dash-metrics`):** bitta surface, 4 katak: asosiy **Savdo** (kengroq, neytral fon, `fs-display`) + Buyurtmalar / Cashback / Filiallar. Taqqoslash faqat `showDelta` bo‘lsa ko‘rsatiladi, aks holda neytral “—” va izoh. Mijozlar soni Cashback detaliga, faol bronlar Buyurtmalar detaliga ko‘chdi (alohida Mijozlar/Bronlar KPI olib tashlandi).
- **Savdo dinamikasi (`.dash-sales`):** O‘rtacha chek · 7 kunlik jami · Eng yuqori kun, so‘ng real 7 kunlik grafik — ma’lumot bo‘lsa gridline, o‘q, shkala va tooltip; bo‘lmasa bir xil ramka ichida “Ma’lumot yetarli emas”. Xato holatida bar chizilmaydi.
- **Operatsion holat (`.dash-orders`):** buyurtma holatlari (Yakunlangan / Yetkazilmoqda / Rezerv) kichik indikator qatorlari bilan + ichida ixcham “Holat” bloki; tinch holatda bitta qator, sarlavha takrorlanmaydi.
- **Tarmoq:** xarita saqlangan; rail — Filial / Ochiq / 24/7 / Hudud real sonlari, hududlar bo‘yicha taqsimot chizig‘i (`network.regions`) va top hududlar.
- **Signallar (`.dash-signals`):** so‘nggi faollik + real buyurtma/kassa qatorlari (faqat mavjud bo‘lsa).
- **Ranglar:** binafsha faqat brend/aktiv holat va tarmoq vizualizatsiyasida; sariq faqat tanlov; surface’lar oq + hairline, og‘ir soya yo‘q. Header’dagi “Muammo yo‘q” ikkinchi darajali nuqta.
- **Responsive:** 1280 da 4 katakli band siqiladi, ≤1100 da asosiy katak to‘liq qator + 3 katak, ≤560 da bitta ustun; dashboard breakpointlari `Dashboard — Phase 13.0 reset` blokida jamlangan.

---

## Phase 13.21 — Staging Infrastructure Provisioning Readiness

1. **CODE READY / INFRASTRUCTURE NOT PROVISIONED.** STAGING STATUS: NOT PROVISIONED. No DigitalOcean resource, DNS record, domain, firewall or secret was created; this phase had no authorization to create them. The provisioning package (parts A–S: inventory, topology, firewall matrix, secrets, PostgreSQL, Valkey, API, worker, Admin, domain/TLS, O-6, O-8, backup, O-2, monitoring, smoke, rollback, cost, deployment order, blockers) is in `docs/STAGING_INFRASTRUCTURE_BLUEPRINT.md` § Phase 13.21. Nothing below is staging evidence.
2. **Deployment blocker fixed — migration release (O-8):**
   - **Before:** the image had no migration command. Root `pnpm db:migrate` needs `tsx` and the workspace, so the only in-image path was API boot. Boot auto-migrates through the drizzle migrator, which takes no lock, so several replicas starting on an unmigrated database could race.
   - **`dist/migrate.mjs`** (`artifacts/api-server/src/migrate.ts`, which calls the new `@workspace/db/release`):
     - A one-off release step: no HTTP, no seed, one pooled connection, never prints the URL.
     - `--status` is read-only. Without the flag it applies the migrations, then verifies.
     - It exits non-zero unless every journal migration is applied, no unknown hash is recorded, and the critical tables exist.
     - Scripts: `migrate:release`, `migrate:release:status`.
   - **Shared advisory lock:** `lib/db/src/migrationLock.ts` wraps every PostgreSQL migration application (API boot and the release step) in `pg_advisory_lock` on one dedicated connection. Concurrent starts serialize, and the later ones find nothing pending. PGlite and seed behaviour are unchanged, and no migration was added (journal still `0013`).
   - **CI:** the runtime-layout step also checks `test -f dist/migrate.mjs`. The `Dockerfile` documents the release CMD.
   - **LOCAL real-PostgreSQL evidence** (embedded PostgreSQL 18.4 in a temp directory, deleted afterwards; **not staging**):

     | Step | Result |
     |------|--------|
     | Status on an empty database | exit 1, 14 pending, 38 critical tables missing |
     | Two concurrent apply runs | both exit 0, 14 applied, 0 pending, 0 unknown |
     | Status afterwards | exit 0, last `0013_auth_event_telemetry` |
     | Apply again | exit 0 (no-op) |
     | Password in output | never |

     The first attempt correctly refused to run: the local `.env` sets `DB_DRIVER=pglite`, which `assertProductionDatabaseConfig` forbids in staging.
3. **Audit findings used by the package:**
   - The worker bundle (`dist/worker.mjs`) contains no Redis client and no provider host. The worker needs PostgreSQL only: no Valkey and no internet.
   - The Payme and Click hosts are browser checkout URLs, not server calls. Their merchant APIs are inbound and off by default.
   - The API's outbound calls are `notify.eskiz.uz` (SMS) and `router.project-osrm.org` (`GET /api/maps/route`). The 13.20 matrix listed the wrong outbound hosts and is corrected in the blueprint.
   - `rediss://` uses Node's default certificate verification, and there is no CA-file option for Valkey. Provider certificate trust is **TBD** (PROVIDER).
   - `package.json` has `start` (API), `start:worker`, `migrate:release` and `migrate:release:status`. There is **no** `start:api` script, and none was invented.
4. **Admin bundle scan** (`artifacts/admin-web/dist`, 13.21 build):
   - 0 hits for database or Redis URLs, the secret variable names, `sslrootcert`, private IPv4 ranges, `localhost:5000` / `127.0.0.1` and provider-internal hostnames.
   - The only absolute URLs are `w3.org`, `react.dev` and `google.com`. No API hostname is hard-coded; the build uses same-origin `/api`, so no change was needed.
5. **Registry O-2:** **STATUS = DECISION REQUIRED**. Alternatives (DOCR / GHCR / other OCI) are listed in the blueprint as not selected, and no resource was created.
6. **O-6 TRUSTED PROXY CUTOVER BLOCKER:** `trust proxy` stays off and runtime is unchanged. Enabling it needs:
   - The proxy type.
   - The proxy IPs / CIDRs.
   - Forwarding-header behaviour.
   - The firewall restriction.
   - The TLS termination point.
   - The proxy chain.
   - Test evidence.

   Until then, all clients behind the edge share one rate-limit identity and one auth-event IP.
7. **Secrets inventory:** every staging secret is **MISSING**, because no secret store exists yet. Statuses only, no values (blueprint § D).
8. **Monitoring:** log-based alert codes, health endpoints and DO metrics exist. No metrics / APM platform is selected, and the alert destination is **STATUS = TBD**.
9. **Smoke checklist (staging — none executed; NOT RUN / PASS / FAIL / BLOCKED):**

   | # | Area | Check | Status |
   |---|------|-------|--------|
   | 1 | INFRA | API health (`/api/health/live` over HTTPS) | **BLOCKED** — not provisioned |
   | 2 | INFRA | API readiness (`/api/health/ready`, `driver: "postgres"`) | **BLOCKED** — not provisioned |
   | 3 | INFRA | PostgreSQL connectivity (TLS verify-full, provider CA) | **BLOCKED** — not provisioned |
   | 4 | INFRA | Valkey connectivity (`rediss://` boot PING) | **BLOCKED** — not provisioned |
   | 5 | INFRA | TLS certificate on the edge | **BLOCKED** — no domain / edge |
   | 6 | INFRA | DNS for `<staging-domain>` | **BLOCKED** — no domain |
   | 7 | INFRA | Firewall matches the matrix | **BLOCKED** — no firewall |
   | 8 | INFRA | Container startup from the registry image | **BLOCKED** — O-2 |
   | 9 | INFRA | Worker startup (`ENABLE_BACKGROUND_WORKERS=1`) | **BLOCKED** — not provisioned |
   | 10 | APPLICATION | Admin login through the staging origin | NOT RUN |
   | 11 | APPLICATION | Customer auth (OTP) | **BLOCKED** — Eskiz credentials |
   | 12 | APPLICATION | Order | NOT RUN |
   | 13 | APPLICATION | Reservation | NOT RUN |
   | 14 | APPLICATION | Inventory | NOT RUN |
   | 15 | APPLICATION | Cashback | NOT RUN |
   | 16 | APPLICATION | POS | NOT RUN |
   | 17 | APPLICATION | Payment state | **BLOCKED** — PSP sandbox credentials |
   | 18 | APPLICATION | Delivery | NOT RUN |
   | 19 | APPLICATION | FOM boundary | **BLOCKED** — CONTRACT_PENDING |
   | 20 | APPLICATION | Worker processing | NOT RUN |
   | 21 | SECURITY | 401 without a token | NOT RUN |
   | 22 | SECURITY | 403 for a cashier on HQ endpoints | NOT RUN |
   | 23 | SECURITY | Rate limit (shared Valkey) | NOT RUN |
   | 24 | SECURITY | Spoofed `X-Forwarded-For` ignored | NOT RUN |
   | 25 | SECURITY | Auth telemetry written | NOT RUN |
   | 26 | SECURITY | No secrets in responses | NOT RUN |
   | 27 | SECURITY | No secrets in the frontend bundle | NOT RUN |
   | 28 | SECURITY | Trusted proxy remains intentionally disabled until O-6 (boot log `trustProxy: false`) | NOT RUN |
   | 29 | RESILIENCE | API restart | NOT RUN |
   | 30 | RESILIENCE | Worker restart | NOT RUN |
   | 31 | RESILIENCE | PostgreSQL reconnect | NOT RUN |
   | 32 | RESILIENCE | Redis reconnect (503 `RATE_LIMIT_REDIS_UNAVAILABLE` during outage) | NOT RUN |
   | 33 | RESILIENCE | Stale worker recovery (kill drill) | NOT RUN |
   | 34 | RESILIENCE | Backup restore drill | NOT RUN |

10. **Load-test preconditions:**
    - Use real PostgreSQL, real Valkey, the real API and a live worker; never PGlite.
    - Before testing: O-6 decided, limiter behaviour understood, database capacity and connection limits known, monitoring available.
    - The 1000+ branch load test was not run.
11. **Tests:**
    - `lib/db/tests/p13-21-migration-release.test.ts` (8 tests) covers:
      - Status on an empty database (writes nothing), then ok after applying.
      - Unknown-hash and missing-table detection; critical-table coverage.
      - Refusal without a postgres URL.
      - The release module never imports the app database or seed and never logs.
      - The shared advisory lock in boot and release.
    - `artifacts/api-server/tests/admin-phase13-21-provisioning-readiness.test.ts` (17 tests) covers:
      - The release entry point, the third build entry, the scripts, the CI check and the Dockerfile note.
      - That the worker and migrate entry points carry no Redis client.
      - That trust proxy, CORS and readiness are unchanged.
      - Docs: 13.21 sections, the resource / firewall / secrets tables, O-2 DECISION REQUIRED, the O-6 blocker, a smoke checklist without PASS, blockers with owner categories.
12. **Browser QA — LOCAL QA — NOT STAGING:**
    - Setup: an isolated API from the current build (temp PGlite with the demo seed, dev mode, `CORS_ORIGIN=http://127.0.0.1:5916`), behind a local same-origin edge serving `admin-web/dist` and forwarding `/api`.
    - 401 without a token; login through the edge.
    - Dashboard, Adminlar (2 users, 2 auth events) and the Sessions tab rendered; Settings showed PGlite (lokal) / "Javob berdi".
    - The token stayed in `localStorage` and not in the URL.
    - CORS: the allowlisted origin could read the API (200); the other origin was blocked by the browser.
    - 403 for the cashier on `/api/admin/auth-events` and `/api/admin/users/1/sessions`, and the cashier saw no Adminlar nav item.
    - 25 API responses, all 2xx; response secret scan 0 hits; 0 console errors; no horizontal overflow at 390 px.
    - The temp database was deleted, and the dev database was not touched.
13. **Remaining blockers (owner):**
    - Account access / authorization (OPS).
    - Registry O-2 (DEVOPS).
    - Domain (BUSINESS).
    - Edge type (OPS).
    - O-6 (SECURITY + OPS).
    - Secret store (OPS + SECURITY).
    - Valkey certificate trust (PROVIDER).
    - PSP / Eskiz credentials and callback sources (PROVIDER).
    - Alert destination (OPS).
    - Public OSRM dependency (BUSINESS).
    - `docker build` / CI not executed (DEVOPS): Docker build is **BLOCKED — Docker unavailable** locally.

---

## Phase 13.20 — Staging Infrastructure Bootstrap

1. **STAGING STATUS: NOT PROVISIONED.** No DigitalOcean account, Droplet, database, Valkey, load balancer, domain, DNS record, firewall or secret was created; this phase had no authorization to create them. The repository was prepared for a DigitalOcean FRA1 (candidate) staging, and every staging check below is **NOT RUN** or **BLOCKED**. Nothing here is staging evidence.
2. **Audit — real blockers found in the repository:**
   - **The Docker image could not start.** `build.mjs` keeps `ioredis` and `@electric-sql/pglite` as external imports of `dist/index.mjs`, but the runtime stage copied only `dist` and `package.json`. There was no `node_modules` and no `lib/db/migrations`, so boot died with `ERR_MODULE_NOT_FOUND` before any code ran. Even with the packages present, `getMigrationsFolder()` would not have found the journal. The CI smoke step tolerates a process exit, so CI never caught this.
   - **No worker process existed.** `worker_jobs` ran only when an admin called `POST /api/workers/run-due` over HTTP, which needs a 12-hour admin session token in a cron job. The target topology needs a separate always-on worker.
   - **CORS reflected any origin** (`origin: true`). The blueprint named `CORS_ORIGIN`, but no code read it (the gap matrix marks it **MISSING**).
   - **PostgreSQL TLS:** node-postgres 8.23 treats `sslmode=require` as verify-full. A provider-private CA must be passed as `sslrootcert=<file>`, otherwise the connection fails. Disabling verification is not an option.
   - **Migrations:** they auto-apply at import in every process (API and worker). The drizzle migrator uses one transaction but no advisory lock, so instances booting at the same time on an unmigrated database can race (one fails and restarts).
   - **Admin API URL:** `artifacts/admin-web/src/api.ts` has `const API = ""`. The bundle calls same-origin `/api/...`, and there is no `VITE_*` variable or runtime config. Staging must therefore serve Admin and `/api` from one origin.
3. **Readiness matrix (repository vs staging):**

   | Area | Repository | Staging |
   |------|-----------|---------|
   | A API | **READY_IN_REPO**: image fixed; boot guards (DB, Redis, KEK, no trust proxy, CORS validation) | NOT RUN |
   | B Worker | **READY_IN_REPO**: `dist/worker.mjs`, gated, no HTTP, SKIP LOCKED + stale reclaim reused | NOT RUN |
   | C Admin | **READY_IN_REPO** with constraint: same-origin `/api` only; bundle secret scan 0 hits | NOT RUN |
   | D PostgreSQL | Fail-closed config; migrations 0000–0013; TLS via URL params | **BLOCKED** (not provisioned) |
   | E Redis / Valkey | Fail-closed boot PING; 503 `RATE_LIMIT_REDIS_UNAVAILABLE`; `rl:v1` keys unchanged | **BLOCKED** (not provisioned) |
   | F Secrets | Contract documented, placeholders only | **OPS_REQUIRED** (no secret created) |
   | G Observability | pino JSON logs + redaction; alert codes in logs; boot log fields | **PARTIAL**: no metrics/APM/alert routing |
   | H Deployment | Dockerfile + CI layout check; no registry, no IaC | **BLOCKED**: no DO resources, registry O-2 open |

4. **Docker / container changes:**
   - **Change 1:** a new `prod-deps` stage runs `pnpm install --frozen-lockfile --prod --no-optional --filter @workspace/api-server...`.
   - **Change 2:** the runtime stage now uses `WORKDIR /app/artifacts/api-server` (the same layout as the workspace). It copies the production `node_modules` and `lib/db/migrations` (resolved via `../../lib/db/migrations`).
   - **Unchanged:** non-root `appuser`, `HEALTHCHECK /api/health/live`, PSP and worker flags `0`, `CMD dist/index.mjs`, and no baked secrets.
   - **Same image for the worker:** set `CMD ["node","--enable-source-maps","dist/worker.mjs"]` and disable the HEALTHCHECK, since the worker has no port.
   - **CI:** a new step checks that the image resolves `ioredis` and `@electric-sql/pglite`, and that both the migrations journal and `dist/worker.mjs` exist.
   - **Local evidence (Windows, no Docker installed):** the same `--prod --no-optional` install ran in a temp copy (111 packages, no dev dependencies). The bundled API then booted from that layout with a temp PGlite: migrations applied, `/api/health/live` and `/api/health/ready` returned 200. **`docker build` itself was NOT RUN.**
5. **Environment contract:**
   - **REQUIRED STAGING:** `APP_ENV=staging`, `NODE_ENV=production`, `PORT`, `DATABASE_URL` (postgres, TLS verify-full + provider CA file), `REDIS_URL` (`rediss://`), `ADMIN_SECRET`, `CUSTOMER_SECRET`, `POS_SECRET`, `MERCHANT_SECRET_KEK` (32 bytes, base64 or hex), `FOM_WEBHOOK_SECRET`, `CORS_ORIGIN`. The worker additionally needs `ENABLE_BACKGROUND_WORKERS=1`.
   - **OPTIONAL:** `PG_POOL_MAX`, `PG_POOL_IDLE_MS`, `PG_POOL_CONNECT_TIMEOUT_MS`, `WORKER_POLL_INTERVAL_MS`, `WORKER_STALE_RUNNING_MS`, `PAYMENT_INTENT_TTL_MS`, `LOG_LEVEL`, `LEGACY_HMAC_DEADLINE` / `ALLOW_LEGACY_HMAC_TOKENS`, `DB_MIGRATIONS_FOLDER`, Eskiz (`ESKIZ_*`), and the sandbox harness vars (`PAYME_SANDBOX_*`, `CLICK_SANDBOX_*`, `SANDBOX_E2E_RUN`).
   - **Must stay OFF in staging:** PSP merchant flags (until the sandbox gate), every `ALLOW_*` dev flag, and `ENABLE_BACKGROUND_WORKERS_DEV` (ignored in production-like anyway).
   - **No `TRUST_PROXY`.** `.env.example` carries placeholders only.
6. **PostgreSQL bootstrap:**
   - The full procedure is in `docs/STAGING_INFRASTRUCTURE_BLUEPRINT.md` § Phase 13.20 addendum.
   - The journal stays at **0013**; this phase adds no migration.
   - Run migrations once as a release step (`pnpm db:migrate`, or a single first instance) before scaling out.
   - The demo seed never runs in staging (`lib/db/src/env.ts`).
   - PGlite runs here are local tests only, never PostgreSQL evidence.
7. **Redis / Valkey:**
   - Unchanged: `REDIS_URL` only, boot connect + PING (exit in production-like on failure), a fail-closed limiter, and `rl:v1:<sha256>` keys.
   - **Readiness stays PostgreSQL-only.** That was the deliberate 12.38 decision, pinned by `phase12-38-redis-staging-gate`. A Redis outage returns 503 on rate-limited routes instead of pulling every instance out of rotation.
8. **Health:**
   - `/api/health/live` is process-only.
   - `/api/health/ready` checks PostgreSQL (503 `not_ready` when down).
   - `/api/healthz` is the Settings compatibility alias.
   - No false healthy: readiness does not claim Redis. Redis health shows in the boot log (`rateLimitStorage: "redis"`) and as limiter 503s.
9. **Worker:**
   - Run it with `node dist/worker.mjs` (`pnpm --filter @workspace/api-server start:worker`).
   - It refuses to start, before opening the database, unless `ENABLE_BACKGROUND_WORKERS=1`. Outside production-like mode, `ENABLE_BACKGROUND_WORKERS_DEV=1` is also accepted.
   - Each tick enqueues the idempotent hourly sweeps and drains due jobs (batches of 20, at most 10 per tick) through the existing `runDueWorkerJobs`: FOR UPDATE SKIP LOCKED plus stale RUNNING reclaim. Several replicas are therefore safe. There is no new queue and no BullMQ.
   - On SIGTERM/SIGINT it stops scheduling and waits up to 25 s for the in-flight tick. An interrupted job is reclaimed after `WORKER_STALE_RUNNING_MS`.
   - The API process still never starts workers (`workersAutoStart: false`).
   - **Local run** (temp PGlite, dev flag): the worker started, enqueued and finished `reservation_expiry` and `payment_expiry`, and later ticks found nothing due. SIGTERM drain is covered by unit tests only, because Windows cannot deliver SIGTERM.
10. **Admin:**
    - The API URL is compile-time `""`, i.e. same origin. The staging edge must serve the static `artifacts/admin-web/dist` and forward `/api/*` to the API on the same hostname. A separate Admin hostname would need a code change (not done).
    - A secret scan of the bundle found 0 hits.
    - The token stays in `localStorage` (Bearer header; no cookies).
11. **CORS:**
    - `CORS_ORIGIN` is a comma-separated allowlist of exact origins. Wildcards, paths and trailing slashes fail boot, and staging/production require `https`.
    - When unset, the legacy reflect-any behaviour is kept so existing deployments don't change, and production-like boot logs a warning.
    - Boot logs `cors: "allowlist" | "reflect"`.
    - Same-origin Admin doesn't need CORS. List only real cross-origin browser clients (for example a Telegram Mini App or Expo web origin, if it is served from a different origin). Native mobile, POS and PSP callbacks are not affected.
12. **DigitalOcean topology (target, not provisioned):**
    - Internet → HTTPS edge (DO Load Balancer or an on-host TLS proxy, **TO_BE_AGREED**) → API container(s) on `PORT` 5000.
    - On the same origin, the edge also serves the Admin static build.
    - A worker container runs on a Droplet with no inbound traffic.
    - Managed PostgreSQL and Managed Valkey (FRA1 candidate) sit in the VPC.
    - Outbound traffic goes to `checkout.test.paycom.uz`, `my.click.uz` and `notify.eskiz.uz`.
    - Details: blueprint § Phase 13.20 addendum.
13. **Trusted proxy:**
    - Unchanged from 13.19: `trust proxy` stays off, `assertNoProxyTrust()` runs at boot, and no CIDR or hop count exists.
    - **Consequence for this topology:** every HTTPS edge is a proxy hop, so all staging clients share the edge's address for rate limiting and auth-event IP. That is acceptable only for a closed internal smoke test. Load tests and pilots stay blocked until O-6 is decided.
14. **Firewall matrix:** see the blueprint addendum.
    - Public inbound: 443 only, to the edge.
    - API `PORT` 5000: reachable only from the edge.
    - Worker: no inbound.
    - PostgreSQL and Valkey: VPC or trusted sources only, on the provider-assigned port (not invented here).
    - Outbound: HTTPS 443 to the three provider hosts.
    - SSH / ops access: **TO_BE_AGREED**.
15. **Backup / restore:**
    - `pnpm backup:drill` is a non-production PGlite drill and is **not** evidence.
    - The provider drill is **NOT RUN**: enable backups and PITR, restore to a new cluster, point a temporary API at it, check `/api/health/ready` returns `driver: "postgres"`, check `db:migrate:status`, check critical-table row counts, and record the timings.
    - No backup evidence is claimed.
16. **Smoke checklist (staging — none executed):**

    | # | Check | Status |
    |---|-------|--------|
    | 1 | DO resources exist (PostgreSQL, Valkey, Droplets / edge, VPC) | **BLOCKED** — not provisioned |
    | 2 | DNS + TLS certificate for staging hostnames | **BLOCKED** — no domain decision |
    | 3 | Image built by CI and pushed to a registry | **BLOCKED** — registry decision O-2 |
    | 4 | CI runtime-image layout step (externals, migrations, worker entry) | NOT RUN — CI not executed (no push) |
    | 5 | API boot log: `rateLimitStorage: "redis"`, `trustProxy: false`, `cors: "allowlist"` | NOT RUN |
    | 6 | `GET /api/health/live` 200 over HTTPS | NOT RUN |
    | 7 | `GET /api/health/ready` 200 with `driver: "postgres"` | NOT RUN |
    | 8 | `db:migrate:status` shows 0000–0013 applied | NOT RUN |
    | 9 | PostgreSQL TLS verify-full with provider CA (verification never disabled) | NOT RUN |
    | 10 | Valkey `rediss://` PING at boot; outage → 503 `RATE_LIMIT_REDIS_UNAVAILABLE` | NOT RUN |
    | 11 | Admin login through the staging origin (same-origin `/api`) | NOT RUN |
    | 12 | CORS: allowlisted origin readable, other origin blocked | NOT RUN |
    | 13 | Worker started with `ENABLE_BACKGROUND_WORKERS=1`; sweeps processed | NOT RUN |
    | 14 | Worker SIGTERM drain + kill drill → stale reclaim, no double effect | NOT RUN |
    | 15 | API port reachable only from the edge | **BLOCKED** — no firewall |
    | 16 | PostgreSQL / Valkey reachable only from VPC / trusted sources | **BLOCKED** — not provisioned |
    | 17 | Payme sandbox E2E (`pnpm sandbox:e2e`) | **BLOCKED** — credentials missing |
    | 18 | Click sandbox E2E | **BLOCKED** — credentials missing |
    | 19 | Eskiz OTP SMS to a test number | **BLOCKED** — staging credentials missing |
    | 20 | Backups + PITR on; restore to a new cluster drill | NOT RUN |

17. **Tests:**
    - `artifacts/api-server/tests/admin-phase13-20-staging-bootstrap.test.ts` (new, 22 tests) covers:
      - CORS parsing and validation, plus fail-closed behaviour on an invalid allowlist.
      - Real-app CORS headers: allowlisted origin, foreign origin, preflight, no Origin header, and unset meaning legacy reflect.
      - Boot ordering.
      - The worker poll clamp and the env gate, including that the dev flag is ignored in production-like mode.
      - Tick drain bound, error resilience, no overlapping ticks, and stop with drained or timeout.
      - The worker entrypoint has no HTTP server and gates before importing anything DB-backed.
      - Dockerfile runtime layout, fail-closed defaults and no baked secrets; the CI layout step.
      - The `.env.example` contract.
      - Readiness stays PostgreSQL-only; trust proxy and the rate limiter are untouched; the journal is still at 0013.
      - Docs honesty.
    - Full suite: see the final report. It was run with a fresh temporary `PGLITE_DIR`, because the old local `artifacts/api-server/.data/pglite` directory (left untouched) aborts PGlite on open. That was documented in 13.19.
18. **Browser QA — LOCAL QA (not staging):**
    - Setup: an isolated API from the current build (temp PGlite with the demo seed, dev mode, `CORS_ORIGIN=http://127.0.0.1:5916`), plus a local same-origin edge that served `admin-web/dist` and forwarded `/api`, mirroring the required staging layout.
    - Login through the edge worked, and all 19 API calls returned 2xx.
    - Settings "Tizim holati" showed PGlite (lokal) / "Javob berdi".
    - A fetch from the allowlisted origin to the API port was readable (200). The same fetch from `http://localhost:5916` was blocked by the browser.
    - There were 0 console errors and no horizontal overflow at 390 px.
    - The dev database was not touched, and the temp database was deleted.
19. **Remaining gaps:**
    - Every DigitalOcean resource (not provisioned).
    - Domain / TLS and the edge choice.
    - Trusted-proxy decision O-6, which is now the main precondition for meaningful staging traffic.
    - Registry O-2; `docker build` verification (CI).
    - Migration release step O-8.
    - Admin separate-origin support (code change, only if a separate Admin hostname is wanted).
    - Metrics / alert routing.
    - The provider backup / PITR restore drill.
    - PSP sandbox and Eskiz credentials.
    - Worker kill drill on real PostgreSQL.

---

## Phase 13.19 — Deployment Proxy + Trusted Proxy Security

1. **Status: NO RUNTIME PROXY CHANGE — trust proxy intentionally left disabled.** The repository defines no trusted-proxy topology, so none was invented. Client IP resolution, rate-limit keys and auth telemetry behave exactly as in 13.18. This phase adds a fail-closed boot guard, documentation, an ops decision record and tests proving that spoofed forwarding headers stay ignored.
2. **Audit — what the repository defines:**
   - `docs/STAGING_INFRASTRUCTURE_BLUEPRINT.md`: "Reverse Proxy / LB (optional but typical)" in a diagram; TLS termination **NOT_VERIFIED** for every provider; domain names **TO_BE_AGREED**.
   - `docs/PHASE_12_49_PROVIDER_DECISION.md`: DigitalOcean was chosen as the staging provider, but the load balancer is "(optional but recommended)" and **DEPENDS_ON_PLAN**. Nothing is provisioned.
   - `docs/BATCH_3L_STAGING_SERVER_PREFLIGHT.md`: TLS terminator "Nginx **or** Caddy — choose after OS discovery" → `127.0.0.1:PORT`; host discovery **NOT_RUN**.
   - `docs/PRODUCTION_GAP_MATRIX.md` O-3: TLS termination / CORS **OPS_REQUIRED**.
   - `docs/MASTER_SPECIFICATION.md` and `PRODUCTION.md`: "behind a load balancer" as a scaling principle only.
   - `.replit`: a Replit `autoscale` deployment target. That is a hosting option, not the selected staging topology, and it publishes no proxy addresses in the repo.
   - `Dockerfile` / `docker-compose.yml` / `.env.example`: no proxy service, no trusted-proxy variable.
   - **Not defined anywhere:** proxy IP / CIDR, hop count, staging or production proxy instance, header-rewrite behaviour (overwrite vs append to `X-Forwarded-For`), or a `TRUST_PROXY`-style setting.
3. **Express `trust proxy` behaviour (audited):**
   - It is never set, so `app.get("trust proxy") === false` and `req.ip` is `req.socket.remoteAddress`. The server listens on `0.0.0.0` (IPv4).
   - `req.ip` is the only client-address source. No code reads `X-Forwarded-*`, `X-Real-IP`, `Forwarded` or `req.ips`.
   - Nothing reads `req.protocol` / `req.hostname` / `req.secure`, so `trust proxy` would affect only `req.ip`. That is exactly the rate-limit identity and the auth-event IP.
   - The Expo static server (`artifacts/soglom-apteka/server/serve.js`) reads `x-forwarded-proto/host` only to build landing-page URLs. It is not part of the API identity and was left untouched.
4. **Rate-limit identity (audited, unchanged):**
   - Every limiter key is built from `req.ip`: `admin-login:{ip}`, `auth:{ip}`, `otp:{ip}:{phone}`, `order-create:{ip}:{auth24}`, `cashback-history:{ip}:{auth24}`, `loyalty-redeem:{ip}`, `pos-scan/pos-sale/pos-card:{ip}`, and the default `{ip}:{path}`.
   - Keys are SHA-256-hashed into `rl:v1:<40 hex>` before Redis or memory storage.
   - Rate-limit keys did **not** change, and no new IP-derived key was added.
5. **Spoofing analysis:**
   - With trust proxy off, a client cannot choose its identity. `X-Forwarded-For`, `X-Real-IP` and `Forwarded` (including IPv6, loopback claims and malformed values) move neither the rate-limit bucket nor the stored IP. This is tested against the real admin login limiter and a probe limiter.
   - Enabling it safely needs **all** of the following, or one of these failures appears:
     - `trust proxy = true` or a bare hop count trusts the left-most / client-supplied `X-Forwarded-For` entry. Any client could then rotate fake IPs to get a fresh bucket per request (rate-limit bypass) and write arbitrary IPs into `auth_events`.
     - Express honours only `X-Forwarded-For` for `req.ip`. Code that later reads `X-Real-IP` / `Forwarded` directly would reopen spoofing; the tests forbid such reads.
     - The trusted list must contain only the proxy's own addresses (LB private/VPC range, or loopback for an on-host Nginx/Caddy), and the proxy must overwrite or append `X-Forwarded-For` with the real peer.
   - **Current deployment risk (documented, not fixed by guessing):** if the API is put behind a proxy as-is, every client shares the proxy's address. All limiters then become global buckets (e.g. 20 admin logins per 15 min for everyone, OTP and POS limits shared), and auth events show the proxy IP. This must be resolved before staging traffic goes through an LB or TLS terminator.
6. **Boot guard:**
   - `assertNoProxyTrust(app)` in `src/lib/requestTelemetry.ts` runs in `boot()` with the other fail-closed checks, before `app.listen`. It throws if `trust proxy` is enabled (any truthy value: `true`, hop count, `"loopback"`, CIDR list) while no trusted-proxy configuration exists.
   - The boot log now includes `trustProxy: false`.
   - `.env.example` states that there is no trusted-proxy setting and that forwarding headers are ignored.
7. **auth_sessions schema: unchanged.** No spec, business or security requirement asks for a session IP.
   - MASTER_SPECIFICATION §81 asks for "IP/device monitoring where appropriate", and §58 asks for audit "IP/device information where appropriate".
   - The 13.18 `session.create` auth event already stores the IP / UA of the request that created each session, and `auth_sessions` keeps `user_agent` / `device_label`.
   - `auth_sessions.ip_address` stays a documented gap.
8. **auth_events schema: unchanged.** There is no IP filter or IP index: `/api/admin/auth-events` has no IP filter and no spec requires one. **No migration** was added; the journal stays at 0013.
9. **Security:** no secrets, tokens, password hashes, cookies or authorization headers in responses or `auth_events`. No invented IP or User-Agent, no customer telemetry, and RBAC unchanged (401 / 403 / 200 identical with forwarding headers).
10. **Decision record — needed from OPS + SECURITY before enabling trust proxy:**
    - The real edge: none, DigitalOcean Load Balancer, on-host Nginx/Caddy, Replit, or a combination, per environment (staging / production).
    - The exact addresses / CIDRs the API sees as the TCP peer (e.g. LB VPC range, `127.0.0.1` for an on-host terminator). Whether the API port is reachable only from that proxy (firewall), because otherwise clients can bypass it.
    - How the proxy writes `X-Forwarded-For` (overwrite vs append), and the hop count if chained.
    - IPv6 at the edge.
    - Then: an explicit address-restricted configuration (never `true`), replacing `assertNoProxyTrust` with a validator for that configuration. Tests are needed for trusted and untrusted chains, and a check that rate-limit buckets stay per-client behind the proxy.
11. **Tests:** `artifacts/api-server/tests/admin-phase13-19-proxy-trust.test.ts`:
    - Audit: trust proxy off at runtime; no source enables it; no forwarding-header, `req.ips` or `req.protocol/hostname/secure` reads; the boot guard runs before listen and rejects `true` / `1` / `"loopback"` / CIDR / list; no trusted-proxy env setting; all limiter keys unchanged and hashed.
    - Auth telemetry: direct; spoofed `X-Forwarded-For` / `X-Real-IP` / `Forwarded`; IPv6 and loopback claims; malformed values; a real IPv6 peer (`::1`); customer events still NULL; `normalizeIp` rejects header-shaped values.
    - Rate-limit identity: the probe limiter key equals the telemetry IP on IPv4 and IPv6, and rotating spoofed headers share one bucket (3 × 200 then 429). The real admin login limiter counts down one per spoofed request and then returns 429.
    - Authorization: 401 / 403 / 200 unchanged with forwarding headers, and the API shows only peer IPs.
    - Secret scans and docs.
12. **Browser QA:**
    - **Boot check:** the new build started on an isolated port with a temporary PGlite (removed afterwards). The guard passed, and the boot log shows `trustProxy: false`.
    - **Dev DB, read-only:** the only writes were HQ and cashier logins. Every other non-GET was aborted, and none was attempted; there was no session revoke.
      - The dev API process was not restarted. Request handling is unchanged in this phase.
      - Auth events: page columns Vaqt · Hodisa · Natija · Admin · IP · Qurilma; drawer columns IP manzil · User-Agent. New rows show the peer IP `127.0.0.1` / "Chrome · Windows"; older rows show "Saqlanmagan".
      - Filters (`event`, `success`) and pagination (`offset=25`) work.
      - Keyboard: Enter on a row; ArrowRight / End / Home / ArrowLeft / Space / Enter on tabs; Tab into the panel; Escape returns focus to the row.
      - Error copy for 401 / 403 / 404 / 500 / network has no raw text.
      - Cashier: nav hidden, API 403; no token → 401.
    - **Responsive:** at 1920 / 1440 / 1280 / 1024 / 768 / 390 there is no overflow, no clipped controls and no IP / device cell spill. Cards at ≤768; drawer 460px at 1024 / 768 and full width at 390. The browser-only IPv6 layout fixture wraps on the page and in the drawer at 390.
    - No console errors. No password, token, `public_id`, raw UA or storage column name in Network / DOM / URL; every IPv4-looking string sits in an `.ac-ip` cell (18 / 18).
13. **Remaining gaps:**
    - Trusted proxy topology is undecided (O-6 in `PRODUCTION_GAP_MATRIX.md`). Until it is decided, deploying behind a proxy makes all clients share one rate-limit identity and one stored IP.
    - TLS termination and the domain are still **OPS_REQUIRED** / **TO_BE_AGREED**.
    - There is no `auth_sessions.ip_address` (session IP is available through the `session.create` event).
    - There is no IP filter or index on auth events.
    - The listener is IPv4-only (`0.0.0.0`).
    - Test environment: test files that import DB-backed modules open `@workspace/db` at `PGLITE_DIR`, or `<cwd>/.data/pglite`. The local `artifacts/api-server/.data/pglite` (an older PGlite directory) makes PGlite abort on open, so `pnpm test` was run with `PGLITE_DIR` set to a fresh temporary directory. The local directory was left untouched.
14. **Changed files:**
    - `artifacts/api-server/src/lib/requestTelemetry.ts` (`assertNoProxyTrust`, header note), `artifacts/api-server/src/index.ts` (boot guard, `trustProxy` log field).
    - `.env.example` (comment only).
    - `artifacts/api-server/tests/admin-phase13-19-proxy-trust.test.ts` (new).
    - `docs/ADMIN_IMPLEMENTATION_STATUS.md`, `docs/PRODUCTION_GAP_MATRIX.md` (O-6), `docs/STAGING_INFRASTRUCTURE_BLUEPRINT.md` (13.19 addendum).

---

## Phase 13.18 — Auth Security Telemetry

1. **Status: IMPLEMENTED.** Admin auth events now store the IP address and User-Agent of the HTTP request that produced them. "Kirish hodisalari" and the drawer's "Auth hodisalari" tab show them. No IP, User-Agent, device or proxy trust is invented: values come only from the live request, and everything else is NULL ("Saqlanmagan").
2. **Audit (before implementation):**
   - Request lifecycle (`app.ts`): Express `trust proxy` is unset, so `req.ip` is the TCP peer address. Forwarding headers are not read anywhere.
   - Writers: `recordAuthEvent` (`lib/authEvents.ts`) is the only writer. It is best-effort and runs after commit. Callers: `loginAdmin`, admin/customer logout, `revokeSessionFromToken`, `requirePermission` / `assertBranchScope` (`authz.denied`), admin revoke / disable / password change (`session.revoke`), and `issueAdminSession` (`session.create`).
   - `sessionMetaFrom` (`lib/auth.ts`) already read `req.ip` / `user-agent` for sessions. It now uses the same normalizer, and no parallel metadata system was added.
3. **Migration:** `lib/db/migrations/0013_auth_event_telemetry.sql` (journal idx 13) is additive only.
   - `ADD COLUMN IF NOT EXISTS` for both columns.
   - Guarded (`pg_constraint` lookup) length CHECKs: `auth_events_ip_address_len` (≤ 45) and `auth_events_user_agent_len` (≤ 512).
   - There is no DROP, DELETE, UPDATE, NOT NULL or DEFAULT; existing rows stay NULL.
   - Re-running it is a no-op. It works on a clean DB, an existing DB and the 0012 state, on PGlite and Postgres.
   - **No index**: nothing filters or sorts by IP / UA, and the 0012 `auth_events_actor_created_idx` already covers the list queries.
4. **Columns:** `auth_events.ip_address text NULL` and `auth_events.user_agent text NULL` (Drizzle `ipAddress` / `userAgent`). The columns are the source of truth; IP / UA are never copied into `meta` or `audit_log`.
5. **IP source policy** (`artifacts/api-server/src/lib/requestTelemetry.ts`):
   - Source is `req.ip` only. With `trust proxy` unset, that is the socket peer address.
   - `X-Forwarded-For`, `X-Real-IP` and `Forwarded` are ignored, including spoofed and malformed values.
   - `normalizeIp`: trim, drop the IPv6 zone (`%eth0`), and unwrap `::ffff:a.b.c.d` to IPv4. Valid IPv4 is kept as is; valid IPv6 is lowercased.
   - Anything else → NULL. There is no `127.0.0.1` / `0.0.0.0` default.
6. **Trusted proxy policy:** no trusted proxy is configured, and none was invented. Behind a reverse proxy the stored IP would be the proxy's address. Enabling `trust proxy` is an ops decision that needs the real proxy topology, and it would also change the IP rate-limit keys, which are deliberately unchanged.
7. **User-Agent policy:**
   - `normalizeUserAgent` turns control characters (incl. NUL) into spaces, trims, and maps empty to NULL.
   - It cuts deterministically to 512 code points (`AUTH_EVENT_USER_AGENT_MAX`).
   - The raw header is never returned by the API or rendered by the UI. Sessions keep their existing 240-char `user_agent` slice.
8. **Request context:**
   - `requestTelemetryMiddleware` captures `{ ip, userAgent }` once per request into an `AsyncLocalStorage` store. It is mounted after the body parsers (their stream callbacks would lose the context) and before the router.
   - `recordAuthEvent` reads the store only for `actorType: "admin"`. Code outside a request (startup, scripts, background) has no store and writes NULL.
9. **Event writers:**
   - `login.success`, `login.failure` (known and unknown email), `logout`, `authz.denied`, `session.create` (login) and `session.revoke` (logout, admin revoke, disable, password change) store the IP / UA of their request.
   - For admin-initiated actions (revoke, disable, password change) that is the **acting** admin's request; `meta.byAdminId` already says who acted. Enabling an admin writes no auth event (unchanged).
   - Failed login: an unknown email has `actor_id` NULL and the email is **not** recorded (existing privacy policy kept). A known email with a wrong password also stays unattributed (existing behaviour). A disabled admin's login keeps its `actor_id`.
   - Logout: `actor_id` is set only when the bearer secret was verified and the session revoked (`revokeSessionFromToken` now returns `actorId`). An unknown or invalid token stays unattributed; no admin is guessed.
   - Customer events never get telemetry (separate privacy decision, not in scope).
10. **API** (`GET /api/admin/auth-events`, also used by the drawer tab):
    - `stored` is now `{ ip: true, userAgent: true }`.
    - Each event adds `ip: { stored, value }` and `userAgent: { stored, summary, recognized }`. `summary` is the existing server-side browser / OS detection (e.g. "Chrome · Windows"); an unrecognised UA is `stored: true, summary: null`, which the UI shows as "Saqlangan (aniqlanmadi)".
    - Pre-0013 rows return `stored: false` / `value: null`.
    - The raw UA string is never included. No new endpoint and no IP filter were added.
11. **Permissions:** unchanged. `requireRbacManager` (`rbac:manage`) and the 13.17 branch scope apply. HQ → 200, cashier → 403 (plus an `authz.denied` event with telemetry), no token → 401. Customers have no access to admin APIs.
12. **Privacy:**
    - IP and device appear only on the RBAC-protected security console and are not shown on the Audit page; `audit_log` is unchanged.
    - "Audit" and "Auth hodisalari" stay separate.
    - The UI explains that IP / device come from the request that produced the event (for actions on another admin, from the acting admin), that older events are "Saqlanmagan", and that a wrong-email attempt records no email.
13. **Security:**
    - No password, hash, OTP, token, `public_id`, cookie or authorization header is stored or returned (tests scan every response and every `auth_events` row).
    - The best-effort contract is unchanged: an `auth_events` insert failure does not fail the auth flow. It now logs a warning with only the event type and SQLSTATE, because the driver error carries the bound IP / UA / meta.
    - Rate-limit and Redis keys are unchanged.
14. **Frontend** (`AdminAccessPage.tsx`, `styles.css`):
    - Page events: Vaqt · Hodisa · Natija · Admin · IP · Qurilma. Drawer events: Vaqt · Hodisa · Natija · IP manzil · User-Agent.
    - Missing values show "Saqlanmagan"; a stored but unparseable value shows "Noma'lum" / "Saqlangan (aniqlanmadi)".
    - The parser accepts only an IP-shaped value (`[0-9a-f:.]`, ≤ 45) and a summary ≤ 60 chars.
    - IP / device cells wrap (`overflow-wrap: anywhere`) so a 39-char IPv6 fits cards at 390.
    - "Hozir ishlayotgan" gains an "IP va qurilma" item; "Hali ulanmagan" now lists "Sessiyalarda IP manzil" instead of "IP manzil".
15. **Tests:**
    - `artifacts/api-server/tests/admin-phase13-18-auth-telemetry.test.ts` has 34 tests:
      - Migration on the test DB.
      - IP policy: direct, spoofed and malformed headers, IPv6 over `::1`, `normalizeIp` units.
      - UA policy: stored, missing, 512 cut, units.
      - Every writer: failed known / unknown, logout attributed and anonymous, authz.denied, revoke (audit payload has no IP / UA), password change, disable, enable, customer and system NULL.
      - API shape, legacy rows, RBAC 200 / 403 / 401.
      - Concurrency: parallel requests keep their own telemetry; an insert failure still lets login succeed.
      - Secret scans, static contract (middleware order, rate-limit key unchanged), frontend, CSS and docs.
    - `lib/db/tests/p13-18-auth-telemetry-migration.test.ts` has 4 tests: versioned / additive, clean DB (nullable, CHECKs), existing 0012 DB with rows (unchanged, NULL, re-apply no-op), and idempotent DDL.
    - Old tests changed only where they pinned the pre-13.18 state, and none was weakened. In `admin-phase13-17-auth-security.test.ts`:
      - The `stored` flags are now `true`.
      - The event keys include `ip` / `userAgent`.
      - The schema assertion now requires exactly the two telemetry columns.
      - The "no invented IP" test checks that the header comes from a label and values come only from `e.ip`.
16. **Browser QA:**
    - **Real dev DB:** it was backed up first (`%TEMP%\vm-1318-pglite-run-backup`, 1240 files, byte count matched). 0013 was verified on a scratch copy: applied 13 → 14; 547 auth events, 2 admins and 241 sessions byte-identical; telemetry NULL on every existing row; re-run no-op. 0013 was then applied by the normal startup migrator when the dev API restarted.
    - **Dev DB checks (read-only; logins were the only writes, every other non-GET was aborted and none was attempted):**
      - Page events head is Vaqt · Hodisa · Natija · Admin · IP · Qurilma. New rows show `127.0.0.1` / "Chrome · Windows"; pre-0013 rows show "Saqlanmagan".
      - Filters and pagination (`offset=25`) are unchanged.
      - Drawer events head is Vaqt · Hodisa · Natija · IP manzil · User-Agent.
      - Keyboard: Enter on a row, ArrowRight / End / Home / ArrowLeft (wrap) / Space / Enter on tabs, Tab into the panel, and Escape returns focus to the row.
      - Error copy for 401 / 403 / 404 / 500 / network has no raw text.
      - API shape: `ip { stored, value }`, `userAgent { recognized, stored, summary }`, `stored { ip: true, userAgent: true }`.
      - Cashier: nav hidden, `auth-events` / sessions → 403, no token → 401.
    - **Isolated API with a temporary PGlite** (port 5912, `%TEMP%\vm-1318-qa-db`, stopped and deleted afterwards), covering real requests:
      - Logins as Chrome · Windows and Safari · iOS.
      - Known-email wrong password and unknown email: unattributed, IP stored, no email.
      - An unrecognised UA ("Saqlangan (aniqlanmadi)") and an empty UA ("Saqlanmagan").
      - Logout attributed to the cashier, with its `session.revoke`.
      - A UI revoke: `session.revoke` with "Bajargan: admin #1" carries the acting browser's telemetry, exactly one cashier token → 401, and the `admin.session_revoke` audit row has no IP / UA.
    - The script ran twice (an earlier identical run before the approved one). Both runs wrote only to the isolated DB, apart from logins and one cashier 403 read on the dev DB.
    - IPv6 could not be exercised in the browser: the API listens on `0.0.0.0` only. IPv6 storage is covered by the integration test's own `::1` listener.
    - No console errors. No password, token, `public_id`, raw UA string or storage column name in responses, DOM or URL; every IPv4-looking string in the page text sits in an `.ac-ip` cell (11 / 11 on the dev DB, 25 / 25 on the isolated DB).
17. **Responsive:**
    - At 1920 / 1440 / 1280 / 1024 / 768 / 390 there is no page overflow, no clipped controls and no IP / device cell spill (50 page cells, 20 drawer cells).
    - Event rows are cards at ≤768. The drawer is 460px at 1024 / 768 and full width at 390, with no horizontal scroll.
    - Layout fixture (browser-only, never stored): the longest IPv6 (`2001:0db8:85a3:0000:0000:8a2e:0370:7334`) and an unrecognised UA wrap to 2 lines inside the 390 card, page and drawer, with no spill. They fit on one line at 768.
18. **Remaining gaps:**
    - Proxy topology is undecided. Behind a reverse proxy the stored IP is the proxy's, until `trust proxy` is configured for the real topology.
    - `auth_sessions` still has no IP column ("Sessiyalarda IP manzil" stays under "Hali ulanmagan").
    - Customer auth events carry no telemetry.
    - There is no IP filter / search (and so no index).
    - A known-email wrong-password failure has no `actor_id` (existing behaviour).
    - Telemetry exists only for events written after 0013.
19. **Changed files:**
    - DB: `lib/db/migrations/0013_auth_event_telemetry.sql` (new), `lib/db/migrations/meta/_journal.json`, `lib/db/src/schema/auth.ts`, `lib/db/tests/p13-18-auth-telemetry-migration.test.ts` (new).
    - API: `artifacts/api-server/src/lib/requestTelemetry.ts` (new), `src/app.ts`, `src/lib/authEvents.ts`, `src/lib/auth.ts`, `src/lib/sessions.ts`, `src/lib/authSecurity.ts`, `src/routes/admin.ts`, `src/routes/adminSecurity.ts`.
    - Frontend: `artifacts/admin-web/src/pages/AdminAccessPage.tsx`, `artifacts/admin-web/src/styles.css`.
    - Tests: `artifacts/api-server/tests/admin-phase13-18-auth-telemetry.test.ts` (new), `artifacts/api-server/tests/admin-phase13-17-auth-security.test.ts`.
    - `docs/ADMIN_IMPLEMENTATION_STATUS.md`.

---

## Phase 13.17 — Authentication Events + Admin Sessions

1. **Status: IMPLEMENTED.** "Adminlar" now reads real authentication events and per-admin sessions, and can revoke a single session. Everything is built on the existing `auth_events` / `auth_sessions` tables. No event, session field, IP or device is invented. This closes three Phase 13.16 gaps: no `auth_events` read API, no per-session list/revoke, and no case-insensitive email index.
2. **auth_events contract** (audited from `lib/db/src/schema/auth.ts` and every `recordAuthEvent` writer):
   - Columns: `id, actor_type, actor_id (nullable), event_type, success, reason, meta (text JSON), created_at`. There is **no IP and no user-agent column**, so the API reports `stored: { ip: false, userAgent: false }` and the UI says "IP manzil va qurilma kirish hodisalarida saqlanmaydi".
   - Admin event types written today: `login.success`, `login.failure`, `logout`, `session.create`, `session.revoke`, `authz.denied`.
   - Reasons: `bad_credentials`, `admin_disabled`, `hq_required`, `missing_permission`, `branch_required`, `branch_mismatch`, `admin_password_change`, `admin_revoke`. Unknown codes are shown raw.
   - Only `actor_type = 'admin'` rows are exposed; customer events stay hidden.
3. **Session contract:** `auth_sessions` has `id, public_id, actor_type, actor_id, token_hash, expires_at, revoked_at, last_seen_at, device_label, user_agent, created_at`.
   - The API exposes only the numeric `id`. `public_id` is part of the bearer token and `token_hash` is a secret, so neither ever leaves the server.
   - Status (`active | expired | revoked`) is computed on the server from `revoked_at` / `expires_at`; the UI never computes expiry.
   - `device` is a server-side summary of the stored `user_agent` / `device_label`: `{ label, browser, os, recognized }`. It is `null` when nothing was stored ("Saqlanmagan"), and "Noma'lum qurilma" when unrecognised. The raw UA string is never returned.
   - No IP is stored (`stored.ip: false`).
4. **APIs** (`artifacts/api-server/src/routes/adminSecurity.ts`, helpers in `src/lib/authSecurity.ts`):
   - `GET /api/admin/auth-events` (read-only). Returns `{ events, pagination, eventTypes, stored, readOnly: true }`. Each event is `{ id, event, success, reason, adminId, admin: { id, name, email } | null, details, createdAt }`. `details` is `meta` scrubbed recursively by `sanitizeAuditPayload`, then reduced to an allow-list of scalar keys (`permission, role, resourceBranchId, count, revoked, byAdminId, expiresAt`).
   - `GET /api/admin/users/:id/sessions`. Returns `{ sessions, pagination, summary: { active, expired, revoked }, currentKnown, stored }`. Each session is `{ id, status, current, createdAt, expiresAt, revokedAt, lastSeenAt, device }`. `current` is true only for the caller's own bearer session (`sessionPublicIdFromBearer`); otherwise the API does not guess.
   - `POST /api/admin/users/:id/sessions/:sessionId/revoke`. Returns `{ session, changed, endedCurrent }`.
5. **Permissions:** every endpoint starts with `requireRbacManager` (`requireAdmin` + `rbac:manage`). The RBAC model was checked first and no new permission was added. Without a token → 401; a cashier → 403 plus an `authz.denied` event.
6. **Branch scope:** the default is an HQ security console. A branch-scoped manager (a non-HQ admin holding `rbac:manage`) only sees events of non-HQ admins in its own branch; HQ and other-branch rows are filtered out by a join on `admin_users`. An `adminId` filter or sessions call for an out-of-scope admin → 403 `ADMIN_SCOPE_FORBIDDEN`. Events without an admin (`actor_id` null) are visible only to HQ.
7. **Filters** (all server-side; no client-side filtering):
   - Auth events: `adminId` (positive int), `event` (validated code pattern), `success` (`true | false`), and `dateFrom` / `dateTo` (`YYYY-MM-DD`, Asia/Tashkent business days; `from > to` → 422).
   - Sessions: `status`.
   - Invalid input → 422 `AUTH_EVENT_FILTER_INVALID` / `SESSION_FILTER_INVALID`.
8. **Pagination:** `limit` and `offset`, with auth events defaulting to 25 (max 50) and sessions to 10 (max 50). The response is `{ limit, offset, total, hasMore, nextOffset }`; `limit=999` is clamped to 50. Ordering is `created_at DESC, id DESC`. The UI uses `PaginationBar`.
9. **Revoke:** one `db.transaction` runs these steps:
   - Lock the target admin row (`lockTarget`) and check scope with `assertManagerCanTouch`.
   - Lock the session with `SELECT … FOR UPDATE`, filtered by id + `actor_type = 'admin'` + `actor_id = :id`. A missing, wrong-admin, customer or malformed session → 404 `SESSION_NOT_FOUND`.
   - If the session is already revoked, return 200 `changed: false` (idempotent, no audit). Otherwise run the guarded `UPDATE … WHERE revoked_at IS NULL`.
   - Write the audit row.
   - After commit, write a `session.revoke` auth event (reason `admin_revoke`, meta `byAdminId`).
   Revoking your own current session is allowed, with the same effect as logout (`endedCurrent: true`). The UI then shows "Joriy sessiyangiz bekor qilindi. Qayta kiring.", and the next request returns "Seans tugagan. Qayta kiring.".
10. **Audit:** `audit_log` (entity `admin_user`) stores `admin.session_revoke` with `{ adminId, email, sessionId, sessionStatus, current }`. `sessionId` is the numeric row id; no token, `public_id` or hash is included. The generic `/api/admin/audit` reader hides every `session*` key as a safety net, so the Audit page shows only `adminId`, `email` and `current`. Reads (`auth-events`, `sessions`) are **not** audited, matching the existing `/api/admin/audit` read policy. No other new event types were introduced.
11. **Disabled admin:** the Phase 13.16 behaviour is preserved and tested. Disabling revokes every session, so all of them list as `revoked` with no revoke button. A surviving token → 401, login → 403, and the failures appear in auth events. A password change revokes the target's sessions; a self change keeps only the current session.
12. **Concurrency** (tested):
    - The same session revoked in parallel gives exactly one `changed: true` and one audit row.
    - Different sessions in parallel are each revoked once.
    - An already revoked session revoked in parallel gives all `changed: false` with no audit.
    - Revoke racing a disable always ends revoked and disabled.
    - If the audit insert fails (trigger), the revoke rolls back and the 500 hides the DB error.
13. **Email index:** `lib/db/migrations/0012_auth_security.sql` (journal idx 12) is additive only.
    - A `DO $$ … RAISE EXCEPTION` guard refuses to apply while case-only duplicate emails exist (BLOCKED path, no data cleanup).
    - It then creates `admin_users_email_lower_unique ON admin_users (lower(email))` and `auth_events_actor_created_idx (actor_type, actor_id, created_at DESC)`.
    - The API duplicate checks now use `lower(email) = :normalized` (`sameEmail`).
    - Real dev DB: it was backed up first (`%TEMP%\vm-1317-pglite-run-backup`), with 2 admins and 0 case duplicates. 0012 was verified on a scratch copy of that backup (13 applied, both indexes, admin rows byte-identical, re-run no-op) and then applied by the normal startup migrator when the dev API restarted. It works on both PGlite and Postgres.
14. **Security:**
    - No password, hash, session token, `public_id`, token hash, HMAC, cookie, OTP or authorization header appears in responses, audit rows, the DOM or URLs (tests scan every response; browser QA checked Network, DOM, URL and Console).
    - No raw `meta` JSON or raw UA string is ever shown.
    - Error copy: 401 "Seans tugagan. Qayta kiring." · 403 "Bu ma'lumotlarni ko‘rish uchun ruxsatingiz yo‘q." · 404 "Ma'lumot topilmadi." · 500 "Serverda xatolik yuz berdi." · network "Server bilan aloqa o‘rnatilmadi.".
15. **Frontend** (`AdminAccessPage.tsx`):
    - Drawer header: name, email, status and role badge.
    - WAI-ARIA tabs: Profil · Sessiyalar · Auth hodisalari, with a roving tabindex. ArrowLeft/Right wrap, Home/End work, and Enter/Space activate.
    - Sessions: Holat · Qurilma · Yaratilgan · Oxirgi faollik · Tugash vaqti · Amal, with a status filter and summary. Revoke goes through a focus-trapped `ConfirmDialog` and is offered only for active sessions.
    - The new "Kirish hodisalari" page section has filters Hodisa · Natija · Sanadan · Sanagacha · Admin and columns Vaqt · Hodisa · Natija · Admin. There is no IP/Qurilma column, because neither is stored.
    - Sequence guards protect against stale responses. Yangilash and a successful revoke also reload the events list.
    - CSS fix found in browser QA: `.ac-tabs` is a horizontal scroll container inside the scrolling `.drawer-body` grid, and collapsed to 0px height once the drawer overflowed. `height: max-content; overflow-y: hidden` fixes it, with a regression assertion in the 13.17 CSS test.
16. **Tests:**
    - `artifacts/api-server/tests/admin-phase13-17-auth-security.test.ts` has 43 tests: 30 backend integration on a temp PGlite (authorization, auth events, sessions, revoke, concurrency, auth security, email, secrets), 5 static contract and 8 frontend.
    - `lib/db/tests/p13-17-auth-security-migration.test.ts` has 4 tests: versioned/additive, clean DB, an existing DB with a legacy mixed-case admin, and an existing DB with case-only duplicates (migration rejected, rows and applied count unchanged).
    - Old tests changed only where they pinned the previous state, and none was weakened:
      - `p13-16-admin-management-migration.test.ts` now finds 0011 by idx instead of assuming it is the last journal entry.
      - `admin-phase13-15-admin-users.test.ts` allows exactly the three new routes in `adminSecurity.ts`, keeps `/admin/sessions` forbidden everywhere, and adds the three URLs to the frontend allow-list.
17. **Browser QA:**
    - Real dev DB, read-only (every non-GET aborted; none attempted): the events section (25 / 536 rows; filters event / success / dateFrom / adminId sent as query params; next page offset=25), the HQ drawer (header, tabs, keyboard ArrowRight/End/Home/ArrowLeft/Space/Tab, sessions with "Joriy sessiya" on exactly one row, status filter), 401/403/404/500/network fixtures for sessions and events (spec copy, no raw text), and server validation (limit clamp, 422s, 404).
    - Cashier: nav hidden; both APIs → 403.
    - Mutations ran only on an isolated API with a temporary PGlite (port 5912, `%TEMP%\vm-1317-qa-db`), which was stopped and deleted afterwards:
      - ConfirmDialog with a focus trap (7/7 focus checks inside the dialog). Escape cancels with no write.
      - Revoke: `POST …/sessions/2/revoke` with no body; exactly one of the two cashier tokens → 401.
      - The audit row `admin.session_revoke` holds no token or public id (the audit reader shows `adminId`, `email`, `current`), and `session.revoke` appears in the events list after Yangilash.
      - Disable: both sessions revoked, tokens → 401, login → 403.
      - Self current-session revoke ends only that session, while the other HQ session stays 200.
    - No console errors, and no secret in responses, DOM or URL (`ip` / `userAgent` appear only as boolean `stored` flags).
18. **Responsive:** at 1920 / 1440 / 1280 / 1024 / 768 / 390 there is no page overflow and no clipped controls. Event rows become cards at ≤768. Drawer tables are cards at every width. The drawer is 460px at 768 and full width at 390. Tabs stay 39px tall, scroll horizontally if needed and never overflow the page. The revoke ConfirmDialog fits at 390.
19. **Remaining gaps:**
    - IP is not stored anywhere, and `auth_events` has no user-agent. Adding either needs a new additive migration plus writer changes.
    - A failed login with an unknown email has no admin and no email recorded.
    - Admin `logout` events carry no `actor_id`, so only HQ sees them, unattributed.
    - There is no global "all sessions" list or bulk revoke.
    - The Audit page does not show which session was revoked: the stored `sessionId` is hidden by the audit reader's `session*` key scrubber, which was intentionally left unchanged.
    - The Admin filter options come from the admins on the current list page.
20. **Changed files:**
    - DB: `lib/db/migrations/0012_auth_security.sql` (new), `lib/db/migrations/meta/_journal.json`, `lib/db/tests/p13-17-auth-security-migration.test.ts` (new), `lib/db/tests/p13-16-admin-management-migration.test.ts`.
    - API: `artifacts/api-server/src/lib/authSecurity.ts` (new), `src/routes/adminSecurity.ts` (new), `src/routes/index.ts`, `src/routes/adminUsers.ts` (shared helpers exported; `sameEmail`).
    - Frontend: `artifacts/admin-web/src/pages/AdminAccessPage.tsx`, `artifacts/admin-web/src/styles.css`.
    - Tests: `artifacts/api-server/tests/admin-phase13-17-auth-security.test.ts` (new), `artifacts/api-server/tests/admin-phase13-15-admin-users.test.ts`.
    - `docs/ADMIN_IMPLEMENTATION_STATUS.md`.

---

## Phase 13.16 — Admin Management Backend + RBAC Control Plane

1. **Status: IMPLEMENTED.** "Adminlar" now runs on a real admin management API: list, detail, create, edit, enable/disable and password change, plus a read-only RBAC API. Every endpoint requires `rbac:manage` on the server. `ADMIN_USER_MANAGEMENT = API_REQUIRED` (Phase 12.23) is closed. Role and permission editing is still intentionally absent, because roles are defined in migrations.
2. **Migration:** `lib/db/migrations/0011_admin_management.sql` (journal idx 11) is additive only. It adds `admin_users.status text NOT NULL DEFAULT 'active'` with CHECK `admin_users_status_check` (active | disabled), and `admin_users.updated_at timestamptz NOT NULL DEFAULT now()`, backfilled to `created_at`. It also adds index `admin_users_role_status_idx (role, status)`. There is no DROP, DELETE or TRUNCATE, and 0000–0010 are unchanged. The existing `admin_users.email` UNIQUE constraint is the DB-level duplicate guard. Tested in `lib/db/tests/p13-16-admin-management-migration.test.ts`:
   - On a clean DB: defaults, CHECK rejection, unique email and the index.
   - On an existing DB migrated to 0010 with legacy admins: rows are kept, `active`, and `updated_at = created_at`; re-applying is a no-op.
   - Real dev DB: the normal startup migrator applied 0011 when the dev API restarted. A backup was taken first (`%TEMP%\vm-dash-check\pglite-backup-1316`). Afterwards it has 2 active admins, and RBAC reads 22 permissions / 9 cashier permissions from the DB.
3. **CRUD API** (`artifacts/api-server/src/routes/adminUsers.ts`, helpers in `src/lib/adminUsers.ts`). The response DTO is an explicit allow-list: `id, email, name, role, branchId, branchName, status, createdAt, updatedAt`. It never contains `passwordHash`.
   - `GET /api/admin/users`: server-side `limit` (default 25, max 50) and `offset`, with `q` (name/email), `role`, `branchId` and `status` filters. Returns `{ users, pagination: { limit, offset, total, hasMore, nextOffset } }`. Invalid params → 422.
   - `GET /api/admin/users/:id`: returns `{ user, permissions, sessions: { active, lastSeenAt }, isSelf }`. A missing admin → 404 `ADMIN_NOT_FOUND`.
   - `POST /api/admin/users`: email is trimmed and lowercased. A duplicate → 409 `ADMIN_EMAIL_TAKEN`. The role must exist in `auth_roles`, otherwise 422 `ADMIN_ROLE_INVALID`. An HQ role requires `branchId: null`; a cashier requires an existing branch, otherwise 422 `ADMIN_BRANCH_INVALID`. Returns 201 `{ user }`.
   - `PATCH /api/admin/users/:id`: accepts only name/email/role/branchId. A `status`, `password`, `passwordHash` or unknown key, or an empty body, → 422 `ADMIN_INVALID`. Only changed fields are written. Returns `{ user, changed }`; a no-op returns `changed: []`.
   - `PATCH /api/admin/users/:id/password`: body `{ password }` only.
   - There is no DELETE: hard delete is intentionally absent so the audit history stays intact. Disable replaces it.
4. **Status:** `PATCH /api/admin/users/:id/status` with `{ status: "active" | "disabled" }`. Repeating the current status is idempotent (`changed: false`).
   - Disabling yourself → 409 `ADMIN_SELF_PROTECTED`.
   - Disabling or downgrading the last active HQ admin → 409 `ADMIN_LAST_ACTIVE_SUPER_ADMIN`.
   - Disabling revokes every session of the target inside the same transaction. Returns `{ user, changed, revokedSessions }`.
5. **RBAC API:** `GET /api/admin/rbac` (read-only) returns:
   - `roles[]` with `{ code, name, description, scope: all | branch, admins: { active, disabled } }`.
   - `permissions[]` with 22 codes and descriptions, all from `auth_permissions`.
   - `matrix[]` with `{ role, source: db | fallback, permissions }`.
   - `assignableRoles` and `managePermission: "rbac:manage"`.
   No role, permission or role_permission write endpoint exists.
6. **Permissions:** the 22 codes are unchanged, with `auth_permissions` as the source of truth. `rbac:manage` is now enforced on all 7 endpoints, so every one of the 22 codes is enforced by a real route. Results: 401 without a token, 403 "Bu amal uchun ruxsat yo‘q" plus `authz.denied` (meta `permission: rbac:manage`) for a cashier, and allowed for `super_admin`. The frontend has no permission list of its own; codes come from `/api/admin/rbac`, with display labels only, and any unknown code is shown raw.
7. **Role model:** roles are seed/static (`super_admin`, `cashier` from 0001; legacy `admin`/`hq` are treated as HQ). There is no dynamic role CRUD. Assignable roles are the real `auth_roles` rows. Changing your own role → 409 `ADMIN_SELF_PROTECTED`.
8. **Branch scope:** enforced on the server. HQ roles always have `branchId = null`, and a cashier needs a valid branch. A branch-scoped manager (a non-HQ admin holding `rbac:manage`) only sees and touches non-HQ admins in its own branch. Anything else → 403 `ADMIN_SCOPE_FORBIDDEN`, and its list is filtered by `resolveStaffBranchFilter`. Changing your own branch → 409.
9. **Audit:** `audit_log` (entity `admin_user`) gets `admin.create`, `admin.update` (fields, previousEmail, previousBranchId), `admin.role_change` (from/to), `admin.status_change` (from, to, revokedSessions) and `admin.password_change` (revokedSessions). No password or hash is ever written. Each mutation and its audit row run in one `db.transaction`; a test forces an audit failure with a trigger and proves the mutation rolls back (500 `{ message: "Ichki xatolik" }`). Auth events (`session.revoke`) are written after commit.
10. **Password security:** this keeps the existing policy (min 6 characters, the same rule `auth.ts` already applies; max 128). Passwords are stored only as a scrypt hash (`hashPassword`). A password never appears in responses, audit, auth events, logs, error messages or URLs; tests scan every response and audit row. A password change revokes the target's sessions. For a self change, the current session is kept.
11. **Sessions:** `requireAdmin` now re-reads the admin row on every request. A `disabled` admin gets 401 `ADMIN_DISABLED` ("Hisob faol emas") on both the session path and the legacy HMAC path, even if a session survived. Login for a disabled admin → 403 `ADMIN_DISABLED` plus a `login.failure` auth event. No session token, HMAC or secret is returned.
12. **Errors:** responses are JSON `{ code, message }`. The global error handler (`app.ts`) no longer exposes DB errors: a non-HTTP error gives 500 "Ichki xatolik", and SQLSTATE codes are never forwarded. Unique violations map to 409 `ADMIN_EMAIL_TAKEN`.
13. **Concurrency:** every mutation takes `pg_advisory_xact_lock(1316001)` (real Postgres) and `SELECT … FOR UPDATE` on the target row, re-checks the invariants inside the transaction, and relies on the DB UNIQUE constraint on email. PGlite serializes transactions. Tests cover:
    - a duplicate-email race (exactly one 201);
    - a concurrent disable;
    - a concurrent role/branch change;
    - a deterministic gated cross-disable and cross-downgrade of two super admins (exactly `[200, 409]`);
    - an ungated "never zero active super admins" check.
14. **Frontend:** `AdminAccessPage.tsx` runs on the real API.
    - List: search, role/branch/status filters, server pagination, and a sequence guard against stale responses.
    - DetailDrawer: account, role and scope, sessions count, permissions.
    - Forms: create and edit (only changed fields sent; no optimistic row; the list reloads after success), and password change with show/hide.
    - Disable: a ConfirmDialog with "Bu administratorning tizimga kirishi to‘xtatiladi.". Enable is a direct action. Your own account has no disable button, and its role/branch selects are disabled.
    - Matrix: Ruxsat | role columns | Doira, from `rbac.matrix`.
    - Header chips: "Faqat HQ", "RBAC: serverda", "Adminlar API: ulangan". Server error codes map to fixed Uzbek copy; raw messages are never shown.
15. **Tests:** `artifacts/api-server/tests/admin-phase13-16-admin-management.test.ts` has 50 tests (40 backend integration on a temp PGlite + 10 frontend/static). `lib/db/tests/p13-16-admin-management-migration.test.ts` has 3 tests. These old tests changed only where Phase 13.15 asserted that the API was absent; each now asserts the real 13.16 contract, and none was deleted:
    - `admin-phase13-15-admin-users.test.ts`: still 25 tests. The checks for no writes, no audit and no status column now assert the writes, the 5 audit actions, the status/updatedAt columns, roles from the API, all 22 permissions enforced, and the new chips.
    - `admin-phase12-23-admin-users.test.ts`: adds `rbac:manage` / no role writes / no DELETE checks. The page must call `/api/admin/users`, must not render a hash or token, and must have exactly one password input with `autoComplete="new-password"`.
    - `admin-phase12-25-final-ux.test.ts`: "no `/api/admin/users`" became "uses the paginated `/api/admin/users` request, with no DELETE".
16. **Browser QA:**
    - Reads ran on the real dev DB with every non-GET aborted (none attempted). Checked: list (2 admins), pager, role/branch/status filters, search, detail, matrix (22 rows × 2 roles), keyboard (Tab → row, Enter → drawer, Escape → focus returns), the self drawer (no disable), and the 500/403/network/404 fixtures with retry.
    - Writes ran only on an isolated temporary API and PGlite (port 5912, `%TEMP%\vm-1316-qa-db`), which were stopped and deleted afterwards: create (validation, show/hide, duplicate email → 409 copy), edit (PATCH body `{"name":…}` only), disable via ConfirmDialog, the disabled filter, enable and password change. The audit showed `admin.create`, `admin.update`, `admin.status_change` and `admin.password_change`, with no plaintext or hash.
    - Cashier: nav "Adminlar" hidden; `/api/admin/users`, `/users/1` and `/rbac` → 403. No console errors. No secret was found in any response, DOM or URL.
17. **Responsive QA:** at 1920 / 1440 / 1280 / 1024 / 768 / 390 there is no page overflow, no clipped controls and no table horizontal scroll. At ≤768 rows become cards. The drawer is 460px at 768 and full width (390px) at 390, and the create form and ConfirmDialog fit at 390. CSS stays on `ac-*` tokens (0 hardcoded colours).
18. **Remaining gaps:**
    - There is no case-insensitive DB email index; the API lowercases emails and the UNIQUE constraint covers normalised values.
    - No dynamic role/permission CRUD, by design.
    - No per-session list or revoke UI; only counts are shown, and disabling or a password change revokes all sessions.
    - No `auth_events` read API.
    - PGlite serializes transactions, so the advisory lock matters only on real Postgres.
    - The error-handler hardening is global; existing contracts are unchanged and covered by the full suite.
19. **Changed files:**
    - DB: `lib/db/migrations/0011_admin_management.sql` (new), `lib/db/migrations/meta/_journal.json`, `lib/db/src/schema/admin.ts`, `lib/db/tests/p13-16-admin-management-migration.test.ts` (new).
    - API: `artifacts/api-server/src/lib/adminUsers.ts` (new), `src/routes/adminUsers.ts` (new), `src/routes/index.ts`, `src/lib/auth.ts`, `src/lib/rbac.ts`, `src/app.ts`.
    - Frontend: `artifacts/admin-web/src/pages/AdminAccessPage.tsx`, `artifacts/admin-web/src/styles.css`.
    - Tests: `artifacts/api-server/tests/admin-phase13-16-admin-management.test.ts` (new); the 12-23, 12-25 and 13.15 test updates.
    - `docs/ADMIN_IMPLEMENTATION_STATUS.md`.

---

## Phase 13.15 — Admin Users / RBAC

1. **Status: IMPLEMENTED (read-only).** "Adminlar" is rebuilt as an honest operator / RBAC console over the only admin identity endpoint, `GET /api/admin/me`. The server has no admin list, create, edit, disable, role-read or permission-matrix API, so the page has no mutation buttons, forms or ConfirmDialog. `ADMIN_USER_MANAGEMENT = API_REQUIRED` (Phase 12.23) is still true.
2. **Real APIs:** `POST /api/admin/login`, `POST /api/admin/logout` (own session only) and `GET /api/admin/me` (`requireAdmin`). `/me` returns `{ user: { id, email, name, role, branchId }, permissions: string[] (sorted) }`. A cashier also gets 200 with their own data. Probed on the dev API: `/api/admin/users`, `/admins`, `/rbac`, `/roles`, `/permissions`, `/users/1` → 404 for both HQ and cashier. Without a token, or with an invalid one, `/me` returns 401. There is no pagination, filter, search or scope parameter because there is no list.
3. **Admin model:** `admin_users` has id, email, name, passwordHash, role, branchId and createdAt. There is no status, updatedAt or last-activity column. `auth_sessions` (TTL ≈ 12h, revokedAt, lastSeenAt, deviceLabel) and `auth_events` exist, but neither has a read API. The only server write to `admin_users` is the login-time normalisation of a legacy role (`auth.ts`). Nothing writes `auth_roles`, `auth_permissions` or `auth_role_permissions`.
4. **Roles:** migration 0001 seeds `super_admin` ("HQ global administration") and `cashier` ("Branch-scoped POS staff"). Legacy `admin` / `hq` values are treated as `super_admin`. The page shows only these two roles, in a Rol | Ruxsatlar | Doira table. It labels them as seed data, because no role-read API exists.
5. **Permissions:** there are 22 codes: 21 from 0001, plus `inventory:adjust` from 0004 (HQ only). `super_admin` has all 22; `cashier` has 9 (products:read, orders:read, orders:confirm_pos, pos:lookup, pos:preview, pos:sale, pos:void, pos:sales:read, delivery:update). `rbac.ts` falls back to the same sets. Each code has an Uzbek label in the matrix. The roles' Ruxsatlar column comes from the seed, and "Sizning sessiyangiz" from the live `/me` response. Every code is enforced by a real route except `rbac:manage`, which no endpoint requires; the page flags it. Any unknown code from the server is shown raw under "Boshqa ruxsatlar". No permission was added.
6. **Branch scope:** a cashier is limited to its own `branchId`, and a missing branchId gives 403 `branch_required`. HQ sees every branch (`assertBranchScope` / `resolveStaffBranchFilter`). The page shows "Barcha filiallar (HQ)" for an HQ user with a null branchId. Otherwise it shows the branch name from the already-loaded `/api/admin/branches` list (fallback "Filial #id").
7. **List:** there is no list API. The "Joriy sessiya" section shows one real row (the current account), with a "Joriy hisob" badge, followed by the empty state "Adminlarni boshqarish API mavjud emas". The page states "Filtr API mavjud emas" and has no pagination.
8. **Detail:** the row opens a DetailDrawer by click, Enter or Space. It has five sections: Hisob (name, email, admin ID), Rol va doira, Ruxsatlar (N) with labels, Ochiq bo‘limlar (derived from `NAV` + `navVisible`), and "API'da berilmaydi" (status, last activity, created date, sessions). Escape closes it and focus returns to the row.
9. **Create:** no API, so no button (shown as "Hali ulanmagan").
10. **Edit:** no API (name, email, role, branch, password), so no button.
11. **Delete/disable:** no API and no status column, so no button.
12. **Audit:** there are no admin-management mutations, so no mutation audit. Every login writes `admin.login` to `audit_log`. Denials (`authz.denied`) go to `auth_events`, which has no read API.
13. **Security:** `requirePermission` → 403 "Bu amal uchun ruxsat yo‘q" (+ `authz.denied`); `requireAdmin` → 401. Nav "Adminlar" is `hqOnly`, so a cashier gets 0 nav items. The page also shows the 403 state when `/me` returns a non-HQ role. Cashier direct GET (browser QA): `/admin/me` 200 (own data), `/admin/users|roles|permissions` 404, `/admin/audit` and `/admin/dashboard` 403.
14. **Sensitive data:** the page picks only id/email/name/role/branchId from `/me`. Extra fields are not rendered: a fixture-injected `passwordHash` did not appear in the DOM. Browser QA scanned every `/api` response, the page DOM and the URL: no hash, token, session key or connection string. Errors use fixed copy and the raw server message is never shown. 401 "Seans tugagan. Qayta kiring.", 403 "Bu bo‘lim uchun ruxsatingiz yo‘q.", 404 "Ma'lumot topilmadi.", 500 "Serverda xatolik yuz berdi.", network "Server bilan aloqa o‘rnatilmadi."
15. **Backend changes:** none.
16. **DB changes:** none. No schema or migration change. On the real dev DB, the only writes were `admin.login` rows from QA logins and `authz.denied` events from the cashier 403 probes.
17. **Fake data:** none. The roles and matrix columns are the migration seed, and a test pins them to 0001 / 0004 and the `rbac.ts` fallbacks. Fixtures were used only in browser QA (error, loading, race and unknown-code states).
18. **Tests:** `artifacts/api-server/tests/admin-phase13-15-admin-users.test.ts` (25 tests). `pnpm test`: 1034 (843 + 191), 0 fail. `admin-phase12-23-admin-users.test.ts` now asserts `title="Adminlar"` (the spec header) instead of "Adminlar va ruxsatlar"; all its other assertions are unchanged.
19. **Typecheck:** `pnpm run typecheck` OK.
20. **Build:** admin-web, api-server and mockup-sandbox OK.
21. **Browser QA:** real dev DB, GET-only (every non-GET was aborted, and none was attempted). Refresh sends one `GET /api/admin/me`. A stale slow response did not overwrite the newer one. No console errors. Header chips: "Faqat ko‘rish", "Faqat HQ", "RBAC: serverda mavjud", "Adminlar API: mavjud emas".
22. **Responsive QA:** 1920 / 1440 → two section columns; ≤1280 → one column; ≤768 → tables become label/value cards (thead visually hidden). At 390 the drawer is full width (390px). No page overflow, no clipped controls and no table horizontal scroll at any width. CSS is `ac-*` tokens only (0 hardcoded colours, 0 gradients).
23. **Remaining gaps (backend):** no admin list, create, edit, disable, role or branch assignment API. No role / permission read API and no `rbac:manage` endpoint. No session list or revoke API for operators. No `auth_events` read API. `admin_users` has no status or last-activity column.
24. **Changed files:** `artifacts/admin-web/src/pages/AdminAccessPage.tsx`, `artifacts/admin-web/src/App.tsx` (AdminAccessPage props → `token`, `branches`), `artifacts/admin-web/src/styles.css` (`ac-*` block), `artifacts/api-server/tests/admin-phase13-15-admin-users.test.ts` (new), `artifacts/api-server/tests/admin-phase12-23-admin-users.test.ts` (title literal), `docs/ADMIN_IMPLEMENTATION_STATUS.md`.
25. **Next phase:** Phase 13.16. Admin management needs backend work first: admin CRUD + role / permission read API + `rbac:manage` enforcement + mutation audit + `admin_users` status column (migration).

---

## Phase 13.14 — Sozlamalar (Settings)

**Status: IMPLEMENTED (read-only).** Settings console over the real server read sources. There is no settings or config API (`/api/admin/settings`, `/api/settings`, `/api/admin/config` → 404) and no write path for `system_settings`. O‘zgartirish mumkin bo‘lgan sozlama yo‘q, so every value is marked "Faqat ko‘rish — o‘zgartirish API mavjud emas"; there are no edit controls, Save buttons or ConfirmDialog. Backend o‘zgarmadi. DB sxemasi va migratsiyalar o‘zgartirilmadi.

| Source | Permission | Values used | Value source |
| --- | --- | --- | --- |
| `GET /api/cashback/rules` | public (app / kassa / FOM) | `maxSpendPercent` | DB `system_settings.cashback.max_spend_ratio` (seed 0.30; default 30% if missing; clamped to (0, 1]) |
| ″ | ″ | `minPurchase` (1 000 so‘m), `deliveryFee` (15 000 so‘m), `tiers` (Silver 3% / 200 000, Gold 5% / 1 000 000, Platinum 7% / 5 000 000), `ttlDays` (90), `earnWhen` / `spendWhen` | code constants in `lib/cashback.ts` (immutable) |
| `GET /api/admin/branches` | `branches:read` (HQ; cashier 403) | `isOpen`, `is24h`, `hasPayme`, `hasClick` | branch records; secrets masked by `toAdminBranchPaymentDto` (`paymeKey` / `clickSecret` → `••••` or empty) |
| `GET /api/admin/deliveries?limit=1` | `delivery:update` | `externalProvider` (`CONTRACT_PENDING`) | static contract field |
| `GET /api/integrations/fom/status` | any admin | `status` (`CONTRACT_PENDING`), `ready`, `inventoryWriter` (`OFF`) | static contract fields |
| `GET /api/healthz` | public | `database` (`up` / `down`, 503 → down), `driver`, `time` | live DB check |
| `GET /api/admin/me` (App bootstrap) | admin | role, permission count | session |

Permissions: no `settings:*` permission exists and none was added. The nav item is HQ-only (`hqOnly`), and each section is protected server-side by its own endpoint permission. Links to Cashback / Filiallar / Yetkazib berish / FOM / Adminlar are shown only for tabs the operator can open.

UI (`SettingsPage.tsx`):
- Header chips: "Faqat ko‘rish", "Faqat HQ", "Har bo‘lim o‘z server ruxsati bilan". Yangilash button. An intro line ("Alohida sozlamalar API’si yo‘q…") shows the last read time in Asia/Tashkent.
- Each section card shows its endpoint. Each setting row shows: title, description, value, "Manba: …", optional status and a "Faqat ko‘rish" marker.
- **Cashback / Loyalty:** spend limit 30%, minimal purchase, tier table, TTL 90 days. TTL is flagged "Serverda qo‘llanmaydi": no server code expires cashback. Server rule text is collapsed. A note says customer balances and the ledger live in Cashback / Loyalty, and no balance endpoint is read.
- **Filiallar va to‘lov kabinetlari:** Payme / Click configured counts (`0 / 121` on the dev DB) from `hasPayme` / `hasClick`, plus open and 24/7 counts. Configured branches are listed by name only. Key values, merchant IDs and `••••` masks are never read or rendered. Branch CRUD stays in Filiallar.
- **Yetkazib berish:** delivery fee; external provider "Hali ulanmagan — tashqi provider contract mavjud emas". No courier or ETA settings, because none exist.
- **FOM integratsiyasi:** "Shartnoma kutilmoqda" (not production-ready); inventory writer "O‘chirilgan".
- **Kirish va ruxsatlar:** current role and server permission count (link to Adminlar).
- **Tizim holati:** database driver and "Javob berdi" / "Javob bermadi", only from `/healthz`.
- **Admin API orqali ko‘rinmaydi:** SMS / notifications (Eskiz), workers, Payme / Click mode (sandbox / production), session TTL / OTP / rate limits, order reservation hours. Listed as not visible, with no status or value.

Security / secrets:
- No secret, token, password, KEK, connection string or env value is read or rendered.
- Browser QA scanned every `/api` response and the page DOM: no unmasked `paymeKey` / `clickSecret`, no `enc:v1`, no connection strings.
- The server error `message` is never shown.

States:
- per-section 403 / 404 / 500 / network with fixed Uzbek copy (retry only for 500 / network);
- page-level 401 (session) and full network outage;
- initial LoadingBlock; dimmed refresh;
- stale batches dropped (`loadSeq`).

Performance: one parallel batch of 5 GET requests per load or refresh, no N+1.

Responsive: two section columns on wide screens, one column ≤1280px, rows stacked ≤560px. Measured at 1920 / 1440 / 1280 / 1024 / 768 / 390: no page overflow, no clipped controls. There is no drawer.

Browser QA: real dev DB, GET-only (the only writes were `POST /api/admin/login`, each writing one `admin.login` audit row). Fixtures were used only for error, loading and race states.

Remaining gaps (backend):
- No settings write API: changing `cashback.max_spend_ratio` still needs DB access.
- `ttlDays` (90) is published but not enforced.
- Tier promotion (`nextTier`) runs only on POS sales.
- Minimal purchase, delivery fee, tiers and reservation hours are code constants.
- No admin read API for payment provider mode, SMS provider, workers, session / OTP / rate-limit parameters.
- `/integrations/fom/status` needs only `requireAdmin` (no permission).
- `/admin/branches` spreads the full branch row (masked secrets, phone, merchant IDs) — the page uses booleans only.

Tests: `artifacts/api-server/tests/admin-phase13-14-settings.test.ts`.

Next phase: Phase 13.15.

---

## Phase 13.13 — Audit

**Status: IMPLEMENTED (read-only).** Operator investigation console over the real `audit_log` table via `GET /api/admin/audit`. It is a staff action journal, not a full system audit ("Jurnal to‘liq tizim auditi emas"). No new endpoint, filter, permission or event type. One backend hardening: `sanitizeAuditPayload` now drops sensitive keys at every depth (it used to scrub top-level keys only) and also drops `cookie` / `session` / `hmac`. Response shape is unchanged for the data stored today. DB sxemasi va migratsiyalar o‘zgartirilmadi; RBAC, order, cashback va auth logikasi o‘zgarmadi.

| Area | Status | Source |
| --- | --- | --- |
| Endpoint | REAL | `GET /api/admin/audit`: `requireAdmin` → `audit:read`, checked before DB access. No token → 401, cashier → 403. No detail (`/admin/audit/:id` → 404), no delete/patch/put |
| Permission | REAL | `audit:read`, HQ only (super_admin fallback + seed). Cashier fallback/seed exclude it and the nav item is hidden |
| Fields | REAL | `id`, `actor` (stored string), `action`, `entity`, `createdAt`, `metadata` (`sanitizeAuditPayload(payload)`). There is no status, IP, user agent, request ID or branch column |
| Pagination | REAL | `limit` (default 40, max 100; invalid → 40), `offset` (negative → 0); `pagination { limit, offset, total, hasMore, nextOffset }`; order `createdAt desc, id desc`; `readOnly: true` |
| Filters | REAL (2) | `action`: case-insensitive substring (`ILIKE`, with `%`, `_` and `\` stripped). `entity`: exact match. Unknown params (`actor`, `createdFrom`, `branchId`, `q`) are ignored by the server, so the page does not offer them |
| Branch scope | HQ-global | no branch filter on the endpoint; safe today because only HQ holds `audit:read` |
| Export | MISSING (disclosed) | "Audit eksporti API mavjud emas"; no local CSV |
| Auth events | MISSING (disclosed) | `auth_events` (login success/failure, authz denied) has no read API |

Audit source of truth (code audit of every writer): `admin.login`, `branch.create` / `update` / `delete`, `product.create` / `update`, `inventory.adjust`, `inventory.expire_due`, `order.transition.<CONFIRMED|PREPARING|READY_FOR_PICKUP|OUT_FOR_DELIVERY|COMPLETED>`, `order.confirm_pos`, `order.cancel` (admin), `order.refund_cashback.<full|partial>`, `fom.sale_confirmed`, `pos.sale`, `pos.void`. Entities: `admin_user`, `branch`, `product`, `product_stock`, `reservation`, `order`, `pos_sale`. **Not audited:** customer-initiated cancel, delivery (courier) actions, payment callbacks/status changes, customer/loyalty actions, admin logout, background workers other than reservation expiry. The page lists these in an "Audit qamrovi" section.

UI (`AuditPage.tsx`):
- Header chips: "Faqat o‘qish", "Barcha filiallar · faqat HQ", "Audit eksporti API mavjud emas"; Yangilash button.
- `FilterBar`:
  - Amal select with underscore-free substrings, each verified to match only its intended codes: `admin.login`, `branch.`, `product.`, `inventory.`, `order.transition.`, `order.confirm`, `order.cancel`, `order.refund`, `pos.`, `fom.`.
  - Obyekt select with the 7 real entities, plus Tozalash.
  - A note explains that text, operator, branch and date filters are not in the API.
- Summary: `N ta yozuv` (server `total`) and "Vaqt: Asia/Tashkent".
- Table: Vaqt (Asia/Tashkent via `Intl`), Amal (Uzbek label), Operator, Resurs, Filial, Belgi.
  - Unknown actions show as `Amal: <code>`; unknown entities as `Obyekt: <code>`.
  - Actor is shown exactly as stored. Only known prefixes are described: `staff:` → Xodim, `kassa`, `fom` / `fom-webhook` → FOM integratsiyasi. Role appears only from `admin.login` metadata.
  - Belgi badges come only from server flags: `paymentRefundRequired`, credential updated, `idempotent`.
- `PaginationBar` reads the server pagination fields.
- Drawer (`DetailDrawer`, built from the row data):
  - Sections: Amal, Vaqt, Operator, Resurs (type, identifier, branch name from metadata `branchId`, and "Buyurtmani ochish" which opens the Orders detail), Tafsilotlar.
  - Tafsilotlar shows operator-friendly key/value pairs: money via `money()`, Ha/Yo‘q, fulfillment/payment/reason labels.
  - "Texnik ma’lumotlar" is collapsed and holds the record id, raw codes and technical keys. IP / device / request ID are disclosed as not stored.

Security / PII:
- The server sanitizer runs before the response, and the page scrubs the same key family again (`scrubMeta`).
- The page never dumps raw metadata JSON and never renders the server error message.
- No phones, tokens or secrets are shown. Audit writers store no merchant secrets (`paymeCredentialUpdated` / `clickCredentialUpdated` booleans only).
- PII is limited to staff emails in `actor`, as returned by the server.
- No mutation UI and no export.

States, kept separate:
- loading skeleton;
- empty ("Audit yozuvlari mavjud emas");
- filter-empty ("Tanlangan filtrlar bo‘yicha audit yozuvi topilmadi" + reset);
- 401 / 403 / 404 / 500 / network, each with fixed Uzbek copy. Retry is offered only for 500 and network.

Performance: one request per filter or page change, no N+1, stale responses dropped (`loadSeq`).

Responsive: the Belgi column is hidden ≤1200px; Filial is hidden and the table min-width removed ≤1024px; coverage goes to 1 column ≤760px; rows become cards ≤560px; drawer key/values go to 1 column ≤480px. Measured at 1920 / 1440 / 1280 / 1024 / 768 / 390: no page overflow and no table scroll. The drawer fits at 390.

Browser QA:
- Real dev DB, GET-only. The only writes were `POST /api/admin/login`, which itself writes `admin.login` rows.
- Isolated PGlite with real-API-created events (inventory, orders, refund, POS sale/void, FOM confirm) verified labels, money formatting, filters, pagination and the order deep link.
- Error fixtures verified 401 / 403 / 404 / 500 / network, the race guard, keyboard (Tab / Enter / Space / Escape, focus return) and no console errors.

Remaining gaps (backend):
- The `action` filter strips `_` instead of escaping it (`order.refund_cashback` matches nothing; `order.refund` works).
- No date, actor, branch, status or text filters.
- No IP, user agent, request ID or status column.
- No detail or export API; `auth_events` has no read API.
- The actor is a free string, not linked to `admin_users`.
- The `pos.void` payload has no `branchId`, and `product.update` has no changed-field list.
- Not audited: customer cancel, delivery, payments, customer/loyalty actions, logout, most workers.
- No branch scoping on the endpoint, which would be needed before any branch role gets `audit:read`.

Backend changed: `artifacts/api-server/src/lib/adminOrderOps.ts` (`sanitizeAuditPayload`: recursive scrub at max depth 4; strings truncated at 500; keys added: `cookie`, `session`, `hmac`). Tests: `artifacts/api-server/tests/admin-phase13-13-audit.test.ts`.

Next phase: Phase 13.14 (Settings).

---

## Phase 13.12 — Hisobotlar

Read-only period report console over the only reporting endpoint, `GET /api/admin/dashboard`. Reports = period analysis (order KPIs for a chosen Asia/Tashkent date range and branch); Dashboard stays the operational overview. One additive backend change: `pendingPayment` and `cancelled` FILTER counts in the existing order KPI query, so the status breakdown partitions the server order total. No new endpoint, permission or query. DB sxemasi va migratsiyalar o‘zgartirilmadi; RBAC, order, cashback va auth logikasi o‘zgarmadi.

| Area | Status | Source |
| --- | --- | --- |
| Endpoint | REAL | `GET /api/admin/dashboard` — `dashboard:read` (HQ only: super_admin; cashier 403, nav hidden), checked before DB access |
| Filters | REAL | `branchId` (`resolveStaffBranchFilter`), `createdFrom` / `createdTo` `YYYY-MM-DD` → `tashkentBusinessDayUtcRange` (Asia/Tashkent business day, UTC bounds); malformed → 400 `INVALID_DATE_FILTER` |
| Order KPIs (filtered) | REAL | one aggregate over `orders` (legacy `status`, dual-written by `deriveLegacyStatus`): `revenue` = sum `orders.total` where completed; `orders`, `completed`, `delivering` (awaiting_delivery + paid = open delivery orders), `reserved` (open pickup), `pendingPayment` (13.12), `cancelled` (13.12) |
| Global KPIs | REAL (not filtered) | `customers` (customers table), `branches`, `cashback` = sum `cashback_accounts.balance` (`cashbackSource: "cashback_accounts"`); scopes reported as `global` |
| Inventory snapshot | REAL (branch only) | `inventory` when a branch is selected: stock rows, zero-available count, 12 lowest-available items (current state, not period-based); no low-stock threshold (`inventoryThreshold: false`) |
| Time-series / chart | MISSING (disclosed) | chart: time-series API yo‘q — no chart is drawn |
| Comparison with previous period | MISSING (disclosed) | not in the API — no ↑/↓ or % |
| Per-branch, payments, POS, cashback period, delivery, product / category reports | MISSING (disclosed) | no aggregate endpoints |
| Export | MISSING (disclosed) | Export API mavjud emas — no local CSV |
| Detail / pagination | MISSING | no detail API → no drawer |

UI (`ReportsPage.tsx`): header chips "Davr bo‘yicha agregat · faqat ko‘rish", scope ("Barcha filiallar yoki bitta filial" / "Faqat o‘z filialingiz"), "Export API mavjud emas", Yangilash. Period presets Bugun / Kecha / 7 kun / 30 kun (default) / Barcha davr / Maxsus — computed on the Asia/Tashkent calendar via `Intl`, sent to the server as `createdFrom` / `createdTo`; Maxsus sends nothing until both dates are applied and from ≤ to. Filial select for HQ only; no client-side filtering. Context line: period · branch · Asia/Tashkent · last update.
- **Savdo va buyurtmalar:** Tushum (hero, `money()`), Buyurtmalar, Yakunlangan, Bekor qilingan. Revenue note: orders created in the period that are now completed, after cashback, incl. delivery fee; refunds are not subtracted; POS sales are not included. Status breakdown table (Yakunlangan, Ochiq — yetkazib berish, Ochiq — olib ketish, To‘lov kutilmoqda, Bekor qilingan) with "Jami buyurtmalar" = server `orders` (no client sum).
- **Umumiy holat:** Mijozlar, Cashback majburiyati, Filiallar — labelled as not tied to the period/branch filter.
- **Ombor holati:** branch only (stock rows, "Mavjud emas", lowest-available table); otherwise a "Filial tanlash" prompt.
- **Hali ulanmagan hisobotlar:** honest list of the reports above that the API does not provide.

States: loading skeleton, empty ("Hozircha buyurtmalar yo‘q."), filter-empty ("Bu davr uchun ma’lumot yo‘q." + reset), custom pending, 401 / 403 / 404 / 400 (date) / 500 / network with fixed Uzbek copy (server `message` never rendered); retry only for 500 / network; stale responses dropped (`loadSeq`).

Responsive: KPIs 4 → 2 columns ≤1280px; note / Jismoniy / Bron columns hidden ≤900px; global KPIs 1 column ≤760px; presets 3-column grid, KPIs 1 column, stock table as cards ≤560px. Measured 1920 / 1440 / 1280 / 1024 / 768 / 390: no page overflow, tables fit.

Security: no customer phones (server `includePhone: false`; page ignores `recentOrders`), no tokens or secrets; branch scope and permission enforced server-side. Integer money only, formatted by `money()`; the UI performs no financial arithmetic.

Browser QA: real dev DB, read-only (only `POST /api/admin/login`); isolated PGlite with real-API-created orders verified KPI values, breakdown sum and branch scoping.

Remaining gaps (backend):
- No time-series, comparison, per-branch, payments, POS, cashback-period, delivery or product aggregates; no export or detail API.
- Revenue is filtered by order creation date, not completion date; order KPIs rely on legacy `orders.status`.
- `/admin/dashboard` still computes `recentOrders` with per-row `serializeOrder` (N+1) and scans all inventory rows of the branch, even though Reports does not use `recentOrders`.
- `tashkentBusinessDayUtcRange` accepts overflowing calendar dates (`2026-02-30` → 2 March); the UI date input cannot produce them.
- No branch role has `dashboard:read`, so branch managers cannot open Reports.

Tests: `artifacts/api-server/tests/admin-phase13-12-reports.test.ts`.

---

## Phase 13.11 — Yetkazib berish

Operator console for internal-courier deliveries over the existing delivery lifecycle. One minimal backend change on the list route (server search + customer name / timestamps on rows). DB sxemasi va migratsiyalar o‘zgartirilmadi; RBAC kodlari, mutation route’lari, delivery/order/cashback logikasi o‘zgarmadi.

| Area | Status | Source |
| --- | --- | --- |
| List | REAL | `GET /api/admin/deliveries` (`delivery:update`, `resolveStaffBranchFilter`) — `limit` (≤100, default 40), `offset`, `status`, `branchId` (HQ), `q` |
| Search | REAL (13.11 backend) | `q` → `sanitizeAdminOrderSearch`, ILIKE over order code, customer phone / first / last name, delivery address; one count + one joined rows query (`leftJoin customers`) |
| Row fields | REAL | delivery public fields + `updatedAt`, `orderCode`, `orderCreatedAt`, `branchId`, `deliveryFee`, `fulfillmentStatus`, `customerId`, `customer` (name only — `includePhone: false`), `providerStatus` |
| Detail | REAL | `GET /api/admin/orders/:id` (`orders:read` + `assertBranchScope`) — fetched only when the drawer opens; payment status, total, comment, branch, customer phone (masked in UI, explicit reveal) |
| Assign courier | REAL | `POST /api/deliveries/:orderId/assign` `{ courierName }` — `delivery:update` + `assertBranchScope`; free-text name (no courier registry); same-state re-assign = replace |
| Status | REAL | `POST /api/deliveries/:orderId/status` `{ status, reason? }` — GRAPH guard (409 `INVALID_DELIVERY_TRANSITION`) |
| External provider | CONTRACT_PENDING | `POST /api/deliveries/:orderId/external/sync` → 501; UI shows "Hali ulanmagan (shartnoma kutilmoqda)", sync button only on external rows |
| History / ETA / live tracking | MISSING (disclosed) | `delivery_status_history` has no read API; only lifecycle timestamps are shown |
| Date / courier / method filters | MISSING (disclosed) | not in the API — not offered in the UI |

Statuses (from `deliveryLifecycle.ts`): pending "Kuryer kutilmoqda" (warn) → assigned "Kuryer biriktirilgan" → picked_up "Kuryer olib ketdi" → on_the_way "Yo‘lda" (info) → delivered "Yetkazildi" (ok); cancelled "Bekor qilindi" (neutral), failed "Yetkazilmadi" (danger). Page `NEXT_STATUS` mirrors GRAPH (test-enforced). Delivery status and order fulfillment are shown as separate badges.

UI: header subtitle from capability ("Kuryer biriktirish va holatni o‘zgartirish mumkin" / "Faqat ko‘rish"), scope chip ("Barcha filiallar" / "Faqat o‘z filialingiz"), external chip, Yangilash. Filters: server search (Enter), Holat, Filial (HQ only), Tozalash, with a note listing the filters the API lacks. Table Buyurtma (code + branch · created) → Mijoz → Holat → Buyurtma holati → Kuryer → Manzil → Vaqt oynasi → Yangilangan; rows open by click / Enter / Space. Drawer sections Yetkazib berish → Buyurtma → Mijoz → Manzil → Kuryer → Vaqt oynasi → Filial → Tashqi xizmat, collapsed "Texnik ma’lumotlar"; missing values read "Ma’lumot mavjud emas". Footer offers only GRAPH-legal steps; every mutation goes through ConfirmDialog (cancel / failed are danger, optional reason) → API → feedback → list + detail refresh; 404 / stale-transition codes refresh the drawer. "Yetkazildi" is disabled while the order is not in a state that can reach COMPLETED (CREATED / CANCELLED), with the reason shown.

Responsive: "Yangilangan" hidden ≤1480px, "Vaqt oynasi" ≤1380px, "Buyurtma holati" ≤1200px, "Kuryer" ≤1100px; cards ≤560px; drawer fits 390px. Measured 1920 / 1440 / 1280 / 1024 / 768 / 390: no page overflow, table fits its container.

Security: 401 / 403 / 404 / 500 / network have separate fixed Uzbek copy (server `message` never rendered); branch scope enforced server-side (cashier sees own branch only, no branch filter); list rows carry no phone; no tokens or secrets in the page.

Remaining gaps (backend, not changed in 13.11):
- `transitionDelivery` is not transactional: "delivered" on an order still in CREATED writes the delivery as delivered, then the order transition fails (409) and the order stays CREATED. The UI blocks the step; the server does not.
- Mirroring to OUT_FOR_DELIVERY is skipped silently from CREATED; cancelled / failed delivery leaves the order in OUT_FOR_DELIVERY (operator must handle it in Buyurtmalar).
- No courier registry — `courierId` defaults to the acting admin id.
- `status` list filter accepts any string (unknown value → empty list).
- No delivery history read API, no date / courier / method filters, no ETA / live tracking, external provider CONTRACT_PENDING.

Tests: `artifacts/api-server/tests/admin-phase13-11-delivery.test.ts`.

---

## Phase 13.10 — Filiallar

13.10: UI reconstruction over the existing GET/PATCH contracts (backend untouched). 13.10.1 (user request): full branch CRUD — new `POST` / `DELETE` routes, validated and extended `PATCH`. DB sxemasi va migratsiyalar o‘zgartirilmadi; RBAC kodlari o‘zgarmadi (`branches:read`, `branches:manage`).

| Area | Status | Source |
| --- | --- | --- |
| Branch list | REAL | `GET /admin/branches` (`branches:read`, HQ only) — full list in one response, no pagination / search / filter params |
| Fields shown | REAL | `id`, `code`, `name`, `region`, `city`, `district`, `address`, `phone`, `hours`, `lat`, `lng`, `isOpen`, `is24h`, `createdAt`, `hasPayme`, `hasClick` |
| Create | REAL (13.10.1) | `POST /admin/branches` — `branches:manage` + HQ role; validated (`lib/adminBranches.ts`); unique code → 409 `BRANCH_CODE_TAKEN`; secrets encrypted; one transaction inserts the branch and a 0-quantity `product_stocks` row per product (same invariant as `POST /admin/products`); audit `branch.create` |
| Edit | REAL | `PATCH /admin/branches/:id` (`branches:manage` + `assertBranchScope`) — code, name, region, city, district, address, phone, hours, lat/lng, isOpen, is24h, merchant IDs, write-only secrets; invalid input → 400 `BRANCH_INVALID`; audit `branch.update` with changed field names + credential booleans |
| Delete | REAL (13.10.1, safe) | `DELETE /admin/branches/:id` — `branches:manage` + HQ role; 409 `BRANCH_IN_USE` while any order, POS sale, payment, payment intent, reservation, inventory movement, stocked product, staff account, rating, courier delivery or FOM receipt references the branch; otherwise one transaction removes zero stock rows, clears cart branch selections and deletes the branch; audit `branch.delete` |
| Secrets | MASKED | `toAdminBranchPaymentDto` returns `••••`; UI never seeds or re-sends the mask; audit log never stores secret values |
| KPI | REAL (client count) | total / open / closed / 24/7 / regions counted from the full loaded list (valid because the API has no pagination) |
| Search / filters | REAL (client-side, disclosed) | search on Enter over name, code, region, city, district, address, phone; status, region, 24/7 filters |
| Map | LINK ONLY | coordinates open an external map (no new dependency) |
| Branch-scoped list | CONTRACT_PENDING | GET is not branch-scoped for any holder of `branches:read` (today HQ only) |
| Concurrency | CONTRACT_PENDING | no version / ETag — last write wins (UI sends changed fields only) |

UI: header mode line ("Qo‘shish, tahrirlash va o‘chirish mumkin" / "Faqat o‘z filialingizni tahrirlash mumkin" / "Faqat ko‘rish — tahrirlash uchun ruxsat yo‘q"), Yangilash and (HQ) "Yangi filial"; 5 KPI cells; table Filial → Holat → Manzil → Ish vaqti → Aloqa → row actions (edit; delete for HQ); drawer view sections + footer Tahrirlash / O‘chirish; one form for create and edit (Asosiy ma’lumotlar, Manzil with coordinates, Ish rejimi va holat, To‘lov kabineti) with client validation mirroring the server. Every write goes form → ConfirmDialog (closing and deleting are danger) → API → notice → reload → shell branch list refreshed (`onBranchesChanged`). A refused delete shows the server's reference summary in the drawer with a "Filialni yopish" path. Responsive: hours column hidden ≤1100px, phone ≤900px, cards ≤560px (actions in the card), drawer fits 390px.

Security: unauthenticated 401, cashier 403 and no nav item (no `branches:*` in fallback or seeded grants); non-HQ create/delete denied and audited (`hq_required`). Only server texts carrying `BRANCH_INVALID` / `BRANCH_CODE_TAKEN` / `BRANCH_IN_USE` are shown; other failures use fixed copy. Performance: one list request; drawer opens from the list row; stale responses dropped via a request sequence guard.

Gaps: public `/branches` spreads merchant IDs; `city` duplicates `region` in current seed data; `hours` is free text next to `is24h`; no soft-delete/archive (would need a schema change) — branches with history can only be closed.

Tests: `artifacts/api-server/tests/admin-phase13-10-branches.test.ts`.

---

## Phase 13.9 — Baholar

Read-only UI reconstruction over the single existing admin contract. No backend, schema, RBAC or rating logic change.

| Area | Status | Source |
| --- | --- | --- |
| Ratings list | REAL | `GET /admin/ratings` (`ratings:read`, HQ only) — `limit` (default 50, max 100), `offset`, `total`, `hasMore`, fixed `createdAt desc` |
| Branch filter | REAL (server) | `branchId` via `resolveStaffBranchFilter`; non-HQ forced to own branch |
| Fields shown | REAL | `id`, `branchId` (name from loaded branch list), `orderId`, `employeeName`, `rating`, `comment`, `createdAt` |
| Scale | REAL | integer 1–5 enforced by `POST /ratings` (customer); no DB CHECK — out-of-range legacy values render raw |
| Search / score / date filters, sorting | NOT IMPLEMENTED | no API parameters |
| KPI (average, distribution) | NOT IMPLEMENTED | no aggregate API; only server `total` is shown |
| Customer / product relation | NOT EXPOSED | `customerId` omitted from DTO (least privilege); no product relation in model |
| Order code | CONTRACT_PENDING | DTO returns `orderId` only; UI shows `#id` |
| Tags | CONTRACT_PENDING | stored in `staff_ratings.tags`, not returned by admin API |
| Moderation / reply / delete / edit | NOT IMPLEMENTED | no endpoint, no status column; page has no mutation controls |

UI: header with "Faqat ko‘rish — baholarni o‘zgartirish API mavjud emas", server branch filter (HQ), table Baho → Buyurtma → Filial → Izoh → Sana, stars + number with tones (4–5 positive, 3 neutral, 2 warning, 1 negative), "Izohsiz" for empty comments, drawer Baho → Buyurtma → Filial → Izoh → collapsed technical section. Dates in Asia/Tashkent. Order column hidden ≤900px; cards ≤560px.

Security: unauthenticated 401, cashier 403 (no `ratings:read` in fallback or seeded grants), branch widening refused server-side. No detail route → no ID-based access surface. Performance: one list request with a count query; branch names resolved from the already-loaded branch list; drawer opens from the list row (no extra request).

Gaps: no rating aggregates, no search, no order code / tags in DTO, no DB range constraint on `rating`, legacy rows may have `order_id` null or a person name in `employee_name`, dev DB has 0 ratings.

Tests: `artifacts/api-server/tests/admin-phase13-9-ratings.test.ts`.

---

## Phase 13.8 — Cashback / Loyalty financial console

Read-only UI composition over existing contracts. No backend, schema, RBAC or cashback engine change.

| Area | Status | Source |
| --- | --- | --- |
| Liability KPI | REAL | `GET /admin/dashboard` → `kpis.cashback` = `sum(cashback_accounts.balance)` (requires `dashboard:read`) |
| Rules (max spend %, min purchase, tiers) | REAL | `GET /cashback/rules` (`getMaxSpendRatio` from settings) |
| Account list | REAL | `GET /admin/customers` (server `q`, limit/offset, SoT balance) |
| Account ledger | REAL | `GET /admin/customers/:id/cashback-history` (append-only `cashback_ledger`, "Yana ko‘rsatish") |
| Entry drawer | REAL | ledger row → commercial transaction → order / POS receipt / branch; REVERSAL section; technical collapsed |
| Cashback adjust / reverse / expire actions | NOT IMPLEMENTED | no admin write API; page performs no mutation |
| Original entry link for REVERSAL | CONTRACT_PENDING | history DTO does not expose `reverses_entry_id` |
| Ledger total count | CONTRACT_PENDING | history API returns no total |
| TTL (`ttlDays`) | NOT IMPLEMENTED | published in rules, not enforced by engine |
| Integrity check | CONTRACT_PENDING | `cashbackIntegrity` has no admin route |

UI details: entry tones EARN ok, USE info, REVERSAL warn, ADJUSTMENT neutral; dates in Asia/Tashkent; `sourceKey` / idempotency keys never rendered.

Data quality (reported, not fixed): legacy `customers.purchases_count` / `total_purchases` diverge from the ledger for seeded customers; default tier differs between schema ("Gold") and DTO/auth ("Silver"); unknown tiers fall back to 5%; tier auto-updates only on POS sales.

Tests: `artifacts/api-server/tests/admin-phase13-8-cashback.test.ts`.

---

## Phase 13.7 — Mijozlar customers console

| Item | Status |
|------|--------|
| API audit | `GET /api/admin/customers` (server `q` over first / last name, phone and telegram id; `limit` default 25, max 50; `offset`; server `total` / `hasMore`; newest id first), `GET /api/admin/customers/:id`, `GET /api/admin/customers/:id/cashback-history` (`limit` ≤100 / `offset`, no total). All require `customers:read` (super_admin only). No write, block, delete, export, sort or filter endpoints; no `customers:manage` |
| Identity / PII | DTO `toAdminCustomerListItem`: id, first / last name, `phoneMasked` (`+998 90 *** ** 67`), tier, purchasesCount, cashbackBalance. Full phone, telegram id, password hash and redeemed rewards are never returned; the UI states the full number is not available |
| Cashback | Balance from `cashback_accounts` (SoT), history from the `cashback_ledger` ⨝ `commercial_transactions` projection with server source labels (ORDER / POS / SYSTEM / FOM_POS). `savedAmount` shown as a profile counter, not a financial source. No correction API → read-only |
| Loyalty | Real `tier` text (Silver / Gold / Platinum in the engine) + purchases count / sum; rate is not returned by the admin API and is not recomputed in the UI |
| Orders / POS / branch | No customer-scoped order or POS list in the admin API; order codes, receipts and branch names appear only on ledger rows. No home branch |
| List | Server search (Enter / Qidirish), server pages via `PaginationBar`, `Jami N ta mijoz` from the server total; no KPI cards, filters or sorting |
| Drawer | Loaded on open only (detail + one history page, "Yana ko‘rsatish" for the next page): Mijoz → Loyalty → Cashback → Cashback tarixi → collapsed tech |
| Backend / API / data | **Unchanged** |

---

## Phase 13.6 — Aksiyalar promotions console

| Item | Status |
|------|--------|
| API audit | Only `GET /api/admin/promos` (`promos:read`, super_admin) returning the full `promos` and `rewards` tables (no search / filter / pagination / limit). Public `GET /api/catalog/promos` serves active promos to the mobile app. No create / update / delete / toggle endpoints; no `promos:manage` permission |
| Promo model | Marketing banner: `title`, `subtitle`, `tag` (free text), `icon`, `background`, `active`. No period, discount type / value, scope (branch / product / category / segment), usage limit, redemption counter or analytics |
| Integration | Orders, POS, FOM, payments and cashback code never read `promos`; checkout ignores client `discount` (`PROMO_MARKETING_ONLY`) |
| Rewards | Separate tab "Cashback sovg‘alari": loyalty catalog redeemed once per customer via `/api/loyalty/redeem` → `useCashback` (cashback balance debit). Shown as a loyalty item, never as a promotion; redemption counts not exposed to admin |
| Status | Real `active` boolean only: Faol (shown in the app) / Nofaol (hidden). `tag` is displayed as free text and never parsed as a period |
| Honesty | Free text that reads like a %, discount, cashback or bonus promise is flagged ("Matnda va’da — tizim qo‘llamaydi") because no engine fulfils it |
| Controls | Search (Enter / Qidirish) + Holat filter over the complete list, stated in the UI; counts (jami / faol / nofaol) come from the complete response |
| Drawer | Promo: Aksiya → Holat → Ta’sir (price / POS / cashback: none; period / scope / limit: not in system) → collapsed tech. Reward: Sovg‘a → Almashtirish → collapsed tech |
| Backend / API / data | **Unchanged** |

---

## Phase 13.5 — Katalog product catalog console

| Item | Status |
|------|--------|
| API audit | Read: `GET /api/catalog/products` (public; server-side `q` over nameUz / nameRu / manufacturer / sku, exact `category`, `sort` default / name / price_asc / price_desc, `limit` ≤ 50, `offset`, `total`, `hasMore`; optional `branchId` adds `availableQuantity`), `GET /api/catalog/categories` (distinct product categories). Admin: `GET /api/admin/products` (`products:read`, unbounded, no search — no longer used by Katalog), `POST /api/admin/products` and `PATCH /api/admin/products/:id` (`products:manage`, audited) |
| Not available in API | Product status / activation, delete / archive, category management, images / media, barcode, import / export, admin-scoped paginated list, server validation of create / edit input |
| Controls | Search first (server-side, Enter / Qidirish, ≤80 chars, clearing reloads) · Kategoriya (from categories endpoint) · Saralash (server sort). The former client-only prescription filter was removed — the API cannot filter by it |
| Table | Mahsulot (initial mark + name, SKU · manufacturer) → Kategoriya → Narx (integer `money()` + unit) → Retsept badge; branch staff also see a read-only "Filialda" available column for their own branch. 50 per page with server total; ≤900px category column hidden; ≤560px rows become cards |
| Drawer | Mahsulot → Narx va tasnif → Ombor (relation only, link to Ombor) → collapsed Texnik ma’lumotlar (ID, created, app icon code) |
| Create / edit | Only with `products:manage`; fields limited to what POST / PATCH accept; integer price validation; `ConfirmDialog` before write; edit sends only changed fields (fixes description being blanked by the old form, whose list DTO had no description). Create copy states the real backend side effect: every branch gets a starting physical quantity of 10 without an inventory movement |
| Backend / API / data | **Unchanged** — no new endpoints, schema or inventory writers |

---

## Phase 13.4 — Ombor operations console

| Item | Status |
|------|--------|
| API audit | Same contract: `GET /api/admin/products?branchId=` (`products:read`; HQ passes a branch, branch staff are forced to their own branch by `resolveStaffBranchFilter`; returns every product with `stock {physical, reserved, available}` from `product_stocks`, no pagination / search / thresholds / timestamps); `POST /api/admin/inventory/adjust {branchId, productId, physicalDelta, reason, idempotencyKey?}` (`inventory:adjust` + `assertBranchScope`, physical only, never below 0 or below reserved, audited); `POST /api/admin/inventory/expire-due` (`inventory:adjust`, **network-wide** sweep of due ACTIVE reservations, ≤100 per call) |
| Not available in API | Network aggregate stock, multi-branch list, stock movements history, reservation list, low-stock policy, transfers, batches / expiry, FOM stock sync |
| Scope | Branch selector is the first control (HQ only); branch staff see their server-resolved branch read-only; stale branch responses are dropped |
| Summary | Mahsulot · Mavjud · Mavjud emas (incl. "to‘liq rezervda") · Rezervda (SKU + units) · Nomuvofiq (only if >0) — computed from the **complete** list of the selected branch; labelled with the branch name, never as network totals |
| Table | Mahsulot (name + SKU · category, one line) → Fizik → Rezerv → **Mavjud** (server value) → Holat; right-aligned integers, 44px rows, client pages of 50; ≤560px rows become cards (product + available + status first) |
| Status | Presentation-only from server axes: Mavjud (ok) · Mavjud emas (warn) · To‘liq rezervda (info) · Nomuvofiq (danger: available < 0 or reserved > physical, shown uncorrected). No threshold invented |
| Drawer | Qoldiq (Fizik / Rezerv / Mavjud) → Mahsulot → Filial → Rezerv (reservations are the authority; no reservation list API) → Korreksiya (`inventory:adjust` only) → collapsed Texnik ma’lumotlar |
| Adjustment | Integer ± delta + required reason; client guards mirror server rules; `ConfirmDialog` shows branch, product, delta, physical/available before → after; stable `idempotencyKey` per confirmed input; 403 / 404 / 409 / network errors in Uzbek; list revalidated after success or 409 |
| FOM | Read from `GET /api/integrations/fom/status`: subtle info "FOM inventar yozuvchisi faol emas"; no sync / import / push actions |
| Labels | Shared `stockAxisLabel` / `stockAxisShort`: reserved axis renamed **Band → Rezerv** |
| Visual refinement | Two-tier controls (Filial scope row first, highlighted while HQ has no branch; Mahsulot / Kategoriya / Mavjudlik below, disabled until stock loads); no-branch state = neutral "—" summary placeholders ("Filial tanlanmagan", hidden ≤560px) + compact "Avval filialni tanlang" guide whose "Filialni tanlash" button only focuses the existing selector; distinct states: no branch · empty branch · no filter match · load error · skeleton |
| Backend / API / data | **Unchanged** — no new endpoints, writers or schema |

---

## Phase 13.3 — To‘lovlar operations console

| Item | Status |
|------|--------|
| API audit | Same contract: `GET /api/admin/payments` (latest ≤200 legacy rows, branch-scoped, **no filters / pagination / dates**), `GET /api/admin/payments/intents/:id` (intent, attempts, capture, refunds, `refundableAmount`, `orderPaymentStatus`), `POST /api/admin/payments/intents/:id/refund {reason, amount?}` (`payments:manage`) |
| Status strip | Jami yozuv · To‘langan (count + sum) · Kutilmoqda (count + sum) · Qaytarilgan (count, "shundan N qisman") · Boshqa (only if >0). Counted from the loaded rows **only when the response is below the 200-row cap** (complete set in the operator's scope); capped responses show "jami hisoblanmaydi". Sums only when all rows share one currency; refunded amounts are not in the list DTO, so that group is a count |
| Table | Buyurtma #orderId (primary) · To‘lov #id (+ "tarixsiz yozuv") → Summa (right-aligned, strong) → Holat → Usul (Payme / Click marked as online PSP) → Filial; ≤1100px the branch moves under the identity, ≤560px rows stack as compact cards (no horizontal table scroll); row click / Enter / Space opens the drawer; client-side pages of 25 |
| Filters | Holat / Usul / Filial (only when >1 branch loaded) — options come from loaded rows, applied client-side with an explicit note; no search / date filter (API has none) |
| Status tones | Shared `paymentTone`: PAID ok, PENDING family (incl. legacy `awaiting_pos`, `pending_keys`) warn, FAILED danger, REFUNDED **neutral** (was amber), PARTIALLY_REFUNDED **info** |
| Drawer | Buyurtma → To‘lov → Urinishlar (compact list) → Qabul qilish → Qaytarish (refundable, refunded total, refund rows) → collapsed Texnik ma’lumotlar (intent / capture / refund ids, merchant, external ref) |
| Refund | Danger button only when `payments:manage` + `refundableAmount > 0` + intent PAID / PARTIALLY_REFUNDED; `ConfirmDialog` with integer amount ≤ refundable (full = `{reason}`, partial adds `amount`); idempotent replay reported as such |
| Provider refund | Not connected for Payme / Click — operator copy "Provayder orqali qaytarish hozircha ulanmagan", internal record only; cashback not auto-reversed |
| States | Table skeleton, distinct empty / filtered-empty copy, Uzbek list / detail / refund errors (no raw server messages) |
| Backend / API / data | **Unchanged** — no new endpoints, no fake data |

---

## Phase 13.2 — Buyurtmalar operations console

| Item | Status |
|------|--------|
| API audit | Same contract: `GET /api/admin/orders?limit&offset&q&fulfillmentStatus&paymentStatus&reservationStatus&branchId&createdFrom&createdTo`, `GET /api/admin/orders/:id` (+ `capabilities`), `POST /api/orders/:id/confirm|prepare|ready|out-for-delivery|complete`, `POST /api/orders/:id/confirm-pos {receiptId}`, `POST /api/orders/:id/admin-cancel` |
| Table | Buyurtma (code · item count · branch for HQ) · Mijoz · Buyurtma holati · To‘lov · Yetkazish · Summa · Vaqt — row click / Enter / Space opens the drawer |
| Filters | Search (code, name, phone) + fulfillment / payment / reservation / branch (HQ only) / date range — all server-side, selects apply on change |
| Status axes | Fulfillment, payment and reservation are three separate badges; payment REFUNDED is neutral (not the PENDING amber), reservation CANCELLED neutral |
| Drawer | Mijoz (phone masked by default) → Buyurtma (items + totals) → To‘lov → Bron → Yetkazish (real `deliveries` row only) → collapsed Texnik ma’lumotlar |
| Actions | Next steps mirror `FULFILLMENT_GRAPH` + channel rules (parity test); gated by `canTransitionFulfillment` / `canConfirmPos` / `canCancel`; Yakunlash, FOM tasdiq and Bekor qilish go through `ConfirmDialog` |
| States | Table skeleton while loading, distinct empty / filtered-empty copy, Uzbek operator errors (no raw server enums), feedback inside the drawer |
| Not exposed | `POST /orders/:id/refund-cashback` (policy OPEN) — no refund button |
| Backend / API / data | **Unchanged** — no new endpoints, no fake data |

---

## Phase 13.1 — Kassa POS transaction workspace

| Item | Status |
|------|--------|
| API audit | Same contract: `POST /api/pos/lookup {qr}`, `POST /api/pos/preview {qr, amount, cashbackToUse}`, `POST /api/pos/sale {qr, amount, cashbackToUse, branchId}`, `POST /api/pos/void {receiptId}`, `GET /api/pos/sales?branchId&limit=25` |
| Capability scope | Amount-based loyalty POS — **no product search, cart or payment-method API**, so none shown |
| Layout | Numbered flow (Mijoz → Xarid summasi → Cashback) + sticky current check (total + single primary CTA) + sales history; container-query composition |
| Cashback | Available balance · server limit (`preview.maxSpend`, `maxSpendRatio`) · use (slider, 0 / Maks) — values from server only |
| Receipt / void | Success receipt in the check panel; void via shared `ConfirmDialog` (server keeps the 15-minute rule) |
| Errors | Domain Uzbek messages from the server; network / 5xx / technical text mapped to operator copy |
| Keyboard | Scan autofocus, F2 → scan, lookup → amount, Enter in amount → pay button, Escape clears scan field |
| POS hardcoded colors | **0** — legacy `.pos-*` colors re-expressed on design tokens |
| Backend / API / data | **Unchanged** — no new endpoints, no fake data |

---

## Phase 13.0 reset — Enterprise Operations Console (design system + shell + Dashboard)

| Item | Status |
|------|--------|
| Design tokens (brand, accent, surfaces 0–3, radius, elevation, type, motion) | **DONE** — `styles.css` foundation, no gradients/textures |
| Shell: sidebar (brand + operator head, quiet groups, accent active line, separate logout), topbar (breadcrumb + date) | **DONE** |
| Primitives: buttons (primary/secondary/tertiary/danger), inputs, badges, table, drawer, states | **DONE** — shared CSS, module code unchanged |
| Dashboard: overview (sales on brand surface + 7-day bars, orders stacked status) → key metrics strip → operational signals → order lists → network | **DONE** — same endpoints, no new data |
| Login default credentials | **REMOVED** (UI state only; auth unchanged) |
| Remaining modules on the new system | **OPEN** — awaiting visual approval |

### Phase 13.0 final gate

| Item | Status |
|------|--------|
| 7-day chart | **REAL API** — 7 × `GET /api/admin/dashboard?createdFrom=d&createdTo=d`, `kpis.revenue` + `kpis.orders`; on failure no bars are drawn (no zero fallback) |
| Branch network map | **REAL API** — `GET /api/admin/branches` rows (region/city, lat/lng, `isOpen`, `is24h`); region outlines are static OSM geography; `isOpen` is the configured branch flag, not live opening hours |
| Breadcrumb | **FIXED** — group segment dropped when it equals the page title (Ombor, Mijozlar) |
| Drawer / dialog focus | **FIXED** in `ui.tsx` (`useModalFocus`): focus in, Tab trap, Escape, focus restore, stacked modals, `aria-modal` + `aria-labelledby` |
| Hardcoded colors in global primitives | **0** — moved to tokens; 9 remain in the legacy POS slice (module scope, untouched) |

---

## Phase 12.49 — Provider decision

| Item | Status |
|------|--------|
| Decision | `docs/PHASE_12_49_PROVIDER_DECISION.md` |
| Staging provider | **DigitalOcean** (not provisioned) |
| Production gates closed? | **No** |
| Admin UI change | None |

---

## Phase 12.48 — Provider research

| Item | Status |
|------|--------|
| Research | `docs/PHASE_12_48_PROVIDER_RESEARCH.md` |
| Provider / provisioning | **None** — **TO_BE_AGREED** |
| Production gates closed? | **No** |
| Admin UI change | None |

---

## Phase 12.47 — Staging infrastructure blueprint

| Item | Status |
|------|--------|
| Blueprint | `docs/STAGING_INFRASTRUCTURE_BLUEPRINT.md` |
| Provider / provisioning | **None** — **TO_BE_AGREED** |
| Production gates closed? | **No** |
| Admin UI change | None |

See `docs/PRODUCTION_GAP_MATRIX.md` § Phase 12.47.

---

## Phase 12.46 — Staging infrastructure bootstrap

| Item | Status |
|------|--------|
| Staging evidence checklists | Documented in gap matrix |
| Production gates closed? | **No** — still **OPS_REQUIRED** / **CONTRACT_PENDING** |
| Admin UI change | None |

See `docs/PRODUCTION_GAP_MATRIX.md` § Phase 12.46.

---

## Phase 12.45 — Final full-system gap re-audit

| Item | Status |
|------|--------|
| Admin honesty console (12.6A–12.25) | **READY_IN_REPO** / **TEST_VERIFIED** |
| Admin users CRUD API | **MISSING** (honest UI) |
| Deep reports / export | **Hali ulanmagan** (honest) |
| FOM / external delivery / PSP refund | **CONTRACT_PENDING** / OFF |
| Production | **NOT READY — OPERATIONAL EVIDENCE MISSING** |
| Admin UI redesign this phase | **None** |

See `docs/PRODUCTION_GAP_MATRIX.md` § Phase 12.45.

---

## Phase 12.44 — Worker live crash / recovery operational gate

| Item | Status |
|------|--------|
| Reclaim implementation | **READY_IN_REPO** / **TEST_VERIFIED** |
| Staging worker / PostgreSQL | **MISSING** / **NOT_PROVEN** |
| Live crash drill | **NOT_PROVEN** |
| Gate | **OPS_REQUIRED** |
| Admin UI change | None |

See `docs/PRODUCTION_GAP_MATRIX.md` § Phase 12.44.

---

## Phase 12.43 — External delivery production contract gate

| Item | Status |
|------|--------|
| Internal delivery Admin UI | **READY_IN_REPO** |
| External provider | **MISSING** → **CONTRACT_PENDING** |
| Tracking / ETA | **CONTRACT_PENDING** (honest Hali ulanmagan) |
| Live provider E2E | **NOT_PROVEN** |
| Gate | **CONTRACT_PENDING** / **OPS_REQUIRED** |
| Admin UI change | None |

See `docs/PRODUCTION_GAP_MATRIX.md` § Phase 12.43.

---

## Phase 12.42 — Merchant secret KMS operational gate

| Item | Status |
|------|--------|
| App enc:v1 AES-GCM boundary | **READY_IN_REPO** / **TEST_VERIFIED** |
| Managed KMS | **MISSING** → **OPS_REQUIRED** |
| MERCHANT_SECRET_KEK (workspace) | **MISSING** |
| Branches UI secret exposure | Write-only / masked — no plaintext seed from API |
| Production PSP | **OFF** |
| Admin UI change | None |

See `docs/PRODUCTION_GAP_MATRIX.md` § Phase 12.42.

---

## Phase 12.41 — Click sandbox E2E operational gate

| Item | Status |
|------|--------|
| Adapter / Shop API (in-repo) | **READY_IN_REPO** / **VERIFIED_IN_REPO** |
| Sandbox credentials / live E2E | **MISSING** / **NOT_RUN** |
| Outbound refund | **CONTRACT_PENDING** |
| Production Click | **OFF** |
| Gate | **OPS_REQUIRED** |
| Admin UI change | None |

See `docs/PRODUCTION_GAP_MATRIX.md` § Phase 12.41.

---

## Phase 12.40 — Payme sandbox E2E operational gate

| Item | Status |
|------|--------|
| Adapter / Merchant RPC (in-repo) | **READY_IN_REPO** / **VERIFIED_IN_REPO** |
| Sandbox credentials / live E2E | **MISSING** / **NOT_RUN** |
| Outbound refund | **CONTRACT_PENDING** |
| Production Payme | **OFF** |
| Gate | **OPS_REQUIRED** |
| Admin UI change | None |

See `docs/PRODUCTION_GAP_MATRIX.md` § Phase 12.40.

---

## Phase 12.39 — HMAC legacy retirement operational gate

| Item | Status |
|------|--------|
| Admin s1 issuance / opaque Bearer | **DONE** / **READY_IN_REPO** |
| Admin HMAC construction | **Absent** |
| Legacy dual-accept | Still **ON** (default) |
| Telemetry / quiet / population | **NOT_PROVEN** |
| Gate | **OPS_REQUIRED** |
| Admin UI change | None |

See `docs/PRODUCTION_GAP_MATRIX.md` § Phase 12.39.

---

## Phase 12.38 — Production Redis staging gate

| Item | Status |
|------|--------|
| Managed provider / REDIS_URL | **MISSING** |
| TLS / AUTH / live PING / failover | **NOT_PROVEN** |
| Gate | **OPS_REQUIRED** |
| Provider invented? | **No** |
| Admin UI change | None |

See `docs/PRODUCTION_GAP_MATRIX.md` § Phase 12.38.

---

## Phase 12.37 — Managed PostgreSQL staging gate

| Item | Status |
|------|--------|
| Managed provider / staging DATABASE_URL | **MISSING** |
| PITR / restore / RPO / RTO | **NOT_PROVEN** / **NOT_ESTABLISHED** |
| Gate | **OPS_REQUIRED** |
| Provider invented? | **No** |

See `docs/PRODUCTION_GAP_MATRIX.md` § Phase 12.37.

---

## Phase 12.36 — Worker crash recovery

| Item | Status |
|------|--------|
| Stale RUNNING reclaim | **READY_IN_REPO** / **TEST_VERIFIED** |
| Production worker kill drill | **OPS_REQUIRED** (12.44 re-verified) |
| Admin UI change | None |

See `docs/PRODUCTION_GAP_MATRIX.md` § Phase 12.36.

---

## Phase 12.35 — Failure recovery & resilience

| Item | Status |
|------|--------|
| In-repo fail-closed / idempotency | **READY_IN_REPO** / **TEST_VERIFIED** |
| Real staging/production outage drills | **OPS_REQUIRED** / **NOT_PROVEN** |
| RPO / RTO | **NOT_ESTABLISHED** |
| Production enablement | **CLOSED** |

See `docs/PRODUCTION_GAP_MATRIX.md` § Phase 12.35.

---

## Phase 12.34 — Mobile s1.* migration readiness

| Item | Status |
|------|--------|
| Admin auth | Unaffected (`s1.*` issuance DONE; dual-accept still ON) |
| Mobile s1-only production proof | **NOT_PROVEN** |
| Legacy HMAC disabled this phase? | **No** |
| Retirement gate | **OPS_REQUIRED** |

See `docs/PRODUCTION_GAP_MATRIX.md` § Phase 12.34.

---

## Phase 12.33 — HMAC legacy auth gate

| Item | Status |
|------|--------|
| Admin login → `s1.*` | **DONE** |
| Legacy admin HMAC dual-accept | Still **ON** by default |
| Legacy HMAC CLOSED | **No** — **OPS_REQUIRED** / **NOT_PROVEN** |
| Blind removal performed? | **No** |

See `docs/PRODUCTION_GAP_MATRIX.md` § Phase 12.33.

---

## Phase 12.32 — Click sandbox E2E gate

| Item | Status |
|------|--------|
| Shop API + adapter (Prepare/Complete) | **READY_IN_REPO** |
| Sandbox credentials | **MISSING** |
| Live sandbox E2E | **NOT RUN** → **OPS_REQUIRED** / PENDING |
| Outbound Click refund / SHA1 Merchant API | **CONTRACT_PENDING** |
| Production Click | **OFF** |
| Credentials invented? | **No** |

See `docs/PRODUCTION_GAP_MATRIX.md` § Phase 12.32.

---

## Phase 12.31 — Payme sandbox E2E gate

| Item | Status |
|------|--------|
| Merchant API + adapter (core settle) | **READY_IN_REPO** |
| Sandbox credentials | **MISSING** |
| Live sandbox E2E | **NOT RUN** → **OPS_REQUIRED** / PENDING |
| Outbound Payme refund | **CONTRACT_PENDING** |
| Production Payme | **OFF** |
| Credentials invented? | **No** |

See `docs/PRODUCTION_GAP_MATRIX.md` § Phase 12.31.

---

## Phase 12.30 — Redis production gate

| Item | Status |
|------|--------|
| In-repo client + fail-closed + rate-limit | **READY_IN_REPO** |
| FakeRedis multi-instance / atomic tests | **TEST VERIFIED** |
| `REDIS_URL` / live PING / TLS | **MISSING** / **NOT_PROVEN** |
| Production Redis gate | **OPS_REQUIRED** |
| Provider invented? | **No** |

See `docs/PRODUCTION_GAP_MATRIX.md` § Phase 12.30.

---

## Phase 12.27 — P0 production gate verification

| Item | Status |
|------|--------|
| P0-1 Managed PG PITR + restore | **OPS_REQUIRED** (12.29 re-verified; no managed PG / DATABASE_URL here) |
| P0-2 Merchant KMS-at-rest | **OPS_REQUIRED** (12.28: encryption boundary implemented; cloud KMS still ops) |
| P0-3 Payme/Click sandbox E2E | **OPS_REQUIRED** (harness PENDING — credentials MISSING) |
| P0-4 Redis live verify | **OPS_REQUIRED** (code DONE; REDIS_URL MISSING) |
| Production readiness | Remains **NOT READY** |
| Production PSP / FOM enablement | **NOT PERFORMED** |
| Business engines / APIs / DB | unchanged |

**Test:** `tests/phase12-27-p0-gates.test.ts`

---

## Phase 12.26 — Production gap inventory

| Item | Status |
|------|--------|
| Authoritative register `docs/PRODUCTION_GAP_MATRIX.md` | **CREATED** |
| Production readiness | **NOT READY** |
| P0/P1/P2/P3 + EXTERNAL/OPS classified | **DOCUMENTED** |
| Business engines / APIs / DB / Admin redesign | unchanged |
| Invariant test | `tests/production-gap-matrix.test.ts` |

---

## Phase 12.25.1 — Sidebar icon system

| Item | Status |
|------|--------|
| Library: `lucide-react` (workspace catalog) | **IMPLEMENTED** |
| FINAL semantic mapping for all nav + Chiqish | **IMPLEMENTED** |
| Unicode/emoji sidebar glyphs removed | **IMPLEMENTED** |
| Routes / permissions / IA groups | **PRESERVED** |
| Visual acceptance | **PASS** (Edge fixtures) |

**Files:** `navIcons.tsx`, `App.tsx`, `nav.ts`, `styles.css`, `package.json`, `tests/admin-phase12-25-1-sidebar-icons.test.ts`

---

## Phase 12.25 — Cross-module UX consolidation

| Item | Status |
|------|--------|
| Shared Escape on DetailDrawer / ConfirmDialog | **IMPLEMENTED** |
| Status language: FAILED / CONTRACT_PENDING unified | **IMPLEMENTED** |
| Dead “Tez orada” nav chrome removed | **IMPLEMENTED** |
| Duplicate FOM Yangilash removed | **IMPLEMENTED** |
| PAGE_DESCRIPTIONS / nav icon polish | **IMPLEMENTED** |
| Honesty locks (FOM / Settings / Adminlar / Audit / Reports) | **PRESERVED** |
| Business engines / APIs / DB | unchanged |
| Visual acceptance | **PASS** (Edge fixtures) |

**Files:** `ui.tsx`, `nav.ts`, `App.tsx`, `styles.css`, `FomPage.tsx`, `AuditPage.tsx`, `DeliveryPage.tsx`, `RatingsPage.tsx`, docs, `tests/admin-phase12-25-final-ux.test.ts`

---

## Phase 12.24 — FOM integration console

| Item | Status |
|------|--------|
| Source: `GET /integrations/fom/status` (admin auth) | **PRESERVED** |
| Inventory writer OFF / not misrepresented as synced | **IMPLEMENTED** |
| FOM_POS CONTRACT_PENDING honest | **IMPLEMENTED** |
| confirm-pos commercial identity = ORDER | **DOCUMENTED** |
| No invent probe / retry / sync / KPI / receipts | **IMPLEMENTED** |
| Secrets not rendered | **IMPLEMENTED** |
| Business engines / APIs / DB | unchanged |
| Visual acceptance | **PASS** (Edge fixtures) |

**Files:** `FomPage.tsx`, `nav.ts`, `styles.css`, `ui.tsx` (NOT_SUPPORTED label), docs, `tests/admin-phase12-24-fom.test.ts`

---

## Phase 12.23 — Admin users & RBAC access boundary

| Item | Status |
|------|--------|
| Admin user list/create/update/delete API | **MISSING** (confirmed) |
| Role/permission assignment API | **MISSING** |
| Honest `AdminAccessPage` (no fake CRUD) | **IMPLEMENTED** |
| Session role + permissions from `/admin/me` (read-only) | **IMPLEMENTED** |
| Backend RBAC / branch scope described as enforcement | **DOCUMENTED** |
| Nav: Tizim → Adminlar (hqOnly) | **IMPLEMENTED** |
| Business engines / APIs / DB | unchanged |
| Visual acceptance | **PASS** (Edge fixtures) |

**Files:** `AdminAccessPage.tsx`, `App.tsx`, `nav.ts`, `SettingsPage.tsx`, `styles.css`, `ui.tsx`, docs, `tests/admin-phase12-23-admin-users.test.ts`

---

## Phase 12.22 — Settings product reconstruction

| Item | Status |
|------|--------|
| No `/admin/settings` aggregate (honest) | **CONFIRMED** |
| Read-only cashback max spend via `GET /cashback/rules` | **IMPLEMENTED** |
| Admin users CRUD | **Hali ulanmagan** (API_REQUIRED) |
| No invent toggles / feature flags / secrets / save | **IMPLEMENTED** |
| Pointers: Filiallar / FOM (no secret dump) | **IMPLEMENTED** |
| Business engines / APIs / DB | unchanged |
| Visual acceptance | **PASS** (Edge fixtures) |

**Files:** `SettingsPage.tsx`, `App.tsx`, `nav.ts`, `styles.css`, docs, `tests/admin-phase12-22-settings.test.ts`

---

## Phase 12.21 — Audit logs product reconstruction

| Item | Status |
|------|--------|
| Source: `GET /admin/audit` (limit/offset/action/entity) | **PRESERVED** |
| Filters: action (ilike) + entity (exact) only | **IMPLEMENTED** |
| No invent date/branch/actor/search/export/KPI/charts | **IMPLEMENTED** |
| Table + DetailDrawer (no raw JSON dump) | **IMPLEMENTED** |
| Client metadata scrub (token/otp/secret…) | **IMPLEMENTED** |
| Pagination: total / hasMore | **IMPLEMENTED** |
| Business engines / APIs / DB | unchanged |
| Visual acceptance | **PASS** (Edge fixtures) |

**Files:** `AuditPage.tsx`, `App.tsx`, `styles.css`, `nav.ts`, docs, `tests/admin-phase12-21-audit.test.ts`

---

## Phase 12.20 — Reports / Hisobotlar product reconstruction

| Item | Status |
|------|--------|
| Source: `GET /admin/dashboard` only (no dedicated reports API) | **PRESERVED** |
| Date/branch filters mapped to real `createdFrom`/`createdTo`/`branchId` | **IMPLEMENTED** |
| Removed invent AOV / completion % | **IMPLEMENTED** |
| Snapshot tables + scope notes (order vs global) | **IMPLEMENTED** |
| Deep reports: “Hali ulanmagan” (no fake charts/export) | **IMPLEMENTED** |
| Distinct from Dashboard composition | **IMPLEMENTED** |
| Business engines / APIs / DB | unchanged |
| Visual acceptance | **PASS** (Edge fixtures 1920→390) |

**Files:** `ReportsPage.tsx`, `App.tsx`, `styles.css`, `nav.ts`, docs, `tests/admin-phase12-20-reports.test.ts`

---

## Phase 12.19 — Promos / Aksiyalar product reconstruction

| Item | Status |
|------|--------|
| IA: Header → filters → count → dense tables → DetailDrawer | **IMPLEMENTED** |
| Read-only `GET /admin/promos` (promos + rewards); no invent CRUD | **PRESERVED** |
| `PROMO_MARKETING_ONLY` honesty (not pricing engine) | **PRESERVED** |
| No invent discount/dates/branch/KPI | **IMPLEMENTED** |
| Rewards: code/title/points/subtitle only (no fake price) | **IMPLEMENTED** |
| Cashback / Checkout untouched | unchanged |
| Business engines / APIs / DB | unchanged |
| Visual acceptance | **VISUAL PASS** — Edge headless fixture (production CSS) at 1920 / 1600 / 1440 / 1280 / 1100 / 960 / 768 / 390 |

**Files:** `PromosPage.tsx`, `styles.css`, `nav.ts`, docs, `tests/admin-phase12-19-promos.test.ts`

---

## Phase 12.18 — Delivery / Yetkazib berish product reconstruction

| Item | Status |
|------|--------|
| IA: Header → Holat/Filial → count → dense table → DetailDrawer | **IMPLEMENTED** |
| Server filters + pagination (`limit`/`offset`/`total`) | **IMPLEMENTED** |
| Assign + status via drawer; ConfirmDialog for status | **IMPLEMENTED** |
| ETA/courier/tracking honesty (no invent) | **IMPLEMENTED** |
| External sync honesty (`operatorCapabilityLabel`, no primary CONTRACT_PENDING) | **IMPLEMENTED** |
| Removed page-level action cards / Amallar row buttons / window.confirm | **IMPLEMENTED** |
| Business engines / APIs / DB | unchanged |
| Visual acceptance | **VISUAL PASS** — Edge headless fixture (production CSS) at 1920 / 1600 / 1440 / 1280 / 1100 / 960 / 768 / 390 |

**Files:** `DeliveryPage.tsx`, `App.tsx`, `styles.css`, `nav.ts`, docs, `tests/admin-phase12-18-delivery.test.ts`

---

## Phase 12.17 — Branches / Filiallar product reconstruction

| Item | Status |
|------|--------|
| IA: Header → filters → count → dense table → DetailDrawer | **IMPLEMENTED** |
| Removed mini Ombor/Buyurtmalar/To‘lovlar tabs + softRequest side loads | **IMPLEMENTED** |
| Edit PATCH + ConfirmDialog; secrets MASK / write-only | **PRESERVED** |
| No invent create/delete (API has PATCH only) | **IMPLEMENTED** |
| Holat = Ochiq/Yopiq (`isOpen`) | **IMPLEMENTED** |
| Quiet Ombor link; no stock axes in Filiallar | **IMPLEMENTED** |
| Business engines / APIs / DB | unchanged |
| Visual acceptance | **VISUAL PASS** — Edge headless fixture (production CSS) at 1920 / 1600 / 1440 / 1280 / 1100 / 960 / 768 / 390 |

**Files:** `BranchesPage.tsx`, `App.tsx`, `styles.css`, `nav.ts`, docs, `tests/admin-phase12-17-branches.test.ts`

---

## Phase 12.16 — Catalog product management reconstruction

| Item | Status |
|------|--------|
| IA: Header → filters → count → dense table → DetailDrawer | **IMPLEMENTED** |
| Master data columns only (no Fizik/Band/Mavjud table) | **IMPLEMENTED** |
| Create (POST) + edit (PATCH) in drawer; `products:manage` | **IMPLEMENTED** |
| Quiet Ombor reference + navigate to Inventory | **IMPLEMENTED** |
| No StatCard / fake price / fake discount | **IMPLEMENTED** |
| Holat = Retsept / Oddiy (API has no active flag) | **IMPLEMENTED** |
| Business engines / APIs / DB | unchanged |
| Visual acceptance | **VISUAL PASS** — Edge headless fixture (production CSS) at 1920 / 1600 / 1440 / 1280 / 1100 / 960 / 768 / 390 |

**Files:** `CatalogPage.tsx`, `App.tsx`, `styles.css`, `nav.ts`, docs, `tests/admin-phase12-16-catalog.test.ts`; phase3 axes assertion moved to Inventory

---

## Phase 12.15 — Inventory / Stock product reconstruction

| Item | Status |
|------|--------|
| IA: Header → Filial/filters → count → dense table → DetailDrawer | **IMPLEMENTED** |
| Stock axes: Fizik / Band / Mavjud (server-authoritative) | **IMPLEMENTED** |
| HQ branch gate (no fake cross-branch aggregate) | **IMPLEMENTED** |
| Client filters on loaded branch list (q / kategoriya / mavjudlik) | **IMPLEMENTED** |
| Mavjud emas = Available ≤ 0 only (no invent threshold) | **IMPLEMENTED** |
| Adjust + expire-due via ConfirmDialog; `inventory:adjust` RBAC | **PRESERVED** |
| No StatCard KPI wall / no inventory value / no turnover | **IMPLEMENTED** |
| Business engines / APIs / DB | unchanged |
| Visual acceptance | **VISUAL PASS** — Edge headless fixture (production CSS) at 1920 / 1600 / 1440 / 1280 / 1100 / 960 / 768 / 390 |

**Files:** `InventoryPage.tsx`, `styles.css`, `nav.ts`, docs, `tests/admin-phase12-15-inventory.test.ts`

---

## Phase 12.14 — Payments product reconstruction

| Item | Status |
|------|--------|
| IA: Header → filters → count → table → DetailDrawer | **IMPLEMENTED** |
| StatusLabelBadge + provider display labels | **IMPLEMENTED** |
| Honest filters on loaded list (no fake search API) | **IMPLEMENTED** |
| Intent drawer: payment ≠ order payment axis | **IMPLEMENTED** |
| Internal refund + ConfirmDialog; provider CONTRACT_PENDING | **PRESERVED** |
| No StatCard KPI wall / no secrets / no sourceKey-style chrome | **IMPLEMENTED** |
| Business engines / APIs / DB | unchanged |
| Visual acceptance | **VISUAL PASS** — Edge headless fixture (production CSS) at 1440 / 1280 / 960 / 768 / 390 |

**Files:** `PaymentsPage.tsx`, `App.tsx` (branches prop), `styles.css`, `nav.ts`, docs, `tests/admin-phase12-14-payments.test.ts`

---

## Phase 12.13 — Customers / Cashback / Ratings product reconstruction

| Item | Status |
|------|--------|
| Customers: search → count → dense table → DetailDrawer | **IMPLEMENTED** |
| Cashback ≠ Loyalty separation in drawer | **IMPLEMENTED** |
| Cashback: liability overview (dashboard SoT) + customer ledger drawer | **IMPLEMENTED** |
| Ledger: StatusLabelBadge entry types; no `sourceKey` chrome | **IMPLEMENTED** |
| Ratings: branch filter → count → table → DetailDrawer | **IMPLEMENTED** |
| Removed client “Sahifa o‘rtachasi” KPI | **IMPLEMENTED** |
| No fake metrics / no client finance math / no balance invent | **PRESERVED** |
| Business engines / APIs / DB | unchanged |
| Visual acceptance | **VISUAL PASS** — Edge headless fixtures (production CSS) for Customers / Cashback / Ratings at 1440 / 1280 / 960 / 390 |

**Files:** `CustomersPage.tsx`, `CashbackPage.tsx`, `RatingsPage.tsx`, `styles.css`, `nav.ts`, docs, `tests/admin-phase12-13-crm.test.ts`

---

## Phase 12.12.1 — Orders visual / product refinement

| Item | Status |
|------|--------|
| Search-primary control hierarchy | **IMPLEMENTED** |
| Bron demoted to “Qo‘shimcha filtrlar” | **IMPLEMENTED** |
| Sana grouped (Dan–Gacha, same query params) | **IMPLEMENTED** |
| Enter applies search (SearchInput onSubmit) | **IMPLEMENTED** |
| Quiet result context (`N ta buyurtma`) | **IMPLEMENTED** |
| Compact table-surface empty state | **IMPLEMENTED** |
| Transition actions behind disclosure | **IMPLEMENTED** |
| Business engines / APIs / DB | unchanged |
| Visual acceptance | **VISUAL PASS** — Edge headless fixture with production `styles.css` at 1440 / 1280 / 960 / 390 |

**Files:** `OrdersPage.tsx`, `styles.css`, docs, `tests/admin-phase12-12-orders.test.ts`

---

## Phase 12.12 — Orders page product reconstruction

| Item | Status |
|------|--------|
| IA: Header → Control bar → Result count → Table → DetailDrawer | **IMPLEMENTED** |
| Operator table: Buyurtma / Mijoz / Filial / Holat / To‘lov / Summa / Vaqt | **IMPLEMENTED** |
| Row click opens DetailDrawer (no per-row Ko‘rish noise) | **IMPLEMENTED** |
| Payment ≠ fulfillment (separate StatusLabelBadge axes) | **IMPLEMENTED** |
| Tur / Bron demoted from table → drawer | **IMPLEMENTED** |
| Filters: q / holat / to‘lov / filial / bron / sana + Tozalash | **IMPLEMENTED** |
| Honest empty (no orders vs no filter results) | **IMPLEMENTED** |
| Cancel via ConfirmDialog; transitions / FOM via capabilities | **PRESERVED** |
| Server pagination (limit 25) | **PRESERVED** |
| Business engines / APIs / DB | unchanged |
| Visual acceptance | **VISUAL PASS NOT VERIFIED** (no browser automation this session) |

**Files:** `OrdersPage.tsx`, `styles.css`, `nav.ts`, docs, `tests/admin-phase12-12-orders.test.ts`

**Next:** Phase 12.13+ other modules if scheduled — not started.

---

## Phase 12.11.1 — Dashboard geometry / full-width

| Item | Status |
|------|--------|
| Root cause: `.dashboard { max-width: 1100px }` | **FIXED** |
| Dashboard fills `.main` (`width: 100%`, `max-width: none`) | **IMPLEMENTED** |
| Soft cap remains on `.main` via `--vm-content-max: 1680px` + `margin-inline: auto` | **PRESERVED** |
| Header / hero / rail / attention / activity share same width | **IMPLEMENTED** |
| Visual acceptance | **BROWSER VERIFY** |

**Files:** `styles.css`, `tests/admin-phase12-11-dashboard.test.ts`

---

## Phase 12.11 — Final Dashboard product reconstruction

| Item | Status |
|------|--------|
| Compact biz-hero (Savdo + period + orders) | **IMPLEMENTED** |
| Ops-rail (label-above-value, separators) | **IMPLEMENTED** |
| Attention: calm strip / gate / priority rows | **IMPLEMENTED** |
| Activity content-height when empty | **IMPLEMENTED** |
| Sparse DB intentional composition | **IMPLEMENTED** |
| No QA matrix / gradients / fake metrics | **IMPLEMENTED** |
| Business engines / APIs / DB | unchanged |
| Visual acceptance | **BROWSER VERIFY** — not claimed PASS from tests |

**Files:** `DashboardPage.tsx`, `styles.css`, docs, `tests/admin-phase12-11-dashboard.test.ts`

---

## Phase 12.10 — Dashboard pixel-level product reconstruction

| Item | Status |
|------|--------|
| Pre-impl KEEP/MOVE/MERGE/REDESIGN/REMOVE audit | **DONE** |
| Savdo hero row (34–40px) + subordinate pipeline | **IMPLEMENTED** |
| Context rail (not KPI cards) | **IMPLEMENTED** |
| Attention work queue (WHAT / WHY / CTA) | **IMPLEMENTED** |
| Priority: inventory → open orders → delivery | **IMPLEMENTED** |
| Compact calm empty with ✓ | **IMPLEMENTED** |
| No gradients / no QA matrix / no sidebar mirror | **IMPLEMENTED** |
| CSS vocabulary: dashboard / business-snapshot / context-rail / attention / activity | **IMPLEMENTED** |
| Other modules | **NOT THIS PHASE** |
| Business engines / APIs / DB | unchanged |
| Visual acceptance | **BROWSER VERIFY** — tests ≠ visual PASS |

**Files:** `DashboardPage.tsx`, `styles.css`, `App.tsx` (`onOpenDelivery`), docs, `tests/admin-phase12-10-dashboard.test.ts`

**Next:** Phase 12.11+ module redesigns (Orders/POS/…) if scheduled.

---

## Phase 12.9 — Dashboard operations center reset

| Item | Status |
|------|--------|
| Composition: Header → Bugungi savdo → E’tibor → Faoliyat | **IMPLEMENTED** |
| One business snapshot (Savdo dominant) | **IMPLEMENTED** |
| Quiet network metadata (not KPI strip) | **IMPLEMENTED** |
| Attention work queue from real API signals | **IMPLEMENTED** |
| Compact calm empty attention | **IMPLEMENTED** |
| Inventory Available≤0 only (operator “Mavjud emas”) | **IMPLEMENTED** |
| Quick-action / sidebar-mirror matrix removed | **IMPLEMENTED** |
| Activity prominent; StatusLabelBadge | **IMPLEMENTED** |
| Module redesigns (Orders/POS/…) | **NOT THIS PHASE** (12.10+) |
| Business engines / APIs / DB | unchanged |
| Visual acceptance | **BROWSER VERIFY** — tests ≠ visual PASS |

**Files:** `DashboardPage.tsx`, `styles.css`, `App.tsx` (prop cleanup), docs, `tests/admin-phase12-9-dashboard.test.ts`

**Next:** Phase 12.10 — Orders / POS / Payments / Inventory redesign.

---

## Phase 12.8 — Information Architecture + operator copy

| Item | Status |
|------|--------|
| Nav IA: Boshqaruv / Savdo / Ombor / Mijozlar / Tarmoq / Tahlil / Tizim | **IMPLEMENTED** |
| Nav weight (primary / secondary / low / system) | **IMPLEMENTED** |
| FOM moved to Tizim (route + RBAC unchanged) | **IMPLEMENTED** |
| Operator label helpers + StatusLabelBadge | **IMPLEMENTED** |
| Technical-copy suppression (presentation only) | **IMPLEMENTED** (light module adoption) |
| Page-header contract (topbar location / page H1) | **IMPLEMENTED** |
| Button hierarchy + surface + density foundations | **IMPLEMENTED** |
| Dashboard redesign / module redesigns | **NOT THIS PHASE** (12.9+) |
| Business engines / APIs / DB | unchanged |
| Visual acceptance | **BROWSER VERIFY** — tests ≠ visual PASS |

**Files:** `nav.ts`, `App.tsx`, `ui.tsx`, `styles.css`, selected pages (copy-only), docs, `tests/admin-phase12-8-ia-copy.test.ts`

**Next:** Phase 12.9 — Dashboard redesign on this IA foundation.

---

## Phase 12.6B — Dashboard Operations Center

| Item | Status |
|------|--------|
| Composition: Snapshot → Context → Attention+Actions → Activity | **IMPLEMENTED** |
| Business snapshot (`.biz-snapshot`, Savdo dominant) | **IMPLEMENTED** |
| Quiet secondary context line | **IMPLEMENTED** |
| Unified ops zone (~60/40, one surface) | **IMPLEMENTED** |
| Inventory attention (Available≤0 only, compact empty) | **IMPLEMENTED** |
| Quick action tiles with contextual hints | **IMPLEMENTED** |
| Activity tabs + StatusLabelBadge | **IMPLEMENTED** |
| Content-driven empty states | **IMPLEMENTED** |
| Business engines | unchanged |
| Visual acceptance | **BROWSER VERIFY** |

**Files:** `DashboardPage.tsx`, `styles.css`, docs, `tests/admin-phase12-6b-dashboard.test.ts`

---

## Phase 12.6A — Enterprise Shell + Navigation

| Item | Status |
|------|--------|
| Sidebar quiet nav (not filled buttons) | **IMPLEMENTED** |
| Brand → operator → role → scope hierarchy | **IMPLEMENTED** |
| Topbar: quiet breadcrumb + scope + Sessiya + Chiqish | **IMPLEMENTED** |
| Session refresh accurate label (not fake page refresh) | **IMPLEMENTED** |
| Page-header title contract (H1 owns title) | **IMPLEMENTED** |
| Button hierarchy: primary / secondary / tertiary / danger | **IMPLEMENTED** (shared CSS) |
| Surface system classes | **IMPLEMENTED** |
| Status label helpers (Uzbek presentation) | **IMPLEMENTED** (helpers; module adoption later) |
| Technical-copy helpers | **IMPLEMENTED** |
| Module page compositions (Dashboard/Orders/…) | **NOT THIS PHASE** |
| Business engines | unchanged |
| Visual acceptance | **BROWSER VERIFY** |

**Files:** `App.tsx`, `ui.tsx`, `styles.css`, docs, `tests/admin-phase12-6a-shell.test.ts`

---

## Phase 12.5 — Dashboard composition rebuild

| Item | Status |
|------|--------|
| Mental model: Happening → Attention → Do → Recent | **IMPLEMENTED** |
| Business snapshot: single cmd-strip (Savdo hero) | **IMPLEMENTED** |
| Secondary totals demoted to context line | **IMPLEMENTED** |
| Ops zone 60/40 (inventory + qa-matrix) | **IMPLEMENTED** |
| Activity tabs (Buyurtmalar / Kassa) | **IMPLEMENTED** |
| Content-driven empty-inline states | **IMPLEMENTED** |
| Business engines | unchanged |
| Visual acceptance | **BROWSER VERIFY** — do not claim PASS without hard-refresh inspection |

---

## Phase 12.4 — Pixel-level product design reconstruction

| Item | Status |
|------|--------|
| Content audit (debug language removed from operator surfaces) | **IMPLEMENTED** |
| Topbar simplified | **IMPLEMENTED** |
| Dashboard flat panels + MetricStrip | superseded by 12.5 cmd-strip |
| FOM status + collapsed technical details | **IMPLEMENTED** |
| Reports / Settings / Cashback operator copy | **IMPLEMENTED** |
| Business engines | unchanged |
| Visual PASS claim | superseded by 12.5 |

---

## Phase 12.3 — Enterprise product UX/UI overhaul

| Item | Status |
|------|--------|
| Product IA navigation groups | **IMPLEMENTED** |
| Sidebar / topbar control center | **IMPLEMENTED** |
| Dashboard MetricStrip ops center | superseded by 12.5 |
| Reports AVAILABLE vs API_REQUIRED | **IMPLEMENTED** |
| Settings capability sections | **IMPLEMENTED** |
| Cashback financial strip | **IMPLEMENTED** |
| POS spend label honesty (server maxSpend) | **IMPLEMENTED** |
| Business engines | unchanged |

---

## Phase 12.2 — Premium Dashboard visual refinement

| Item | Status |
|------|--------|
| KPI hierarchy (Savdo hero + secondary quiet) | **IMPLEMENTED** (evolved in 12.5) |
| Compact filters in header | **IMPLEMENTED** |
| Inventory purposeful empty + real table | **IMPLEMENTED** |
| Quick action tiles | **IMPLEMENTED** (matrix in 12.5) |
| Orders/POS full-width compact empties | **IMPLEMENTED** |
| Fake trends / invented thresholds | none |
| Business logic | unchanged |

---

## Phase 12.1 — CSS / styling regression fix

| Item | Status |
|------|--------|
| Root cause | Vite **dev** transform served styles.css with empty __vite__css (HMR/cache corruption on long-lived server) |
| Source CSS / import | Intact (main.tsx → ./styles.css; tokens --vm-* present; production build CSS ~20KB) |
| Fix | Cleared Vite cache + restarted Admin Vite; **no UI redesign**, no business logic changes |
| Browser verify | Dev CSS module non-empty after restart |

---

## Phase 12 — Premium visual redesign

| Item | Status |
|------|--------|
| Density tokens (sidebar/radius/shadow/content max) | **IMPLEMENTED** |
| Sidebar quieter / narrower | **IMPLEMENTED** |
| Compact topbar (no pill chips) | **IMPLEMENTED** |
| Dashboard KPI hierarchy + ops grid | **IMPLEMENTED** |
| Flat sections / less card nesting | **IMPLEMENTED** |
| Compact empty states | **IMPLEMENTED** |
| Module token cascade | **INTEGRATED** (global CSS) |
| Business logic | unchanged |

---

## Phase 11 — Deep operator UX

| Module | Status | Notes |
|--------|--------|-------|
| Filiallar | **PASS** | FilterBar, DetailDrawer tabs, ConfirmDialog, secrets masked |
| Katalog | **PASS** | FilterBar, DetailDrawer, no fake discounts |
| Ombor | **PASS** | Available<=0 only, ConfirmDialog adjust |
| Buyurtmalar | **PASS** | ConfirmDialog cancel; 3-axis detail |
| Mijozlar | **PASS** | DetailDrawer tabs, SoT cashback |
| Cashback | **PASS** | SoT labels retained |
| To‘lovlar | **PASS** | Intent drawer; refund CONTRACT_PENDING |
| Kassa POS | **PASS** | Step chrome; engine untouched |
| Yetkazib berish | **PARTIAL** | External ETA CONTRACT_PENDING |
| Aksiyalar | **PASS** | PROMO_MARKETING_ONLY |
| Baholar | **PARTIAL** | Real list |
| Audit | **PASS** | DetailDrawer + honest filters (12.21) |
| Hisobotlar | **PASS** | Snapshot + Hali ulanmagan (12.20); no invent KPIs |
| FOM | **PASS** | Status console; writer OFF; FOM_POS pending (12.24) |
| Sozlamalar | **PARTIAL** | Cashback % read-only; Adminlar → separate boundary (12.23) |
| Adminlar | **PARTIAL** | Access boundary; CRUD API_REQUIRED |
| ConfirmDialog / DetailDrawer | **IMPLEMENTED** | ui.tsx |

---

## Phase 10 — Enterprise UI/UX

| Item | Status | Notes |
|------|--------|-------|
| UI/UX audit | **IMPLEMENTED** | `docs/ADMIN_UI_UX_AUDIT.md` |
| Design system tokens | **IMPLEMENTED** | CSS `--vm-*` + `docs/ADMIN_DESIGN_SYSTEM.md` |
| Shared components (`ui.tsx`) | **IMPLEMENTED** | Header, FilterBar, StatCard, StatusBadge, DataTable, Pagination, Empty/Error/Loading |
| Sidebar redesign | **IMPLEMENTED** | Groups, icons, collapse, `aria-current`, permission-aware |
| Top header | **IMPLEMENTED** | Breadcrumb + identity chip + HQ/branch + refresh + logout |
| Page header system | **IMPLEMENTED** | `PAGE_DESCRIPTIONS` + `AdminPageHeader` |
| Dashboard polish | **IMPLEMENTED** | FilterBar, StatCards, SectionCard tables, Omborga o‘tish |
| Money format `125 500 so‘m` | **IMPLEMENTED** | `money()` display-only |
| Status badge system | **IMPLEMENTED** | ok/warn/danger/info/neutral + shared tone helpers |
| Orders / Cashback / Reports / Settings polish | **IMPLEMENTED** | Shared components |
| Other modules token alignment | **INTEGRATED** | Same CSS + PageHeader descriptions; deeper FilterBar migration incremental |
| Fake trends / charts | **DISABLED** | Not added |
| Business logic changes | — | None |

---

## Phase 9A — Module matrix (current)

| Module | UI | API | Real data? | Status |
|--------|----|-----|------------|--------|
| Dashboard | `DashboardPage` | `GET /admin/dashboard` (+ filters) | Yes | **IMPLEMENTED** |
| POS | `PosTerminal` | `/api/pos/*` | Yes | **INTEGRATED** |
| Branches | `BranchesPage` | `/admin/branches` | Yes | **IMPLEMENTED** |
| Catalog | `CatalogPage` | `/admin/products` | Yes | **IMPLEMENTED** |
| Inventory | `InventoryPage` | products + adjust | Yes | **IMPLEMENTED** |
| Orders | `OrdersPage` | `/admin/orders` + transitions | Yes | **IMPLEMENTED** |
| Customers | `CustomersPage` | customers + cashback-history | Yes (SoT) | **IMPLEMENTED** |
| Cashback | `CashbackPage` | SoT ledger/history | Yes | **IMPLEMENTED** |
| Payments | `PaymentsPage` | payments + intents | Yes | **IMPLEMENTED** |
| Promotions | `PromosPage` | `/admin/promos` | Yes (marketing) | **IMPLEMENTED** |
| Ratings | `RatingsPage` | `/admin/ratings` | Yes | **IMPLEMENTED** |
| Delivery | `DeliveryPage` | `/admin/deliveries` | Yes | **IMPLEMENTED** |
| Reports | `ReportsPage` | dashboard aggregates + filters | Yes (snapshot) | **PARTIAL** (deep API_REQUIRED) |
| Audit | `AuditPage` | `/admin/audit` | Yes | **IMPLEMENTED** |
| FOM | `FomPage` | fom/status | Yes (honest) | **INTEGRATED** |
| Settings / Admin users | `SettingsPage` + `AdminAccessPage` | `/cashback/rules`; `/admin/me` | Partial | **PARTIAL** |

---

## Phase 9 — Dashboard ops

| Item | Status | Notes |
|------|--------|-------|
| Date filter (today / yesterday / 7d / 30d / custom) | **IMPLEMENTED** | Server: `createdFrom`/`createdTo` Asia/Tashkent |
| Branch filter | **IMPLEMENTED** | Server: `branchId` + `resolveStaffBranchFilter` |
| Order KPIs scoped | **IMPLEMENTED** | revenue, orders, completed, delivering, reserved |
| Customers / cashback / branches counts | **IMPLEMENTED** | Global SoT snapshot (documented) |
| Inventory snapshot | **IMPLEMENTED** | Requires branch; Available≤0 factual — **no threshold policy** |
| Low-stock threshold rule | **MISSING** | Not invented |
| Recent orders + open detail | **IMPLEMENTED** | Customer identity; navigates to Orders |
| Recent POS | **PARTIAL** | `GET /pos/sales` when `pos:sales:read` |

### KPI authority (Phase 9E)

| KPI | Source | Date scope | Branch scope |
|-----|--------|------------|--------------|
| Savdo / completed / delivering / reserved / orders | `orders` aggregate | Yes | Yes |
| Mijozlar | `customers` count | Global | Global |
| Cashback | `sum(cashback_accounts.balance)` | Global | Global |
| Filiallar | `branches` count | Global | Global |
| Inventory list | `product_stocks` | N/A | Required branch |

---

## Phase 9N–O

| Item | Status |
|------|--------|
| Admin user CRUD | **ADMIN_USER_MANAGEMENT = API_REQUIRED** |
| Deep reports / CSV / charts | **API_REQUIRED / MISSING** |
| Reports operational snapshot (dashboard reuse) | **IMPLEMENTED** (12.20 honesty) |

---

## Remaining OPEN / CONTRACT_PENDING / DISABLED

| Item | Status |
|------|--------|
| Cashback correction workflow | **OPEN** |
| Secret encryption at rest | **OPEN** |
| PSP outbound refund | **CONTRACT_PENDING** |
| External delivery | **CONTRACT_PENDING** (12.43 re-verified) |
| FOM_POS | **CONTRACT_PENDING** |
| FOM inventory writer | **DISABLED** |
| Inventory low-stock threshold policy | **MISSING** (not invented) |
| Admin users / roles API | **API_REQUIRED** |
| Deeper FilterBar migration on every list page | **PARTIAL** (tokens applied; Orders/Cashback/Dashboard complete) |

---

## Safety

- No financial engine / 30% / FOM enable / inventory architecture changes  
- No unnecessary migrations  
- No git add/commit/push in Phase 12  
- Not claimed production-ready
