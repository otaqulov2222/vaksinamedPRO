/**
 * Production language detection for VaksinaMed chat (Uzbekistan-wide).
 * Prefer what the user is writing now over a stale app locale.
 */

export type ChatLang = "uz" | "ru" | "en";

function normalize(str: string): string {
  return String(str || "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[ʻʼ’‘`´′]/g, "'")
    .replace(/[?!.,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Explicit "speak Uzbek / Russian / English" intents (typos OK). */
export function isLanguageSwitchRequest(message: string): boolean {
  const q = normalize(message);
  return /(?:tilida|speak|язык|language|по-узбек|по-русск|по-англ|o['']?zbekcha|ruscha|inglizcha).{0,30}(?:gap\w*|javob|speak|ответь|пиши|yoz|please)|(?:gap\w*|javob|speak|ответь|yuqori\w*).{0,24}(?:o['']?zbek|uzbek|rus|russian|ingliz|english|узбек|русск|англ)/i.test(
    q,
  );
}

/**
 * Detect reply language from the current message.
 * Order: explicit switch → script/heuristic → fallback (app locale).
 */
export function detectReplyLanguage(message: string, fallback: ChatLang = "uz"): ChatLang {
  const q = normalize(message);
  if (!q) return fallback;

  if (
    /(?:o['']?zbek|uzbek|узбек).{0,24}(?:til|язык|language|cha)|(?:tilida|на узбекском|in uzbek|по-узбекски).{0,24}(?:gap\w*|javob|speak|ответь|пиши|yoz)|speak\s*uzbek|javob.*o['']?zbek|o['']?zbekcha\s*(?:gap\w*|javob|yoz)/i.test(
      q,
    )
  ) {
    return "uz";
  }
  if (
    /(?:rus(?:cha|til)?|русск|russian).{0,24}(?:til|язык|language|gap\w*|javob|speak|ответь|пиши|yoz)|(?:tilida|на русском|in russian|по-русски).{0,24}(?:gap\w*|javob|speak|ответь|пиши|yoz)|speak\s*russian|javob.*rus|ruscha\s*(?:gap\w*|javob|yoz)/i.test(
      q,
    )
  ) {
    return "ru";
  }
  if (
    /(?:ingliz|english|англ).{0,24}(?:til|язык|language|gap\w*|javob|speak|ответь|пиши|yoz)|(?:tilida|in english|на английском|по-английски).{0,24}(?:gap\w*|javob|speak|ответь|пиши|yoz)|speak\s*english|javob.*ingliz|inglizcha\s*(?:gap\w*|javob|yoz)/i.test(
      q,
    )
  ) {
    return "en";
  }

  const cyr = (q.match(/[а-яё]/gi) || []).length;
  const lat = (q.match(/[a-z']/gi) || []).length;
  if (cyr >= 4 && cyr > lat * 1.2) return "ru";

  // Common Uzbek Latin chat markers (stems — covers typos/agglutination)
  if (
    /(?:^|[\s])(salom|assalom|rahmat|iltimos|yordam|savol|javob|nima|qanday|qayer|qancha|kerak|boladi|bo'ladi|ichsam|ichay|og'?ri|bosh|qorin|tomoq|isitma|shamol|dori|retsept|dorixona|yuqori|ozi|men|sen|siz|bola|homila|qon|bosim|uxla|uyqu)/i.test(
      ` ${q} `,
    )
  ) {
    return "uz";
  }

  if (
    /\b(hello|hi|please|thanks|thank you|what can you|how (?:do|can) i|medicine|prescription|fever|headache|stomach|pain)\b/i.test(
      q,
    )
  ) {
    return "en";
  }

  // Latin-heavy informal chat in UZ market defaults to Uzbek over Russian app locale
  if (lat >= 6 && cyr === 0 && fallback === "ru") {
    return "uz";
  }

  return fallback;
}

/** Soft fallback copy when LLM is temporarily unavailable — never mix wrong language. */
export function offlineAssistantFallback(lang: ChatLang): {
  reply: string;
  quickSuggestions: string[];
} {
  if (lang === "ru") {
    return {
      reply:
        "Здравствуйте! Я медицинский ИИ-консультант VaksinaMed 🩺.\n\nМогу помочь с симптомами, лекарствами, дозировками и фото рецепта (проверка по каталогу аптек).\n\nОпишите, что беспокоит, или пришлите название препарата.\n\n⚠️ Рекомендации информационные; перед приёмом лекарств проконсультируйтесь с врачом. При угрожающих симптомах звоните 103.",
      quickSuggestions: ["Сфотографировать рецепт", "Симптомы простуды", "Головная боль", "Витамин D3"],
    };
  }
  if (lang === "en") {
    return {
      reply:
        "Hello! I am the VaksinaMed Medical AI Consultant 🩺.\n\nI can help with symptoms, medicines, dosage guidance, and prescription photos (catalog matching).\n\nTell me what is bothering you or send a medicine name.\n\n⚠️ Advice is informational; consult a doctor before taking medicines. For emergencies call 103.",
      quickSuggestions: ["Scan prescription", "Cold symptoms", "Headache", "Vitamin D3"],
    };
  }
  return {
    reply:
      "Assalomu alaykum! Men VaksinaMed tibbiy AI maslahatchisiman 🩺.\n\nSizga alomatlar, dori-darmon, doza va retsept surati (dorixona katalogidan qidirish) bo‘yicha yordam bera olaman.\n\nNima bezovta qilyapti — yozing yoki dori nomini yuboring.\n\n⚠️ Maslahatlar tavsiyaviy; dori qabul qilishdan oldin shifokor bilan maslahatlashing. Xavfli holatda 103 ni chaqiring.",
    quickSuggestions: ["Retseptni rasmga olish", "Shamollash alomatlari", "Bosh og‘rig‘i", "Vitamin D3"],
  };
}
