import { tryMedicalLlmReply } from "./aiMedicalLlm";
import {
  handleAiMedicalChat,
  isLanguageSwitchRequest,
  type AiChatResponse,
} from "./aiPrescriptionChat";
import type { CatalogProductCandidate } from "./prescriptionEngine";
import { isLlmConfigured } from "./aiLlm";
import { detectReplyLanguage, offlineAssistantFallback } from "./aiLocale";

function looksLikePrescriptionScan(userText: string, hasImage: boolean): boolean {
  if (hasImage) return true;
  const t = userText.trim();
  if (/\brp\s*[:：]/i.test(t)) return true;
  if (/tab\.\s*\w+/i.test(t) && /\d+\s*mg/i.test(t)) return true;
  // Bare word "retsept" in a question is NOT a scan — e.g. "retseptni qanday yuboraman?"
  if (/\b(retsept|recept|рецепт)\b/i.test(t) && /(?:Rp:|mg|#\d+|tab\.|капсул|таблет)/i.test(t)) {
    return true;
  }
  return false;
}

/** Last clinical user turn before a language-switch message (so we still answer the prior question). */
function priorClinicalUserMessage(
  history: Array<{ role: "user" | "assistant"; content: string }> | undefined,
  current: string,
): string | null {
  if (!history?.length) return null;
  if (!isLanguageSwitchRequest(current)) return null;
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    if (h?.role !== "user") continue;
    const t = String(h.content || "").trim();
    if (!t || isLanguageSwitchRequest(t)) continue;
    if (looksLikePrescriptionScan(t, false)) continue;
    return t;
  }
  return null;
}

/**
 * Production orchestrator for Uzbekistan-wide medical chat.
 * LLM-first for free-form; deterministic catalog path for real prescriptions;
 * language-safe soft fallback if the model is down (never wrong-language walls).
 */
export async function handleAiMedicalChatAsync(params: {
  message?: string;
  image?: string;
  language?: "uz" | "ru" | "en";
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  candidates: CatalogProductCandidate[];
}): Promise<AiChatResponse> {
  const userText = String(params.message || "").trim();
  const hasImage = Boolean(params.image && params.image.trim().length > 0);
  const appLang = params.language || "uz";
  const lang = detectReplyLanguage(userText, appLang);
  const priorClinical = priorClinicalUserMessage(params.history, userText);
  const effectiveMessage = priorClinical || userText;

  if (looksLikePrescriptionScan(userText, hasImage)) {
    return handleAiMedicalChat({
      message: params.message,
      image: params.image,
      language: lang,
      candidates: params.candidates,
    });
  }

  if (isLlmConfigured()) {
    const llm = await tryMedicalLlmReply({
      message: userText,
      language: lang,
      history: params.history,
      candidates: params.candidates,
      hasImage: false,
    });
    if (llm?.reply?.trim()) {
      return llm as AiChatResponse;
    }
  }

  // Soft, language-correct offline fallback (avoid dumping wrong-locale clinical templates)
  const soft = offlineAssistantFallback(lang);
  // On language switch without LLM: answer the prior clinical question in the new language
  const rules = handleAiMedicalChat({
    message: effectiveMessage,
    image: params.image,
    language: lang,
    candidates: params.candidates,
  });

  // If rules only produced the generic clarification wall, prefer soft capability intro
  const isGenericWall =
    /Чтобы предоставить вам точную|To provide safe and accurate|to‘g‘ri va xavfsiz yordam bera olishim uchun/i.test(
      rules.reply,
    );
  if (isGenericWall) {
    return {
      success: true,
      reply: soft.reply,
      isMedical: true,
      isPrescription: false,
      matchedProducts: [],
      quickSuggestions: soft.quickSuggestions,
    };
  }

  return rules;
}
