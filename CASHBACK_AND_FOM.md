# Cashback + FOM — qanday ishlaydi

## Rollar

| Tizim | Vazifa |
|--------|--------|
| **FOM / DMED** (dorixona kompyuteri) | Dori skan (shtrix-kod), narx, qoldiq, seriya/muddat, Click / Payme / naqd, chek |
| **Vaksina Med ilova** | Uyda qidiruv, qaysi filialda bor, yaqin filialdan bron, yetkazish, loyalty QR |
| **Bizning API** | Cashback hisobi, bron bog‘lash, filial merchant kalitlari |

FOM o‘zgarmaydi — u ishlashda davom etadi. Biz unga **chek yopilganda** webhook ulaymiz.

---

## Cashback qachon **tushadi** (earn)

1. **Kassada oddiy xarid** — mijoz QR ko‘rsatadi → FOM skan/to‘lov → chek yopiladi → `POST /api/integrations/fom/sale` → cashback **darhol**
2. **Ilovadan bron (olib ketish)** — bron qiladi → filialda FOM beradi + to‘lov → FOM `orderCode` yuboradi → cashback
3. **Yetkazib berish** — Click/Payme/COD → kuryer yetkazadi → status `delivered` → cashback

Online to‘lovning o‘zi cashback bermaydi (bron bekor / qaytarish uchun).

## Cashback qachon **ishlatiladi** (spend)

- Ilovada buyurtma berishda (balansdan yechiladi)
- Kassada QR skanlanganda (FOM yoki Admin → Kassa POS)

Foiz: **Silver 3% · Gold 5% · Platinum 7%** (to‘langan qismdan; yetkazish haqidan emas).

---

## FOM webhook namunasi

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

`branchCode` = filial email/kod (`apteka53@…` → `apteka53`). Click/Payme merchant ID/key har filialda Admin → Filiallar da saqlanadi.

---

## Mijoz oqimi (ilova)

1. Dori qidiradi → qaysi filialda bor / narx
2. Eng yaqin filialdan **bron** yoki **yetkazish**
3. To‘lov: filialda (FOM Click/Payme/naqd) yoki onlayn Payme/Click
4. Cashback — yuqoridagi jadvaldagi paytda balansga

Kassada: **Mening QR** → skaner → FOM chek.
