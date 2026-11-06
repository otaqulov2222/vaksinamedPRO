import type { CatalogProductCandidate } from "./prescriptionEngine";
import { isMedicineSeekingAsk, normalizeUserSpeech } from "./aiChatNlu";
import { chatCompletion, getLlmConfig, isLlmConfigured, type LlmMessage } from "./aiLlm";
import type { ChatLang } from "./aiLocale";

/** Compatible with AiChatResponse in aiPrescriptionChat (kept local to avoid cycles). */
export interface MedicalLlmChatResult {
  success: boolean;
  reply: string;
  isMedical: boolean;
  isPrescription?: boolean;
  matchedProducts: Array<{
    id: number;
    sku: string;
    nameUz: string;
    nameRu: string;
    category: string;
    manufacturer: string;
    price: number;
    unit: string;
    requiresPrescription: boolean;
    analogGroup?: string;
    inStock: boolean;
    dosage?: string;
    instructions?: string;
    confidence?: number;
  }>;
  quickSuggestions?: string[];
}

type MatchedProductCard = MedicalLlmChatResult["matchedProducts"][number];

export interface MedicalLlmInput {
  message: string;
  language: ChatLang;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  candidates: CatalogProductCandidate[];
  hasImage?: boolean;
}

const STOP_BRAND_TOKENS = new Set([
  "demo",
  "test",
  "mg",
  "ml",
  "iu",
  "quti",
  "flakon",
  "sprey",
  "tab",
  "tabletka",
  "kapsula",
  "vitamin", // too broad alone — use full name / D3 aliases
]);

function defaultChips(lang: ChatLang): string[] {
  if (lang === "ru") return ["Сфотографировать рецепт", "Симптомы простуды", "Головная боль", "Цены на лекарства"];
  if (lang === "en") return ["Scan prescription", "Cold symptoms", "Headache", "Medicine prices"];
  return ["Retseptni rasmga olish", "Shamollash alomatlari", "Bosh og‘rig‘i", "Dori narxlari"];
}

function contextualChips(
  lang: ChatLang,
  userText: string,
  reply: string,
  products: MatchedProductCard[],
): string[] {
  const blob = normalizeUserSpeech(`${userText} ${reply} ${products.map((p) => p.nameUz).join(" ")}`);
  if (lang === "ru") {
    if (/qorin|stomach|smecta|linex|omeprazol|espumizan|живот|тошн|диаре|ich\s*ket/.test(blob)) {
      return ["Где болит живот?", "Есть ли тошнота?", "Когда к врачу?", "Цены на лекарства"];
    }
    if (/shamol|gripp|aqua|burun|простуд|насморк|isitma|harorat/.test(blob)) {
      return ["Измерить температуру", "Пить больше воды", "Когда к врачу?", "Цены на лекарства"];
    }
    if (/tomoq|yo'?tal|acc|ambroksol|кашел|горл/.test(blob)) {
      return ["Сухой или мокрый кашель?", "Когда к врачу?", "Цены на лекарства"];
    }
    if (/bosh|headache|paratsetamol|голов/.test(blob)) {
      return ["Измерить давление", "Когда к врачу?", "Отдых и вода", "Цены на лекарства"];
    }
    if (/allerg|loratadin|setirizin/.test(blob)) {
      return ["Избегать аллергена", "Когда к врачу?", "Цены на лекарства"];
    }
    return defaultChips(lang);
  }
  if (lang === "en") {
    if (/qorin|stomach|smecta|linex|omeprazol|espumizan|diarrhea|nausea/.test(blob)) {
      return ["Where is the pain?", "Any nausea?", "When to see a doctor?", "Medicine prices"];
    }
    if (/shamol|cold|aqua|fever|isitma|harorat|burun/.test(blob)) {
      return ["Check temperature", "Drink more water", "When to see a doctor?", "Medicine prices"];
    }
    if (/tomoq|cough|acc|ambroksol|throat/.test(blob)) {
      return ["Dry or wet cough?", "When to see a doctor?", "Medicine prices"];
    }
    if (/bosh|headache|paratsetamol/.test(blob)) {
      return ["Check blood pressure", "When to see a doctor?", "Rest and hydrate", "Medicine prices"];
    }
    return defaultChips(lang);
  }
  if (/qorin|stomach|smecta|linex|omeprazol|espumizan|ich\s*ket|diare|ko'?ngil\s*ayn/.test(blob)) {
    return ["Qayeri og'riyapti?", "Ko'ngil aynish bormi?", "Shifokorga qachon?", "Dori narxlari"];
  }
  if (/shamol|gripp|aqua|burun|isitma|harorat|orvi/.test(blob)) {
    return ["Haroratni o'lchash", "Ko'p suv ichish", "Shifokorga qachon?", "Dori narxlari"];
  }
  if (/tomoq|yo'?tal|acc|ambroksol/.test(blob)) {
    return ["Yo'tal quruqmi yoki balg'amlimi?", "Shifokorga qachon?", "Dori narxlari"];
  }
  if (/bosh|headache|paratsetamol|bosim/.test(blob)) {
    return ["Qon bosimini o'lchash", "Shifokorga qachon?", "Dam olish va suv", "Dori narxlari"];
  }
  if (/allerg|loratadin|setirizin|klaritin/.test(blob)) {
    return ["Allergenni cheklash", "Shifokorga qachon?", "Dori narxlari"];
  }
  return defaultChips(lang);
}

