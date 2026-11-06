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

function defaultChips(lang: ChatLang): string[] {
  if (lang === "ru") return ["Сфотографировать рецепт", "Симптомы простуды", "Головная боль", "Цены на лекарства"];
  if (lang === "en") return ["Scan prescription", "Cold symptoms", "Headache", "Medicine prices"];
  return ["Retseptni rasmga olish", "Shamollash alomatlari", "Bosh og‘rig‘i", "Dori narxlari"];
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
- productQueries = ONLY the exact medicine names you explicitly recommend in "reply" for THIS symptom (max 3).
- If reply mentions Paracetamol / Paratsetamol — productQueries MUST include that name, never Vitamin D3.
- Acute headache / fever / toothache / cold pain → analgesic/antipyretic (e.g. Paracetamol), NOT vitamins, NOT bone/calcium/D3 supplements.
- Vitamins / D3 / Omega only when the user asked about vitamins, deficiency, bones, immunity courses — not for acute pain.
- If you only give lifestyle advice (rest, BP check) with no named OTC — productQueries MUST be [].
- Never invent catalog products that are not listed below.

HARD SAFETY (Uzbekistan):
- Emergencies (chest crush pain, stroke signs, severe bleeding, anaphylaxis, seizures, collapse) → call 103 now. No selling.
- Advice is informational; always remind doctor consult before Rx / antibiotics / child dosing.
- Never invent FOM, PSP, payment systems, fake branches, or fake stock numbers.
- Children & pregnancy: extra caution; prefer doctor.

CATALOG (max 3 suggestions when truly relevant):
${catalogHint || "(empty)"}

OUTPUT: Prefer a single JSON object with no markdown fences:
{"reply":"...","isEmergency":false,"isMedical":true,"productQueries":[],"quickSuggestions":["...","..."]}
If you cannot emit JSON, output a clear plain-text reply in the user language (still useful).`;
}

function compactCatalog(candidates: CatalogProductCandidate[]): string {
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const p of candidates) {
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
  /(?:\bbosh\b(?!qa).{0,24}og['']?ri|og['']?ri.{0,24}\bbosh\b(?!qa)|headache|головн|болит\s+голов|isitma|harorat|temperatura|fever|tish.{0,12}og['']?ri|toothache|зубн|tomoq.{0,12}og['']?ri|yo['']?tal|cough|кашел|qorin.{0,12}og['']?ri|stomach\s*pain|shamoll|gripp|простуд|cold\b)/i;

const VITAMIN_OR_SUPPLEMENT_RE =
  /(?:vitamin|витамин|\bd3\b|\bд3\b|omega|омега|кальц|calci|suyak|кость|БАД|\bbad\b|multivit|askorbin|аскорбин|magniy|магний)/i;

const KNOWN_OTC_ALIASES: Array<{ re: RegExp; query: string }> = [
  { re: /paratse?tamol|парацетамол|acetaminophen/i, query: "paratsetamol" },
  { re: /ibuprofen|ибупрофен/i, query: "ibuprofen" },
  { re: /nimesulid|нимесулид|nimesil/i, query: "nimesulid" },
  { re: /analgin|анальгин|metamizol/i, query: "analgin" },
  { re: /aspirin|аспирин|atsetilsalitsil/i, query: "aspirin" },
  { re: /ats?ts\b|ацц|atsetiltsistein|acetylcysteine/i, query: "acc" },
  { re: /aqua\s*maris|aquamaris|аква\s*марис/i, query: "aqua maris" },
  { re: /smecta|smekta|смекта/i, query: "smecta" },
  { re: /linex|линекс/i, query: "linex" },
  { re: /rehydron|regidron|регидрон/i, query: "rehydron" },
  { re: /faol\s*ko['']?mir|activated\s*charcoal|активированн\w*\s*угол/i, query: "ko'mir" },
  { re: /loratadin|лоратадин/i, query: "loratadin" },
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

/** Pull catalog brand tokens that the assistant actually named in the reply. */
function extractCatalogMentions(
  reply: string,
  candidates: CatalogProductCandidate[] | undefined,
): string[] {
  if (!candidates?.length) return [];
  const replyNorm = normalizeUserSpeech(reply);
  const hits: Array<{ q: string; len: number }> = [];
  for (const p of candidates) {
    for (const rawName of [p.nameUz, p.nameRu, p.analogGroup]) {
      if (!rawName) continue;
      const cleaned = normalizeUserSpeech(String(rawName).replace(/\(.*?\)/g, ""));
      const brand = cleaned.split(/\s+/).find((w) => w.length >= 4);
      if (!brand) continue;
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
      // Must be grounded in the reply text (avoid "Paracetamol in text, D3 in card")
      const grounded =
        replyNorm.includes(qn) ||
        qn.split(/\s+/).filter((w) => w.length >= 5).some((w) => replyNorm.includes(w)) ||
        KNOWN_OTC_ALIASES.some((a) => a.re.test(q) && (a.re.test(reply) || a.re.test(replyNorm)));
      return grounded;
    });

  // Merge reply-grounded names first, then any other grounded LLM queries
  let queries = [...fromReply, ...fromLlm];

  // Acute pain/fever/cold: never attach vitamins/bone supplements unless user asked for them
  if (isAcuteSymptomAsk(userText) && !userAskedForVitamins(userText)) {
    queries = queries.filter((q) => !isVitaminOrSupplementQuery(q));
  }

  // Dedupe preserving order
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

function scoreProductMatch(queryNorm: string, productHay: string): number {
  if (!queryNorm || !productHay) return 0;
  if (productHay.includes(queryNorm)) return 100 + Math.min(queryNorm.length, 40);
  const words = queryNorm.split(/\s+/).filter((w) => w.length >= 4);
  let score = 0;
  for (const w of words) {
    if (productHay.includes(w)) score += 20 + Math.min(w.length, 12);
  }
  return score;
}

function matchProducts(
  queries: string[],
  candidates: CatalogProductCandidate[],
  allowAttach: boolean,
  userText: string,
): MatchedProductCard[] {
  if (!allowAttach || !queries.length) return [];
  const cards: MatchedProductCard[] = [];
  const seen = new Set<number>();
  const blockVitamins = isAcuteSymptomAsk(userText) && !userAskedForVitamins(userText);

  for (const raw of queries) {
    const q = normalizeUserSpeech(raw);
    if (q.length < 3) continue;

    let best: CatalogProductCandidate | null = null;
    let bestScore = 0;
    for (const p of candidates) {
      if (seen.has(p.id)) continue;
      const hay = normalizeUserSpeech(
        `${p.nameUz} ${p.nameRu} ${p.sku} ${p.analogGroup || ""} ${p.category || ""}`,
      );
      if (blockVitamins && isVitaminOrSupplementQuery(hay)) continue;
      const score = scoreProductMatch(q, hay);
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    // Require a real match (avoid weak 1-word collisions)
    if (!best || bestScore < 20) continue;
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
  const isEmergency = Boolean(parsed?.isEmergency);
  const productQueries = reconcileProductQueries(
    reply,
    parsed?.productQueries,
    userText,
    candidates,
  );
  const allowProducts =
    !isEmergency &&
    productQueries.length > 0 &&
    (isMedicineSeekingAsk(userText) ||
      productQueries.some((q) => normalizeUserSpeech(reply).includes(normalizeUserSpeech(q))) ||
      KNOWN_OTC_ALIASES.some((a) => a.re.test(reply)));
  const chips = Array.isArray(parsed?.quickSuggestions)
    ? parsed!.quickSuggestions!.map(String).filter(Boolean).slice(0, 4)
    : [];
  return {
    success: true,
    reply: reply.trim().slice(0, 4000),
    isMedical: parsed?.isMedical !== false,
    isPrescription: false,
    matchedProducts: matchProducts(productQueries, candidates, allowProducts, userText),
    quickSuggestions: chips.length ? chips : defaultChips(lang),
  };
}

export async function tryMedicalLlmReply(input: MedicalLlmInput): Promise<MedicalLlmChatResult | null> {
  if (!isLlmConfigured()) return null;
  const userText = String(input.message || "").trim();
  if (!userText && !input.hasImage) return null;

  const cfg = getLlmConfig();
  const catalogHint = compactCatalog(input.candidates);
  // preferPlainText providers (Groq/Ollama) skip brittle JSON mode
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

  // Plain-text-first for Groq/Ollama; JSON first for OpenAI-compatible hosts that handle it well
  const preferJson = Boolean(cfg && !cfg.preferPlainText);
  let raw = await chatCompletion(messages, {
    temperature: 0.3,
    maxTokens: 1100,
    responseFormatJson: preferJson,
  });

  if (!raw && preferJson) {
    raw = await chatCompletion(messages, {
      temperature: 0.3,
      maxTokens: 1100,
      responseFormatJson: false,
    });
  }
  if (!raw) return null;

  const parsed = parseLlmJson(raw);
  if (parsed?.reply?.trim()) {
    return toResult(parsed.reply, userText, input.language, input.candidates, parsed);
  }

  return toResult(raw, userText, input.language, input.candidates, null);
}
