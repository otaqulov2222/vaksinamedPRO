# P12.1 — Pre-P13 Hardening Results

**Date context:** After P11/P12 readiness batch  
**Production PSPs:** DISABLED  
**FOM inventory writer:** OFF  

See also: `PHASE_3_3_P12_1_SECRETS_HMAC_FOLLOWUP.md`

## Delivered in this batch

1. TS7030 fixed via AST-safe `return` inserts — api-server typecheck PASS  
2. Non-prod backup restore drill (`pnpm backup:drill`) — PGlite logical PASS  
3. CI: required typecheck job + build/tests/migration/backup drill  
4. Cloud-neutral `Dockerfile` + `docker-compose.yml`  
5. Worker claim uses `FOR UPDATE SKIP LOCKED` + concurrency test  
6. Minimal `alerts.ts` structured alert codes (log sink)  
7. Sandbox E2E probe — PENDING without inventing success  
8. Secrets/HMAC follow-up documented (no risky migration / no blind HMAC close)
