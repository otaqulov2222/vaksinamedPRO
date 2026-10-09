# VAKSINAMED — PHASE 1: EXTERNAL INTEGRATION CONTRACT FREEZE
**Rasmiy hisobot va texnik audit hujjati**
**Sana:** 2026-10-09
**Holat:** CONTRACT FREEZE VERIFIED

---

## 1. INTEGRATSIYA HOLATI MATRITsASI (STATUS MATRIX)

| Provayder | Xizmat sohasi | Joriy Status | Asosiy kod joylashuvi | Qisqacha xulosa va holat |
| :--- | :--- | :--- | :--- | :--- |
| **FOM (F-Apteka / DMED)** | POS / Apteka ERP | `PARTIAL` | `artifacts/api-server/src/lib/fomBridge.ts`<br>`artifacts/api-server/src/lib/fomAdapter.ts` | Sotuv va kassa integratsiyasi ishlaydi, biroq **ombor qoldiqlari sinxronizatsiyasi mutlaqo bloklangan** (`FOM_INVENTORY_WRITER_ENABLED = false`). |
| **Payme (Paycom)** | To‘lov shlyuzi | `PARTIAL` | `artifacts/api-server/src/lib/paymeMerchantApi.ts`<br>`artifacts/api-server/src/lib/paymeContract.ts` | Inbound JSON-RPC 2.0 (`CheckPerform`, `Create`, `Perform`, `Cancel`) to‘liq va xavfsiz. Outbound avtomatlashtirilgan invoice yaratish va live hisoblar kutilmoqda. |
| **Click (Click.uz)** | To‘lov shlyuzi | `PARTIAL` | `artifacts/api-server/src/lib/clickMerchantApi.ts`<br>`artifacts/api-server/src/lib/clickContract.ts` | Inbound Shop API (`Prepare`, `Complete`) MD5 imzo bilan to‘liq. Outbound invoice va Click Pass/Fiskal integratsiyasi mavjud emas. |
| **F-Kassa / OFD** | Fiskal kassa apparati | `NOT IMPLEMENTED` | N/A | Kod bazasida birorta ham drayver, SDK yoki fiskal chek shakllantirish API mavjud emas. |
| **Yandex Maps** | Geocoding & Xarita | `IMPLEMENTED` | `artifacts/soglom-apteka/lib/maps.ts` | Xarita tanlash, geocoding va majburiy uy raqami nazorati to‘liq ishlaydi. |
| **Yandex Delivery** | Kuryer logistikasi | `CONTRACT_PENDING` | `artifacts/api-server/src/lib/deliveryAdapters.ts`<br>`artifacts/api-server/src/lib/deliveryService.ts` | Adapter stub holatida (`CONTRACT_PENDING`). Ichki kuryer ishlaydi. 15,000 so‘m flat narx o‘rnatilgan. |
| **Eskiz SMS** | SMS OTP Gateway | `PARTIAL` | `artifacts/api-server/src/lib/sms.ts`<br>`artifacts/api-server/src/lib/securityEnv.ts` | REST API integratsiyasi va token keshlash tayyor. Production hisob ma'lumotlari va tasdiqlangan sender ID kerak. |
| **Cashback 90-Day** | Sodiqlik / FIFO Muddati | `CONTRACT_PENDING` | `lib/db/src/schema/cashback.ts`<br>`artifacts/api-server/src/lib/cashback.ts` | **STOP EXECUTION.** Amaldagi schemada `unconsumed_amount` va `expires_at` yo‘q. FIFO grant schemasi ishlab chiqildi. |

---

## 2. PROVAYDERLAR BO‘YICHA CHUQUR AUDIT VA KOD DALILLARI

### 2.1. FOM Integratsiyasi (F-Apteka / DMED)
- **Hozirgi holat va kod dalillari:**
  - `artifacts/api-server/src/lib/fomBridge.ts` faylida `processFomSale` funksiyasi FOM’dan keladigan savdo hodisalarini qabul qiladi.
  - `receiptId` (chek raqami) orqali `fom_sale_events` jadvalida qat'iy idempotentlik tekshiriladi (takroriy so‘rovlar qayta hisoblanmaydi).
  - Webhook endpointi `POST /integrations/fom/sale` bo‘lib, `x-fom-secret` yoki `Authorization: Bearer` orqali himoyalangan (`assertFomWebhookAuthorized`).
  - Buyurtma kodli xaridlar (`orderCode`) bo‘yicha pickup buyurtma yakunlanadi va mijozga cashback o‘tkaziladi (`confirmFomSale`).
  - Kassadagi to‘g‘ridan-to‘g‘ri xaridlar (`customerQr + amount`) bo‘yicha `confirmPosSale` chaqirilib, kassa xaridi qayd etiladi.
