import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildMedicalLlmResult,
  reconcileProductQueries,
  sanitizeAssistantReply,
} from "../src/lib/aiMedicalLlm";
import { isExplicitMedicinePurchaseRequest } from "../src/lib/aiPrescriptionChat";
import { offlineAssistantFallback } from "../src/lib/aiLocale";
import type { CatalogProductCandidate } from "../src/lib/prescriptionEngine";

const candidates: CatalogProductCandidate[] = [
  {
    id: 1,
    sku: "PARA500",
    nameUz: "Paratsetamol 500 mg (Demo)",
    nameRu: "Парацетамол 500 мг (Demo)",
    category: "Analgesic",
    manufacturer: "DemoPharm",
    price: 8000,
    unit: "box",
    requiresPrescription: false,
    availableQuantity: 12,
  },
  {
    id: 2,
    sku: "VITD3",
    nameUz: "Vitamin D3 2000 IU (Demo)",
    nameRu: "Витамин D3 2000 IU (Demo)",
    category: "Vitamin",
    manufacturer: "Solgar (Demo)",
    price: 89000,
    unit: "bottle",
    requiresPrescription: false,
    availableQuantity: 5,
  },
  {
    id: 3,
    sku: "AQUA",
    nameUz: "Aqua Maris sprey (Demo)",
    nameRu: "Аква Марис спрей (Demo)",
    category: "Shamollash",
    manufacturer: "Jadran",
    price: 36000,
    unit: "bottle",
    requiresPrescription: false,
    availableQuantity: 4,
  },
  {
    id: 4,
    sku: "SMEC",
    nameUz: "Smecta (Demo)",
    nameRu: "Смекта (Demo)",
    category: "Ovqat hazm",
    manufacturer: "Ipsen",
    price: 32000,
    unit: "box",
    requiresPrescription: false,
    availableQuantity: 6,
  },
  {
    id: 5,
    sku: "LINE",
    nameUz: "Linex (Demo)",
    nameRu: "Линекс (Demo)",
    category: "Ovqat hazm",
    manufacturer: "Sandoz",
    price: 64000,
    unit: "box",
    requiresPrescription: false,
    availableQuantity: 3,
  },
  {
    id: 6,
    sku: "VM-ACC",
    nameUz: "ACC 200 mg (Demo)",
    nameRu: "АЦЦ 200 мг (Демо)",
    category: "Shamollash",
    manufacturer: "Sandoz (Demo)",
    price: 47000,
    unit: "box",
    requiresPrescription: false,
    availableQuantity: 8,
    analogGroup: "cough",
  },
  {
    id: 7,
    sku: "VM-STRIP",
    nameUz: "Accu-Chek Active strip (Demo)",
    nameRu: "Accu-Chek Active полоски (Демо)",
    category: "Devices",
    manufacturer: "Accu-Chek (Demo)",
    price: 120000,
    unit: "box",
    requiresPrescription: false,
    availableQuantity: 2,
  },
  {
    id: 8,
    sku: "ESP",
    nameUz: "Espumizan (Demo)",
    nameRu: "Эспумизан (Demo)",
    category: "Ovqat hazm",
    manufacturer: "Berlin-Chemie",
    price: 41000,
    unit: "box",
    requiresPrescription: false,
    availableQuantity: 5,
  },
];