function buildSystemPrompt(lang: ChatLang, catalogHint: string): string {
  return `You are VaksinaMed Medical AI Consultant for pharmacies across Uzbekistan.

AUDIENCE: Millions of users — children of parents, elders, Russian speakers, Uzbek Latin/Cyrillic, mixed chat.
Understand ANY phrasing: typos (ogriydi, nma, gapr, beraolsan), slang, voice-to-text errors, half Russian + half Uzbek.

LANGUAGE RULES (strict):
1) Answer in the language of the user's LATEST message (detected preference: ${lang}).
2) If they ask to switch language ("o'zbekcha javob ber", "по-русски", "in English") — switch AND answer their previous question from history. Never only say "OK I will speak X".
3) Capability questions ("nima qila olasan", "nimalarga javob", "что умеешь") — list capabilities clearly in their language.

YOU CAN HELP WITH:
- Symptoms & first-aid style guidance (informational)
- OTC medicine orientation + when to see a doctor
- Dosage orientation from packaging rules (never invent Rx antibiotics)
- Prescription photo / text → match catalog names when possible
- Stock/price orientation using CATALOG below only

PRODUCT CARD RULES (critical — never mismatch text vs card):
- ONLY recommend medicines that appear in CATALOG below. Use the exact catalog names in reply and productQueries.
- productQueries = ONLY those exact catalog names you explicitly recommend in "reply" (max 3).
- If reply mentions Paracetamol / Paratsetamol — productQueries MUST include that name, never Vitamin D3.
- Acute headache / fever / toothache / cold / cough / stomach / diarrhea / allergy → matching OTC from catalog, NEVER vitamins/D3/Omega/Calcium unless user asked vitamins.
- Cold with blocked nose → Aqua Maris (if in catalog) + Paracetamol if fever/pain.
- Stomach discomfort → Smecta / Linex / Omeprazol / Espumizan (whichever fits AND is in catalog) — do NOT invent No-shpa/Mezim/Regidron if absent from catalog.
- Cough with phlegm → ACC or Ambroksol from catalog (never glucometer strips).
- If you only give lifestyle advice with no named OTC — productQueries MUST be [].
- quickSuggestions must be in the SAME language as reply and clinically relevant to THIS answer (not generic greeting chips).

HARD SAFETY (Uzbekistan):
- Emergencies (chest crush pain, stroke signs, severe bleeding, anaphylaxis, seizures, collapse) → call 103 now. No selling.
- Advice is informational; always remind doctor consult before Rx / antibiotics / child dosing.
- Never invent FOM, PSP, payment systems, fake branches, or fake stock numbers.
- Children & pregnancy: extra caution; prefer doctor.

CATALOG (recommend ONLY from this list):
${catalogHint || "(empty)"}

OUTPUT: Prefer a single JSON object with no markdown fences:
{"reply":"...","isEmergency":false,"isMedical":true,"productQueries":[],"quickSuggestions":["...","..."]}
If you cannot emit JSON, output a clear plain-text reply in the user language (still useful). Never put JSON inside the reply string.`;
}

