# MASTER PHASE — FULL VAKSINAMED SYSTEM AUDIT
## PRODUCTION READINESS + COMPLETENESS + INTEGRATION + DEPLOYMENT AUDIT

**Date:** Current
**Status:** READ-ONLY AUDIT PHASE
**Target Infrastructure:** Hetzner Cloud

---

## PHASE 0 — REPOSITORY INVENTORY

*   **`artifacts/api-server/`**: The core Node.js/Fastify backend API.
    *   *Status*: Implemented. 1057/1057 tests PASS (with PGlite).
    *   *Role*: Authoritative business logic, financial ledger writer, order state machine.
    *   *Gaps*: Missing real external provider network verification, missing real PostgreSQL load testing, missing Hetzner deployment.
*   **`artifacts/soglom-apteka/`**: The Expo React Native mobile application.
    *   *Status*: Phase C.0 and B.0 UI polish applied and tested (107/107 tests PASS).
    *   *Role*: Customer-facing interface for catalog, map picker, POS QR, cashback history.
    *   *Gaps*: Deep links (TMA) not implemented, real maps API key testing required in staging.
*   **`artifacts/admin-web/`**: The React-based admin panel.
    *   *Status*: Scaffolded/Partial. Design system and initial routes exist.
    *   *Role*: HQ and Branch staff dashboard.
    *   *Gaps*: Many views lack backend integration; RBAC matrix only partially connected to UI.
*   **`lib/db/`**: The Drizzle ORM PostgreSQL schema and migrations.
    *   *Status*: Implemented and stable for core features.
    *   *Role*: Single source of truth for schema and migrations.
    *   *Gaps*: Missing `expires_at` column in `cashback_ledger` for 90-day expiry.
*   **Infrastructure (`Dockerfile`, `docker-compose.yml`)**:
    *   *Status*: Exists for local/dev use.
    *   *Role*: Defines container boundaries.
    *   *Gaps*: No production Helm charts, no Hetzner specific Terraform or cloud-init, no CI/CD pipelines defined.

---

## PHASE 1 — DOCUMENTATION / SPECIFICATION AUDIT

| Feature | Documented Requirement | Actual Code Status | Contradiction |
| :--- | :--- | :--- | :--- |
| Yandex Delivery | Active | `ExternalDeliveryAdapter` = `CONTRACT_PENDING` | Code blocks external calls. NOT READY. |
| Payme/Click | Integrated | Callbacks exist, Outbound `CONTRACT_PENDING` | Needs real sandbox verification. |
| Cashback | 90-day expiry | No worker, no DB column for expiry | MISSING. |
| FOM Stock Sync | Integrated | `FOM_INVENTORY_WRITER_ENABLED = false` | Explicitly disabled in code. |
| F-Kassa / OFD | Integrated | No code exists in `src/lib/` | NOT IMPLEMENTED. |

---

## PHASE 2 — COMPLETE BUSINESS FEATURE INVENTORY

| Feature | Status | Notes |
| :--- | :--- | :--- |
| Registration / Auth / OTP | **DONE** | Eskiz SMS implemented. Fallback to dev logs. |
| Profile & Localization | **DONE** | UZ/RU/EN persistent state fully active. |
| Catalog & Search | **PARTIAL** | Basic search exists, advanced filtering missing. |
| Cart & Checkout | **DONE** | Validates branch, stock, and delivery. |
| Map & Address Picker | **DONE** | Phase B.0 complete (Yandex Geocoder frontend). |
| Saved Addresses (Phase B.1) | **NOT IMPLEMENTED** | Schema/UI not yet built. |
| Order State Machine | **DONE** | Strict transitions enforced in `orderTransitions.ts`. |
| Payment | **PARTIAL** | Intents created, provider callbacks exist, waiting on provider sandbox testing. |
| Cashback & POS QR | **DONE** | UI polished (Phase C.0). 90s TTL active. |
| Cashback 90-day Expiry | **MISSING** | No worker logic exists. |

---

## PHASE 3 & 4 — MOBILE & ADMIN AUDIT

