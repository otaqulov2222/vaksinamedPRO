import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { handleAiMedicalChatAsync } from "../src/lib/aiMedicalChat";
import { isLlmConfigured } from "../src/lib/aiLlm";

describe("AI medical chat orchestrator", () => {
  it("falls back to rule-based when LLM is not configured", async () => {
    assert.equal(isLlmConfigured(), false);
    const res = await handleAiMedicalChatAsync({
      message: "boshim ogriydi nima ichay",
      language: "uz",
      candidates: [],
    });
    assert.equal(res.success, true);
    assert.match(res.reply, /bosh|og['']ri|Paratsetamol|og‘ri/i);
  });

  it("keeps prescription path deterministic", async () => {
    const res = await handleAiMedicalChatAsync({
      message: "Rp: Tab. Paratsetamol 500 mg #10",
      language: "uz",
      candidates: [
        {
          id: 1,
          sku: "PARA500",
          nameUz: "Paratsetamol 500 mg",
          nameRu: "Парацетамол 500 мг",
          category: "Analgesic",
          manufacturer: "Test",
          price: 5000,
          unit: "box",
          requiresPrescription: false,
          availableQuantity: 5,
        },
      ],
    });
    assert.equal(res.success, true);
    assert.equal(res.isPrescription, true);
  });
});
