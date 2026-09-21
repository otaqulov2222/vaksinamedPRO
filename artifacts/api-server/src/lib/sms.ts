/**
 * SMS yuborish — O‘zbekiston: Eskiz.uz
 * Env: ESKIZ_EMAIL, ESKIZ_PASSWORD, ESKIZ_FROM (optional)
 * Kalitlar bo‘lmasa development rejimida logga yoziladi (SMS yuborilmaydi).
 */

type SendResult = { ok: boolean; provider: "eskiz" | "dev"; messageId?: string };

let eskizToken: { value: string; expiresAt: number } | null = null;

async function getEskizToken() {
  const email = process.env.ESKIZ_EMAIL;
  const password = process.env.ESKIZ_PASSWORD;
  if (!email || !password) return null;
  if (eskizToken && eskizToken.expiresAt > Date.now()) return eskizToken.value;

  const response = await fetch("https://notify.eskiz.uz/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error("Eskiz autentifikatsiya xatosi");
  const data = await response.json() as { data?: { token?: string } };
  const token = data?.data?.token;
  if (!token) throw new Error("Eskiz token olinmadi");
  eskizToken = { value: token, expiresAt: Date.now() + 1000 * 60 * 60 * 20 };
  return token;
}

export async function sendSms(phone998: string, text: string): Promise<SendResult> {
  const token = await getEskizToken().catch(() => null);
  if (!token) {
    console.info(`[SMS:dev] +${phone998} → ${text}`);
    return { ok: true, provider: "dev" };
  }

  const form = new URLSearchParams();
  form.set("mobile_phone", phone998);
  form.set("message", text);
  form.set("from", process.env.ESKIZ_FROM || "4546");

  const response = await fetch("https://notify.eskiz.uz/api/message/sms/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("[SMS:eskiz]", errText);
    throw Object.assign(new Error("SMS yuborilmadi. Keyinroq urinib ko‘ring."), { status: 502 });
  }

  const data = await response.json() as { id?: string | number };
  return { ok: true, provider: "eskiz", messageId: data.id != null ? String(data.id) : undefined };
}

export function otpSmsText(code: string) {
  return `Vaksina Med: tasdiqlash kodi ${code}. Kodni hech kimga bermang.`;
}
