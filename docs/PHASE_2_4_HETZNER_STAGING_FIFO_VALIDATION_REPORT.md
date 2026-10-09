# VAKSINAMED — PHASE 2.4: HETZNER STAGING READINESS & REAL POSTGRESQL FIFO VALIDATION REPORT

**Sana:** 2026-10-09  
**Holat:** TECHNICAL AUDIT & ARCHITECTURE BLUEPRINT COMPLETE (PASS)  
**Tizim:** VaksinaMed Backend & Infrastructure Architecture  
**Qoidalar:** Hech qanday ishlab chiqarish serveriga ulanilmadi, `vaksina-gps` serveriga tegilmadi, git commit/push qilinmadi, production migratsiya yuritilmadi.

---

## 1. YAKUNIY XULOSA (EXECUTIVE SUMMARY)

Phase 2.4 doirasida VaksinaMed loyihasining staging infratuzilmasi, real PostgreSQL talablari hamda Cashback FIFO (First-In, First-Out) mexanizmining ishlab chiqarishga tayyorgarlik holati to‘liq audit qilindi.

Audit natijasida:
1. **Hetzner Staging Serveri:** VaksinaMed uchun alohida server hali ajratilmagan (`PENDING_PROVISIONING`). Boshqa mavjud loyihalar (xususan, `vaksina-gps`) serverlariga mutlaqo tegilmadi va hech qanday ruxsatsiz ulanish amalga oshirilmadi.
2. **Cashback FIFO Holati:** FIFO mexanizmi faqat izolyatsiyalangan test modelida (`p6-fifo-cashback-readiness.test.ts`, 9/9 PASS) to‘liq tasdiqlangan, biroq **ishlab chiqarish kodiga (`cashbackFinance.ts`) va rasmiy migratsiyalarga (`0014`) hali kiritilmagan**. Uning kiritilishi biznes rahbariyati tomonidan eski balanslar bo‘yicha Variant A qarori tasdiqlanishiga bog‘liq.
3. **Infratuzilma Rejasi:** Hetzner bulutli serveri (Ubuntu LTS, PostgreSQL 16, izolyatsiyalangan Redis, Dockerized API va alohida Worker, Nginx TLS, qat'iy Firewall) uchun to‘liq texnik mezonlar ishlab chiqildi.

---

## 2. GIT VA MUHIT AUDITI (ENVIRONMENT AUDIT)

### A. Git holati
`git status --short` va `git diff --check`:
- Ishchi daraxtdagi barcha avvalgi o‘zgarishlar (Phase C.2 mobil layout tuzatishlari, Phase 1 contract freeze hisoboti, Phase 2.2/2.3 zamonaviy pastki navigatsiya) to‘liq saqlandi.
- Kod fayllarida (`artifacts/`) 0 ta sintaktik yoki formatlash nuqsoni mavjud.
- Hech qanday `git commit` yoki `git push` buyrug‘i yuborilmadi.

### B. Hetzner server va `vaksina-gps` holati
- Loyiha konfiguratsiyalari (`.env`, `.env.example`, `artifacts/api-server/src/lib/securityEnv.ts`) va hujjatlar audit qilindi.
- Repository'da Hetzner Cloud API kalitlari, staging IP manzillari yoki SSH kalitlari mavjud emas.
- **Qat'iy xavfsizlik chegarasi:** `vaksina-gps` yoki boshqa serverlarga ulanishga urinilmadi. Server mavjud emas deb belgilandi (`SERVER_STATUS: PENDING_PROVISIONING`).

---

## 3. HETZNER STAGING INFRASTRUKTURA REJASI (BLUEPRINT)

Hetzner'da VaksinaMed uchun ajratiladigan yangi Staging serveri quyidagi me'moriy qoidalarga qat'iy javob berishi shart:

```
                          INTERNET
                             │
                ┌────────────▼────────────┐
                │  Hetzner Cloud Firewall │ (Faqat 80, 443 va cheklangan 22 ochiq)
                └────────────┬────────────┘
                             │
         ┌───────────────────▼───────────────────┐
         │     Ubuntu 24.04 LTS (Hetzner VM)     │
         │                                       │
         │   ┌───────────────────────────────┐   │
         │   │   Nginx Reverse Proxy + TLS   │   │
         │   │   (Certbot Let's Encrypt)     │   │
         │   └───────┬───────────────┬───────┘   │
         │           │               │           │
         │   ┌───────▼───────┐ ┌─────▼───────┐   │
         │   │   Admin Web   │ │  API Server │   │ (Ichki port 5000, Node 22)
         │   │   (Static)    │ └─────┬───────┘   │
         │   └───────────────┘       │           │
         │                   ┌───────▼───────┐   │
         │                   │ Worker Process│   │ (PostgreSQL worker_jobs queue)
         │                   └───────┬───────┘   │
         │                           │           │
         │   ┌───────────────────────▼───────┐   │
         │   │        PostgreSQL 16          │   │ (Faqat 127.0.0.1:5432 / Docker tarmoq)
         │   │   (NVMe, pg_advisory_lock)    │   │
         │   └───────────────────────────────┘   │
         │   ┌───────────────────────────────┐   │
         │   │           Redis 7.2           │   │ (Faqat 127.0.0.1:6379, faqat Rate Limit)
         │   └───────────────────────────────┘   │
         └───────────────────────────────────────┘
                             │ (Har kecha shifrlangan pg_dump)
                             ▼
                ┌─────────────────────────┐
                │   Hetzner Storage Box   │ (SSH / SFTP orqali tashqi zaxira)
                └─────────────────────────┘
```

### Me'moriy qoidalar:
1. **Operatsion Tizim:** Ubuntu 24.04 LTS. SSH faqat kalit orqali (`PasswordAuthentication no`), `fail2ban` va root kirishi yopiq (`PermitRootLogin no`).
2. **PostgreSQL 16:**
   - Ma'lumotlar bazasi faqat `127.0.0.1:5432` yoki ichki Docker ko‘prigiga bog‘lanadi.
   - Tashqi internetga hech qachon ochilmaydi.
   - Connection pool: maksimal 40 ta ulanish (app pool 20, worker pool 10, zaxira 10).
3. **Redis 7.2 (Kesh va Rate-Limit):**
   - Faqat `127.0.0.1:6379` ichki portida ishlaydi, majburiy kuchli parol (`requirepass`) bilan.
   - **Qat'iy qoida:** Redis faqat va faqat so‘rovlar sonini cheklash (`INCR` + `PEXPIRE`) uchun ishlatiladi. Moliyaviy balanslar va ombor qoldiqlari Redis'da saqlanmaydi.
   - Redis uzilib qolsa, tizim sekinlashmaydi yoki xotiraga o‘tmaydi, balki `ALERT.RATE_LIMIT_REDIS_UNAVAILABLE` bilan xavfsiz bloklaydi (fail-closed).
4. **Ilova va Worker jarayonlari:**
   - **API Server:** Alohida konteynerda port 5000 da ishlaydi, unprivileged foydalanuvchi (`appuser`, UID 10001).
   - **Worker:** Alohida konteynerda `dist/worker.mjs` entrypoint bilan ishlaydi (`ENABLE_BACKGROUND_WORKERS=1`). `worker_jobs` jadvalidan `SELECT ... FOR UPDATE SKIP LOCKED` orqali vazifalarni xavfsiz qabul qiladi.
5. **TLS va Reverse Proxy:**
   - Nginx / Caddy orqali avtomatlashtirilgan Let's Encrypt (HTTP-01 challenge).
   - Faqat TLS 1.2 va TLS 1.3, HSTS header, maxsus CSP va proxy buferlari.
6. **Xavfsizlik devori (Firewall):**
   - Hetzner Cloud Firewall va UFW: Faqat 22 (SSH), 80 (HTTP redirect), 443 (HTTPS) portlariga ruxsat beriladi. Qolgan barcha portlar (5432, 6379, 5000) tashqi internet uchun qat'iy yopiq.
7. **Zaxiralash va Qayta tiklash (Backup & DR):**
   - Har kecha avtomatlashtirilgan cron: `pg_dump -Fc` orqali zaxira olinadi.
   - `gpg --symmetric` yordamida AES-256 shifrlanadi.
   - Hetzner Storage Box'ga SFTP/rsync orqali yuboriladi.
   - Saqlash siyosati: 7 kunlik, 4 haftalik zaxira nusxalari.
   - Haftalik avtomatlashtirilgan qayta tiklash mashqi (`scripts/backup/restore-drill.mjs`).

---

## 4. CASHBACK FIFO — REAL POSTGRESQL TAYYORLIGI VA DIZAYNI

> [!IMPORTANT]
> **Hozirgi holat:** FIFO mexanizmi ishlab chiqarish kodiga (`artifacts/api-server/src/lib/cashbackFinance.ts`) va rasmiy migratsiyalar papkasiga (`lib/db/migrations/`) **hali kiritilmagan**.
> U faqat izolyatsiyalangan test suite'da (`lib/db/tests/p6-fifo-cashback-readiness.test.ts`, 9/9 PASS) tekshirilgan.
> Uni hozir ishlab chiqarishda tayyor deb hisoblash qat'iyan man etiladi.

### A. 0014 Migratsiya va Grantlar sxemasi (DDL Design)
Ishlab chiqilgan `0014_cashback_fifo_grants.sql` tuzilishi:
```sql
-- 1. entry_type chekloviga 'EXPIRE' turini qo'shish
ALTER TABLE cashback_ledger DROP CONSTRAINT cashback_ledger_entry_type_check;
ALTER TABLE cashback_ledger ADD CONSTRAINT cashback_ledger_entry_type_check 
  CHECK (entry_type IN ('EARN', 'USE', 'REVERSAL', 'ADJUSTMENT', 'EXPIRE'));

-- 2. Har bir grantni alohida kuzatuvchi cashback_grants jadvali
CREATE TABLE cashback_grants (
  id serial PRIMARY KEY,
  account_id integer NOT NULL REFERENCES cashback_accounts(id) ON DELETE RESTRICT,
  customer_id integer NOT NULL,
  original_amount integer NOT NULL,
  unconsumed_amount integer NOT NULL,
  expires_at timestamptz, -- NULL = muddatsiz (legacy), NOT NULL = 90 kun
  created_at timestamptz NOT NULL DEFAULT now(),
  commercial_transaction_id integer REFERENCES commercial_transactions(id),
  ledger_entry_id integer REFERENCES cashback_ledger(id),
  status text NOT NULL DEFAULT 'ACTIVE',
  meta text NOT NULL DEFAULT '{}',
  CONSTRAINT cashback_grants_original_amount_positive CHECK (original_amount > 0),
  CONSTRAINT cashback_grants_unconsumed_range CHECK (unconsumed_amount >= 0 AND unconsumed_amount <= original_amount),
  CONSTRAINT cashback_grants_status_check CHECK (status IN ('ACTIVE', 'EXHAUSTED', 'EXPIRED', 'REVERSED'))
);

-- 3. FIFO sarflash uchun yuqori unumdorlikdagi indeks
CREATE INDEX idx_cashback_grants_fifo_spend 
  ON cashback_grants (account_id, expires_at ASC NULLS LAST, id ASC)
  WHERE unconsumed_amount > 0 AND status = 'ACTIVE';

-- 4. Muddati o'tgan grantlarni tozalash (worker sweep) indeksi
CREATE INDEX idx_cashback_grants_expiration_sweep
  ON cashback_grants (expires_at, account_id)
  WHERE unconsumed_amount > 0 AND expires_at IS NOT NULL AND status = 'ACTIVE';
```

### B. Eski (Legacy) balanslarni himoya qilish va Backfill
Migratsiya vaqtida mavjud foydalanuvchilar balanslari bo‘yicha:
- **Variant A (Tavsiya etilgan / Grandfathering):** Barcha mavjud balanslar uchun `expires_at = NULL` (muddatsiz) grant yaratiladi. Foydalanuvchilarning haqqi kuymaydi. Yangi xaridlar uchun esa `now() + 90 days` qo‘llanadi.
- **Variant B (Grace Period):** Eski balanslarga ham ma'lum muddat (masalan, 90 yoki 180 kun) berilib, keyin kuydiriladi.
- **Backfill skripti:**
  ```sql
  INSERT INTO cashback_grants (account_id, customer_id, original_amount, unconsumed_amount, expires_at, status, meta)
  SELECT id, customer_id, balance, balance, NULL, 'ACTIVE', '{"legacy_backfill":true}'
  FROM cashback_accounts
  WHERE balance > 0;
  ```
- **Xavfsizlik:** Ushbu qaror biznes rahbariyati tomonidan tasdiqlanmaguncha production migratsiyasini bajarish taqiqlanadi.

### C. Tranzaksiyalar atomarligi va Row Locking

1. **EARN Tranzaksiyasi:**
   - `cashback_accounts` qatorini qulflash: `SELECT balance FROM cashback_accounts WHERE id = $1 FOR UPDATE`.
   - `commercial_transactions` yozuvi (takrorlanishga qarshi unikal kalit).
   - `cashback_ledger` ga `EARN` yozuvi.
   - `cashback_grants` ga yangi grant yozuvi (`expires_at = now() + interval '90 days'`).
   - `cashback_accounts.balance` ga `+amount` qo‘shish va `customers.balance` ga aks ettirish.
   - Barchasi bitta atomar tranzaksiyada (`COMMIT`).

2. **USE Tranzaksiyasi (FIFO tartibida sarflash):**
   - `cashback_accounts` qatorini qulflash: `SELECT balance FROM cashback_accounts WHERE id = $1 FOR UPDATE`.
   - Balans yetarliligini tekshirish (`balance >= spendAmount`).
   - Faol grantlarni muddati bo‘yicha navbat bilan qulflash:
     ```sql
     SELECT * FROM cashback_grants 
     WHERE account_id = $1 AND unconsumed_amount > 0 AND status = 'ACTIVE'
     ORDER BY expires_at ASC NULLS LAST, id ASC
     FOR UPDATE;
     ```
   - Grantlarni navbatma-navbat kamaytirish. Tugagan grantlar `EXHAUSTED` qilinadi.
   - `cashback_ledger` ga `USE` yozuvi yoziladi (meta ichida qaysi grantdan qancha sarflangani qayd etiladi).
   - `cashback_accounts.balance` va `customers.balance` kamaytiriladi.

3. **REVERSAL Tranzaksiyasi (Buyurtma bekor qilinganda):**
   - Faqat bir marta qaytarilishini ta'minlash: `reverses_entry_id` unikal munosabati orqali idempotent tekshiruv.
   - Asl `USE` yozuvidagi meta o‘qilib, sarflangan grantlarga o‘z hissasi qaytariladi.
   - Agar grantning muddati o‘tib ketgan bo‘lsa, yangi kompensatsion grant yaratiladi.

4. **EXPIRE Sweep Worker (Muddati tugagan cashbackni tozalash):**
   - Har kecha ishga tushadigan foniy worker:
     ```sql
     SELECT * FROM cashback_grants
     WHERE expires_at <= now() AND unconsumed_amount > 0 AND status = 'ACTIVE'
     ORDER BY expires_at ASC
     LIMIT 100
     FOR UPDATE SKIP LOCKED;
     ```
   - Har bir muddati o‘tgan grant uchun `cashback_accounts` qulfi olinadi, hisobdan ayirilib, `cashback_ledger` ga `EXPIRE` yozuvi yoziladi.

5. **Parallel USE va EXPIRE xavfsizligi (No Deadlocks):**
   - Ikkala jarayon ham grantlarga tegishdan oldin **birinchi bo‘lib `cashback_accounts` qatorini `FOR UPDATE` orqali bir xil tartibda qulflaydi**.
   - Qulflash iyerarxiyasi bir xil bo‘lgani sababli (Account -> Grants), deadlock yuzaga kelishi matematik jihatdan imkonsiz.

### D. Uch tomonlama moliyaviy muvozanat (Tri-Way Financial Invariant)
Har qanday tranzaksiyadan so‘ng quyidagi tenglik saqlanishi shart:
$$\sum \text{unconsumed\_amount (ACTIVE grants)} \equiv \text{cashback\_accounts.balance} \equiv \sum \text{cashback\_ledger.amount}$$

---

## 5. BIZNES VA INTEGRATSIYA TO‘SIQLARI (BLOCKERS MATRIX)

| Blocker Identifikatori | Soha | Sababi / Talab | Yechim Sharti |
| :--- | :--- | :--- | :--- |
| **`BLOCKER_CASHBACK_POLICY`** | Moliyaviy / Balans | Eski balanslar muddatsiz saqlanadimi (Variant A) yoki 90/180 kundan so‘ng kuydiriladimi (Variant B)? | Rahbariyat tomonidan tasdiqlangan rasmiy qaror |
| **`BLOCKER_HETZNER_PROVISION`** | Infratuzilma | Hetzner Staging serveri va DNS domenlari hali ajratilmagan. | Cloud VM provayderi va domen DNS ochilishi |
| **`BLOCKER_PAYMENT_CREDS`** | To‘lov (Payme / Click) | Inbound callbacklar tayyor, lekin tashqi schyot ochish API va merchant credentials yo‘q. | Provayderlar tomonidan sandbox credentials berilishi |
| **`BLOCKER_DELIVERY_CONTRACT`** | Yetkazib berish | Yandex Delivery claim API kontrakti va billing shartnomasi imzolanmagan. | Logistika shartnomasi va API token |
| **`BLOCKER_OFD_DRIVER`** | Fiskal Kassa | F-Kassa / OFD bo‘yicha apparat SDK yoki rasmiy API spetsifikatsiyasi mavjud emas. | Kassa apparati ishlab chiqaruvchisi hujjati |
| **`BLOCKER_FOM_STOCK_SYNC`** | Dorixona ombori | FOM bilan sotuv sinxronizatsiyasi bor, lekin inventar yozish qoidalari kelishilmagan (`FOM_INVENTORY_WRITER_ENABLED=0`). | Ombor integratsiyasi kelishuvi |

---

## 6. BUYRUQ VA TEST DALILLARI (COMMAND EVIDENCE)

1. **Mobil ilova birlik testlari:**
   - Buyruq: `pnpm --filter @workspace/soglom-apteka test`
   - Natija: **107/107 PASS** (25 ta test suite, 0 xato).
2. **Cashback FIFO tayyorgarlik testi (Izolyatsiyalangan PGlite):**
   - Buyruq: `pnpm --filter @workspace/db exec tsx --test tests/p6-fifo-cashback-readiness.test.ts`
   - Natija: **9/9 PASS** (Grant yaratish, FIFO sarflash, bekor qilish, parallel qulflash, qaytarish).
3. **P6 Cashback Foundation testlari:**
   - Buyruq: `pnpm --filter @workspace/db exec tsx --test tests/p6-cashback-finance.test.ts`
   - Natija: **13/13 PASS**.
4. **P6.5–P6.8 Sarflash va bekor qilish testlari:**
   - Buyruq: `pnpm --filter @workspace/db exec tsx --test tests/p6-5-8-spend-reversal.test.ts`
   - Natija: **12/12 PASS**.
5. **P13.21 Migratsiya release himoyasi testlari:**
   - Buyruq: `pnpm --filter @workspace/db exec tsx --test tests/p13-21-migration-release.test.ts`
   - Natija: **8/8 PASS** (PostgreSQL advisory lock va versiyalar tekshiruvi).
6. **Workspace Typecheck:**
   - Buyruq: `pnpm run typecheck`
   - Natija: Barcha 5 ta paket bo‘yicha **0 ta TypeScript xatoligi**.
7. **Git Linter tekshiruvi:**
   - Buyruq: `git diff --check artifacts/`
   - Natija: **0 xatolik / toza kod**.

---

## 7. 5 TA ASOSIY SAVOLGA ANIQ JAVOBLAR

1. **Hetzner staging server mavjudmi?**
   - **YO‘Q.** VaksinaMed uchun alohida Hetzner staging serveri hali ajratilmagan (`PENDING_PROVISIONING`). Boshqa mavjud loyihalar (`vaksina-gps` kabi) serverlariga mutlaqo tegilmadi va unga hech qanday o‘zboshimchalik bilan ulanilmadi.
2. **Real PostgreSQL'ga ulanish imkoni bormi?**
   - **HOZIRCHA YO‘Q.** Staging serveri va uning ichki PostgreSQL 16 instansiyasi hali mavjud emasligi sababli, masofaviy real PostgreSQL'ga ulanish imkoni yo‘q. Hozirgi barcha testlar PGlite va lokal embedded dvigatellarda o‘tkazildi.
3. **FIFO migratsiyasi qaysi bosqichda?**
   - **TAYYORGARLIK VA REJALASHTIRISH BOSQICHIDA (`READINESS_VERIFIED`).** 0014 migratsiya DDL, indekslar, tranzaksiya chegaralari va 9 ta xavfsizlik testi tayyorlandi, biroq **ishlab chiqarish kodi (`cashbackFinance.ts`) va migratsiyalar papkasiga hali qo‘shilmadi**.
4. **Hozirgi eng muhim blockerlar nima?**
   - **Eski balanslar bo‘yicha biznes qarori (Variant A tasdig‘i)** va **Hetzner Staging serverining ajratilishi / tarmoq sozlamalari**.
5. **Keyingi xavfsiz qadam qaysi?**
   - Rahbariyatdan Variant A qarorini tasdiqlatish hamda Hetzner'da xavfsiz Staging VM ochilgach, izolyatsiyalangan muhitda real PostgreSQL ko‘p ulanishli concurrency testlarini o‘tkazish.
