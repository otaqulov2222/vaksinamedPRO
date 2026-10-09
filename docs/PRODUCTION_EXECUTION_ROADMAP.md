# PRODUCTION EXECUTION ROADMAP
**Path to Hetzner Production**

## PHASE 1: EXTERNAL CONTRACT FREEZE (P0)
**Objective**: Unblock all CONTRACT_PENDING dependencies.
*   **Tasks**:
    *   Finalize Yandex Delivery pricing and API contract.
    *   Finalize F-Kassa / OFD hardware/software integration path.
    *   Clarify FOM stock synchronization rules (enable or discard).
*   **Exit Criteria**: All technical contracts documented and signed off.

## PHASE 2: CORE LOGIC COMPLETION (P1)
**Objective**: Finish missing backend and UI features.
*   **Tasks**:
    *   Implement 90-day Cashback expiration worker and DB column (`expires_at`).
    *   Implement Payme/Click outbound invoice creation (Merchant API).
    *   Wire Admin Panel UI to existing backend APIs.
*   **Exit Criteria**: Feature freeze. No `NOT_IMPLEMENTED` core features.

## PHASE 3: STAGING INFRASTRUCTURE (HETZNER) (P1)
**Objective**: Deploy the system to a real cloud environment.
*   **Tasks**:
    *   Provision Hetzner CX22 server.
    *   Install Docker, Docker Compose, Nginx (Reverse Proxy), Certbot.
    *   Provision real PostgreSQL instance (not PGlite) and Redis.
    *   Configure CI/CD to deploy to staging.
*   **Exit Criteria**: API, Mobile (Dev build), and Admin panel accessible via public staging URLs.

## PHASE 4: SANDBOX & CONCURRENCY VERIFICATION (P1)
**Objective**: Prove the system works under real network conditions.
*   **Tasks**:
    *   Connect Payme/Click Sandbox credentials. Verify end-to-end checkout.
    *   Connect Eskiz SMS. Verify delivery.
    *   Run high-concurrency order/cashback load tests against the real PostgreSQL staging DB to verify `SELECT ... FOR UPDATE` row locks.
*   **Exit Criteria**: Zero deadlocks, successful sandbox payments.

## PHASE 5: SECURITY, BACKUP & DR (P2)
**Objective**: Ensure the system is safe for real customer data.
*   **Tasks**:
    *   Implement automated daily `pg_dump` to Hetzner Storage Box.
    *   Perform a manual restore drill (RTO/RPO verification).
    *   Audit TLS, CORS, and Secret injection (no `.env` committed).
*   **Exit Criteria**: Backups verified, Security checklist passed.

## PHASE 6: PRODUCTION CUTOVER (P2)
**Objective**: Launch the live system.
*   **Tasks**:
    *   Provision Production Hetzner servers (App node + Managed DB).
    *   Inject live credentials (Payme, Click, Eskiz, Yandex).
    *   Run DB Migrations on Production.
    *   Seed initial branches and admin users.
    *   Publish Mobile App to App Store / Google Play.
*   **Exit Criteria**: Live traffic accepted.

## PHASE 7: PILOT & SCALE (P3)
**Objective**: Monitor and stabilize.
*   **Tasks**:
    *   Rollout to 1-3 branches initially.
    *   Monitor logs, database CPU, and memory.
*   **Exit Criteria**: Stable operation at pilot branches.