- **Yetishmayotgan shartnoma / API (Missing):**
  - **Ombor qoldig‘i (Stock sync):** `artifacts/api-server/src/lib/fomAdapter.ts` faylida `FOM_INVENTORY_WRITER_ENABLED = false` qat'iy o‘rnatilgan. FOM tizimidan tovar qoldiqlarini qabul qilish shartnomasi mavjud emas.
  - FOM yuborishi mumkin bo‘lgan `barcodes` qabul qilinadi, ammo ularni mahsulotlar bilan solishtirib ombor qoldig‘idan ayirish mutlaqo to‘xtatilgan (karantinga olingan).
  - FOM kassasida chek bekor qilinganda (Vozvrat/Refund) VaksinaMed’ga xabar berish webhooki yo‘q.
- **Kerakli hujjatlar va credentials:**
  - `FOM_WEBHOOK_SECRET` (production uchun maxfiy kalit).
  - FOM ERP API texnik spetsifikatsiyasi (Ombor qoldiqlari qaysi formatda va qachon yuboriladi: Push yoki Pull).
  - Filiallar ro‘yxati va ularning FOM tizimidagi identifikatorlari (`branchCode` xaritasi).
- **Ishlab chiqish ketma-ketligi:**
  1. FOM texnik jamoasi bilan uchrashuv o‘tkazish va ombor qoldiqlari formatini tasdiqlash.
  2. Ombor sinxronizatsiyasi uchun bir tomonlama (FOM -> VaksinaMed) ma'lumotlar oqimini loyihalash.
  3. `FOM_INVENTORY_WRITER_ENABLED`ni test muhitida xavfsiz sinovdan o‘tkazish.
- **Sandbox testlari:**
  - Bir xil `receiptId` bilan ketma-ket 5 ta so‘rov yuborilganda faqat 1 marta hisob-kitob bo‘lishi (Idempotency).
  - Mavjud bo‘lmagan `branchCode` yuborilganda HTTP 400 (`FOM_BRANCH_REQUIRED`) qaytishi.
  - QR kod orqali kassa xaridida cashback to‘g‘ri hisoblanishi.
- **Production to‘siqlari:**
  - FOM va VaksinaMed o‘rtasida qoldiqlarning ikki tomonlama to‘qnashuvi (Dual-authority race condition). Agar FOM qoldiq shartnomasi tasdiqlanmasa, inventar yozishni yoqish mumkin emas.

---

### 2.2. Payme va Click Integratsiyasi
- **Hozirgi holat va kod dalillari:**
  - **Payme Inbound API:** `artifacts/api-server/src/lib/paymeMerchantApi.ts` faylida rasmiy JSON-RPC 2.0 protokoli asosida barcha 5 ta metod implementatsiya qilingan:
    - `CheckPerformTransaction` (summa, akkaunt va holatni tekshirish)
    - `CreateTransaction` (tranzaksiyani yaratish va muddatini belgilash)
    - `PerformTransaction` (to‘lovni yakunlash va buyurtmani `PAID` qilish)
    - `CancelTransaction` (to‘lovni bekor qilish va agar bajarilgan bo‘lsa cashbackni qaytarish)
    - `CheckTransaction` (tranzaksiya holatini tekshirish)
    - Xavfsizlik: HTTP Basic Auth (`Paycom` + merchant key), `crypto.timingSafeEqual` orqali taqqoslash, 1 UZS = 100 tiyin konvertatsiyasi.
  - **Click Inbound API:** `artifacts/api-server/src/lib/clickMerchantApi.ts` faylida rasmiy Click Shop API protokoli asosida:
    - `Prepare` (action=0)
    - `Complete` (action=1)
    - Xavfsizlik: MD5 `sign_string` tekshiruvi (`click_trans_id`, `service_id`, `secret_key`, `merchant_trans_id`, `amount`, `action`, `sign_time`).
  - Har ikkala integratsiyada tranzaksiyalar `payment_attempts` va `payment_intents` jadvallarida `SELECT ... FOR UPDATE` row-level lock orqali amalga oshiriladi.