function isVitaminLikeProduct(p: CatalogProductCandidate): boolean {
  return VITAMIN_OR_SUPPLEMENT_RE.test(
    normalizeUserSpeech(`${p.nameUz} ${p.nameRu} ${p.category || ""} ${p.analogGroup || ""}`),
  );
}

function compactCatalog(candidates: CatalogProductCandidate[]): string {
  const sorted = [...candidates].sort((a, b) => {
    const av = isVitaminLikeProduct(a) ? 1 : 0;
    const bv = isVitaminLikeProduct(b) ? 1 : 0;
    return av - bv;
  });
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const p of sorted) {
    const key = (p.analogGroup || p.sku || String(p.id)).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const stock =
      typeof p.availableQuantity === "number"
        ? p.availableQuantity > 0
          ? "in_stock"
          : "out"
        : "unknown";
    lines.push(
      `- ${p.nameUz} / ${p.nameRu} | ${p.category || "?"} | ${p.price} UZS | ${stock}${p.requiresPrescription ? " | Rx" : ""}`,
    );
    if (lines.length >= 60) break;
  }
  return lines.join("\n");
}

const ACUTE_SYMPTOM_RE =
  /(?:\bbosh\b(?!qa).{0,24}og['']?ri|og['']?ri.{0,24}\bbosh\b(?!qa)|headache|головн|болит\s+голов|isitma|harorat|temperatura|fever|tish.{0,12}og['']?ri|toothache|зубн|tomoq.{0,12}og['']?ri|yo['']?tal|cough|кашел|qorin.{0,12}og['']?ri|stomach\s*pain|shamoll|gripp|простуд|\bcold\b|ich\s*ket|diare|диаре|ko['']?ngil\s*ayn|тошн|рвот|allerg|аллерг|zaharlan|отравл|poison)/i;

const VITAMIN_OR_SUPPLEMENT_RE =
  /(?:vitamin|витамин|\bd3\b|\bд3\b|omega|омега|кальц|calci|suyak|кость|БАД|\bbad\b|multivit|askorbin|аскорбин|magniy|магний|femibion|tsink|цинк)/i;

const KNOWN_OTC_ALIASES: Array<{ re: RegExp; query: string }> = [
  { re: /paratse?tamol|парацетамол|acetaminophen/i, query: "paratsetamol" },
  { re: /ibuprofen|ибупрофен/i, query: "ibuprofen" },
  { re: /nurofen|нурофен/i, query: "nurofen" },
  { re: /nimesulid|нимесулид|nimesil/i, query: "nimesulid" },
  { re: /analgin|анальгин|metamizol/i, query: "analgin" },
  { re: /aspirin|аспирин|atsetilsalitsil/i, query: "aspirin" },
  { re: /(?:^|[^a-zа-я])(?:acc|ацц)(?:$|[^a-zа-я])|atsetiltsistein|acetylcysteine/i, query: "acc 200" },
  { re: /ambroksol|амброксол|ambroxol/i, query: "ambroksol" },
  { re: /aqua\s*maris|aquamaris|аква\s*марис/i, query: "aqua maris" },
  { re: /oksalin|оксолин/i, query: "oksalin" },
  { re: /smecta|smekta|смекта/i, query: "smecta" },
  { re: /linex|линекс/i, query: "linex" },
  { re: /omeprazol|омепразол/i, query: "omeprazol" },
  { re: /espumizan|эспумизан|simetikon/i, query: "espumizan" },
  { re: /pankreatin|панкреатин/i, query: "pankreatin" },
  { re: /rehydron|regidron|rehidron|регидрон/i, query: "rehydron" },
  { re: /faol\s*ko['']?mir|activated\s*charcoal|активированн\w*\s*угол/i, query: "ko'mir" },
  { re: /loratadin|лоратадин/i, query: "loratadin" },
  { re: /setirizin|цетиризин|cetirizine/i, query: "setirizin" },
  { re: /klaritin|кларитин/i, query: "klaritin" },
  { re: /nozol|назол|ksilometazolin|ксилометазолин/i, query: "nozol" },
];

