import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { handleAiMedicalChat, isMedicalDomain } from "../src/lib/aiPrescriptionChat";
import type { CatalogProductCandidate } from "../src/lib/prescriptionEngine";

const mockCatalog: CatalogProductCandidate[] = [
  {
    id: 1,
    sku: "MED-001",
    nameUz: "Paratsetamol 500 mg",
    nameRu: "Парацетамол 500 мг",
    category: "Og'riq qoldiruvchi",
    manufacturer: "Nobel Pharm",
    price: 12000,
    unit: "quti",
    requiresPrescription: false,
    analogGroup: "paracetamol-500",
    inStock: true,
  },
  {
    id: 2,
    sku: "MED-002",
    nameUz: "Amoksitsillin 500 mg",
    nameRu: "Амоксициллин 500 мг",
    category: "Antibiotiklar",
    manufacturer: "Jurabek Laboratories",
    price: 24000,
    unit: "quti",
    requiresPrescription: true,
    analogGroup: "amoxicillin-500",
    inStock: true,
  },
  {
    id: 3,
    sku: "MED-003",
    nameUz: "Vitamin D3 2000 IU",
    nameRu: "Витамин D3 2000 МЕ",
    category: "Vitaminlar",
    manufacturer: "Solgar",
    price: 89000,
    unit: "flakon",
    requiresPrescription: false,
    analogGroup: "vitamin-d3",
    inStock: true,
  },
];

describe("VaksinaMed AI Medical & Prescription Chat Engine", () => {
  it("1. Guards against off-topic non-medical queries", () => {
    assert.equal(isMedicalDomain("Python dasturlash tilida kod yozib ber"), false);
    assert.equal(isMedicalDomain("Gentra mator moyini qachon almashtirish kerak?"), false);
    assert.equal(isMedicalDomain("Prezident saylovi haqida ma'lumot ber"), false);

    const res = handleAiMedicalChat({
      message: "Python kod yozib ber",
      language: "uz",
      candidates: mockCatalog,
    });
    assert.equal(res.isMedical, false);
    assert.equal(res.matchedProducts.length, 0);
    assert.ok(res.reply.includes("VaksinaMed"));
  });

  it("2. Allows and processes medical / symptom queries in Uzbek", () => {
    assert.equal(isMedicalDomain("Boshim qattiq og'riyapti nima ichsam bo'ladi?"), true);

    const res = handleAiMedicalChat({
      message: "Boshim qattiq og'riyapti nima ichsam bo'ladi?",
      language: "uz",
      candidates: mockCatalog,
    });
    assert.equal(res.isMedical, true);
    assert.ok(res.matchedProducts.length > 0);
    assert.equal(res.matchedProducts[0].nameUz, "Paratsetamol 500 mg");
    assert.ok(res.reply.includes("og‘riq"));
  });

  it("3. Processes prescription image / text and matches catalog medications", () => {
    const rxText = "Rp: Tab. Paratsetamol 500 mg #10\nRp: Tab. Amoksitsillin 500 mg #20";
    const res = handleAiMedicalChat({
      message: rxText,
      language: "uz",
      candidates: mockCatalog,
    });
    assert.equal(res.isMedical, true);
    assert.equal(res.matchedProducts.length, 2);
    assert.equal(res.matchedProducts[0].nameUz, "Paratsetamol 500 mg");
    assert.equal(res.matchedProducts[1].nameUz, "Amoksitsillin 500 mg");
    assert.equal(res.matchedProducts[1].requiresPrescription, true);
  });

  it("4. Supports Russian language responses for symptom queries", () => {
    const res = handleAiMedicalChat({
      message: "Какое лекарство принять от головной боли?",
      language: "ru",
      candidates: mockCatalog,
    });
    assert.equal(res.isMedical, true);
    assert.ok(res.matchedProducts.length > 0);
    assert.ok(res.reply.includes("головной"));
  });
});
