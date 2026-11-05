import { tryMedicalLlmReply } from "./aiMedicalLlm";
import {
  handleAiMedicalChat,
  type AiChatResponse,
} from "./aiPrescriptionChat";
import type { CatalogProductCandidate } from "./prescriptionEngine";
import { isLlmConfigured } from "./aiLlm";

/**
 * Orchestrates medical chat:
 * - Deterministic path for prescription photos / Rp text (catalog matching)
 * - LLM for free-form understanding (typos, slang, any phrasing) when configured
 * - Rule-based fallback when LLM is off or fails
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
  const lang = params.language || "uz";

  const looksLikePrescription =
    hasImage ||
    /\b(retsept|recept|рецепт)\b/i.test(userText) ||
    /\brp\s*[:：]/i.test(userText) ||
    /tab\.\s*\w+/i.test(userText);

  // Catalog/OCR fidelity stays rule-based
  if (looksLikePrescription) {
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
    if (llm) {
      return llm as AiChatResponse;
    }
  }

  return handleAiMedicalChat({
    message: params.message,
    image: params.image,
    language: lang,
    candidates: params.candidates,
  });
}
