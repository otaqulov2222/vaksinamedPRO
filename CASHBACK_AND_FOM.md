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
| **2** | Vendor kontrakt: branch map, SKU/barcode, miqdor semantikasi, idempotency, auth | **CONTRACT_PENDING** |
| **3** | Dual-run: shadow farq hisobotlari PASS bo‘lguncha | **NOT_STARTED** |
| **4** | Inventory writer cutover (+ rollback) | **BLOCKED** (kill-switch OFF) |
| **5** | Markirovka / VHK / Soliq — alohida | **SEPARATE** |

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
| `POST /api/integrations/fom/inventory-shadow` | **Phase 1** — farq hisobot, stock yozilmaydi |
| `POST /api/integrations/fom/inventory-sync` | Writer ON bo‘lganda (hozir 503) |
| `GET /api/integrations/fom/status` | Honest holat + roadmap |

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
