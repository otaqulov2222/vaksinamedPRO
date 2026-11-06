import type { CatalogProductCandidate } from "./prescriptionEngine";
import { isMedicineSeekingAsk, normalizeUserSpeech } from "./aiChatNlu";
import { chatCompletion, isLlmConfigured, type LlmMessage } from "./aiLlm";

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
  language: "uz" | "ru" | "en";
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  candidates: CatalogProductCandidate[];
  hasImage?: boolean;
}

function buildSystemPrompt(lang: "uz" | "ru" | "en", catalogHint: string): string {
  return `You are VaksinaMed Medical AI Consultant — the in-app pharmacy health assistant for Uzbekistan.

MISSION: Understand the user EXACTLY like a careful bilingual human who has talked with them for a long time.
- Informal Uzbek Latin, Cyrillic Uzbek, Russian, English, or mixed — all OK.
- Typos, slang, missing apostrophes, keyboard mash — infer intent; do NOT ask them to retype unless clinically ambiguous.
- Reply in the SAME language the user is writing NOW (app default: ${lang}). If they say "o'zbekcha javob ber" / "по-русски" / "in English", switch and ALSO answer their previous question from chat history — do not only acknowledge the language switch.
- Capability questions ("nima qila olasan", "nimalarga javob berasan") → clearly list what you can do in their language.

HARD SAFETY:
- Life-threatening signs → tell them to call 103 immediately. Do not sell medicines then.
- Advice is informational; remind to see a doctor before Rx / antibiotics.
- Never invent FOM, PSP, fake networks, or fake stock.
- Antibiotics only with clear bacterial indication + prescription reminder.

CATALOG (suggest at most 3 when truly relevant):
${catalogHint || "(catalog empty in this request)"}

OUTPUT FORMAT (mandatory):
Return ONLY a single JSON object. No markdown fences. No prose outside JSON.
{
  "reply": "message shown to the user",
  "isEmergency": false,
  "isMedical": true,
  "productQueries": [],
  "quickSuggestions": ["chip1", "chip2"]
}`;
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
    if (lines.length >= 80) break;
  }
  return lines.join("\n");
}

function matchProducts(
  queries: string[],
  candidates: CatalogProductCandidate[],
  allowAttach: boolean,
): MatchedProductCard[] {
  if (!allowAttach || !queries.length) return [];
  const cards: MatchedProductCard[] = [];
  const seen = new Set<number>();

  for (const raw of queries) {
    const q = normalizeUserSpeech(raw);
    if (q.length < 3) continue;
    for (const p of candidates) {
      if (seen.has(p.id)) continue;
      const hay = normalizeUserSpeech(`${p.nameUz} ${p.nameRu} ${p.sku} ${p.analogGroup || ""}`);
      if (!hay.includes(q) && !q.split(/\s+/).some((w) => w.length >= 4 && hay.includes(w))) {
        continue;
      }
      seen.add(p.id);
      cards.push({
        id: p.id,
        sku: p.sku,
        nameUz: p.nameUz,
        nameRu: p.nameRu,
        category: p.category,
        manufacturer: p.manufacturer,
        price: p.price,
        unit: p.unit,
        requiresPrescription: p.requiresPrescription,
        analogGroup: p.analogGroup,
        inStock: (p.availableQuantity ?? 1) > 0,
      });
      if (cards.length >= 3) return cards;
      break;
    }
  }
  return cards;
}

function parseLlmJson(raw: string): {
  reply: string;
  isEmergency?: boolean;
  isMedical?: boolean;
  productQueries?: string[];
  quickSuggestions?: string[];
} | null {
  const trimmed = raw.trim();
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

function toResult(
  reply: string,
  userText: string,
  candidates: CatalogProductCandidate[],
  parsed?: {
    isEmergency?: boolean;
    isMedical?: boolean;
    productQueries?: string[];
    quickSuggestions?: string[];
  } | null,
): MedicalLlmChatResult {
  const isEmergency = Boolean(parsed?.isEmergency);
  const allowProducts =
    !isEmergency &&
    (isMedicineSeekingAsk(userText) || (parsed?.productQueries?.length ?? 0) > 0);
  return {
    success: true,
    reply: reply.trim().slice(0, 4000),
    isMedical: parsed?.isMedical !== false,
    isPrescription: false,
    matchedProducts: matchProducts(parsed?.productQueries || [], candidates, allowProducts),
    quickSuggestions: Array.isArray(parsed?.quickSuggestions)
      ? parsed!.quickSuggestions!.map(String).filter(Boolean).slice(0, 4)
      : [],
  };
}

export async function tryMedicalLlmReply(input: MedicalLlmInput): Promise<MedicalLlmChatResult | null> {
  if (!isLlmConfigured()) return null;
  const userText = String(input.message || "").trim();
  if (!userText && !input.hasImage) return null;

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

  // 1) Prefer JSON mode (structured chips/products)
  let raw = await chatCompletion(messages, {
    temperature: 0.35,
    maxTokens: 1000,
    responseFormatJson: true,
  });

  // 2) If JSON mode empty/failed without rescue, retry plain text
  if (!raw) {
    raw = await chatCompletion(messages, {
      temperature: 0.35,
      maxTokens: 1000,
      responseFormatJson: false,
    });
  }
  if (!raw) return null;

  const parsed = parseLlmJson(raw);
  if (parsed?.reply?.trim()) {
    return toResult(parsed.reply, userText, input.candidates, parsed);
  }

  // Plain-text rescue (Groq failed_generation or non-JSON model output)
  return toResult(raw, userText, input.candidates, null);
}
