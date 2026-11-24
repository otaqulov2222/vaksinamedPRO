# Cashback + FOM — qanday ishlaydi (standart model)

## Muhim: nima to‘g‘ri, nima noto‘g‘ri

**Noto‘g‘ri kutish:** FOM API ni ulasak — FOM’dagi barcha dorilar, QR, VHK, markirovka avtomatik ilovada “ideal ko‘zgu” bo‘ladi.

**To‘g‘ri standart (SoT ajratish):**

| Tizim | Source of truth |
|--------|------------------|
| **FOM / DMED kassa** | Filialdagi fizik qoldiq, skan, narx, seriya/muddat, kassa to‘lovi, chek |
| **Vaksina Med API/ilova** | Buyurtma, bron (reserved), cashback, mijoz, loyalty QR |
| **Katalog** | Faqat **aniq mapping** (SKU/barcode → `products`) — FOM dan mahsulot “o‘ylab topilmaydi” |
| **Markirovka / VHK / Soliq OFD** | Alohida compliance relslar — sale webhook “bepul” bermaydi |

FOM o‘zgarmaydi — u kassa sifatida ishlayveradi. Biz unga **kontrakt asosida** ulanamiz.

---

## Bosqichma-bosqich reja

| Phase | Nima | Holat |
|-------|------|--------|
| **1** | Shadow recon + `fom_product_links` quarantine (stock yozilmaydi) | **READY_IN_REPO** |
| **2** | Katalog sync: FOM mahsulotlari → `products` (qo‘lda ikki marta kiritmaslik) | **READY_IN_REPO** |
| **3** | Vendor kontrakt: branch map, SKU/barcode, miqdor semantikasi, idempotency, auth | **CONTRACT_PENDING** |
| **4** | Dual-run: shadow farq hisobotlari PASS bo‘lguncha | **NOT_STARTED** |
| **5** | Inventory writer cutover (+ rollback) | **BLOCKED** (kill-switch OFF) |
| **6** | Markirovka / VHK / Soliq — alohida | **SEPARATE** |

Writer: `FOM_INVENTORY_WRITER_ENABLED = false` — kontrakt + cutover ticketsiz **yoqilmaydi**.

---

## Rollar

| Tizim | Vazifa |
|--------|--------|
| **FOM / DMED** | Dori skan, narx, qoldiq, Click/Payme/naqd, chek |
| **Ilova** | Qidiruv, filial, bron, yetkazish, loyalty QR |
| **API ko‘prik** | Chek yopilganda cashback/bron; shadow stock recon; mapping |

---

## Cashback qachon **tushadi** (earn)

1. **Kassada oddiy xarid** — mijoz QR → FOM → `POST /api/integrations/fom/sale` → cashback
2. **Ilovadan bron** — FOM `orderCode` yuboradi → yakunlash + cashback
3. **Yetkazib berish** — `delivered` → cashback

Online to‘lovning o‘zi cashback bermaydi.

## Cashback qachon **ishlatiladi** (spend)

- Ilovada buyurtmada
- Kassada QR skan (`POS` / kelajakda barqaror `FOM_POS` kontrakti)

---

## Endpoints

| Endpoint | Ma’nosi |
|----------|---------|
| `POST /api/integrations/fom/sale` | Chek yopish (tijorat) |
| `POST /api/integrations/fom/catalog-sync` | **Phase 2** — FOM katalog → ilova mahsulotlari (stock yozilmaydi) |
| `POST /api/integrations/fom/site-xml` | **Phase 2** — SITE.exe XML qabul (`FOM-{I}` sku; qoldiq yozilmaydi) |
| `POST /api/integrations/fom/catalog-from-report` | **Phase 2** — REPORT_ID=188 spravochnik JSON → katalog |
| `POST /api/integrations/fom/inventory-shadow` | **Phase 1** — farq hisobot, stock yozilmaydi |
| `POST /api/integrations/fom/inventory-sync` | Writer ON bo‘lganda (hozir 503) |
| `GET /api/integrations/fom/status` | Honest holat + roadmap |

### Catalog sync namunasi

```json
{
  "dryRun": false,
  "items": [
    {
      "sku": "FOM-PARA-500",
      "nameUz": "Paracetamol 500 mg",
      "nameRu": "Парацетамол 500 мг",
      "price": 12000,
      "barcode": "4780123456789",
      "category": "Analgetiklar"
    }
  ]
}
```

### SITE.exe (PDF format) → ilova

FOM texnik `SETUP.ini` da:

```ini
[SERVER]
URL=https://<host>/api/integrations/fom/site-xml?token=<FOM_WEBHOOK_SECRET>
TOCING=<FOM_WEBHOOK_SECRET>
```

XML qator: `<V I="2053" N="..." R="..." K="0.37" P="226400.00" O="1" IK="..." UP="..." UN="Qadoq"/>`  
SKU = `FOM-{I}` — demo/VM dorilar o‘chirilmaydi. Qoldiq (`K`/`O`) faqat preview; `product_stocks` yozilmaydi.

Spravochnik bridge: `POST /api/integrations/fom/catalog-from-report` body `{ "rows": [{ "I", "N", "P", "E", "C" }] }`.

### CASHBACK.exe (F-Kassa) → ilova

Kassa URL bazasi (bizning `/api` ni egallamaydi):

```text
https://<host>/fom-cashback
```

| Method | Path | Ichida |
|--------|------|--------|
| `POST /authPOS` | `{ login, password }` | Token |
| `POST /api` | `GetBalance` / `scan_code` | Mavjud QR lookup |
| `POST /api` | `CreateReceipt` | `confirmPosSale` (POS ledger, `receipt:FOMCB-…`) |

Env: `FOM_CASHBACK_LOGIN`, `FOM_CASHBACK_PASSWORD`, `FOM_BRANCH_MAP` yoki `FOM_DEFAULT_BRANCH_ID`.  
`FOM_POS` invent qilinmaydi; `/api/integrations/fom/sale` o‘zgarmaydi.

### Shadow payload namunasi

```json
{
  "branchCode": "apteka53",
  "syncMode": "SNAPSHOT",
  "items": [
    { "sku": "VM-D3-60", "physicalQuantity": 12 },
    { "barcode": "4780123456789", "physicalQuantity": 3 }
  ]
}
```

Noma’lum SKU/barcode → `fom_product_links` da `QUARANTINE` (katalogga avto-insert yo‘q).

---

## FOM sale webhook namunasi

```json
{
  "receiptId": "FOM-20260919-001",
  "branchCode": "apteka53",
  "customerQr": "VAKSINA-100",
  "amount": 126000,
  "paymentMethod": "click",
  "cashbackToUse": 0
}
```

Ilova bronini yopish:

```json
{
  "receiptId": "FOM-20260919-002",
  "orderCode": "VM-XXXX",
  "paymentMethod": "payme"
}
```

`barcodes` qabul qilinadi, lekin stock mapping kontrakti yopilmaguncha inventarga yozilmaydi.

---

## Mijoz oqimi (ilova)

1. Dori qidiradi → filial/qoldiq (app DB; FOM writer OFF paytda bu app SoT)
2. Bron yoki yetkazish
3. To‘lov: filialda (FOM) yoki onlayn
4. Kassada: **Mening QR** → skaner → FOM chek → webhook
