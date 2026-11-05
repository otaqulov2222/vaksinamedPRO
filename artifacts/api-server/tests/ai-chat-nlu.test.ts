import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hasClinicalContent,
  isMedicineSeekingAsk,
  normalizeUserSpeech,
} from "../src/lib/aiChatNlu";
import { handleAiMedicalChat } from "../src/lib/aiPrescriptionChat";

describe("AI informal Uzbek NLU", () => {
  it("normalizes chat typos into canonical medical forms", () => {
    const q = normalizeUserSpeech("boshim ogriydi nma ichay");
    assert.match(q, /bosh/);
    assert.match(q, /og['']ri/);
    assert.match(q, /nima/);
    assert.match(q, /ichay/);
  });

  it("detects medicine-seeking slang", () => {
    assert.equal(isMedicineSeekingAsk("nima ichsam boladi"), true);
    assert.equal(isMedicineSeekingAsk("dori beringchi"), true);
    assert.equal(isMedicineSeekingAsk("salom"), false);
  });

  it("understands informal headache + ask", () => {
    const res = handleAiMedicalChat({
      message: "boshim ogriydi nima ichay",
      language: "uz",
      candidates: [],
    });
    assert.equal(res.success, true);
    assert.match(res.reply, /bosh|og['']ri|Paratsetamol|og‘ri/i);
  });

  it("understands informal stomach pain", () => {
    const res = handleAiMedicalChat({
      message: "qornim ogriyabdi",
      language: "uz",
      candidates: [],
    });
    assert.equal(res.success, true);
    assert.match(res.reply, /oshqozon|qorin|spazm|No-shpa|og‘ri/i);
  });

  it("understands informal cold/fever ask", () => {
    const res = handleAiMedicalChat({
      message: "isitmam chiqib ketti shamollab qoldim nima ichsam boladi",
      language: "uz",
      candidates: [],
    });
    assert.equal(res.success, true);
    assert.match(res.reply, /isitma|shamollash|Paratsetamol|harorat/i);
  });

  it("treats chest squeeze slang as emergency", () => {
    const res = handleAiMedicalChat({
      message: "yuragim ezilyapti",
      language: "uz",
      candidates: [],
    });
    assert.equal(res.success, true);
    assert.match(res.reply, /103|tez yordam|emergency/i);
  });

  it("does not treat boshqa as headache", () => {
    assert.equal(hasClinicalContent("boshqa savolim bor"), false);
  });

  it("still switches language on typo gapr", () => {
    const res = handleAiMedicalChat({
      message: "ozbek tilida gapr",
      language: "ru",
      candidates: [],
    });
    assert.match(res.reply, /o‘zbekcha|ozbekcha/i);
  });
});
