# INTEGRATION STATUS MATRIX

| Provider | Service | Status | Code Location | Missing / Pending |
| :--- | :--- | :--- | :--- | :--- |
| **Payme** | Payment Gateway | **SANDBOX READY** | `api-server/src/lib/paymeMerchantApi.ts` | Outbound Merchant API (invoice create), real sandbox E2E test, production credentials. |
| **Click** | Payment Gateway | **SANDBOX READY** | `api-server/src/lib/clickMerchantApi.ts` | Outbound Merchant API, Click Pass / Fiscal APIs, real sandbox E2E test. |
| **F-Kassa** | Fiscal/OFD | **NOT IMPLEMENTED** | N/A | Entire SDK / driver, fiscal receipt generation, refund mapping. |
| **FOM** | POS / Inventory | **PARTIAL** | `api-server/src/lib/fomBridge.ts` | Stock synchronization is explicitly disabled (CONTRACT_PENDING). |
| **Yandex Maps** | Geocoder | **STAGING READY** | `soglom-apteka/lib/maps.ts` | Production API key, rate limit monitoring. |
| **Yandex Delivery**| Courier Dispatch | **CONTRACT_PENDING** | `api-server/src/lib/deliveryAdapters.ts` | Provider authentication, quote flow, claim creation, tracking webhook. |
| **Eskiz** | SMS OTP | **STAGING READY** | `api-server/src/lib/sms.ts` | Real production credentials and fallback testing. |
| **Telegram** | Mini App | **NOT IMPLEMENTED** | N/A | `x-telegram-id` auth validation, customer linkage, deep links. |
| **Redis** | Cache / Rate Limit | **STAGING READY** | `api-server/src/lib/rateLimit.ts` | Hetzner managed Redis provisioning, failover testing. |
| **PostgreSQL** | Database | **DEV ONLY (PGlite)**| `lib/db/` | Real PostgreSQL deployment, PgBouncer, backup/restore testing, concurrency load test. |
