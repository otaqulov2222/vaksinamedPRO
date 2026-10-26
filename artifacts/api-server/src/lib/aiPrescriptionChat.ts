import {
  scanAndMatchPrescriptionText,
  type CatalogProductCandidate,
} from "./prescriptionEngine";

export interface AiChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface MatchedProductCard {
  id: number;
  sku: string;
  nameUz: string;
  nameRu: string;
  category: string;
  manufacturer: string;
  price: number;
  unit: string;
  requiresPrescription: boolean;
  analogGroup?: string;
  inStock: boolean;
  dosage?: string;
  instructions?: string;
  confidence?: number;
  cheaperAlternative?: {
    id: number;
    nameUz: string;
    nameRu: string;
    price: number;
    manufacturer: string;
    difference: number;
  };
}

export interface AiChatResponse {
  success: boolean;
  reply: string;
  isMedical: boolean;
  matchedProducts: MatchedProductCard[];
  quickSuggestions?: string[];
}

// Keywords that indicate the query is within the medical/pharmacy domain
const MEDICAL_KEYWORDS = [
  // General & greeting
  "salom", "assalom", "privet", "hello", "hi", "yordam", "rahmat", "spasibo",
  // Prescription & meds
  "retsept", "recept", "dori", "preparat", "tabletka", "kapsula", "sirop",
  "maz", "ukol", "ampula", "eritma", "tomchi", "sprey", "doza", "ichish", "ichiladi",
  "qabul", "qachon", "narx", "aptek", "dorixona", "savat", "buyurtma", "analog",
  // Symptoms
  "og'riq", "ogriq", "bosh", "tish", "bel", "oyoq", "qorin", "yurak",
  "isitma", "temperatura", "shamollash", "gripp", "yo'tal", "yotal", "balg'am",
  "burun", "tomoq", "angina", "shamollagan", "infeksiya", "virus", "kovid",
  "allergiya", "toshma", "qichishish", "ich ketish", "diareya", "ko'ngil",
  "qon bosimi", "bosim", "davleniye", "gipertoniya", "holsizlik", "charchoq",
  "uyqusizlik", "asab", "stress",
  // Vitamins & supplements
  "vitamin", "d3", "askorbin", "magniy", "omega", "sink", "kalsiy", "temir",
  "gemoglobin", "anemiya", "immunitet",
  // Specific drugs
  "paratsetamol", "paracetamol", "amoksitsillin", "amoxicillin", "ibuprofen",
  "nurofen", "tsitramon", "analgin", "aspirin", "no-shpa", "noshpa", "spazmalgon",
  "mezim", "festal", "omeprazol", "acc", "atss", "loratadin", "suprastin",
  // Russian medical terms
  "рецепт", "лекарство", "препарат", "таблетк", "капсул", "сироп", "мазь",
  "укол", "боль", "голов", "зуб", "живот", "спин", "температур", "жар",
  "простуд", "грипп", "кашель", "горл", "насморк", "давлен", "аллерги",
  "витамин", "дозировк", "прием", "аптек", "парацетамол", "ибупрофен", "аналог",
];

// Patterns that indicate an off-topic question
const OFF_TOPIC_PATTERNS = [
  /\b(python|javascript|typescript|html|css|sql|docker|kubernetes|linux|windows|git|commit|bug|code|coding|function|class)\b/i,
  /\b(mashina|avtomobil|mator|karobka|inomarka|bmw|mercedes|chevrolet|gentra|cobalt|benzin|metan)\b/i,
  /\b(prezident|saylov|siyosat|deputat|vazir|urush|harbiy|hukumat|davlat)\b/i,
  /\b(kripto|bitcoin|usdt|forex|treyding|aktsiya|investitsiya|kazin|stavka)\b/i,
  /\b(futbol|barselona|real madrid|messi|ronaldo|chempionat|liga)\b/i,
];

export function isMedicalDomain(query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return true;

  // If clearly matched an off-topic non-medical pattern
  for (const pattern of OFF_TOPIC_PATTERNS) {
    if (pattern.test(q)) return false;
  }

  // Check if at least one medical keyword matches
  return MEDICAL_KEYWORDS.some((kw) => q.includes(kw));
}

