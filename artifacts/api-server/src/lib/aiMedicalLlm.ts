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
- Typos, slang, missing apostrophes, keyboard mash (ogriydi, nma ichay, gapr, qornim, yuragim ezilyapti) — infer intent, do NOT ask them to retype unless truly ambiguous clinically.
- Reply in the same language the user is using now (or the app language ${lang} if unclear). Prefer natural spoken tone, not bureaucratic.

HARD SAFETY:
- Life-threatening signs (crushing chest pain, stroke signs, severe bleeding, loss of consciousness, anaphylaxis, child seizure, poisoning with collapse) → tell them to call 103 immediately. Do not sell medicines in that case.
- Never invent diagnoses as certainty. Advice is informational; remind to see a doctor before taking Rx drugs / antibiotics.
- Never invent pharmacy networks, FOM, PSP, payments, or fake stock numbers.
- Antibiotics only with clear bacterial indication + doctor prescription reminder.

CATALOG (names you may suggest when relevant; pick at most 3 that truly fit):
${catalogHint || "(catalog empty in this request)"}

OUTPUT: Return ONLY valid JSON object with keys:
{
  "reply": "full assistant message to show the user (markdown-lite OK, use 🩺 sparingly)",
  "isEmergency": boolean,
  "isMedical": boolean,
  "productQueries": ["optional medicine name fragments to match in catalog"],
  "quickSuggestions": ["2-4 short follow-up chip labels in reply language"]
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

  const raw = await chatCompletion(messages, {
    temperature: 0.35,
    maxTokens: 1000,
    responseFormatJson: true,
  });
  if (!raw) return null;

  const parsed = parseLlmJson(raw);
  if (!parsed?.reply?.trim()) {
    return {
      success: true,
      reply: raw.slice(0, 4000),
      isMedical: true,
      isPrescription: false,
      matchedProducts: [],
      quickSuggestions: [],
    };
  }

  const allowProducts =
    !parsed.isEmergency &&
    (isMedicineSeekingAsk(userText) || (parsed.productQueries?.length ?? 0) > 0);

  const matchedProducts = matchProducts(
    parsed.productQueries || [],
    input.candidates,
    allowProducts && !parsed.isEmergency,
  );

  return {
    success: true,
    reply: parsed.reply.trim(),
    isMedical: parsed.isMedical !== false,
    isPrescription: false,
    matchedProducts,
    quickSuggestions: Array.isArray(parsed.quickSuggestions)
      ? parsed.quickSuggestions.map(String).filter(Boolean).slice(0, 4)
      : [],
  };
}
