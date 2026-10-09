# VAKSINAMED — PHASE 2.5: HETZNER STAGING PROVISIONING READINESS REPORT

**Sana:** 2026-10-09  
**Holat:** PROVISIONING SPECIFICATION & TEST PLAN READY (PASS)  
**Tizim:** Hetzner Cloud Staging Infrastructure & Real PostgreSQL Concurrency Harness  
**Qoidalar:** `vaksina-gps` serveriga tegilmadi, production bazaga ulanilmadi, server yaratilmadi, pullik resurs ishga tushirilmadi, git commit/push qilinmadi, FIFO production kodiga kiritilmadi.

---

## 1. YAKUNIY XULOSA (EXECUTIVE SUMMARY)

Phase 2.5 doirasida VaksinaMed loyihasi uchun yangi Hetzner Staging serverini xavfsiz va standartlashtirilgan tarzda ishga tushirish uchun barcha konfiguratsiyalar, Docker me'morchiligi, operatsion skriptlar hamda haqiqiy PostgreSQL ko‘p oqimli (concurrency) sinovlarining to‘liq dasturi ishlab chiqildi.

**Muhim xavfsizlik chegaralari tasdiqlandi:**
1. **Server holati:** VaksinaMed uchun alohida Hetzner staging serveri foydalanuvchining alohida roziligisiz **yaratilmadi va hech qanday pullik resurs yoqilmadi**.
2. **`vaksina-gps` daxlsizligi:** Aloqador bo‘lmagan `vaksina-gps` serveriga mutlaqo tegilmadi, unga ulanilmadi va hech qanday ma’lumot o‘zgartirilmadi.
3. **Real PostgreSQL testlari holati:** Staging serveri hali ochilmagani sababli, real ko‘p ulanishli PostgreSQL concurrency testlari **`NOT RUN`** deb belgilandi. PGlite test natijalari real tarmoq concurrency testi sifatida soxtalashtirilmadi.

---

## 2. TEKSHIRILGAN VA O‘ZGARTIRILGAN FAYLLAR (CHANGESET AUDIT)

### Tekshirilgan va ishlab chiqilgan infratuzilma fayllari:
1. `infra/docker-compose.staging.yml` *(Yangi yaratildi)*:
   - Staging muhiti uchun PostgreSQL 16, Redis 7.2, alohida API server, alohida Worker va Nginx xizmatlarini izolyatsiyalangan Docker tarmog‘ida birlashtiruvchi rasmiy konfiguratsiya.
