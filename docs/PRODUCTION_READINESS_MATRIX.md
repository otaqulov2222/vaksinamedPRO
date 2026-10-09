# PRODUCTION READINESS MATRIX

| Feature | Status | Source | Test | External Contract | Staging | Production | Blocker | Next Action | Priority |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Auth/OTP** | DONE | `sms.ts` | YES | Eskiz REST | YES | READY | None | Connect Real Eskiz | P1 |
| **Cashback Core** | DONE | `cashbackFinance.ts` | YES | N/A | YES | READY | None | Real PG test | P1 |
| **Cashback Expiry** | NOT IMPLEMENTED | Missing | NO | N/A | NO | NO | Missing worker logic | Implement expiry | P1 |
| **POS QR** | DONE | `pos.ts` / `qr.tsx` | YES | N/A | YES | READY | None | None | - |
| **Payment (Payme)** | PARTIAL | `paymeMerchantApi.ts`| YES | Webhook | NO | NO | Missing outbound | Sandbox testing | P1 |
| **Payment (Click)** | PARTIAL | `clickMerchantApi.ts`| YES | Webhook | NO | NO | Missing outbound | Sandbox testing | P1 |
| **F-Kassa** | NOT IMPLEMENTED | Missing | NO | NONE | NO | NO | Missing SDK/API | Clarify contract | P0 |
| **FOM Bridge** | PARTIAL | `fomBridge.ts` | YES | Mock | YES | NO | Inventory disabled | Clarify stock sync | P1 |
| **Yandex Maps** | DONE | `maps.ts` | YES | REST API | NO | NO | Missing Prod Key | Add Prod Key | P1 |
| **Yandex Delivery** | CONTRACT_PENDING| `deliveryAdapters` | YES | NONE | NO | NO | Adapter is mock | Finalize pricing | P0 |
| **Telegram TMA** | NOT IMPLEMENTED | Missing | NO | NONE | NO | NO | Missing Auth | Clarify scope | P2 |
| **Admin Panel** | PARTIAL | `admin-web/` | NO | N/A | YES | NO | Unwired UI | Connect APIs | P2 |
| **PostgreSQL** | PARTIAL | `lib/db/` | YES | N/A | NO | NO | Needs Real PG | Provision Hetzner DB| P0 |
| **Backups/DR** | NOT IMPLEMENTED | Missing | NO | N/A | NO | NO | Missing scripts | Write cron scripts | P1 |