- **Yetishmayotgan shartnoma / API (Missing):**
  - **Outbound Invoice API:** Serverdan turib avtomatlashtirilgan to‘lov havolasini yaratish (`invoice/create` yoki `receipts.create`) protokoli integratsiya qilinmagan. Hozirda standart GET redirect URL shakllanadi.
  - **OFD / Fiskal ma'lumotlar:** Payme va Click orqali fiskal chek ma'lumotlarini (IKPU/MXIK kodlari, QQS) uzatish shartnomasi kutilmoqda (`CONTRACT_PENDING`).
  - **Outbound Refund API:** Serverdan turib mijoz kartasiga to‘g‘ridan-to‘g‘ri pulni qaytarish API integratsiyasi yo‘q (hozirda faqat Inbound Cancel ishlaydi).
  - **Reconciliation API:** Avtomatlashtirilgan kunlik solishtirish (`GetStatement`).
- **Kerakli hujjatlar va credentials:**
  - Payme: `PAYME_MERCHANT_ID`, `PAYME_SECRET_KEY` (yoki filiallar bo‘yicha individual kalitlar), Sandbox kirish huquqlari (`test.paycom.uz`).
  - Click: `CLICK_SERVICE_ID`, `CLICK_MERCHANT_ID`, `CLICK_SECRET_KEY`, Sandbox kabineti (`test.click.uz`).
  - Yuridik shartnomalar (har bir filial uchun alohidami yoki yagona markazlashgan hisobmi).
- **Ishlab chiqish ketma-ketligi:**
  1. Rasmiy Sandbox kabinetlarini ochish va test API kalitlarini olish.
  2. Test kartalari bilan to‘lov o‘tkazish (E2E Sandbox Verification).
  3. Outbound invoice yaratish va status polling mexanizmini ulash.
  4. Qaytarish (Refund) va bekor qilish (Cancel) oqimini sinash.
- **Sandbox testlari:**
  - Payme: `CheckPerform` -> `Create` -> `Perform` muvaffaqiyatli o‘tib, buyurtma `PAID` holatiga o‘tishi.
  - Click: `Prepare` -> `Complete` ketma-ketligi va takroriy so‘rovlarda idempotency ta'minlanishi.
  - Summa manipulyatsiyasiga urinilganda (`INVALID_AMOUNT`) to‘lov rad etilishi.
- **Production to‘siqlari:**
  - Haqiqiy merchant credentials bo‘lmasdan to‘lovlarni jonli yoqib bo‘lmaydi.
  - Elektron chek (OFD fiskalizatsiya) talabi to‘lov provayderi bilan kelishilishi lozim.

---

### 2.3. F-Kassa / OFD Integratsiyasi
- **Hozirgi holat va kod dalillari:**
  - Kod bazasida birorta ham F-Kassa yoki OFD drayveri, SDK yoki API mijozi mavjud emas.
  - Holat: `NOT IMPLEMENTED`.
- **Yetishmayotgan shartnoma / API (Missing):**
  - Kassa apparati yoki Virtual kassa turi aniqlanmagan (Fizik apparat: Daisy, Posprint, Mercury yoki Bulutli virtual kassa: Didox, Soliq API).
  - Aloqa protokoli noma'lum (TCP/IP, COM, USB yoki Cloud REST API).
  - Fiskal chek ma'lumotlari modeli: MXIK (IKPU) kodlari, QQS stavkalari, paket kodi, to‘lov turlari (naqd, terminal, cashback aralash to‘lov).
  - Bekor qilish va qaytarish (Vozvrat) cheki spetsifikatsiyasi.
- **Kerakli hujjatlar va credentials:**
  - Tanlangan apparat/virtual kassa provayderining SDK va rasmiy API qo‘llanmasi.
  - Kassir identifikatori, Z-hisobot protokoli va fiskal modul seriya raqamlari.
  - VaksinaMed tovarlar nomenklaturasi uchun MXIK kodlari jadvali.
