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
  if (lang === "ru") return ["Сфотографировать рецепт", "Симптомы простуды", "Головная боль", "Витамин D3"];
  if (lang === "en") return ["Scan prescription", "Cold symptoms", "Headache", "Vitamin D3"];
  return ["Retseptni rasmga olish", "Shamollash alomatlari", "Bosh og‘rig‘i", "Vitamin D3"];
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
  const allowProducts =
    !isEmergency &&
    (isMedicineSeekingAsk(userText) || (parsed?.productQueries?.length ?? 0) > 0);
  const chips = Array.isArray(parsed?.quickSuggestions)
    ? parsed!.quickSuggestions!.map(String).filter(Boolean).slice(0, 4)
    : [];
  return {
    success: true,
    reply: reply.trim().slice(0, 4000),
    isMedical: parsed?.isMedical !== false,
    isPrescription: false,
    matchedProducts: matchProducts(parsed?.productQueries || [], candidates, allowProducts),
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
