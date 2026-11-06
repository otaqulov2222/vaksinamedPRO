import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectReplyLanguage } from "../src/lib/aiPrescriptionChat";

describe("AI reply language inference", () => {
  it("prefers Uzbek when user writes informal Uzbek even if app locale is Russian", () => {
    assert.equal(detectReplyLanguage("nimalarga javob beraolsan ozi nimalar qilaolasan", "ru"), "uz");
    assert.equal(detectReplyLanguage("yuqoridagi savolimga o'zbekcha javob ber", "ru"), "uz");
  });

  it("detects Russian Cyrillic messages", () => {
    assert.equal(detectReplyLanguage("Что ты умеешь делать?", "uz"), "ru");
  });
});
