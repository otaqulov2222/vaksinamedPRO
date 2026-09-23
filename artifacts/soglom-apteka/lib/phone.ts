/** Telefon kiriting: 9 raqam (90xxxxxxx). Autofill +998 ni ham to‘g‘ri qayta ishlaydi. */
export function normalizeLocalPhone(input: string): string {
  let digits = String(input || '').replace(/\D/g, '');
  if (digits.startsWith('998') && digits.length >= 12) {
    digits = digits.slice(3);
  } else if (digits.startsWith('998') && digits.length > 9) {
    digits = digits.slice(3);
  } else if (digits.length === 12 && digits.startsWith('998')) {
    digits = digits.slice(3);
  } else if (digits.length === 11 && digits.startsWith('8')) {
    digits = digits.slice(1);
  }
  // Agar hali ham 998 bilan boshlansa (noto‘g‘ri kesilgan)
  if (digits.startsWith('998') && digits.length === 9) {
    // 998889799 — noto‘g‘ri; qayta urinish mumkin emas, foydalanuvchi tozalasin
  }
  return digits.slice(0, 9);
}

/** Display only: 90 123 45 67 — storage remains 9 digits via normalizeLocalPhone. */
export function formatLocalPhoneDisplay(local9: string): string {
  const d = String(local9 || '').replace(/\D/g, '').slice(0, 9);
  const parts: string[] = [];
  if (d.length > 0) parts.push(d.slice(0, 2));
  if (d.length > 2) parts.push(d.slice(2, 5));
  if (d.length > 5) parts.push(d.slice(5, 7));
  if (d.length > 7) parts.push(d.slice(7, 9));
  return parts.join(' ');
}

/**
 * Privacy display for OTP/auth screens: +998 97 *** ** 37
 * Does not alter the normalized value used for API calls.
 */
export function formatLocalPhoneMasked(local9: string): string {
  const d = String(local9 || '').replace(/\D/g, '').slice(0, 9);
  if (d.length !== 9) return formatLocalPhoneDisplay(d);
  return `${d.slice(0, 2)} *** ** ${d.slice(7, 9)}`;
}

export function isValidLocalPhone(phone: string): boolean {
  return /^[0-9]{9}$/.test(phone) && !phone.startsWith('998');
}
