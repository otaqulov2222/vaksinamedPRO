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
    availableQuantity: 15,
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
    availableQuantity: 8,
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
    availableQuantity: 20,
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

  it("2. Does NOT attach products on general greetings (salom / privet)", () => {
    const resUz = handleAiMedicalChat({
      message: "salom",
      language: "uz",
      candidates: mockCatalog,
    });
    assert.equal(resUz.isMedical, true);
    assert.equal(resUz.matchedProducts.length, 0); // No products on pure greeting!
    assert.ok(resUz.reply.includes("Assalomu alaykum"));
    assert.ok(resUz.reply.includes("shifokor"));

    const resRu = handleAiMedicalChat({
      message: "Здравствуйте",
      language: "ru",
      candidates: mockCatalog,
    });
    assert.equal(resRu.matchedProducts.length, 0);
    assert.ok(resRu.reply.includes("Здравствуйте"));
  });

  it("3. Does NOT attach products on gratitude / thanks", () => {
    const res = handleAiMedicalChat({
      message: "Rahmat katta",
      language: "uz",
      candidates: mockCatalog,
    });
    assert.equal(res.isMedical, true);
    assert.equal(res.matchedProducts.length, 0);
    assert.ok(res.reply.includes("Salomat"));
  });

  it("4. Issues emergency warning (103) on severe red flags without selling drugs", () => {
    const res = handleAiMedicalChat({
      message: "Yurak qattiq siqilib nafas qisyapti yordam bering",
      language: "uz",
      candidates: mockCatalog,
    });
    assert.equal(res.isMedical, true);
    assert.equal(res.matchedProducts.length, 0); // Strictly no drugs during emergency!
    assert.ok(res.reply.includes("103"));
    assert.ok(res.reply.includes("SHOSHILINCH"));
  });

  it("5. Allows and processes medical / symptom queries with clinical advice", () => {
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
    assert.ok(res.reply.includes("Shifokor"));
  });

  it("6. Processes prescription image / text and matches catalog medications", () => {
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

  it("7. Supports Russian language responses for symptom queries", () => {
    const res = handleAiMedicalChat({
      message: "Какое лекарство принять от головной боли?",
      language: "ru",
      candidates: mockCatalog,
    });
    assert.equal(res.isMedical, true);
    assert.ok(res.matchedProducts.length > 0);
    assert.ok(res.reply.includes("голов"));
  });
});