- **Ishlab chiqish ketma-ketligi:**
  1. Biznes va buxgalteriya bilan birgalikda fiskalizatsiya yo‘nalishini tanlash (Apparat vs Bulutli).
  2. `artifacts/api-server/src/lib/fiscal.ts` adapter interfeysini yaratish.
  3. Ma'lumotlar bazasidagi mahsulotlar jadvaliga `ikpu_code` va `package_code` ustunlarini qo‘shish.
  4. Chek chop etish va elektron chek QR kodini olish logikasini ulash.
- **Sandbox testlari:**
  - Test kassa tizimiga savdo ma'lumotlarini yuborish va test chekini shakllantirish.
  - Cashback bilan aralash to‘langan buyurtmada chek summasining to‘g‘ri bo‘linishini tekshirish.
- **Production to‘siqlari:**
  - Rasmiy fiskalizatsiyasiz O‘zbekistonda chakana va internet savdosini yuritish qonuniy javobgarlikka olib keladi.

---

### 2.4. Yandex Delivery Integratsiyasi
- **Hozirgi holat va kod dalillari:**
  - `artifacts/api-server/src/lib/deliveryAdapters.ts` faylida `ExternalDeliveryAdapter` sinfi mavjud, ammo barcha chaqiruvlar `CONTRACT_PENDING` qaytaradi.
  - `InternalDeliveryAdapter` orqali dorixonaning o‘z kuryerlari uchun yetkazib berish oqimi ishlaydi.
  - Yetkazib berish narxi `artifacts/api-server/src/lib/deliveryService.ts`da qat'iy 15,000 UZS qilib belgilangan.
  - Frontendda Yandex Maps JavaScript API (`soglom-apteka/lib/maps.ts`) orqali manzil tanlash va koordinatalar aniqlash to‘liq ishlaydi.
- **Yetishmayotgan shartnoma / API (Missing):**
  - Yandex Go for Business (Yandex Delivery B2B API) OAuth tokeni va mijozi mavjud emas.
  - Narxni oldindan hisoblash (`/b2b/taxi/pricing-calculator`) integratsiyasi yo‘q.
  - Kuryer chaqirish (`/b2b/taxi/claims/create`) va tasdiqlash (`/b2b/taxi/claims/accept`) yo‘q.
  - Kuryer holatini kuzatuvchi Webhook yoki status polling yo‘q.
  - Buyurtmani bekor qilish (Cancel claim) va bekor qilish jarimalari siyosati belgilanmagan.
- **Kerakli hujjatlar va credentials:**
  - Yandex Go for Business korporativ shartnomasi.
  - `YANDEX_DELIVERY_OAUTH_TOKEN` va `YANDEX_DELIVERY_CLIENT_ID`.
  - Filiallar uchun jo‘natuvchi kontaktlari va geolokatsiyalari.
- **Ishlab chiqish ketma-ketligi:**
  1. Yandex Delivery B2B shartnomasini tuzish va API kalitlarini olish.
  2. `YandexDeliveryAdapter` sinfini rasmiy B2B API bilan to‘ldirish.
  3. Kuryer buyurtmasini yaratish va kuzatish webhookini ulash (`POST /deliveries/yandex/webhook`).
  4. Buyurtma bekor qilinganda kuryerni bekor qilish zanjirini o‘rnatish.
- **Sandbox testlari:**
  - Yandex Sandbox muhitida test kuryer buyurtmasini yaratish.
  - Virtual kuryer statuslarini (`delivering`, `delivered`, `failed`) qabul qilib, buyurtma statusini o‘zgartirish.
- **Production to‘siqlari:**
  - Kuryer narxi o‘zgaruvchan (dinamik) bo‘lgani sababli, 15,000 so‘mdan oshgan qismini kim qoplashi (apteka subsidiyalaydimi yoki mijoz to‘laydimi) bo‘yicha biznes qarori qabul qilinishi shart.

---

### 2.5. Eskiz SMS Integratsiyasi
- **Hozirgi holat va kod dalillari:**
  - `artifacts/api-server/src/lib/sms.ts` faylida Eskiz REST API (`https://notify.eskiz.uz/api/message/sms/send`) to‘liq yozilgan.
  - JWT token avtomatik keshlanadi va 20 soat davomida qayta ishlatiladi (`getEskizToken`).
  - Xavfsizlik: production va staging muhitida hisob ma'lumotlari bo‘lmasa tizim xavfsiz tarzda to‘xtaydi (fail-closed, HTTP 503). Dev muhitida esa `[SMS:dev]` orqali xabar loglanadi.
