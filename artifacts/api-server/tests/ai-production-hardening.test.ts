import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  detectReplyLanguage,
  isLanguageSwitchRequest,
  offlineAssistantFallback,
} from "../src/lib/aiLocale";
import { extractFailedGeneration } from "../src/lib/aiLlm";
import { parseLlmJson } from "../src/lib/aiMedicalLlm";
import { handleAiMedicalChatAsync } from "../src/lib/aiMedicalChat";

describe("Uzbekistan production AI hardening", () => {
  it("detects informal Uzbek over stale Russian app locale", () => {
    const samples = [
      "nimalarga javob beraolsan ozi nimalar qilaolasan",
      "boshim ogriydi nma ichay",
      "yuqoridagi savolimga o'zbekcha javob ber",
      "salom qalesan",
      "qornim ogriyabdi",
    ];
    for (const s of samples) {
      assert.equal(detectReplyLanguage(s, "ru"), "uz", s);
    }
  });

  it("detects Russian Cyrillic and English", () => {
    assert.equal(detectReplyLanguage("Что ты умеешь делать?", "uz"), "ru");
    assert.equal(detectReplyLanguage("what can you help with?", "uz"), "en");
  });

  it("treats language switch + answer-previous as switch intent", () => {
    assert.equal(isLanguageSwitchRequest("yuqoridagi savolimga o'zbekcha javob ber"), true);
    assert.equal(isLanguageSwitchRequest("bosh og'rig'i"), false);
  });

  it("rescues Groq failed_generation payloads", () => {
    const err = JSON.stringify({
      error: {
        message: "Failed to generate JSON",
        failed_generation: "Salom! Men yordam bera olaman.",
        code: "json_validate_failed",
      },
    });
    assert.equal(extractFailedGeneration(err), "Salom! Men yordam bera olaman.");
  });

  it("parses JSON replies even with markdown fences", () => {
    const raw = '```json\n{"reply":"Salom","isEmergency":false,"isMedical":true,"productQueries":[],"quickSuggestions":["A"]}\n```';
    const parsed = parseLlmJson(raw);
    assert.equal(parsed?.reply, "Salom");
  });

  it("offline fallback stays in the requested language", () => {
    assert.match(offlineAssistantFallback("uz").reply, /Assalomu alaykum|VaksinaMed/i);
    assert.match(offlineAssistantFallback("ru").reply, /Здравствуйте|VaksinaMed/i);
    assert.match(offlineAssistantFallback("en").reply, /Hello|VaksinaMed/i);
  });

  it("does not treat bare retsept question as prescription scan path without LLM key", async () => {
    const res = await handleAiMedicalChatAsync({
      message: "retseptni qanday yuborsam boladi",
      language: "ru",
      candidates: [],
    });
    assert.equal(res.success, true);
    // Should be Uzbek soft/capability style, not Russian clarification wall
    assert.ok(!/Чтобы предоставить вам точную/.test(res.reply));
  });
});