*   **Mobile App (`soglom-apteka`)**: Fully polished. Safe areas, responsive text (360/375/390), and multi-lingual UI (Phase C.0) are fully verified via tests and snapshots. Yandex Maps renders real maps and reverse geocodes coordinates to human addresses.
*   **Admin Panel (`admin-web`)**: Visually scaffolded but missing complete API wiring for complex reports, FOM reconciliation, and advanced POS dashboards.

---

## PHASE 5 & 6 — API & DATABASE AUDIT

*   **API (`api-server`)**: Strict modular design. All endpoints verified via tests. Rate Limiting implemented (Redis with Memory fallback). Security headers and CORS enforced.
*   **Database (`lib/db`)**:
    *   `cashback_accounts` / `cashback_ledger`: Rock solid append-only structure. Missing `expires_at`.
    *   `product_stocks` / `inventory_movements`: Acid transactions for reservations.
    *   `fom_sale_events`: Idempotent processing of external FOM receipts.

---

## PHASE 7 — CASHBACK / LOYALTY FINAL AUDIT

*   **Financial Engine**: `cashbackFinance.ts` enforces exactly ONE writer.
*   **30% Use Limit**: Enforced backend and clarified in UI (Phase C.0).
*   **No Negative Balances**: DB locks prevent overdrafts.
*   **Expiration**: **NOT IMPLEMENTED**. Business rule says 90 days, but no code executes this. (OPEN GAP).

---

## PHASE 8 & 9 — INVENTORY & ORDER STATE MACHINE

*   **Inventory**: Strict Reserve → Release or Consume. Tested with race conditions (PGlite limitations noted). FOM writer is DISABLED to prevent dual-authority corruption.
*   **Order States**: CREATED → CONFIRMED → PREPARING → OUT_FOR_DELIVERY → COMPLETED. State machine in `orderTransitions.ts` strictly rejects invalid transitions.

---

## PHASE 17 & 18 — SECURITY & RATE LIMITING

*   **Redis Rate Limiting**: Implemented (`rateLimit.ts`). Falls back to memory in DEV, fails closed in PROD.
*   **Adversarial Security**: Tested via `adversarial-order-security.test.ts`. Payments locked to intent amounts. Cancelled orders cannot be paid. Delivery requires house numbers.

---

## PHASE 19 & 20 — WORKERS

*   **Implemented Workers**: `expireDueReservations`, `expireUnpaidPayments`.
*   **Missing Workers**: `expireCashback`, FOM Sync Retry Dead-letter queue.

---

## PHASE 25 — HETZNER PRODUCTION ARCHITECTURE

### Minimum Staging (Hetzner)
*   **Server**: 1x CX22 (2 vCPU, 4GB RAM) or CPX21.
*   **Network**: Public IP + Docker Compose (DB, Redis, API).
*   **Storage**: Local SSD (20GB).

### Recommended Production (Hetzner)
*   **Load Balancer**: Hetzner Cloud LB + TLS Termination.
*   **App Nodes**: 2x CPX31 (4 vCPU, 8GB RAM).
*   **Database**: Hetzner Managed PostgreSQL (or 1x Dedicated Server with high-IOPS NVMe).
*   **Cache**: 1x CX22 for Redis.
*   **Backups**: Hetzner Storage Box for daily encrypted pg_dumps.

---

## PHASE 35 — FINAL MATURITY SCORE

*   Architecture: 4 (Tested)
*   Backend: 4 (Tested)
*   Mobile: 4 (Tested)
*   Security: 4 (Tested)
*   Cashback (Core): 4 (Tested)
*   Cashback (Expiry): 0 (Missing)
*   Database (Schema): 4 (Tested)
*   Database (Concurrency): 3 (PGlite tested, Real PG pending)
*   Payments: 2 (Partial, no real network test)
*   F-Kassa: 0 (Missing)
*   Yandex Maps: 3 (Implemented, needs prod key)
*   Yandex Delivery: 1 (Contract Pending)
*   Infrastructure: 1 (Concept/Docker only)

**Final Verdict**: NOT READY FOR STAGING