- **Yetishmayotgan shartnoma / API (Missing):**
  - Rasmiy tasdiqlangan Alpha-name (`ESKIZ_FROM`) kutilmoqda (hozirda standart `4546` ishlatilmoqda).
  - DLR (Delivery Report) webhook qabul qiluvchi endpoint mavjud emas (SMS mijozga yetib borganini tekshirish uchun).
  - Bitta telefon raqami bo‘yicha SMS limitlari (Rate limiting / Antifraud) kuchaytirilishi kerak.
- **Kerakli hujjatlar va credentials:**
  - Eskiz.uz korporativ hisobi va balansi.
  - `ESKIZ_EMAIL`
  - `ESKIZ_PASSWORD`
  - `ESKIZ_FROM` (tasdiqlangan brend nomi: masalan "VaksinaMed")
- **Ishlab chiqish ketma-ketligi:**
  1. Eskiz hisobini to‘ldirish va brend nomini tasdiqlatish.
  2. Production `.env` fayliga credentials kiritish.
  3. SMS yetkazish loglari jadvalini (`sms_delivery_logs`) monitoring qilish.
- **Sandbox testlari:**
  - O‘zbekistonning barcha asosiy operatorlariga (+998 90, 93, 97, 99, 33, 88) test SMS yuborish va tezlikni o‘lchash.
- **Production to‘siqlari:**
  - Faol SMS hisobisiz mijozlar mobil ilovada ro‘yxatdan o‘ta olmaydi va tizimga kira olmaydi.

---

## 3. CASHBACK 90 KUNLIK MUDDATI (FIFO EXPIRATION ARXITEKTURASI)

> [!CAUTION]
> **STOP EXECUTION KOD AUDITI NATIJASI:**
> Amaldagi ma'lumotlar bazasi sxemasida (`cashback_ledger`) har bir `EARN` tranzaksiyasi uchun alohida `unconsumed_amount` va `expires_at` ustunlari mavjud emas. Shuningdek, mijoz pul sarflaganda (`USE`) qaysi `EARN` yozuvidan qancha sarflangani qayd etilmaydi.
>
> Agar hozirgi holatda oddiy vaqt bo‘yicha (`created_at < NOW() - 90 days`) eski `EARN` yozuvlari bekor qilinsa:
> 1. **Ikki karra ayirish (Double Deduction):** Mijoz allaqachon sarflab bo‘lgan mablag‘ muddati o‘tgan deb hisoblanib, ikkinchi marta balansdan ayirib tashlanadi.
> 2. **Manfiy balans (Negative Balance Hazard):** Mijoz balansi noldan pastga tushib ketadi va moliyaviy invariant buziladi.
>
> Shu sababli, taxminiy yechim qilinmadi va xavfsiz FIFO arxitekturasi ishlab chiqildi.

### 3.1. Tavsiya etiladigan FIFO Grant Modeli
Mavjud `cashback_ledger`ning append-only (faqat qo‘shiluvchi) tabiatini buzmasdan, alohida grantlar jadvali joriy etiladi:

```sql
CREATE TABLE cashback_grants (
    id SERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES cashback_accounts(id),
    customer_id INTEGER NOT NULL,
    original_amount INTEGER NOT NULL CHECK (original_amount > 0),
    unconsumed_amount INTEGER NOT NULL CHECK (unconsumed_amount >= 0),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    commercial_transaction_id INTEGER REFERENCES commercial_transactions(id)
);

CREATE INDEX idx_cashback_grants_fifo ON cashback_grants (account_id, expires_at)
WHERE unconsumed_amount > 0;
```

### 3.2. FIFO Sarflash Qoidasi (`useCashback`)
1. Mijoz xarid vaqtida cashback ishlatganda, tranzaksiya ichida `SELECT ... FOR UPDATE` bilan mijozning faol grantlari olinadi:
   ```sql
   SELECT * FROM cashback_grants
   WHERE account_id = $1 AND unconsumed_amount > 0 AND expires_at > NOW()
   ORDER BY expires_at ASC, id ASC
   FOR UPDATE;
   ```
