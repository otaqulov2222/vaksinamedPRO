import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  transliterateCyrillicToLatin,
  normalizeDrugToken,
  levenshteinDistance,
  stringSimilarity,
  matchPrescriptionLine,
  scanAndMatchPrescriptionText,
  type CatalogProductCandidate,
} from "../src/lib/prescriptionEngine";

describe("Prescription Recognition & Catalog Matcher Engine", () => {
  const mockCatalog: CatalogProductCandidate[] = [
    {
      id: 1,
      sku: "VM-PARA-500",
      nameUz: "Paratsetamol 500 mg",
      nameRu: "Парацетамол 500 мг",
      category: "Og‘riq va isitma",
      manufacturer: "Nika Pharm",
      price: 8000,
      unit: "quti",
      requiresPrescription: false,
      analogGroup: "analgesic",
      availableQuantity: 25,
    },
    {
      id: 2,
      sku: "VM-IBU-400",
      nameUz: "Ibuprofen 400 mg",
      nameRu: "Ибупрофен 400 мг",
      category: "Og‘riq va isitma",
      manufacturer: "Bosnalijek",
      price: 14000,
      unit: "quti",
      requiresPrescription: false,
      analogGroup: "analgesic",
      availableQuantity: 10,
    },
    {
      id: 3,
      sku: "VM-AMOX-500",
      nameUz: "Amoksitsillin 500 mg",
      nameRu: "Амоксициллин 500 мг",
      category: "Antibiotiklar",
      manufacturer: "Sandoz",
      price: 24000,
      unit: "quti",
      requiresPrescription: true,
      analogGroup: "antibiotic",
      availableQuantity: 15,
    },
    {
      id: 4,
      sku: "VM-AZIT-500",
      nameUz: "Azitromitsin 500 mg",
      nameRu: "Азитромицин 500 мг",
      category: "Antibiotiklar",
      manufacturer: "KRKA",
      price: 38000,
      unit: "quti",
      requiresPrescription: true,
      analogGroup: "antibiotic",
      availableQuantity: 8,
    },
    {
      id: 5,
      sku: "VM-D3-2000",
      nameUz: "Vitamin D3 2000 IU",
      nameRu: "Витамин D3 2000 IU",
      category: "Vitaminlar",
      manufacturer: "Solgar",
      price: 89000,
      unit: "quti",
      requiresPrescription: false,
      availableQuantity: 5,
    },
  ];

  it("1. Transliteration correctly converts Cyrillic to Latin", () => {
    assert.equal(transliterateCyrillicToLatin("Парацетамол"), "paratsetamol");
    assert.equal(transliterateCyrillicToLatin("Амоксициллин"), "amoksitsillin");
    assert.equal(transliterateCyrillicToLatin("Азитромицин"), "azitromitsin");
  });

  it("2. Normalizer strips medical prefixes (Rp, Tab, Caps) and extracts dosage", () => {
    const res1 = normalizeDrugToken("Rp: Tab. Amoksitsillin 500 mg #20");
    assert.equal(res1.normalized, "amoksitsillin");
    assert.equal(res1.dosage, "500 mg");

    const res2 = normalizeDrugToken("Таб. Парацетамол 500мг по 1т х 2 раза");
    assert.equal(res2.normalized, "paratsetamol");
    assert.equal(res2.dosage, "500mg");
  });

  it("3. Distance & similarity calculation accurately scores typos", () => {
    assert.equal(levenshteinDistance("amoksiklav", "amoksiklav"), 0);
    assert.equal(levenshteinDistance("amoksiklav", "amoxiklav"), 2);
    const sim = stringSimilarity("amoksiklav", "amoxiklav");
    assert.ok(sim >= 0.8);
  });

  it("4. Matches Latin handwritten prescription line with high confidence", () => {
    const match = matchPrescriptionLine("Rp: Tab. Amoksitsillin 500 mg #20", mockCatalog);
    assert.ok(match != null);
    assert.equal(match?.matchedProduct?.sku, "VM-AMOX-500");
    assert.equal(match?.matchedProduct?.requiresPrescription, true);
    assert.ok((match?.confidence ?? 0) >= 90);
    assert.equal(match?.confidenceLevel, "high");
  });

  it("5. Matches Cyrillic handwritten prescription line with high confidence", () => {
    const match = matchPrescriptionLine("Парацетамол 500 мг 1 таб 2 раза", mockCatalog);
    assert.ok(match != null);
    assert.equal(match?.matchedProduct?.sku, "VM-PARA-500");
    assert.ok((match?.confidence ?? 0) >= 90);
  });

  it("6. Handles slight OCR/handwriting typos (e.g. Paracetamol instead of Paratsetamol)", () => {
    const match = matchPrescriptionLine("Tab. Paracetamol 500mg", mockCatalog);
    assert.ok(match != null);
    assert.equal(match?.matchedProduct?.sku, "VM-PARA-500");
    assert.ok((match?.confidence ?? 0) >= 80);
  });

  it("7. Suggests cheaper alternatives / analogs when available", () => {
    // VM-IBU-400 (14000) vs VM-PARA-500 (8000)
    const match = matchPrescriptionLine("Ibuprofen 400 mg", mockCatalog);
    assert.ok(match != null);
    assert.ok(match?.alternatives != null && match.alternatives.length > 0);
    const alt = match.alternatives[0];
    assert.equal(alt.sku, "VM-PARA-500");
    assert.equal(alt.isCheaper, true);
  });

  it("8. Multi-line full prescription text scan parses and matches items", () => {
    const rawRxText = `
      Klinika: Shifoxona №1
      Sana: 15.10.2026
      Bemor: Firdavs
      
      1. Rp: Tab. Amoksitsillin 500 mg #10
         S: 1 t x 2 mahal ovqatdan keyin
         
      2. Парацетамол 500 мг
         S: isitma chiqqanda
         
      3. Vitamin D3 2000 IU #30
         S: ertalab 1 kapsula
    `;

    const result = scanAndMatchPrescriptionText(rawRxText, mockCatalog);
    assert.equal(result.success, true);
    assert.equal(result.items.length, 3);
    assert.equal(result.matchedCount, 3);

    const skus = result.items.map((i) => i.matchedProduct?.sku);
    assert.ok(skus.includes("VM-AMOX-500"));
    assert.ok(skus.includes("VM-PARA-500"));
    assert.ok(skus.includes("VM-D3-2000"));

    assert.ok(result.disclaimer.uz.includes("Retsept"));
  });
});