describe("AI product card grounding", () => {
  it("prefers Paracetamol from reply over Vitamin D3 in productQueries", () => {
    const reply =
      "Bosh orqa tomoni og'rig'i bo'yin mushaklari yoki qon bosimidan bo'lishi mumkin. Katalogda Paratsetamol 500 mg mavjud, lekin dozani shifokor bilan aniqlang.";
    const queries = reconcileProductQueries(reply, ["Vitamin D3 2000 IU"], "boshimni orqa tomoni ogriyabdi");
    assert.deepEqual(queries, ["paratsetamol"]);
  });

  it("does not attach Vitamin D3 card for occipital headache", () => {
    const reply =
      "Boshning orqa qismi og'riganda dam oling, qon bosimini o'lchang. Katalogda Paratsetamol 500 mg mavjud, lekin uni qabul qilishdan oldin dozani shifokor bilan aniqlang.";
    const res = buildMedicalLlmResult(reply, "boshimni orqa tomoni ogriyabdi", "uz", candidates, {
      isEmergency: false,
      isMedical: true,
      productQueries: ["Vitamin D3 2000 IU", "Paratsetamol"],
      quickSuggestions: ["Qon bosimini o'lchash", "Shifokorga murojaat qilish"],
    });
    assert.equal(res.matchedProducts.length, 1);
    assert.match(res.matchedProducts[0]!.nameUz, /Paratsetamol/i);
    assert.ok(!/Vitamin|D3/i.test(res.matchedProducts[0]!.nameUz));
  });

  it("keeps Vitamin D3 when user explicitly asks for it", () => {
    const reply = "Vitamin D3 2000 IU suyak mustahkamligi uchun qo'llaniladi. Katalogda mavjud.";
    const res = buildMedicalLlmResult(reply, "Vitamin D3 bormi?", "uz", candidates, {
      productQueries: ["Vitamin D3"],
    });
    assert.equal(res.matchedProducts.length, 1);
    assert.match(res.matchedProducts[0]!.nameUz, /Vitamin D3/i);
  });

  it("attaches no card when reply has no named medicine", () => {
    const reply = "Dam oling, qon bosimini o'lchang. Agar og'riq kuchaysa shifokorga boring.";
    const res = buildMedicalLlmResult(reply, "boshim ogriyapti", "uz", candidates, {
      productQueries: ["Vitamin D3"],
    });
    assert.equal(res.matchedProducts.length, 0);
  });

  it("attaches Aqua Maris + Paracetamol for cold reply that names both", () => {
    const reply =
      "Ko'p suv iching. Burun bitganda Aqua Maris sprey yordam beradi. Og'riq yoki isitmada Paratsetamol 500 mg ichish mumkin.";
    const res = buildMedicalLlmResult(reply, "shamollaganman", "uz", candidates, {
      productQueries: ["Paratsetamol"],
    });
    const names = res.matchedProducts.map((p) => p.nameUz).join(" | ");
    assert.match(names, /Aqua Maris/i);
    assert.match(names, /Paratsetamol/i);
  });

  it("attaches Smecta and Linex when stomach reply names them", () => {
    const reply =
      "Hazm bilan bog'liq og'riqda Smecta yoki Linex yordam berishi mumkin, lekin shifokor bilan maslahatlashing.";
    const res = buildMedicalLlmResult(reply, "qornim ogriyabdi", "uz", candidates, {
      productQueries: [],
    });
    const names = res.matchedProducts.map((p) => p.nameUz).join(" | ");
    assert.match(names, /Smecta/i);
    assert.match(names, /Linex/i);
  });

  it("ACC cough medicine must not attach Accu-Chek strips", () => {
    const reply = "Balg'amli yo'talda ACC 200 mg yordam berishi mumkin.";
    const res = buildMedicalLlmResult(reply, "yo'talim bor balg'amli", "uz", candidates, {
      productQueries: ["ACC"],
    });
    assert.equal(res.matchedProducts.length, 1);
    assert.match(res.matchedProducts[0]!.nameUz, /^ACC 200/i);
    assert.ok(!/Accu-Chek/i.test(res.matchedProducts[0]!.nameUz));
  });

  it("never leaks nested JSON as the visible reply", () => {
    assert.equal(
      sanitizeAssistantReply('{"reply":"Salom","productQueries":["Paratsetamol"]}'),
      "Salom",
    );
    // Nested object inside reply is unwrapped or rejected — never raw JSON braces for the user
    const nested = sanitizeAssistantReply('{"reply":"{\\"reply\\":\\"Ichki\\"}","productQueries":[]}');
    assert.ok(nested === "Ichki" || nested === null);
    assert.ok(!nested || !/^\s*\{/.test(nested));
    assert.equal(sanitizeAssistantReply('{"productQueries":["x"]}'), null);
    assert.equal(sanitizeAssistantReply('{"isMedical":true}'), null);
  });

  it("uses contextual chips instead of Vitamin D3 defaults", () => {
    const reply = "Bosh og'rig'ida Paratsetamol yordam berishi mumkin.";
    const res = buildMedicalLlmResult(reply, "boshim ogriyabdi", "uz", candidates, {
      productQueries: ["Paratsetamol"],
      quickSuggestions: [],
    });
    const chips = (res.quickSuggestions || []).join(" ");
    assert.ok(!/Vitamin D3/i.test(chips));
    assert.match(chips, /bosim|Shifokor|Dam|narx/i);
  });

  it("blocks vitamins for diarrhea-like acute asks", () => {
    const reply = "Ich ketganda Smecta yordam beradi. Vitamin D3 ham foydali deb aytiladi lekin hozir kerak emas.";
    const queries = reconcileProductQueries(reply, ["Vitamin D3", "Smecta"], "ichim ketayapti", candidates);
    assert.ok(queries.some((q) => /smecta/i.test(q)));
    assert.ok(!queries.some((q) => /vitamin|d3/i.test(q)));
  });
});

describe("Purchase intent must not fire on symptom bormi", () => {
  it("rejects fever/allergy presence questions", () => {
    assert.equal(isExplicitMedicinePurchaseRequest("isitma bormi?"), false);
    assert.equal(isExplicitMedicinePurchaseRequest("allergiya belgilari bormi"), false);
  });

  it("accepts real medicine stock questions", () => {
    assert.equal(isExplicitMedicinePurchaseRequest("Paracetamol bormi?"), true);
    assert.equal(isExplicitMedicinePurchaseRequest("dorixonada Paratsetamol bormi"), true);
    assert.equal(isExplicitMedicinePurchaseRequest("Paratsetamol narxi qancha"), true);
  });
});

describe("Offline fallback chips", () => {
  it("does not push Vitamin D3", () => {
    for (const lang of ["uz", "ru", "en"] as const) {
      const chips = offlineAssistantFallback(lang).quickSuggestions.join(" ");
      assert.ok(!/Vitamin D3|Витамин D3/i.test(chips), lang);
    }
  });
});