2. Eng eski muddati keladigan grantdan boshlab mablag‘ yechiladi (`FIFO - First In, First Out`):
   - Agar grantdagi `unconsumed_amount >= spend_needed` bo‘lsa, ushbu grantdan ayiriladi va qidiruv to‘xtaydi.
   - Agar grantdagi summa yetmasa, ushbu grant 0 ga tushiriladi va qolgan qismi keyingi grantdan yechiladi.
3. `cashback_ledger`ga umumiy sarflangan summa bo‘yicha `USE` yozuvi qo‘shiladi.

### 3.3. Qaytarish Qoidasi (`reverseCashback`)
Buyurtma bekor qilinganda:
- Sarflangan cashback mijozga qaytariladi (`REVERSAL` of `USE`).
- Qaytarilgan summa eng oxirgi sarflangan grantlarga tiklanadi yoki bekor bo‘lgan vaqtdan boshlab yangi 90 kunlik grant sifatida qayd etiladi (biznes qaroriga muvofiq).

### 3.4. Expiration Background Worker Rejasi
- **Ishlash vaqti:** Har kecha soat 03:00 da (past yuklama vaqtida).
- **Ishlash mantig‘i:**
  1. Muddati o‘tgan va sarflanmagan qoldig‘i bor grantlar topiladi:
     ```sql
     SELECT account_id, customer_id, SUM(unconsumed_amount) as expired_sum
     FROM cashback_grants
     WHERE expires_at <= NOW() AND unconsumed_amount > 0
     GROUP BY account_id, customer_id
     FOR UPDATE;
     ```
  2. Har bir mijoz uchun:
     - `cashback_accounts.balance`dan `expired_sum` ayiriladi.
     - `cashback_ledger`ga `EXPIRE` yozuvi kiritiladi (`entry_type = 'EXPIRE'`).
     - Tegishli grantlarning `unconsumed_amount` qiymati 0 qilib belgilanadi.
  3. Barcha amallar bitta atomic DB transaction ichida bajariladi.

---

## 4. YETISHMAYOTGAN CREDENTIALS VA KONFIGURATSIYALAR RO‘YXATI (MASKALANGAN)

| Konfiguratsiya / O‘zgaruvchi | Tizim | Tavsif | Joriy Holat |
| :--- | :--- | :--- | :--- |
| `FOM_WEBHOOK_SECRET` | FOM ERP | Webhook autentifikatsiyasi uchun sirli kalit | `[NOT SET / LOCAL DEV BYPASS]` |
| `PAYME_MERCHANT_ID` | Payme | Paycom yuridik merchant identifikatori | `[MOCK / NOT SET]` |
| `PAYME_SECRET_KEY` | Payme | Paycom merchant maxfiy kaliti (parol) | `[MOCK / NOT SET]` |
| `CLICK_SERVICE_ID` | Click | Click xizmat (service) identifikatori | `[MOCK / NOT SET]` |
| `CLICK_MERCHANT_ID` | Click | Click savdo nuqtasi identifikatori | `[MOCK / NOT SET]` |
| `CLICK_SECRET_KEY` | Click | Click MD5 imzolash kaliti | `[MOCK / NOT SET]` |
| `F_KASSA_DEVICE_ID` | OFD / Kassa | Kassa apparati / virtual kassa ID | `[NOT IMPLEMENTED]` |
| `YANDEX_DELIVERY_OAUTH_TOKEN` | Yandex Delivery | Yandex Go for Business B2B OAuth kaliti | `[NOT SET]` |
| `YANDEX_DELIVERY_CLIENT_ID` | Yandex Delivery | Yandex Delivery korporativ hisob ID | `[NOT SET]` |
| `ESKIZ_EMAIL` | Eskiz SMS | Eskiz.uz korporativ login pochtasi | `[LOCAL / NOT SET]` |
| `ESKIZ_PASSWORD` | Eskiz SMS | Eskiz.uz korporativ paroli | `[LOCAL / NOT SET]` |
| `ESKIZ_FROM` | Eskiz SMS | Tasdiqlangan jo‘natuvchi nomi (Alpha-name) | Standart `4546` |

---

## 5. TALAB QILINADIGAN BIZNES QARORLAR

