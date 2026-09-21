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

export function isValidLocalPhone(phone: string): boolean {
  return /^[0-9]{9}$/.test(phone) && !phone.startsWith('998');
}
