import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildMedicalLlmResult,
  reconcileProductQueries,
} from "../src/lib/aiMedicalLlm";
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
    const catalog: CatalogProductCandidate[] = [
      ...candidates,
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
    ];
    const reply =
      "Ko'p suv iching. Burun bitganda Aqua Maris sprey yordam beradi. Og'riq yoki isitmada Paratsetamol 500 mg ichish mumkin.";
    const res = buildMedicalLlmResult(reply, "shamollaganman", "uz", catalog, {
      productQueries: ["Paratsetamol"],
    });
    const names = res.matchedProducts.map((p) => p.nameUz).join(" | ");
    assert.match(names, /Aqua Maris/i);
    assert.match(names, /Paratsetamol/i);
  });

  it("attaches Smecta and Linex when stomach reply names them", () => {
    const catalog: CatalogProductCandidate[] = [
      ...candidates,
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
    ];
    const reply =
      "Hazm bilan bog'liq og'riqda Smecta yoki Linex yordam berishi mumkin, lekin shifokor bilan maslahatlashing.";
    const res = buildMedicalLlmResult(reply, "qornim ogriyabdi", "uz", catalog, {
      productQueries: [],
    });
    const names = res.matchedProducts.map((p) => p.nameUz).join(" | ");
    assert.match(names, /Smecta/i);
    assert.match(names, /Linex/i);
  });
});