function isAcuteSymptomAsk(userText: string): boolean {
  return ACUTE_SYMPTOM_RE.test(normalizeUserSpeech(userText));
}

function isVitaminOrSupplementQuery(text: string): boolean {
  return VITAMIN_OR_SUPPLEMENT_RE.test(normalizeUserSpeech(text));
}

function userAskedForVitamins(userText: string): boolean {
  return isVitaminOrSupplementQuery(userText);
}

function brandTokenFromName(rawName: string): string | null {
  const cleaned = normalizeUserSpeech(String(rawName).replace(/\(.*?\)/g, ""));
  for (const w of cleaned.split(/\s+/)) {
    if (w.length < 4) continue;
    if (STOP_BRAND_TOKENS.has(w)) continue;
    if (/^\d/.test(w)) continue;
    return w;
  }
  return null;
}

/** Pull catalog brand tokens that the assistant actually named in the reply. */
function extractCatalogMentions(
  reply: string,
  candidates: CatalogProductCandidate[] | undefined,
): string[] {
  if (!candidates?.length) return [];
  const replyNorm = normalizeUserSpeech(reply);
  const hits: Array<{ q: string; len: number }> = [];
  for (const p of candidates) {
    for (const rawName of [p.nameUz, p.nameRu]) {
      if (!rawName) continue;
      const brand = brandTokenFromName(rawName);
      if (!brand) continue;
      // word-ish containment; avoid "acc" matching "accu-chek" via brandToken from Accu-Chek name
      if (brand === "accu" || brand.startsWith("accu")) continue;
      if (replyNorm.includes(brand)) {
        hits.push({ q: brand, len: brand.length });
      }
    }
  }
  hits.sort((a, b) => b.len - a.len);
  return hits.map((h) => h.q);
}

/** Prefer medicines named in the reply; drop LLM productQueries that contradict the reply. */
export function reconcileProductQueries(
  reply: string,
  llmQueries: string[] | undefined,
  userText: string,
  candidates?: CatalogProductCandidate[],
): string[] {
  const replyNorm = normalizeUserSpeech(reply);
  const fromReply: string[] = [];

  for (const alias of KNOWN_OTC_ALIASES) {
    if (alias.re.test(reply) || alias.re.test(replyNorm)) {
      fromReply.push(alias.query);
    }
  }
  fromReply.push(...extractCatalogMentions(reply, candidates));

  const fromLlm = (llmQueries || [])
    .map((q) => String(q || "").trim())
    .filter(Boolean)
    .filter((q) => {
      const qn = normalizeUserSpeech(q);
      if (qn.length < 3) return false;
      const grounded =
        replyNorm.includes(qn) ||
        qn.split(/\s+/).filter((w) => w.length >= 5).some((w) => replyNorm.includes(w)) ||
        KNOWN_OTC_ALIASES.some((a) => a.re.test(q) && (a.re.test(reply) || a.re.test(replyNorm)));
      return grounded;
    });

  let queries = [...fromReply, ...fromLlm];

  // Acute / infectious symptoms: never attach vitamins unless user asked for them
  if ((isAcuteSymptomAsk(userText) || isAcuteSymptomAsk(reply)) && !userAskedForVitamins(userText)) {
    queries = queries.filter((q) => !isVitaminOrSupplementQuery(q));
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const q of queries) {
    const key = normalizeUserSpeech(q);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(q);
    if (out.length >= 3) break;
  }
  return out;
}

