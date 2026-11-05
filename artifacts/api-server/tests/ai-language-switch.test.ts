import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  detectReplyLanguage,
  handleAiMedicalChat,
  isLanguageSwitchRequest,
} from "../src/lib/aiPrescriptionChat";

describe("AI mid-chat language switch", () => {
  it("detects uzbek switch with typo gapr", () => {
    assert.equal(isLanguageSwitchRequest("ozbek tilida gapr"), true);
    assert.equal(detectReplyLanguage("ozbek tilida gapr", "ru"), "uz");
  });

  it("detects russian and english switch phrases", () => {
    assert.equal(detectReplyLanguage("ruscha gapir", "uz"), "ru");
    assert.equal(detectReplyLanguage("speak English please", "uz"), "en");
    assert.equal(isLanguageSwitchRequest("speak English please"), true);
  });

  it("replies in Uzbek when app locale is Russian", () => {
    const res = handleAiMedicalChat({
      message: "ozbek tilida gapr",
      language: "ru",
      candidates: [],
    });
    assert.equal(res.success, true);
    assert.match(res.reply, /o‘zbekcha|o'zbekcha|ozbekcha/i);
    assert.ok(!/Медицинский ИИ-консультант VaksinaMed/.test(res.reply));
    assert.ok(res.quickSuggestions?.some((s) => /Retsept|Shamollash|Bosh/i.test(s)));
  });

  it("does not treat normal medical text as a language switch", () => {
    assert.equal(isLanguageSwitchRequest("bosh og'rig'i"), false);
    const res = handleAiMedicalChat({
      message: "bosh og'rig'i",
      language: "uz",
      candidates: [],
    });
    assert.equal(res.success, true);
    assert.ok(!/bundan keyin o‘zbekcha javob beraman/i.test(res.reply));
  });
});