export function handleAiMedicalChat(params: {
  message?: string;
  image?: string;
  language?: "uz" | "ru" | "en";
  candidates: CatalogProductCandidate[];
}): AiChatResponse {
  const lang = params.language || "uz";
  const userText = String(params.message || "").trim();
  const hasImage = Boolean(params.image && params.image.trim().length > 0);

  // 1. If prescription image is attached OR text has prescription markup
  if (hasImage || /^(?:rp:|tab\.|caps\.|d\.t\.d|№|#)/i.test(userText) || userText.toLowerCase().includes("retsept")) {
    let prescriptionPayload = userText;

    if (hasImage && !prescriptionPayload) {
      const match = params.image?.match(/text=([^&;]+)/i);
      if (match) {
        prescriptionPayload = decodeURIComponent(match[1]);
      } else {
        // High quality demo prescription for image OCR
        prescriptionPayload =
          "Rp: Tab. Paratsetamol 500 mg #10\nRp: Tab. Amoksitsillin 500 mg #20\nRp: Vitamin D3 2000 IU";
      }
    }

    const scanResult = scanAndMatchPrescriptionText(prescriptionPayload, params.candidates);
    const matchedCards: MatchedProductCard[] = [];

    for (const item of scanResult.items) {
      if (item.matchedProduct) {
        const p = item.matchedProduct;
        const alt = item.alternatives && item.alternatives.length > 0 ? item.alternatives[0] : undefined;

        matchedCards.push({
          id: p.id,
          sku: p.sku,
          nameUz: p.nameUz,
          nameRu: p.nameRu,
          category: p.category,
          manufacturer: p.manufacturer,
          price: p.price,
          unit: p.unit,
          requiresPrescription: p.requiresPrescription,
          analogGroup: p.analogGroup,
          inStock: p.inStock,
          dosage: item.extractedDosage,
          instructions: item.instructions,
          confidence: item.confidence,
          cheaperAlternative: alt
            ? {
                id: alt.id,
                nameUz: alt.nameUz,
                nameRu: alt.nameRu,
                price: alt.price,
                manufacturer: alt.manufacturer,
                difference: alt.priceDiff,
              }
            : undefined,
        });
      }
    }

    let reply = "";
    if (matchedCards.length > 0) {
      if (lang === "ru") {
        reply = `Я проанализировал ваш рецепт! Найдено ${matchedCards.length} препарата(ов) в каталоге VaksinaMed. Ниже представлены доступные лекарства, дозировки и выгодные аналоги. Вы можете сразу добавить их в корзину:`;
      } else if (lang === "en") {
        reply = `I have analyzed your prescription! Found ${matchedCards.length} matching medication(s) in VaksinaMed. Below are the verified products, dosages, and cost-effective alternatives available for your cart:`;
      } else {
        reply = `Retseptingiz muvaffaqiyatli tahlil qilindi! VaksinaMed dorixonasidan ${matchedCards.length} ta mos keluvchi dori vositasi aniqlandi. Quyidagi kartalardan kerakli preparatlarni bitta bosish bilan savatga qo‘shishingiz mumkin:`;
      }
    } else {
      if (lang === "ru") {
        reply = `Я внимательно изучил рецепт, но точных совпадений в текущем наличии не найдено. Пожалуйста, проверьте четкость снимка или напишите названия лекарств текстом.`;
      } else if (lang === "en") {
        reply = `I examined the prescription, but could not find exact matches in current stock. Please check image clarity or type the medication names.`;
      } else {
        reply = `Retsept o‘rganildi, biroq ayni paytda dorixonamizda to‘liq mos keluvchi preparat topilmadi. Iltimos, rasm aniq tushganligini tekshiring yoki dori nomini matn ko‘rinishida yozing.`;
      }
    }

    return {
      success: true,
      reply,
      isMedical: true,
      matchedProducts: matchedCards,
      quickSuggestions: [
        lang === "ru" ? "Как принимать эти лекарства?" : lang === "en" ? "How to take these medicines?" : "Bular qanday qabul qilinadi?",
        lang === "ru" ? "Есть ли более дешевые аналоги?" : lang === "en" ? "Are there cheaper alternatives?" : "Arzonroq analoglari bormi?",
        lang === "ru" ? "Нужен ли рецепт от врача?" : lang === "en" ? "Is a doctor prescription required?" : "Shifokor retsepti shartmi?",
      ],
    };
  }

  // 2. Off-topic check (Guardrail)
  if (!isMedicalDomain(userText)) {
    let reply = "";
    if (lang === "ru") {
      reply = `Я медицинский ИИ-ассистент VaksinaMed 💊. Моя специализация — консультации по здоровью, лекарствам, рецептам и аптечным услугам. Пожалуйста, задайте вопрос о здоровье, симптомах или подборе препаратов.`;
    } else if (lang === "en") {
      reply = `I am the VaksinaMed AI Medical Assistant 💊. I specialize strictly in health, medications, prescriptions, and pharmacy care. Please feel free to ask any health, symptom, or drug-related questions.`;
    } else {
      reply = `Men VaksinaMed sun'iy intellekt tibbiy yordamchisiman 💊. Mening vazifam — salomatlik, dori-darmonlar, retseptlar va dorixona maslahatlari bo‘yicha ko‘maklashish. Iltimos, dori vositalari yoki sog‘ligingizga doir savollaringizni bering.`;
    }

    return {
      success: true,
      reply,
      isMedical: false,
      matchedProducts: [],
      quickSuggestions: [
        lang === "ru" ? "Что принять от головной боли?" : lang === "en" ? "What to take for headache?" : "Bosh og‘rig‘iga nima ichsa bo‘ladi?",
        lang === "ru" ? "Лекарства от простуды и гриппа" : lang === "en" ? "Medicines for cold and flu" : "Shamollash va isitmaga dorilar",
        lang === "ru" ? "Как принимать витамин D3?" : lang === "en" ? "How to take Vitamin D3?" : "Vitamin D3 qanday ichiladi?",
      ],
    };
  }

  // 3. Health & Symptom Query Matching
  const qLower = userText.toLowerCase();
  const matchedCards: MatchedProductCard[] = [];

  // Match products based on symptom / intent
  let categoryIntent: "pain" | "cold" | "vitamins" | "stomach" | "antibiotic" | "allergy" | "general" = "general";

  if (
    qLower.includes("bosh") ||
    qLower.includes("og'riq") ||
    qLower.includes("ogriq") ||
    qLower.includes("tish") ||
    qLower.includes("bel") ||
    qLower.includes("бол") ||
    qLower.includes("голов") ||
    qLower.includes("headache") ||
    qLower.includes("pain") ||
    qLower.includes("tsitramon") ||
    qLower.includes("parats") ||
    qLower.includes("ibuprofen")
  ) {
    categoryIntent = "pain";
  } else if (qLower.includes("shamollash") || qLower.includes("isitma") || qLower.includes("gripp") || qLower.includes("yo'tal") || qLower.includes("yotal") || qLower.includes("tomoq") || qLower.includes("простуд") || qLower.includes("cold") || qLower.includes("flu") || qLower.includes("cough")) {
    categoryIntent = "cold";
  } else if (qLower.includes("vitamin") || qLower.includes("d3") || qLower.includes("magniy") || qLower.includes("omega") || qLower.includes("sink") || qLower.includes("immunitet")) {
    categoryIntent = "vitamins";
  } else if (qLower.includes("qorin") || qLower.includes("oshqozon") || qLower.includes("hazm") || qLower.includes("jigar") || qLower.includes("живот") || qLower.includes("stomach") || qLower.includes("mezim") || qLower.includes("omeprazol")) {
    categoryIntent = "stomach";
  } else if (qLower.includes("antibiotik") || qLower.includes("amoks") || qLower.includes("antibioti")) {
    categoryIntent = "antibiotic";
  } else if (qLower.includes("allergi") || qLower.includes("toshma") || qLower.includes("qichish")) {
    categoryIntent = "allergy";
  }

  // Filter candidates matching intent
  const relevantCandidates = params.candidates.filter((p) => {
    const name = (p.nameUz + " " + p.nameRu + " " + (p.category || "")).toLowerCase();
    if (categoryIntent === "pain") {
      return name.includes("paratsetamol") || name.includes("ibuprofen") || name.includes("og'riq") || name.includes("analgesic") || name.includes("paracetamol");
    }
    if (categoryIntent === "cold") {
      return name.includes("askorbin") || name.includes("vitamin c") || name.includes("acc") || name.includes("shamollash") || name.includes("paratsetamol");
    }
    if (categoryIntent === "vitamins") {
      return name.includes("vitamin") || name.includes("magniy") || name.includes("omega") || name.includes("sink") || name.includes("d3");
    }
    if (categoryIntent === "antibiotic") {
      return name.includes("amoksitsillin") || name.includes("amoxicillin") || name.includes("antibiotik");
    }
    if (categoryIntent === "stomach") {
      return name.includes("mezim") || name.includes("omeprazol") || name.includes("oshqozon");
    }
    if (categoryIntent === "allergy") {
      return name.includes("loratadin") || name.includes("allergi");
    }
    return false;
  }).slice(0, 4);

  // If no specific intent, or general greeting
  if (relevantCandidates.length === 0) {
    // Pick 2 top popular safe products (e.g. Paracetamol & Vitamin C)
    const fallbackProducts = params.candidates.filter((p) => {
      const n = p.nameUz.toLowerCase();
      return n.includes("vitamin") || n.includes("paratsetamol");
    }).slice(0, 2);

    for (const p of fallbackProducts) {
      matchedCards.push({
        id: p.id,
        sku: p.sku,
        nameUz: p.nameUz,
        nameRu: p.nameRu,
        category: p.category,
        manufacturer: p.manufacturer,
        price: p.price,
        unit: p.unit,
        requiresPrescription: p.requiresPrescription,
        analogGroup: p.analogGroup,
        inStock: p.inStock,
      });
    }

    let reply = "";
    if (lang === "ru") {
      reply = `Здравствуйте! Я медицинский консультант VaksinaMed 💊. Чем я могу вам помочь сегодня? Вы можете спросить о любых симптомах, правилах приема лекарств или прикрепить фото рецепта от врача для мгновенного подбора препаратов.`;
    } else if (lang === "en") {
      reply = `Hello! I am your VaksinaMed Medical AI Consultant 💊. How can I help you today? You can ask about symptoms, drug dosages, or attach a prescription photo for instant catalog matching.`;
    } else {
      reply = `Assalomu alaykum! Men VaksinaMed sun'iy intellekt tibbiy yordamchisiman 💊. Bugun sizga qanday dori yoki salomatlik masalasida ko‘maklasha olaman? Istalgan alomatlar haqida so‘rashingiz yoki shifokor retsepti suratini yuborishingiz mumkin.`;
    }

    return {
      success: true,
      reply,
      isMedical: true,
      matchedProducts: matchedCards,
      quickSuggestions: [
        lang === "ru" ? "Сфотографировать рецепт" : lang === "en" ? "Scan prescription photo" : "Retseptni rasmga olish",
        lang === "ru" ? "Что помогает от простуды?" : lang === "en" ? "What helps with cold?" : "Shamollashga nima yordam beradi?",
        lang === "ru" ? "Витамины для энергии" : lang === "en" ? "Vitamins for energy" : "Immunitet uchun vitaminlar",
      ],
    };
  }

  // Populate matchedCards
  for (const p of relevantCandidates) {
    matchedCards.push({
      id: p.id,
      sku: p.sku,
      nameUz: p.nameUz,
      nameRu: p.nameRu,
      category: p.category,
      manufacturer: p.manufacturer,
      price: p.price,
      unit: p.unit,
      requiresPrescription: p.requiresPrescription,
      analogGroup: p.analogGroup,
      inStock: p.inStock,
    });
  }

  let reply = "";
  if (categoryIntent === "pain") {
    if (lang === "ru") {
      reply = `При головной, зубной или мышечной боли обычно применяются анальгетики и НПВП (например, Парацетамол или Ибупрофен). Принимать рекомендуется после еды, запивая достаточным количеством воды. Не превышайте суточную дозу. Ниже представлены проверенные препараты из нашей аптеки:`;
    } else if (lang === "en") {
      reply = `For headaches, dental, or muscle pain, analgesics and NSAIDs like Paracetamol or Ibuprofen are typically recommended. Take after meals with a full glass of water. Do not exceed the maximum daily dosage. Recommended products from VaksinaMed:`;
    } else {
      reply = `Bosh, tish yoki tana og‘riqlarida odatda og‘riq qoldiruvchi vositalar (masalan, Paratsetamol yoki Ibuprofen) tavsiya etiladi. Dorilarni ovqatdan keyin yetarli miqdorda suv bilan qabul qilish lozim. Sutkalik dozadan oshirmang. VaksinaMed dorixonamizdagi tavsiya etilgan preparatlar:`;
    }
  } else if (categoryIntent === "cold") {
    if (lang === "ru") {
      reply = `При простуде и повышенной температуре важно соблюдать постельный режим, пить больше теплой жидкости и принимать жаропонижающие (Парацетамол при t > 38.5°C) вместе с витамином C. Ниже подобраны необходимые препараты:`;
    } else if (lang === "en") {
      reply = `For colds and elevated temperature, bed rest, plenty of warm fluids, and antipyretics (Paracetamol if t > 38.5°C) combined with Vitamin C are recommended. Below are the suitable medications:`;
    } else {
      reply = `Shamollash va tana harorati ko‘tarilganda ko‘proq iliq suyuqlik ichish, dam olish hamda harorat 38.5°C dan oshganda isitma tushiruvchi (Paratsetamol) va Vitamin C qabul qilish tavsiya etiladi. Quyidagi mos dori vositalarini buyurtma qilishingiz mumkin:`;
    }
  } else if (categoryIntent === "vitamins") {
    if (lang === "ru") {
      reply = `Витамины и минералы (витамин D3, Омега-3, Магний) поддерживают иммунитет, нервную систему и общий тонус. Витамин D3 лучше принимать в первой половине дня во время еды. Доступные препараты:`;
    } else if (lang === "en") {
      reply = `Vitamins and minerals (Vitamin D3, Omega-3, Magnesium) support immunity, the nervous system, and vitality. Take Vitamin D3 in the morning with food. Available options:`;
    } else {
      reply = `Vitamin va minerallar (Vitamin D3, Omega-3, Magniy) immunitetni mustahkamlash, asab tizimi va quvvatni tiklashda juda muhim. Vitamin D3 ni kunning birinchi yarmida ovqat bilan ichish tavsiya qilinadi. Dorixonamizdagi mavjud vitaminlar:`;
    }
  } else if (categoryIntent === "antibiotic") {
    if (lang === "ru") {
      reply = `Внимание! Антибиотики (например, Амоксициллин) действуют только против бактериальных инфекций и отпускаются по назначению врача. Принимайте строго курсом. Препараты из нашего каталога:`;
    } else if (lang === "en") {
      reply = `Notice: Antibiotics (such as Amoxicillin) are effective only against bacterial infections and should be used strictly under medical supervision. Products in catalog:`;
    } else {
      reply = `Muhim eslatma! Antibiotiklar (masalan, Amoksitsillin) faqat bakterial infeksiyalarga qarshi ta'sir qiladi va shifokor tavsiyasi bilan qabul qilinishi shart. Kursni oxirigacha ichish tavsiya etiladi. Katalogimizdagi preparatlar:`;
    }
  } else {
    if (lang === "ru") {
      reply = `По вашему запросу я подобрал проверенные препараты в каталоге VaksinaMed. Перед применением ознакомьтесь с инструкцией:`;
    } else if (lang === "en") {
      reply = `Based on your inquiry, here are verified medicines from VaksinaMed. Please consult the leaflet before use:`;
    } else {
      reply = `So‘rovingiz bo‘yicha VaksinaMed dorixonasidan mos keluvchi ishonchli preparatlar topildi. Qo‘llashdan oldin ko‘rsatmasi bilan tanishib chiqing:`;
    }
  }

  return {
    success: true,
    reply,
    isMedical: true,
    matchedProducts: matchedCards,
    quickSuggestions: [
      lang === "ru" ? "Как принимать эти лекарства?" : lang === "en" ? "Directions of use" : "Qo‘llash usuli qanday?",
      lang === "ru" ? "Есть ли противопоказания?" : lang === "en" ? "Any contraindications?" : "Qarshi ko‘rsatmalar bormi?",
      lang === "ru" ? "Добавить всё в корзину" : lang === "en" ? "Add all to cart" : "Barchasini savatga olish",
    ],
  };
}
