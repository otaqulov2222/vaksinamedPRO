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
  {
    id: 4,
    sku: "MED-004",
    nameUz: "Ibuprofen 400 mg",
    nameRu: "Ибупрофен 400 мг",
    category: "Yallig'lanishga qarshi",
    manufacturer: "Bosnalijek",
    price: 14000,
    unit: "quti",
    requiresPrescription: false,
    analogGroup: "nsaid-ibu",
    availableQuantity: 10,
  },
  {
    id: 5,
    sku: "MED-005",
    nameUz: "Nurofen 200 mg",
    nameRu: "Нурофен 200 мг",
    category: "Yallig'lanishga qarshi",
    manufacturer: "Reckitt",
    price: 28000,
    unit: "quti",
    requiresPrescription: false,
    analogGroup: "nsaid-ibu",
    availableQuantity: 5,
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

  it("2. Does NOT attach products on general greetings (salom / privet / yaxshimisan)", () => {
    const resUz = handleAiMedicalChat({
      message: "salom",
      language: "uz",
      candidates: mockCatalog,
    });
    assert.equal(resUz.isMedical, true);
    assert.equal(resUz.matchedProducts.length, 0); // No products on pure greeting!
    assert.ok(resUz.reply.includes("Assalomu alaykum"));
    assert.ok(resUz.reply.includes("shifokor"));

    // Check conversational greeting "yaxshimisan"
    const resYaxshi = handleAiMedicalChat({
      message: "yaxshimisan",
      language: "uz",
      candidates: mockCatalog,
    });
    assert.equal(resYaxshi.isMedical, true);
    assert.equal(resYaxshi.matchedProducts.length, 0);
    assert.ok(resYaxshi.reply.includes("Assalomu alaykum"));
    assert.ok(resYaxshi.reply.includes("yaxshiman"));

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
    assert.ok(res.reply.includes("DIQQAT"));
  });

  it("5. Specifically handles toothache as clinical dental advice with ZERO unsolicited products", () => {
    const res = handleAiMedicalChat({
      message: "salom,tishim ogriyabdi",
      language: "uz",
      candidates: mockCatalog,
    });
    assert.equal(res.isMedical, true);
    assert.equal(res.isPrescription, false);
    assert.ok(res.reply.includes("Tish og‘rig‘ida"));
    assert.ok(res.reply.includes("stomatolog"));
    // Does NOT confuse with headache / blood pressure!
    assert.ok(!res.reply.includes("qon bosimi"));
    // Strictly NO unsolicited products attached for advice queries!
    assert.equal(res.matchedProducts.length, 0);
    assert.ok(res.quickSuggestions.includes("Ibuprofen sotib olish"));
  });

  it("6. Allows and processes headache queries with clinical advice (NO unwanted product attachments)", () => {
    const res = handleAiMedicalChat({
      message: "Boshim qattiq og'riyapti nima ichsam bo'ladi?",
      language: "uz",
      candidates: mockCatalog,
    });
    assert.equal(res.isMedical, true);
    assert.equal(res.isPrescription, false);
    // Pure consultation does not dump product cards
    assert.equal(res.matchedProducts.length, 0);
    assert.ok(res.reply.includes("Bosh og‘rig‘ida"));
    assert.ok(res.quickSuggestions.includes("Paratsetamol sotib olish"));
  });

  it("7. Explicit product purchase request attaches the single requested item", () => {
    const res = handleAiMedicalChat({
      message: "Ibuprofen sotib olish",
      language: "uz",
      candidates: mockCatalog,
    });
    assert.equal(res.isMedical, true);
    assert.equal(res.isPrescription, false);
    assert.equal(res.matchedProducts.length, 1);
    assert.equal(res.matchedProducts[0].nameUz, "Ibuprofen 400 mg");
  });

  it("8. Processes prescription image / text and matches catalog medications with isPrescription flag", () => {
    const rxText = "Rp: Tab. Paratsetamol 500 mg #10\nRp: Tab. Amoksitsillin 500 mg #20";
    const res = handleAiMedicalChat({
      message: rxText,
      language: "uz",
      candidates: mockCatalog,
    });
    assert.equal(res.isMedical, true);
    assert.equal(res.isPrescription, true); // Multiple prescribed drugs
    assert.equal(res.matchedProducts.length, 2);
    assert.equal(res.matchedProducts[0].nameUz, "Paratsetamol 500 mg");
    assert.equal(res.matchedProducts[1].nameUz, "Amoksitsillin 500 mg");
    assert.equal(res.matchedProducts[1].requiresPrescription, true);
  });

  it("9. Supports Russian language responses for toothache with zero unsolicited products", () => {
    const res = handleAiMedicalChat({
      message: "Здравствуйте, сильно болит зуб",
      language: "ru",
      candidates: mockCatalog,
    });
    assert.equal(res.isMedical, true);
    assert.equal(res.isPrescription, false);
    assert.equal(res.matchedProducts.length, 0);
    assert.ok(res.reply.includes("Зубная боль") || res.reply.includes("зубной боли"));
    assert.ok(res.reply.includes("стоматолог"));
  });

  it("10. Correctly handles 'qornim ogriyabdi' as clinical abdominal consultation (NEVER off-topic)", () => {
    assert.equal(isMedicalDomain("qornim ogriyabdi"), true);

    const res = handleAiMedicalChat({
      message: "qornim ogriyabdi",
      language: "uz",
      candidates: mockCatalog,
    });
    assert.equal(res.isMedical, true);
    assert.equal(res.isPrescription, false);
    assert.equal(res.matchedProducts.length, 0); // No unsolicited products
    assert.ok(res.reply.includes("Qorin va oshqozon"));
    assert.ok(res.reply.includes("ko‘richak") || res.reply.includes("appenditsit"));
    assert.ok(res.quickSuggestions.includes("No-shpa sotib olish"));
  });

  it("11. Correctly handles pediatric fever with strict ban on Aspirin/Analgin", () => {
    assert.equal(isMedicalDomain("bolamning isitmasi chiqdi"), true);

    const res = handleAiMedicalChat({
      message: "bolamning isitmasi chiqdi nima qilay",
      language: "uz",
      candidates: mockCatalog,
    });
    assert.equal(res.isMedical, true);
    assert.equal(res.matchedProducts.length, 0);
    assert.ok(res.reply.includes("AI tibbiy yordamchisi"));
    assert.ok(res.reply.toLowerCase().includes("pediatr"));
    assert.ok(res.reply.includes("Aspirin"));
    assert.ok(res.reply.includes("Reys sindromi"));
  });

  it("12. Correctly handles eye irritation & redness as ophthalmology consultation", () => {
    assert.equal(isMedicalDomain("ko'zim qizarib achishyapti"), true);

    const res = handleAiMedicalChat({
      message: "ko'zim qizarib achishyapti",
      language: "uz",
      candidates: mockCatalog,
    });
    assert.equal(res.isMedical, true);
    assert.equal(res.matchedProducts.length, 0);
    assert.ok(res.reply.includes("oftalmolog"));
    assert.ok(res.reply.includes("20-20-20"));
  });

  it("13. Correctly handles ear pain as ENT/otitis consultation forbidding alcohol drops", () => {
    assert.equal(isMedicalDomain("qulog'im ogriyapti"), true);

    const res = handleAiMedicalChat({
      message: "qulog'im qattiq ogriyapti",
      language: "uz",
      candidates: mockCatalog,
    });
    assert.equal(res.isMedical, true);
    assert.equal(res.matchedProducts.length, 0);
    assert.ok(res.reply.includes("Otit") || res.reply.includes("LOR"));
    assert.ok(res.reply.includes("spirt"));
  });

  it("14. Correctly handles food poisoning recommending rehydration and forbidding loperamide", () => {
    assert.equal(isMedicalDomain("ovqatdan zaharlanib ichim ketyapti"), true);

    const res = handleAiMedicalChat({
      message: "ovqatdan zaharlanib ichim ketyapti",
      language: "uz",
      candidates: mockCatalog,
    });
    assert.equal(res.isMedical, true);
    assert.equal(res.matchedProducts.length, 0);
    assert.ok(res.reply.includes("Regidron"));
    assert.ok(res.reply.includes("loperamid"));
  });

  it("15. Correctly handles constipation recommending fiber and safe laxatives", () => {
    assert.equal(isMedicalDomain("ichim qotib qoldi nima qilsam boladi"), true);

    const res = handleAiMedicalChat({
      message: "ichim qotib qoldi nima qilsam boladi",
      language: "uz",
      candidates: mockCatalog,
    });
    assert.equal(res.isMedical, true);
    assert.equal(res.matchedProducts.length, 0);
    assert.ok(res.reply.includes("Qabziyat") || res.reply.includes("Ich qotishi"));
    assert.ok(res.reply.includes("laktuloza") || res.reply.includes("Dyufalak"));
  });

  it("16. Correctly handles thermal burns forbidding oil/toothpaste application", () => {
    assert.equal(isMedicalDomain("issiq suv tokilib kuydim"), true);

    const res = handleAiMedicalChat({
      message: "issiq suv tokilib kuydim",
      language: "uz",
      candidates: mockCatalog,
    });
    assert.equal(res.isMedical, true);
    assert.equal(res.matchedProducts.length, 0);
    assert.ok(res.reply.includes("oqova suv"));
    assert.ok(res.reply.includes("yog‘") || res.reply.includes("sariyog‘"));
  });

  it("17. Correctly handles cystitis and burning urination", () => {
    assert.equal(isMedicalDomain("siyganda achishyapti"), true);

    const res = handleAiMedicalChat({
      message: "siyganda achishyapti nima qilsam boladi",
      language: "uz",
      candidates: mockCatalog,
    });
    assert.equal(res.isMedical, true);
    assert.equal(res.matchedProducts.length, 0);
    assert.ok(res.reply.includes("Tsistit") || res.reply.includes("urolog"));
  });

  it("18. Correctly handles elevated blood sugar & diabetes symptoms", () => {
    assert.equal(isMedicalDomain("qandim kotarilib ketdi"), true);

    const res = handleAiMedicalChat({
      message: "qandim kotarilib ketdi",
      language: "uz",
      candidates: mockCatalog,
    });
    assert.equal(res.isMedical, true);
    assert.equal(res.matchedProducts.length, 0);
    assert.ok(res.reply.includes("endokrinolog"));
    assert.ok(res.reply.includes("HbA1c"));
  });

  it("19. Correctly handles insomnia & stress with sleep hygiene guidance", () => {
    assert.equal(isMedicalDomain("uyqusizlik qiynayapti uxlay olmayapman"), true);

    const res = handleAiMedicalChat({
      message: "uyqusizlik qiynayapti uxlay olmayapman",
      language: "uz",
      candidates: mockCatalog,
    });
    assert.equal(res.isMedical, true);
    assert.equal(res.matchedProducts.length, 0);
    assert.ok(res.reply.includes("Uyqu gigiyenasi"));
    assert.ok(res.reply.includes("melatonin"));
  });

  it("20. Correctly handles sprain & trauma with R.I.C.E. protocol", () => {
    assert.equal(isMedicalDomain("oyoq qayrilib lat yedi"), true);

    const res = handleAiMedicalChat({
      message: "oyoq qayrilib lat yedi",
      language: "uz",
      candidates: mockCatalog,
    });
    assert.equal(res.isMedical, true);
    assert.equal(res.matchedProducts.length, 0);
    assert.ok(res.reply.includes("R.I.C.E."));
    assert.ok(res.reply.includes("travmatolog"));
  });

  it("21. Correctly handles nail trauma and broken/detached nails", () => {
    assert.equal(isMedicalDomain("tirnoq sinsa nima qilish kerak"), true);
    assert.equal(isMedicalDomain("tirnogim tushib qoldi deyayabman"), true);
    assert.equal(isMedicalDomain("сорвал ноготь что делать"), true);

    const res1 = handleAiMedicalChat({
      message: "tirnoq sinsa nima qilish kerak",
      language: "uz",
      candidates: mockCatalog,
    });
    assert.equal(res1.isMedical, true);
    assert.ok(res1.reply.includes("Tirnoq sinishi"));
    assert.ok(res1.reply.includes("Levomekol"));
    assert.ok(res1.reply.includes("Xlorgeksidin"));

    const res2 = handleAiMedicalChat({
      message: "tirnogim tushib qoldi deyayabman",
      language: "uz",
      candidates: mockCatalog,
    });
    assert.equal(res2.isMedical, true);
    assert.ok(res2.reply.includes("Tirnoq"));
    assert.ok(res2.reply.includes("jarrohga"));
  });

  it("22. Strictly blocks non-medical knowledge queries like chatgpt and metric units", () => {
    assert.equal(isMedicalDomain("1 km necha metrga teng"), false);
    assert.equal(isMedicalDomain("chatgpt haqida malumot ber"), false);

    const resKm = handleAiMedicalChat({
      message: "1 km necha metrga teng",
      language: "uz",
      candidates: mockCatalog,
    });
    assert.equal(resKm.isMedical, false);
    assert.ok(resKm.reply.includes("faqat tibbiyot va salomatlik"));

    const resGpt = handleAiMedicalChat({
      message: "chatgpt haqida malumot ber",
      language: "uz",
      candidates: mockCatalog,
    });
    assert.equal(resGpt.isMedical, false);
    assert.ok(resGpt.reply.includes("faqat tibbiyot va salomatlik"));
  });
  it("23. Correctly handles identity queries (siz kimsiz / nima qila olasiz) with zero products", () => {
    const res = handleAiMedicalChat({
      message: "siz kimsiz",
      language: "uz",
      candidates: mockCatalog,
    });
    assert.equal(res.isMedical, true);
    assert.ok(res.reply.includes("Men VaksinaMed dorixonalar tarmog‘ining"));
    assert.equal(res.matchedProducts.length, 0);
  });

  it("24. Correctly handles colloquial burn query 'qo\'lim kuydi' with zero products", () => {
    const res = handleAiMedicalChat({
      message: "qo'lim kuydi",
      language: "uz",
      candidates: mockCatalog,
    });
    assert.equal(res.isMedical, true);
    assert.ok(res.reply.includes("kuyish") || res.reply.includes("Kuyish") || res.reply.includes("Termik kuyish"));
    assert.ok(res.reply.includes("oqova suv") || res.reply.includes("suv ostida"));
    assert.equal(res.matchedProducts.length, 0);
  });
  it("25. Correctly handles informal Uzbek 'qalisan' and general help queries with 0 products", () => {
    const resQalisan = handleAiMedicalChat({
      message: "qalisan",
      language: "uz",
      candidates: mockCatalog,
    });
    assert.equal(resQalisan.isMedical, true);
    assert.ok(resQalisan.reply.includes("Assalomu alaykum! Rahmat, yaxshiman"));
    assert.equal(resQalisan.matchedProducts.length, 0);

    const resHelp = handleAiMedicalChat({
      message: "savolim bor yordam bera olasizmi",
      language: "uz",
      candidates: mockCatalog,
    });
    assert.equal(resHelp.isMedical, true);
    assert.ok(resHelp.reply.includes("Assalomu alaykum! Albatta, marhamat"));
    assert.equal(resHelp.matchedProducts.length, 0);

    const resNose = handleAiMedicalChat({
      message: "bolamning burni qonayapti",
      language: "uz",
      candidates: mockCatalog,
    });
    assert.equal(resNose.isMedical, true);
    assert.ok(resNose.reply.includes("burun") || resNose.reply.includes("Burun"));
    assert.equal(resNose.matchedProducts.length, 0);
  });
});