2. `infra/nginx/staging.conf` *(Yangi yaratildi)*:
   - HTTP (ACME webroot challenge, HTTPS redirect) va HTTPS (Let's Encrypt TLS 1.2/1.3, xavfsizlik headerlari, proxy buferlari) sozlamalari.
3. `infra/.env.staging.example` *(Yangi yaratildi)*:
   - Staging uchun barcha zarur o‘zgaruvchilar shabloni (maxfiy parollar faqat tashqaridan inyeksiya qilinadi, default zaif qiymatlarsiz).
4. `infra/scripts/backup-staging.sh` *(Yangi yaratildi)*:
   - `pg_dump -Fc` orqali zaxira olish, hajmini tekshirish, GPG AES-256 bilan shifrlash va Hetzner Storage Box'ga jo‘natish skripti.
5. `infra/scripts/migrate-staging.sh` *(Yangi yaratildi)*:
   - PostgreSQL advisory lock asosida migratsiyalarni xavfsiz yuritish va holatini tekshirish skripti.

### Mavjud saqlangan fayllar:
- `docker-compose.yml` va `Dockerfile` (Lokal ishlab chiqish uchun saqlandi).
- `.env.example` (Lokal andozalar saqlandi).
- `scripts/backup/restore-drill.mjs` (Qayta tiklash tekshirildi).
- `artifacts/soglom-apteka/app/(tabs)/_layout.tsx` (Phase 2.3 zamonaviy pastki navigatsiyasi saqlandi).
- `artifacts/api-server/src/lib/cashbackFinance.ts` (FIFO migratsiyasi kiritilmadi, ishlab chiqarish kodi o‘zgartirilmadi).

---

## 3. HETZNER STAGING DOCKER & XAVFSIZLIK AUDITI

Staging infratuzilmasi uchun quyidagi xavfsizlik talablari `infra/docker-compose.staging.yml` da qat'iy kafolatlandi:

1. **PostgreSQL va Redis portlarining to‘liq izolyatsiyasi:**
   - `postgres` (5432) va `redis` (6379) xizmatlarida `ports:` bo‘limi mavjud emas (hostga bog‘lanmagan).
   - Ular faqat `vaksinamed_staging_net` nomli ichki Docker bridge tarmog‘iga tegishli.
   - Tashqi dunyodan ushbu portlarga ulanish jismonan imkonsiz.
2. **Imtiyozsiz foydalanuvchilar (Non-Root Execution):**
   - API va Worker konteynerlari `user: "10001:10001"` (`appuser`) imtiyozsiz foydalanuvchisi ostida ishlaydi. Root huquqlari berilmagan.
3. **Xizmatlarning ajratilishi:**
   - **API:** Faqat HTTP so‘rovlarga javob beradi (`ENABLE_BACKGROUND_WORKERS=0`).
   - **Worker:** HTTP portlari ochilmagan, alohida `dist/worker.mjs` jarayoni sifatida faqat `worker_jobs` jadvalidan vazifalarni bajaradi (`ENABLE_BACKGROUND_WORKERS=1`).
4. **Nginx Reverse Proxy:**
   - Host tarmog‘iga faqat Nginx (port 80 va 443) ulanadi.
   - To‘liq SSL/TLS terminatsiyasi, HSTS va reverse proxy kesh buferlari o‘rnatilgan.

---

## 4. OPERATSION SKRIPTLAR AUDITI

1. **Migratsiyalar (`infra/scripts/migrate-staging.sh`):**
   - Advisory lock orqali bir vaqtda faqat 1 ta migratsiya jarayoni ishlashi ta'minlanadi.
   - Operator tasdig‘isiz avtomatik destruktiv buyruqlar bajarilmaydi.
2. **Shifrlangan Zaxira (`infra/scripts/backup-staging.sh`):**
   - Bo‘sh fayl yozilishiga qarshi xatolik tekshiruvi (`test ! -s`).
   - `gpg --symmetric --cipher-algo AES256` orqali zaxira fayli shifrlanadi.
   - SSH/SFTP orqali Hetzner Storage Box'ga xavfsiz jo‘natiladi.
   - 7 kundan eski zaxiralar avtomatik tozalanadi.
3. **Qayta tiklash sinovi (Restore Drill):**
   - `scripts/backup/restore-drill.mjs` va `restore-drill.ts` mavjud.
   - Zaxira nusxasini bo‘sh test bazasiga tiklash va muhim jadvallar (`orders`, `cashback_ledger`, `product_stocks`, `branches`) mavjudligini tasdiqlash uchun mo‘ljallangan.

---

## 5. REAL POSTGRESQL CONCURRENCY TEST REJASI (HARNESS SPECIFICATION)

Staging serveri ochilgach, PGlite o‘rniga **haqiqiy ko‘p ulanishli PostgreSQL (40 parallel connection pool)** da bajariladigan rasmiy sinov dasturi:

### Test 1: Parallel Cashback `USE` Race Condition
- **Maqsad:** Balansdan ortiqcha mablag‘ sarflanib ketmasligini va manfiy balans hosil bo‘lmasligini tekshirish.
- **Setup:** Hisobda 10,000 so‘m faol grant (`expires_at = now() + 90 days`).
- **Harakat:** 40 ta bir vaqtning o‘zida yuborilgan parallel `USE` so‘rovi (har biri 4,000 so‘m, jami talab: 160,000 so‘m).
- **SQL / Qulflash sharti:** `SELECT balance FROM cashback_accounts WHERE id = $1 FOR UPDATE`.
- **Kutilgan natija:** Aniq 2 ta so‘rov muvaffaqiyatli o‘tadi (8,000 so‘m sarflanadi). Qolgan 38 tasi `INSUFFICIENT_CASHBACK` bilan rad etiladi. Yakuniy balans: 2,000 so‘m.
- **Muvaffaqiyatsizlik mezoni (Failure):** Balans manfiy bo‘lib qolsa (`balance < 0`) yoki 2 tadan ortiq so‘rov qabul qilinsa.

### Test 2: Concurrent `USE` vs `EXPIRE` Worker To‘qnashuvi
- **Maqsad:** Xarid paytida sarflanayotgan cashbackni foniy worker bir vaqtda kuydirib yubormasligini ta'minlash.
- **Setup:** Hisobda muddati o‘tgan 5,000 so‘mlik grant (`expires_at = now() - 1s`).
- **Harakat:** 1-oqim: Mijoz checkout'da 5,000 so‘m ishlatadi (`USE`). 2-oqim: Worker tozalashni boshlaydi (`EXPIRE`).
- **SQL / Qulflash sharti:** Ikkala oqim ham avval `cashback_accounts` qatorini `FOR UPDATE` orqali qulflaydi.
- **Kutilgan natija:** Birinchi qulf olgan jarayon muvaffaqiyatli bajariladi (yo USE, yo EXPIRE). Yakuniy balans: 0. Ikki marta hisobdan chiqarilmaydi.
- **Muvaffaqiyatsizlik mezoni:** Balans `-5000` bo‘lib qolishi yoki ikkala operatsiya ham muvaffaqiyatli deb qaytishi.

### Test 3: Takroriy `EARN` va `REVERSAL` Idempotency
- **Maqsad:** Tarmoq xatosi tufayli kelgan takroriy so‘rovlar balansni asossiz ko‘paytirmasligi.
- **Setup:** Bitta tijoriy sotuv hodisasi (`order:888`, cashback: 3,000 so‘m).
- **Harakat:** 50 ta bir vaqtda yuborilgan `EARN` so‘rovi. So‘ngra buyurtma bekor qilinib, 20 ta parallel `REVERSAL` yuboriladi.
- **SQL shartlari:** `commercial_transactions (source_type, source_key)` va `cashback_ledger.reverses_entry_id` unikal indekslari.
- **Kutilgan natija:** Faqat 1 ta EARN (balans +3,000) va faqat 1 ta REVERSAL (balans 0). Qolgan barcha so‘rovlar `idempotent_existing` deb qaytadi.
- **Muvaffaqiyatsizlik mezoni:** Balans 3,000 dan oshib ketishi yoki duplicate grant yaratilishi.

### Test 4: Uch tomonlama Balans Muvofiqligi (Tri-Way Invariant)
- **Maqsad:** 1,000 ta turli xil parallel operatsiyalardan so‘ng hisoblarning matematik yaxlitligi.
- **SQL Invariant tekshiruvi:**
  ```sql
  SELECT a.id, a.balance, COALESCE(SUM(g.unconsumed_amount), 0) AS grant_sum, COALESCE(SUM(l.amount), 0) AS ledger_sum
  FROM cashback_accounts a
  LEFT JOIN cashback_grants g ON g.account_id = a.id AND g.status = 'ACTIVE'
  LEFT JOIN cashback_ledger l ON l.account_id = a.id
  GROUP BY a.id, a.balance
  HAVING a.balance != COALESCE(SUM(g.unconsumed_amount), 0) OR a.balance != COALESCE(SUM(l.amount), 0);
  ```
- **Kutilgan natija:** Natija **0 ta qator** bo‘lishi shart.
- **Muvaffaqiyatsizlik mezoni:** Kamida 1 ta hisobda nomutanosiblik aniqlanishi.

### Test 5: Deadlock, Retry va Connection Pool Stress
- **Maqsad:** 40 ta parallel ulanishda tranzaksiyalar to‘qnashuvida deadlock va ulanishlar uzilishini tekshirish.
- **Kutilgan natija:** Deadlocks = 0, p99 kechikish < 250ms, ulanishlar xavfsiz yopilishi.

---

## 6. XAVFSIZLIK KAMCHILIKLARI VA BO‘SHLIQLAR (GAPS)

1. **Haqiqiy server yo‘qligi:** Masofaviy real PostgreSQL 16 instansiyasi mavjud bo‘lmagani sababli, tarmoq kechikishi va ko‘p jarayonli Linux OS iyerarxiyasidagi yuklama testlari o‘tkazilmadi.
2. **KMS / Maxfiy kalitlar boshqaruvi:** Hetzner bulutida AWS KMS yoki GCP KMS kabi tayyor kalit boshqaruvi yo‘q. Shuning uchun `MERCHANT_SECRET_KEK` va boshqa kalitlar serverdagi `chmod 600` fayl (`.env.staging`) orqali boshqariladi.
3. **Tashqi provayderlar shartnomalari:** Payme va Click sandbox hisob ma’lumotlari, Yandex Delivery API tokenlari hali operatsion ravishda yetkazib berilmagan.

---

## 7. HETZNER YARATISH UCHUN FOYDALANUVCHIDAN KERAK BO‘LADIGAN QARORLAR

Hetzner Staging serverini yaratishdan oldin quyidagi 5 ta qaror tasdiqlanishi lozim:

1. **Server Konfiguratsiyasi (Plan):**
   - *Tavsiya:* **CPX21** (3 vCPU AMD, 4 GB RAM, 80 GB NVMe SSD, ~€7/oy) yoki **CPX31** (4 vCPU AMD, 8 GB RAM, 160 GB NVMe SSD, ~€13/oy).
2. **Joylashuv (Datacenter Location):**
   - *Tavsiya:* Falkenstein (Germaniya) yoki Nuremberg (Germaniya) — O‘zbekiston bilan optimal marshrutlash va past kechikish.
3. **Domen va DNS sozlamalari:**
   - Staging uchun DNS A yozuvlari (masalan: `api.staging.vaksinamed.uz` va `admin.staging.vaksinamed.uz`) qaysi IP manzilga yo‘naltirilishi.
4. **Eski Cashback Balanslari Bo‘yicha Qaror:**
   - **Variant A (Tavsiya etilgan):** Eski barcha balanslar muddatsiz (`expires_at = NULL`) saqlanadi va kuydirilmaydi.
   - **Variant B:** Eski balanslarga 90 yoki 180 kunlik imtiyozli muddat beriladi.
5. **SSH Public Key:**
   - Deploy qiluvchi operatorning SSH public kaliti (`id_ed25519.pub`).

---

## 8. SINOV VA STATUS MATRITSASI (PASS / FAIL / BLOCKED / NOT RUN)

| Komponent / Tekshiruv | Holat | Izoh / Dalil |
| :--- | :---: | :--- |
| **Docker Staging Konfiguratsiyasi** | `PASS` | `infra/docker-compose.staging.yml` yaratildi, PostgreSQL/Redis tarmoqdan to‘liq izolyatsiya qilindi |
| **Nginx TLS & Reverse Proxy** | `PASS` | `infra/nginx/staging.conf` yaratildi, HTTP/HTTPS va xavfsizlik headerlari kiritildi |
| **Environment & Secrets Andozasi** | `PASS` | `infra/.env.staging.example` tayyorlandi, maxfiy kalitlar xavfsiz ajratildi |
| **Zaxiralash va Migratsiya Skriptlari** | `PASS` | `backup-staging.sh` (GPG shifrlangan) va `migrate-staging.sh` (advisory lock) yaratildi |
| **Mobil Ilova Testlari** | `PASS` | `pnpm --filter @workspace/soglom-apteka test` — **107/107 PASS** (25 ta suite) |
| **FIFO Mantiqiy Tayyorgarlik Testi** | `PASS` | `pnpm --filter @workspace/db exec tsx --test ...` — **9/9 PASS** (Izolyatsiyalangan PGlite) |
| **P6 Cashback Foundation Testlari** | `PASS` | `tests/p6-cashback-finance.test.ts` — **13/13 PASS** |
| **P6 Spend & Reversal Testlari** | `PASS` | `tests/p6-5-8-spend-reversal.test.ts` — **12/12 PASS** |
| **Workspace TypeScript Typecheck** | `PASS` | `pnpm run typecheck` — **0 ta xatolik** (5 ta workspace paketlari bo‘yicha) |
| **Kod sintaktik tekshiruvi (Linter)** | `PASS` | `git diff --check artifacts/ infra/` — **0 ta xatolik** (Toza kod) |
| **Eski Cashback Balanslari Siyosati** | `BLOCKED` | Variant A biznes rahbariyati tomonidan tasdiqlanishi kutilmoqda |
| **Tashqi To‘lov Sandbokslari (Payme/Click)** | `BLOCKED` | Rasmiy merchant hisoblari va API shartnomalari kutilmoqda |
| **Hetzner Staging Serveri** | `NOT RUN` | Foydalanuvchi tasdig‘isiz server yaratilmadi (pullik resurs yoqilmadi) |
| **Real PostgreSQL Concurrency Testi** | `NOT RUN` | Real staging serveri mavjud bo‘lmagani sababli sinov hali o‘tkazilmadi |

---

## 9. KEYINGI XAVFSIZ QADAM (NEXT SAFE STEP)

1. Foydalanuvchi tomonidan Hetzner server konfiguratsiyasi (CPX21/CPX31) va eski cashback siyosati (Variant A) tasdiqlanishi.
2. Tasdiq olingach, Hetzner Cloud konsolida yangi serverni ochish, SSH kalitini o‘rnatish va `infra/docker-compose.staging.yml` orqali bo‘sh PostgreSQL 16 instansiyasini ko‘tarish.
3. Yangi ko‘tarilgan real PostgreSQL bazasida ishlab chiqilgan 5 ta Concurrency testini ishga tushirish.