function hasToken(hay: string, token: string): boolean {
  if (!token) return false;
  if (token.length <= 3) {
    return new RegExp(`(?:^|[^a-z0-9а-я])${token}(?:$|[^a-z0-9а-я])`, "i").test(hay);
  }
  return hay.includes(token);
}

function scoreProductMatch(queryNorm: string, nameHay: string, skuHay: string): number {
  if (!queryNorm) return 0;
  // Never score manufacturer — Accu-Chek must not win for ACC
  if (hasToken(nameHay, queryNorm) || hasToken(skuHay, queryNorm)) {
    return 120 + Math.min(queryNorm.length, 40);
  }
  const words = queryNorm.split(/\s+/).filter((w) => w.length >= 3);
  let score = 0;
  for (const w of words) {
    if (hasToken(nameHay, w) || hasToken(skuHay, w)) {
      score += w.length <= 3 ? 35 : 25 + Math.min(w.length, 12);
    }
  }
  return score;
}

function matchProducts(
  queries: string[],
  candidates: CatalogProductCandidate[],
  allowAttach: boolean,
  userText: string,
  reply: string,
): MatchedProductCard[] {
  if (!allowAttach || !queries.length) return [];
  const cards: MatchedProductCard[] = [];
  const seen = new Set<number>();
  const blockVitamins =
    (isAcuteSymptomAsk(userText) || isAcuteSymptomAsk(reply)) && !userAskedForVitamins(userText);

  for (const raw of queries) {
    const q = normalizeUserSpeech(raw);
    if (q.length < 3) continue;

    let best: CatalogProductCandidate | null = null;
    let bestScore = 0;
    for (const p of candidates) {
      if (seen.has(p.id)) continue;
      const nameHay = normalizeUserSpeech(`${p.nameUz} ${p.nameRu} ${p.analogGroup || ""}`);
      const skuHay = normalizeUserSpeech(`${p.sku || ""}`);
      if (blockVitamins && isVitaminLikeProduct(p)) continue;
      // Hard ban Accu-Chek / device strips for cough medicine queries
      if (/\bacc\b|ацц/.test(q) && /accu|chek|глюкомет|strip|полоск/i.test(nameHay)) continue;
      const score = scoreProductMatch(q, nameHay, skuHay);
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    if (!best || bestScore < 35) continue;
    seen.add(best.id);
    cards.push({
      id: best.id,
      sku: best.sku,
      nameUz: best.nameUz,
      nameRu: best.nameRu,
      category: best.category,
      manufacturer: best.manufacturer,
      price: best.price,
      unit: best.unit,
      requiresPrescription: best.requiresPrescription,
      analogGroup: best.analogGroup,
      inStock: (best.availableQuantity ?? 1) > 0,
    });
    if (cards.length >= 3) return cards;
  }
  return cards;
}

export function parseLlmJson(raw: string): {
  reply: string;
  isEmergency?: boolean;
  isMedical?: boolean;
  productQueries?: string[];
  quickSuggestions?: string[];
} | null {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/** Never show raw JSON / fences to the user. */
export function sanitizeAssistantReply(raw: string): string | null {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return null;

  const parsed = parseLlmJson(trimmed);
  if (parsed?.reply?.trim()) {
    let reply = parsed.reply.trim();
    // Nested JSON accidentally placed inside reply
    if (/^\s*[{\[]/.test(reply)) {
      const nested = parseLlmJson(reply);
      if (nested?.reply?.trim()) reply = nested.reply.trim();
      else return null;
    }
    if (/^\s*[{\[]/.test(reply) || /"productQueries"\s*:/.test(reply)) return null;
    return reply.slice(0, 4000);
  }

  if (/^\s*[{\[]/.test(trimmed) || /"productQueries"\s*:/.test(trimmed)) {
    return null;
  }
  return trimmed.slice(0, 4000);
}

function filterChipsToLanguage(chips: string[], lang: ChatLang): string[] {
  return chips.filter((c) => {
    const t = c.trim();
    if (!t) return false;
    const cyr = (t.match(/[а-яё]/gi) || []).length;
    const lat = (t.match(/[a-z']/gi) || []).length;
    if (lang === "ru") return cyr >= 2 || lat === 0;
    if (lang === "en") return cyr === 0 && /[a-z]/i.test(t);
    // uz: allow latin; drop pure cyrillic russian chips
    return !(cyr >= 3 && cyr > lat);
  });
}

/** Exported for unit tests — builds chat result with grounded product cards. */
export function buildMedicalLlmResult(
  reply: string,
  userText: string,
  lang: ChatLang,
  candidates: CatalogProductCandidate[],
  parsed?: {
    isEmergency?: boolean;
    isMedical?: boolean;
    productQueries?: string[];
    quickSuggestions?: string[];
  } | null,
): MedicalLlmChatResult {
  return toResult(reply, userText, lang, candidates, parsed);
}

function toResult(
  reply: string,
  userText: string,
  lang: ChatLang,
  candidates: CatalogProductCandidate[],
  parsed?: {
    isEmergency?: boolean;
    isMedical?: boolean;
    productQueries?: string[];
    quickSuggestions?: string[];
  } | null,
): MedicalLlmChatResult {
  const safeReply = sanitizeAssistantReply(reply) || reply.trim().slice(0, 4000);
  const isEmergency = Boolean(parsed?.isEmergency);
  const productQueries = reconcileProductQueries(
    safeReply,
    parsed?.productQueries,
    userText,
    candidates,
  );
  const allowProducts =
    !isEmergency &&
    productQueries.length > 0 &&
    (isMedicineSeekingAsk(userText) ||
      productQueries.some((q) => normalizeUserSpeech(safeReply).includes(normalizeUserSpeech(q))) ||
      KNOWN_OTC_ALIASES.some((a) => a.re.test(safeReply)));

  const matchedProducts = matchProducts(
    productQueries,
    candidates,
    allowProducts,
    userText,
    safeReply,
  );

  const llmChips = Array.isArray(parsed?.quickSuggestions)
    ? filterChipsToLanguage(
        parsed!.quickSuggestions!.map(String).filter(Boolean),
        lang,
      ).slice(0, 4)
    : [];
  const chips =
    llmChips.length >= 2
      ? llmChips
      : contextualChips(lang, userText, safeReply, matchedProducts);

  return {
    success: true,
    reply: safeReply,
    isMedical: parsed?.isMedical !== false,
    isPrescription: false,
    matchedProducts,
    quickSuggestions: chips,
  };
}

export async function tryMedicalLlmReply(input: MedicalLlmInput): Promise<MedicalLlmChatResult | null> {
  if (!isLlmConfigured()) return null;
  const userText = String(input.message || "").trim();
  if (!userText && !input.hasImage) return null;

  const cfg = getLlmConfig();
  const catalogHint = compactCatalog(input.candidates);
  const messages: LlmMessage[] = [
    { role: "system", content: buildSystemPrompt(input.language, catalogHint) },
  ];

  const history = (input.history || []).slice(-12);
  for (const h of history) {
    if (!h?.content?.trim()) continue;
    if (h.role !== "user" && h.role !== "assistant") continue;
    messages.push({ role: h.role, content: h.content.slice(0, 2000) });
  }

  const userContent = input.hasImage
    ? `${userText || "(user sent a prescription / medicine photo)"}\n[Note: image OCR may be limited; ask for medicine names if unclear.]`
    : userText;
  messages.push({ role: "user", content: userContent });

  const preferJson = Boolean(cfg && !cfg.preferPlainText);
  let raw = await chatCompletion(messages, {
    temperature: 0.25,
    maxTokens: 1100,
    responseFormatJson: preferJson,
  });

  if (!raw && preferJson) {
    raw = await chatCompletion(messages, {
      temperature: 0.25,
      maxTokens: 1100,
      responseFormatJson: false,
    });
  }
  if (!raw) return null;

  const parsed = parseLlmJson(raw);
  const replyText = sanitizeAssistantReply(parsed?.reply || raw);
  if (!replyText) return null;

  return toResult(replyText, userText, input.language, input.candidates, parsed);
}
