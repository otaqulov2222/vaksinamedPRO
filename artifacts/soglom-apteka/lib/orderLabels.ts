/** Batch 3F — labels for existing P5 axes only. No invented statuses. */

export function fulfillmentLabel(status?: string | null): string {
  switch (String(status || "").toUpperCase()) {
    case "CREATED":
      return "Buyurtma yaratildi";
    case "CONFIRMED":
      return "Buyurtma tasdiqlandi";
    case "PREPARING":
      return "Buyurtma tayyorlanmoqda";
    case "READY_FOR_PICKUP":
      return "Olib ketishga tayyor";
    case "OUT_FOR_DELIVERY":
      return "Yetkazib berilmoqda";
    case "COMPLETED":
      return "Buyurtma yakunlandi";
    case "CANCELLED":
      return "Buyurtma bekor qilingan";
    default:
      return status ? String(status) : "Holat noma’lum";
  }
}

export function paymentLabel(status?: string | null): string {
  switch (String(status || "").toUpperCase()) {
    case "PENDING":
      return "To‘lov kutilmoqda";
    case "PAID":
      return "To‘lov amalga oshirilgan";
    case "FAILED":
      return "To‘lov muvaffaqiyatsiz";
    case "REFUNDED":
      return "To‘lov qaytarilgan";
    case "PARTIALLY_REFUNDED":
      return "To‘lov qisman qaytarilgan";
    default:
      return status ? String(status) : "To‘lov holati noma’lum";
  }
}

export function reservationLabel(status?: string | null, expiredHint?: boolean): string {
  if (expiredHint) return "Bron muddati tugagan";
  switch (String(status || "").toUpperCase()) {
    case "NONE":
      return "Bron yo‘q";
    case "ACTIVE":
      return "Bron faol";
    case "EXPIRED":
      return "Bron muddati tugagan";
    case "CANCELLED":
      return "Bron bekor qilingan";
    case "FULFILLED":
      return "Bron bajarilgan";
    default:
      return status ? String(status) : "Bron holati noma’lum";
  }
}

/** Progress track step 0–3 from fulfillment axis (delivery-oriented). */
export function fulfillmentProgressStep(status?: string | null): number {
  switch (String(status || "").toUpperCase()) {
    case "COMPLETED":
      return 3;
    case "OUT_FOR_DELIVERY":
      return 2;
    case "PREPARING":
    case "READY_FOR_PICKUP":
      return 1;
    case "CREATED":
    case "CONFIRMED":
      return 0;
    default:
      return 0;
  }
}

export function isFulfillmentDelivered(status?: string | null, legacy?: string | null): boolean {
  const f = String(status || "").toUpperCase();
  if (f === "COMPLETED") return true;
  return /completed|delivered|yetkaz/i.test(String(legacy || ""));
}

export function isFulfillmentCancelled(status?: string | null, legacy?: string | null): boolean {
  const f = String(status || "").toUpperCase();
  if (f === "CANCELLED") return true;
  return /cancel|bekor/i.test(String(legacy || ""));
}

export function formatCountdown(msLeft: number): string {
  if (msLeft <= 0) return "00:00:00";
  const totalSec = Math.floor(msLeft / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