1. **Yandex Delivery xarajatlari:**
   - Hozirgi qat'iy 15,000 UZS tarif saqlanadimi yoki masofaga qarab Yandex hisoblagan haqiqiy narx mijozdan olinadimi?
   - Agar buyurtma summasi ma'lum miqdordan (masalan, 200,000 UZS) oshsa, yetkazib berish tekin bo‘ladimi (apteka subsidiyalaydimi)?
2. **Fiskal Kassa turi:**
   - Har bir filialdagi mavjud fizik kassa apparatlari (drayver orqali) ishlatiladimi yoki yagona bulutli Virtual Kassa (Cloud OFD) xizmatiga ulanadimi?
3. **Cashback 90 kunlik muddati bo‘yicha o‘tish davri:**
   - Tizim joriy etilgunga qadar mijozlar hisobida mavjud bo‘lgan eski cashbacklar muddati qanday hisoblanadi (barchasiga bugundan 90 kun beriladimi)?
   - Muddati tugashiga 7 kun va 1 kun qolganda mijozga ogohlantiruvchi SMS/Push yuboriladimi?
4. **Payme va Click merchant hisoblari:**
   - Har bir dorixona filiali uchun alohida yuridik merchant ochiladimi yoki barcha mablag‘ bosh kompaniyaning yagona hisobiga kelib tushadimi?

---

## 6. INTEGRATSIYA YO‘L XARITASI (ROADMAP)

### Bosqich 1: Yuridik shartnomalar va hisoblar ochish (Hozirgi holat)
- Payme, Click, Eskiz, Yandex Delivery va OFD operatori bilan shartnomalar imzolash.
- Test Sandbox kabinetlarini ochish va API kalitlarini qabul qilish.

### Bosqich 2: To‘lov va SMS Sandbox integratsiyasi (Keyingi qadam)
- Payme va Click Sandbox testlarini o‘tkazish (E2E to‘lov, bekor qilish, qisman qaytarish).
- Eskiz SMS Alpha-name integratsiyasi va yetkazish monitoringini yoqish.
- Database migratsiyasi: `cashback_grants` jadvalini qo‘shish va FIFO sarflash mantiqini yoqish.

### Bosqich 3: Yetkazib berish va Kassa integratsiyasi
- Yandex Delivery B2B API ulanishi va dinamik narx hisoblash.
- F-Kassa / OFD drayveri yoki bulutli API integratsiyasi, MXIK kodlarini mahsulotlarga biriktirish.
- FOM ERP jamoasi bilan qoldiqlar protokoli tasdiqlangach, `FOM_INVENTORY_WRITER_ENABLED`ni ehtiyotkorlik bilan sinash.

### Bosqich 4: Production ishga tushirish (Go-Live)
- Barcha test kalitlarni haqiqiy ishlab chiqarish kalitlariga almashtirish.
- Moliyaviy monitoring va kunlik solishtirish (Reconciliation) tizimlarini faollashtirish.

---

## 7. SANDBOX QABUL QILISH VA TEKSHIRUV MEZONLARI

Har bir integratsiyani Sandbox bosqichida qabul qilish uchun quyidagi testlar 100% muvaffaqiyatli o‘tishi shart:

1. **Payme Sandbox:**
   - Test karta orqali to‘lov o‘tganda buyurtma avtomatik `PAID` holatiga o‘tishi.
   - Noto‘g‘ri summa yoki noto‘g‘ri parolda xatolik kodlari rasmiy standartga mos qaytishi.
   - Buyurtma bekor qilinganda `CancelTransaction` chaqirilib, cashback qaytarilishi.
2. **Click Sandbox:**
   - `Prepare` va `Complete` tranzaksiyalari to‘liq yakunlanishi va takroriy so‘rovlarda xato bermasligi.
3. **Eskiz SMS:**
   - OTP kod 15 soniya ichida test telefon raqamiga yetib borishi.
4. **Yandex Delivery Sandbox:**
   - Test claim yaratilishi, kuryer tayinlanishi va yetkazib berish yakunlanganda buyurtma holati `DELIVERED` bo‘lishi.
5. **Cashback FIFO:**
   - Bir necha kunda olingan turli muddatli grantlar eng eskisidan boshlab to‘g‘ri sarflanishi.
   - Worker simulyatsiyasida faqat muddati o‘tgan va sarflanmagan qoldiq bekor qilinishi, mijoz balansi hech qachon manfiy bo‘lmasligi.
