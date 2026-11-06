import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  detectSymptomBucket,
  isProductAllowedForUserAsk,
} from "../src/lib/aiProductPolicy";
import { buildMedicalLlmResult } from "../src/lib/aiMedicalLlm";
import type { CatalogProductCandidate } from "../src/lib/prescriptionEngine";

const catalog: CatalogProductCandidate[] = [
  {
    id: 1,
    sku: "PARA",
    nameUz: "Paratsetamol 500 mg (Demo)",
    nameRu: "Парацетамол",
    category: "Analgesic",
    manufacturer: "X",
    price: 8000,
    unit: "box",
    requiresPrescription: false,
    analogGroup: "analgesic",
    availableQuantity: 5,
  },
  {
    id: 2,
    sku: "ACC",
    nameUz: "ACC 200 mg (Demo)",
    nameRu: "АЦЦ",
    category: "Shamollash",
    manufacturer: "Sandoz",
    price: 47000,
    unit: "box",
    requiresPrescription: false,
    analogGroup: "cough",
    availableQuantity: 5,
  },
  {
    id: 3,
    sku: "AQUA",
    nameUz: "Aqua Maris sprey (Demo)",
    nameRu: "Аква Марис",
    category: "Shamollash",
    manufacturer: "Jadran",
    price: 36000,
    unit: "bottle",
    requiresPrescription: false,
    analogGroup: "nasal",
    availableQuantity: 5,
  },
  {
    id: 4,
    sku: "MASK",
    nameUz: "Tibbiy niqob 50 dona (Demo)",
    nameRu: "Маска",
    category: "First aid",
    manufacturer: "X",
    price: 15000,
    unit: "box",
    requiresPrescription: false,
    analogGroup: "first-aid",
    availableQuantity: 5,
  },
  {
    id: 5,
    sku: "AMOX",
    nameUz: "Amoksitsillin 500 mg (Demo)",
    nameRu: "Амоксициллин",
    category: "Antibiotik",
    manufacturer: "X",
    price: 28000,
    unit: "box",
    requiresPrescription: true,
    analogGroup: "antibiotic",
    availableQuantity: 5,
  },
  {
    id: 6,
    sku: "NURO",
    nameUz: "Nurofen 200 mg (Demo)",
    nameRu: "Нурофен",
    category: "Analgesic",
    manufacturer: "X",
    price: 22000,
    unit: "box",
    requiresPrescription: false,
    analogGroup: "analgesic",
    availableQuantity: 5,
  },
];

describe("AI product policy gate", () => {
  it("detects cough from yotalim", () => {
    assert.equal(detectSymptomBucket("yotalim bor"), "cough");
  });

  it("blocks products on capability asks", () => {
    assert.equal(detectSymptomBucket("nima qila olasan"), "meta");
    assert.equal(
      isProductAllowedForUserAsk("nima qila olasan", catalog[3]!),
      false,
    );
  });

  it("nasal ask cannot attach Paracetamol", () => {
    assert.equal(detectSymptomBucket("burnim bitib qoldi"), "nasal");
    assert.equal(isProductAllowedForUserAsk("burnim bitib qoldi", catalog[0]!), false);
    assert.equal(isProductAllowedForUserAsk("burnim bitib qoldi", catalog[2]!), true);
  });

  it("cough ask cannot attach Nurofen or antibiotics", () => {
    assert.equal(isProductAllowedForUserAsk("balgamli yotal", catalog[5]!), false);
    assert.equal(isProductAllowedForUserAsk("balgamli yotal", catalog[4]!), false);
    assert.equal(isProductAllowedForUserAsk("balgamli yotal", catalog[1]!), true);
  });

  it("eye redness attaches no cards even if LLM names wrong OTCs", () => {
    const res = buildMedicalLlmResult(
      "Ko'z qizarishi uchun Paratsetamol va Aqua Maris yordam berishi mumkin.",
      "kozim qizarib achishyapti",
      "uz",
      catalog,
      { productQueries: ["Paratsetamol", "Aqua Maris", "ACC"] },
    );
    assert.equal(res.matchedProducts.length, 0);
  });

  it("capability reply cannot attach mask", () => {
    const res = buildMedicalLlmResult(
      "Men VaksinaMed yordamchisiman. Tibbiy niqob ham bor katalogda.",
      "nima qila olasan",
      "uz",
      catalog,
      { productQueries: ["Tibbiy niqob"] },
    );
    assert.equal(res.matchedProducts.length, 0);
  });
});
