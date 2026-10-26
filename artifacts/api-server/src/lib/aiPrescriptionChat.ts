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

function normalizeQuery(str: string): string {
  return str
    .toLowerCase()
    .replace(/[ʻ’‘`´]/g, "'")
    .trim();
}

// Patterns that indicate clearly non-medical off-topic inquiries
const OFF_TOPIC_PATTERNS = [
  /\b(python|javascript|typescript|html|css|sql|docker|kubernetes|linux|windows|git|commit|bug|code|coding|function|class)\b/i,
  /\b(mashina|avtomobil|mator|karobka|inomarka|bmw|mercedes|chevrolet|gentra|cobalt|benzin|metan|tormoz)\b/i,
  /\b(prezident|saylov|siyosat|deputat|vazir|urush|harbiy|hukumat|davlat|parlament)\b/i,
  /\b(kripto|bitcoin|usdt|forex|treyding|aktsiya|investitsiya|kazin|stavka|1xbet)\b/i,
  /\b(futbol|barselona|real madrid|messi|ronaldo|chempionat|liga|sport|match)\b/i,
];

// Broad medical / health keywords in Uzbek, Russian, and English
const MEDICAL_KEYWORDS = [
  // Greetings and polite conversational markers
  "salom", "assalom", "privet", "здравствуйте", "привет", "добрый", "доброе", "hello", "hi", "hey",
  "qalesiz", "yaxshimisiz", "tinchmisiz", "rahmat", "спасибо", "благодарю", "spasibo", "thanks", "tushundim",
  "sog' bo'ling", "sog buling", "salomat",
  // Prescription & meds
  "retsept", "recept", "рецепт", "dori", "preparat", "лекарство", "препарат", "tabletka", "kapsula", "sirop",
  "таблетк", "капсул", "сироп", "мазь", "ukol", "ampula", "укол", "eritma", "tomchi", "sprey", "doza", "дозировк",
  "ichish", "ichiladi", "прием", "qabul", "narx", "цена", "aptek", "аптек", "dorixona", "savat", "корзин",
  "buyurtma", "analog", "аналог", "shifokor", "vrach", "врач", "доктор", "doctor",
  // Symptoms
  "og'riq", "ogriq", "боль", "bosh", "голов", "tish", "зуб", "bel", "спин", "oyoq", "qorin", "живот",
  "yurak", "сердц", "isitma", "температур", "жар", "shamollash", "простуд", "gripp", "грипп", "yo'tal", "yotal",
  "кашель", "balg'am", "мокрот", "burun", "насморк", "tomoq", "горл", "angina", "infeksiya", "инфекци", "virus", "вирус",
  "allergiya", "аллерги", "toshma", "сыпь", "qichish", "зуд", "ich ket", "diareya", "диаре", "ko'ngil", "тошнот", "рвот",
  "qon bosimi", "bosim", "давлен", "гипертон", "holsizlik", "слабость", "charchoq", "усталость", "asab", "стресс",
  // Vitamins & supplements
  "vitamin", "витамин", "d3", "д3", "askorbin", "аскорбин", "magniy", "магний", "omega", "омега", "sink", "цинк",
  "kalsiy", "кальций", "temir", "железо", "gemoglobin", "гемоглобин", "anemiya", "анемия", "immunitet", "иммунитет",
  // Specific drugs
  "paratsetamol", "paracetamol", "парацетамол", "amoksitsillin", "amoxicillin", "амоксициллин",
  "ibuprofen", "ибупрофен", "nurofen", "нурофен", "tsitramon", "цитрамон", "analgin", "анальгин",
  "aspirin", "аспирин", "no-shpa", "но-шпа", "noshpa", "spazmalgon", "спазмалгон", "mezim", "мезим",
  "festal", "фестал", "omeprazol", "омепразол", "acc", "ацц", "loratadin", "лоратадин", "suprastin", "супрастин",
];

export function isMedicalDomain(query: string): boolean {
  const q = normalizeQuery(query);
  if (q.length < 2) return true;

  for (const pattern of OFF_TOPIC_PATTERNS) {
    if (pattern.test(q)) return false;
  }

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
  const qNorm = normalizeQuery(userText);
  const hasImage = Boolean(params.image && params.image.trim().length > 0);

  // 1. DOMAIN GUARD: Check off-topic non-medical queries
  if (!hasImage && userText.length > 2 && !isMedicalDomain(userText)) {
    let reply = "";
    if (lang === "ru") {
      reply = `Извините, я специализированный медицинский ИИ-консультант VaksinaMed 🩺.\n\nМоя задача — помогать вам в вопросах здоровья, лекарственных препаратов, правильных дозировок, противопоказаний и расшифровки рецептов от врача.\n\nПожалуйста, задайте вопрос, связанный с медициной, симптомами или лекарствами, и я с радостью проконсультирую вас!`;
    } else if (lang === "en") {
      reply = `I apologize, but I am a dedicated VaksinaMed Medical AI Assistant 🩺.\n\nMy expertise is strictly focused on health consultations, prescription scanning, symptoms, and pharmaceuticals.\n\nPlease ask a health or medication-related question, and I will be glad to assist you!`;
    } else {
      reply = `Kechirasiz, men VaksinaMed sun'iy intellekt tibbiy maslahatchisiman 🩺.\n\nMening asosiy vazifam — salomatlik, dori-darmonlar, simptomlar, qo‘llash usullari va shifokor retseptlarini tahlil qilishda yordam berishdir.\n\nIltimos, sog‘ligingiz, alomatlar yoki dorixonamiz preparatlari bo‘yicha savolingizni bering, sizga professional yordam berishdan mamnun bo‘laman!`;
    }

    return {
      success: true,
      reply,
      isMedical: false,
      matchedProducts: [],
      quickSuggestions: [
        lang === "ru" ? "Что принять от простуды?" : lang === "en" ? "Remedies for cold" : "Shamollashga nima ichiladi?",
        lang === "ru" ? "Головная боль" : lang === "en" ? "Headache relief" : "Bosh og‘rig‘ini qoldirish",
        lang === "ru" ? "Витамин D3" : lang === "en" ? "Vitamin D3 dosage" : "Vitamin D3 qanday ichiladi?",
      ],
    };
  }

  // 2. GREETINGS INTENT: User says hello / greeting without specific symptoms (Strictly NO products)
  const GREETING_STARTS = [
    "salom", "assalom", "xayrli", "privet", "zdravstvuyte",
    "здравствуйте", "привет", "добрый", "доброе", "hello", "hi", "hey"
  ];
  const isGreetingWord =
    GREETING_STARTS.some((w) => qNorm.startsWith(w)) ||
    qNorm === "qalesiz" ||
    qNorm === "yaxshimisiz" ||
    qNorm === "tinchmisiz";

  const hasSpecificSymptomOrDrug =
    /(og'riq|ogriq|bosh|tish|isitma|temperatura|жар|бол|голов|зуб|shamollash|gripp|dori|retsept|рецепт|preparat|vitamin|витамин|davleniye|давлен|qon bosimi|ich ket|diareya|диаре|oshqozon|живот)/i.test(
      qNorm
    );

  if (isGreetingWord && !hasSpecificSymptomOrDrug && !hasImage) {
    let reply = "";
    if (lang === "ru") {
      reply = `Здравствуйте! Я медицинский ИИ-консультант аптечной сети VaksinaMed 🩺.\n\nКак ваше самочувствие? Опишите, пожалуйста, что именно вас беспокоит (например: головная боль, простуда, слабость) или укажите конкретное лекарство, о котором хотите узнать.\n\nТакже вы можете сфотографировать рецепт от врача — я мгновенно найду назначенные препараты в нашем каталоге.\n\n⚠️ *Медицинское напоминание: Все рекомендации носят информационный характер. Перед приемом препаратов обязательно проконсультируйтесь с лечащим врачом.*`;
    } else if (lang === "en") {
      reply = `Hello! I am your VaksinaMed Medical AI Consultant 🩺.\n\nHow are you feeling today? Please let me know what symptoms you are experiencing (e.g. headache, cold, fever, fatigue), or ask about any medication, dosage, or interactions.\n\nYou can also upload or take a photo of a doctor's prescription for instant catalog matching.\n\n⚠️ *Medical note: All advice is advisory. Please consult your physician before taking medications.*`;
    } else {
      reply = `Assalomu alaykum! Men VaksinaMed sun'iy intellekt tibbiy maslahatchisiman 🩺.\n\nBugun o‘zingizni qanday his qilyapsiz? Agar sizda biror bezovtalik (masalan: bosh og‘rig‘i, shamollash, isitma, oshqozon noqulayligi) bo‘lsa, batafsil yozib qoldiring yoki qaysi dori vositasi haqida ma'lumot olmoqchi ekanligingizni ayting.\n\nShuningdek, shifokor retsepti suratini yuborsangiz, barcha belgilangan dorilarni aniqlab, filiallarimizdagi mavjudligini ko‘rsatib beraman.\n\n⚠️ *Muhim eslatma: Men bergan barcha ma'lumotlar tavsiyaviy xarakterga ega. Aniq tashxis qo‘yish va davolash uchun davolovchi shifokoringiz bilan maslahatlashing.*`;
    }

    return {
      success: true,
      reply,
      isMedical: true,
      matchedProducts: [], // Strictly NO products on greetings
      quickSuggestions: [
        lang === "ru" ? "Сфотографировать рецепт" : lang === "en" ? "Scan prescription photo" : "Retseptni rasmga olish",
        lang === "ru" ? "Беспокоит головная боль" : lang === "en" ? "Headache relief" : "Bosh og‘rig‘i bezovta qilyapti",
        lang === "ru" ? "Симптомы простуды и жар" : lang === "en" ? "Cold and fever symptoms" : "Shamollash va isitma belgilari",
        lang === "ru" ? "Как принимать витамин D3?" : lang === "en" ? "How to take Vitamin D3?" : "Vitamin D3 qanday ichiladi?",
      ],
    };
  }

  // 3. GRATITUDE / CLOSING INTENT
  const isGratitude =
    /\b(rahmat|tashakkur|sog' bo'ling|sog buling|salomat|spasibo|спасибо|благодарю|thank you|thanks|thx)\b/i.test(
      qNorm
    );

  if (isGratitude && !hasSpecificSymptomOrDrug && !hasImage) {
    let reply = "";
    if (lang === "ru") {
      reply = `Будьте здоровы! Берегите себя и своих близких 💚. Если возникнут еще вопросы по приему лекарств или здоровью, я всегда готов помочь. Обращайтесь в любое время!`;
    } else if (lang === "en") {
      reply = `You are very welcome! Take good care of your health 💚. If you ever need help with prescriptions, symptoms, or dosages, I am always here to assist. Stay well!`;
    } else {
      reply = `Salomat bo‘ling! O‘zingiz va yaqinlaringiz salomatligini doimo asrang 💚. Dori-darmonlar, retseptlar yoki salomatlik borasida yana savollar tug‘ilsa, bemalol murojaat qilishingiz mumkin!`;
    }

    return {
      success: true,
      reply,
      isMedical: true,
      matchedProducts: [],
      quickSuggestions: [
        lang === "ru" ? "Сфотографировать рецепт" : lang === "en" ? "Scan prescription" : "Retseptni rasmga olish",
        lang === "ru" ? "Проверить наличие лекарств" : lang === "en" ? "Check medicine stock" : "Dori mavjudligini tekshirish",
      ],
    };
  }

  // 4. EMERGENCY RED FLAGS (Call 103 immediately - strictly NO medication selling)
  const isEmergency =
    ((qNorm.includes("yurak") || qNorm.includes("ko'krak") || qNorm.includes("kokrak")) &&
      (qNorm.includes("siq") || qNorm.includes("og'ri") || qNorm.includes("sanch") || qNorm.includes("qis"))) ||
    qNorm.includes("infarkt") ||
    qNorm.includes("инфаркт") ||
    qNorm.includes("insult") ||
    qNorm.includes("инсульт") ||
    qNorm.includes("боль в груди") ||
    qNorm.includes("давит сердце") ||
    qNorm.includes("сердце сжало") ||
    (qNorm.includes("nafas") && qNorm.includes("qis")) ||
    qNorm.includes("задыха") ||
    qNorm.includes("удушье") ||
    qNorm.includes("hushdan ket") ||
    qNorm.includes("xushdan ket") ||
    qNorm.includes("потеря сознания") ||
    qNorm.includes("qon qus") ||
    qNorm.includes("рвота кров") ||
    qNorm.includes("sudorogi") ||
    qNorm.includes("talvasa") ||
    qNorm.includes("судорог");

  if (isEmergency) {
    let reply = "";
    if (lang === "ru") {
      reply = `🚨 **ВНИМАНИЕ: ТРЕБУЕТСЯ СРОЧНАЯ МЕДИЦИНСКАЯ ПОМОЩЬ!**\n\nОписанные вами симптомы (давление в области сердца, одышка, подозрение на инфаркт или инсульт) представляют прямую угрозу здоровью и жизни. Не занимайтесь самолечением!\n\n1. **Немедленно позвоните по номеру 103 (Скорая медицинская помощь)**;\n2. Сядьте или прилягте с приподнятым изголовьем, расстегните тесную одежду и откройте окно для свежего воздуха;\n3. Не принимайте незнакомые сильнодействующие препараты до осмотра врачей;\n4. Обязательно предупредите людей, находящихся рядом с вами.`;
    } else if (lang === "en") {
      reply = `🚨 **EMERGENCY: IMMEDIATE MEDICAL ATTENTION REQUIRED!**\n\nYour described symptoms (chest pain/pressure, severe shortness of breath, possible cardiac or neurological event) are red-flag indicators that require emergency care. Do not attempt self-medication!\n\n1. **Call 103 (Emergency Ambulance) immediately**;\n2. Sit or semi-recline comfortably, loosen tight clothing, and ensure access to fresh air;\n3. Do not take unprescribed potent medications before paramedics arrive;\n4. Alert family members or people nearby immediately.`;
    } else {
      reply = `🚨 **DIQQAT: ZUDLIK BILAN SHOSHILINCH TIBBIY YORDAM CHAQIRING!**\n\nSiz ta'riflagan holat (yurak sohasidagi og‘riq/siqilish, nafas qisishi, insult yoki infarkt xavfi) jiddiy xavf belgisi hisoblanadi. Vaqtni boy bermang va o‘zboshimchalik bilan dori ichmang!\n\n1. **Zudlik bilan 103 (Tez tibbiy yordam)** raqamiga qo‘ng‘iroq qiling;\n2. Tinch holatda o‘tiring yoki boshni biroz baland qilib yoting, tor yoqalarni yechib, xonaga toza havo kiring;\n3. Shifokorlar kelgunga qadar begona yoki kuchli ta'sir qiluvchi dorilarni ichmang;\n4. Yon-atrofdagi yaqinlaringizga holatingiz haqida darhol xabar bering.`;
    }

    return {
      success: true,
      reply,
      isMedical: true,
      matchedProducts: [],
      quickSuggestions: [
        lang === "ru" ? "Вызвать скорую 103" : lang === "en" ? "Call 103 Ambulance" : "103 Tez yordam chaqirish",
        lang === "ru" ? "Первая помощь" : lang === "en" ? "First aid steps" : "Birinchi yordam qoidalari",
      ],
    };
  }

  // 5. PREGNANCY OR INFANT HEALTH SAFETY CAUTION
  const isPregnancyOrInfant =
    /\b(homilador|homiladorlik|emizikli|emizaman|chaqaloq|yangi tug'ilgan|1 yoshgacha)\b/i.test(qNorm) ||
    /\b(беременн|грудное вскармливан|кормящ|младенец|новорожденн)\b/i.test(qNorm);

  if (isPregnancyOrInfant && !hasImage) {
    let reply = "";
    if (lang === "ru") {
      reply = `🩺 **Медицинское предупреждение: Прием препаратов при беременности и лактации**\n\nВо время беременности и грудного вскармливания большинство лекарственных средств проникает через плацентарный барьер или в грудное молоко, что может повлиять на ребенка.\n\nЛюбые лекарственные средства (даже витамины или жаропонижающие) должны подбираться **строго вашим врачом акушером-гинекологом или педиатром** с учетом триместра и анамнеза.\n\nСамолечение категорически не рекомендуется. Пожалуйста, обратитесь к вашему врачу для безопасного назначения.`;
    } else if (lang === "en") {
      reply = `🩺 **Medical Caution: Medication in Pregnancy & Breastfeeding**\n\nDuring pregnancy and lactation, most pharmaceutical substances can cross into fetal circulation or breast milk. Self-medication is unsafe.\n\nAny therapy, even mild pain relievers or vitamins, must be authorized directly by your obstetrician-gynecologist or pediatrician based on your gestational age.\n\nPlease consult your doctor before taking any medication.`;
    } else {
      reply = `🩺 **Tibbiy ogohlantirish: Homiladorlik va emizish davrida dorilar qabuli**\n\nHomiladorlik va laktatsiya davrida dori vositalarining ko‘p qismi yo‘ldosh (platsenta) to‘sig‘i yoki ona suti orqali bolaga o‘tishi mumkin. Shu sababli bu davrda o‘zboshimchalik bilan dori ichish qat'iyan man etiladi.\n\nHatto eng oddiy og‘riq qoldiruvchi yoki vitaminlar ham **faqat davolovchi akusher-ginekolog yoki pediatr** nazorati ostida, homiladorlik haftasiga mos ravishda tanlanishi shart.\n\nIltimos, bolangiz va o‘zingizning xavfsizligingiz uchun shifokoringiz bilan maslahatlashing.`;
    }

    return {
      success: true,
      reply,
      isMedical: true,
      matchedProducts: [],
      quickSuggestions: [
        lang === "ru" ? "Спросить о витаминах для кормящих" : lang === "en" ? "Pregnancy vitamins" : "Homiladorlik vitaminlari",
        lang === "ru" ? "Безопасное снижение температуры" : lang === "en" ? "Safe fever control" : "Isitmani xavfsiz tushirish",
      ],
    };
  }

  // 6. BLOOD PRESSURE / HYPERTENSION INTENT
  const isBloodPressure =
    /\b(qon bosimi|bosimim|davleniye|davleniya|gipertoniya|gipotoniya|bosim oshib|bosim tushib)\b/i.test(qNorm) ||
    /\b(давление|гипертония|высокое давление|низкое давление|скачет давление)\b/i.test(qNorm);

  if (isBloodPressure && !hasImage) {
    let reply = "";
    if (lang === "ru") {
      reply = `🩺 **Консультация врача: Артериальное давление**\n\nАртериальное давление требует строгого индивидуального подхода. Препараты для снижения или повышения давления (гипотензивные) подбираются терапевтом или кардиологом на основании регулярного мониторинга и ЭКГ. Пить чужие лекарства от давления опасно!\n\n**Что делать сейчас:**\n1. Измерьте давление тонометром в состоянии полного покоя (сидя, опершись на спинку стула);\n2. Проветрите комнату, расслабьтесь, не употребляйте кофе, крепкий чай и соленые продукты;\n3. Если давление выше 160/100 мм рт. ст. и сопровождается сильной головной болью, тошнотой или болью в груди — немедленно вызовите врача по номеру 103.`;
    } else if (lang === "en") {
      reply = `🩺 **Clinical Advice: Blood Pressure Management**\n\nBlood pressure medications must be tailored exclusively by a licensed therapist or cardiologist based on personal readings and cardiovascular history. Never take someone else's antihypertensive pills!\n\n**Immediate steps:**\n1. Measure your blood pressure with a reliable tonometer while seated comfortably and quietly for 5 minutes;\n2. Ensure adequate ventilation and avoid caffeine, alcohol, or excess sodium;\n3. If blood pressure exceeds 160/100 mmHg accompanied by chest tightness, dizziness, or visual disturbance, seek immediate medical care via 103.`;
    } else {
      reply = `🩺 **Shifokor tavsiyasi: Qon bosimi (Davleniye)**\n\nQon bosimini nazorat qilish va davolash qat'iy individual yondashuvni talab qiladi. Bosim tushiruvchi (gipotenziv) preparatlarni faqat kardiolog yoki terapevt ko‘rigidan so‘ng, tonometr ko‘rsatkichlariga qarab ichish lozim. Birovning bosim dorisini o‘zboshimchalik bilan ichish hayot uchun xavflidir!\n\n**Hozirgi holatda nima qilish kerak:**\n1. 5 daqiqa tinch o‘tirib, tonometr yordamida qon bosimingizni aniq o‘lchang;\n2. Xonani shamollating, kiyimlarni bo‘shating, qahva yoki achchiq choy ichmang;\n3. Agar bosim 160/100 mm simob ustunidan yuqori bo‘lsa va bosh og‘rig‘i, ko‘ngil aynishi yoki ko‘krakda siqilish kuzatilsa — darhol 103 raqami orqali shifokor chaqiring.`;
    }

    return {
      success: true,
      reply,
      isMedical: true,
      matchedProducts: [],
      quickSuggestions: [
        lang === "ru" ? "Правила измерения давления" : lang === "en" ? "How to measure BP" : "Bosimni to‘g‘ri o‘lchash",
        lang === "ru" ? "Симптомы криза" : lang === "en" ? "Hypertensive symptoms" : "Gipertonik kriz belgilari",
      ],
    };
  }

  // 7. PRESCRIPTION SCAN / TEXT RECOGNITION
  if (hasImage || /^(?:rp:|tab\.|caps\.|d\.t\.d|№|#)/i.test(userText) || qNorm.includes("retsept") || qNorm.includes("рецепт")) {
    let prescriptionPayload = userText;

    if (hasImage && !prescriptionPayload) {
      const match = params.image?.match(/text=([^&;]+)/i);
      if (match) {
        prescriptionPayload = decodeURIComponent(match[1]);
      } else {
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
        reply = `🩺 **Результат клинического анализа рецепта:**\n\nЯ распознал назначенные препараты и сверил их с наличием в аптечной сети VaksinaMed. Найдено совпадений: ${matchedCards.length}.\n\n*Правила безопасности: Принимайте препараты строго по схеме вашего врача. Не прерывайте курс антибиотиков раньше времени.* Вы можете добавить нужные лекарства прямо в корзину:`;
      } else if (lang === "en") {
        reply = `🩺 **Prescription Clinical Match Result:**\n\nI have parsed your prescription and verified availability across VaksinaMed branches. Matched items: ${matchedCards.length}.\n\n*Safety advisory: Follow the exact regimen prescribed by your doctor. Complete any antibiotic course entirely.* You can add the verified medicines directly to your cart:`;
      } else {
        reply = `🩺 **Retseptning klinik tahlil natijasi:**\n\nShifokor retseptidagi dori vositalari o‘qildi va VaksinaMed dorixonasi bazasidan muvaffaqiyatli aniqlandi. Topilgan preparatlar: ${matchedCards.length} ta.\n\n*Xavfsizlik eslatmasi: Dorilarni shifokor belgilagan dozada va qat'iy jadval asosida qabul qiling. Agar antibiotik yozilgan bo‘lsa, kursni oxirigacha yetkazing.* Kerakli dorilarni to‘g‘ridan-to‘g‘ri savatga qo‘shishingiz mumkin:`;
      }
    } else {
      if (lang === "ru") {
        reply = `Я внимательно изучил присланный текст или изображение рецепта, но точных совпадений с препаратами в каталоге не обнаружено.\n\nПожалуйста, убедитесь, что фото четкое, при хорошем освещении, или напишите названия лекарств вручную (например: *Парацетамол 500 мг*).`;
      } else if (lang === "en") {
        reply = `I examined the prescription text or image, but could not detect matching medications in our database.\n\nPlease provide a clear, well-lit photo or enter the medicine names manually (e.g. *Paracetamol 500 mg*).`;
      } else {
        reply = `Yuborilgan retsept matni yoki suratini sinchiklab tekshirdim, ammo dorilar nomini aniq o‘qib bo‘lmadi.\n\nIltimos, retsept suratini yorug‘ joyda, aniqroq qilib qayta yuboring yoki dorilar nomini qo‘lda yozib qoldiring (masalan: *Paratsetamol 500 mg*).`;
      }
    }

    return {
      success: true,
      reply,
      isMedical: true,
      matchedProducts: matchedCards,
      quickSuggestions: [
        lang === "ru" ? "Правила приема этих лекарств" : lang === "en" ? "Dosage directions" : "Dori qabul qilish qoidalari",
        lang === "ru" ? "Есть ли противопоказания?" : lang === "en" ? "Contraindications" : "Qarshi ko‘rsatmalar bormi?",
        lang === "ru" ? "Добавить всё в корзину" : lang === "en" ? "Add all to cart" : "Barchasini savatga olish",
      ],
    };
  }

  // 8. CLINICAL SYMPTOMS & SPECIFIC MEDICINE TRIAGE
  type ClinicalCategory = "pain" | "cold" | "stomach" | "vitamins" | "allergy" | "antibiotic" | "none";
  let categoryIntent: ClinicalCategory = "none";

  if (
    qNorm.includes("bosh") ||
    qNorm.includes("tish") ||
    qNorm.includes("og'ri") ||
    qNorm.includes("ogri") ||
    qNorm.includes("paratsetamol") ||
    qNorm.includes("paracetamol") ||
    qNorm.includes("ibuprofen") ||
    qNorm.includes("analgin") ||
    qNorm.includes("tsitramon") ||
    qNorm.includes("голов") ||
    qNorm.includes("бол") ||
    qNorm.includes("зуб") ||
    qNorm.includes("парацетамол") ||
    qNorm.includes("ибупрофен") ||
    qNorm.includes("анальгин") ||
    qNorm.includes("headache") ||
    qNorm.includes("pain")
  ) {
    categoryIntent = "pain";
  } else if (
    qNorm.includes("shamollash") ||
    qNorm.includes("isitma") ||
    qNorm.includes("temperatura") ||
    qNorm.includes("gripp") ||
    qNorm.includes("yo'tal") ||
    qNorm.includes("yotal") ||
    qNorm.includes("tomoq") ||
    qNorm.includes("burun") ||
    qNorm.includes("простуд") ||
    qNorm.includes("жар") ||
    qNorm.includes("температур") ||
    qNorm.includes("кашель") ||
    qNorm.includes("горл") ||
    qNorm.includes("насморк") ||
    qNorm.includes("fever") ||
    qNorm.includes("cold")
  ) {
    categoryIntent = "cold";
  } else if (
    qNorm.includes("vitamin") ||
    qNorm.includes("d3") ||
    qNorm.includes("magniy") ||
    qNorm.includes("omega") ||
    qNorm.includes("sink") ||
    qNorm.includes("immunitet") ||
    qNorm.includes("charchoq") ||
    qNorm.includes("витамин") ||
    qNorm.includes("иммунитет") ||
    qNorm.includes("усталость")
  ) {
    categoryIntent = "vitamins";
  } else if (
    qNorm.includes("oshqozon") ||
    qNorm.includes("jig'ildon") ||
    qNorm.includes("jigildon") ||
    qNorm.includes("hazm") ||
    qNorm.includes("ich ket") ||
    qNorm.includes("diareya") ||
    qNorm.includes("omeprazol") ||
    qNorm.includes("mezim") ||
    qNorm.includes("живот") ||
    qNorm.includes("изжог") ||
    qNorm.includes("пищеварен") ||
    qNorm.includes("диаре") ||
    qNorm.includes("омепразол") ||
    qNorm.includes("stomach") ||
    qNorm.includes("heartburn")
  ) {
    categoryIntent = "stomach";
  } else if (
    qNorm.includes("allergi") ||
    qNorm.includes("toshma") ||
    qNorm.includes("qichish") ||
    qNorm.includes("loratadin") ||
    qNorm.includes("аллерги") ||
    qNorm.includes("сыпь") ||
    qNorm.includes("зуд")
  ) {
    categoryIntent = "allergy";
  } else if (
    qNorm.includes("antibiotik") ||
    qNorm.includes("amoksitsillin") ||
    qNorm.includes("amoxicillin") ||
    qNorm.includes("антибиотик")
  ) {
    categoryIntent = "antibiotic";
  }

  // Filter candidates matching intent
  const relevantCandidates = params.candidates.filter((p) => {
    const name = normalizeQuery(p.nameUz + " " + p.nameRu + " " + (p.category || ""));
    if (categoryIntent === "pain") {
      return (
        name.includes("paratsetamol") ||
        name.includes("ibuprofen") ||
        name.includes("paracetamol") ||
        name.includes("og'riq") ||
        name.includes("ogriq") ||
        name.includes("боль")
      );
    }
    if (categoryIntent === "cold") {
      return (
        name.includes("paratsetamol") ||
        name.includes("paracetamol") ||
        name.includes("askorbin") ||
        name.includes("vitamin c") ||
        name.includes("acc") ||
        name.includes("shamollash")
      );
    }
    if (categoryIntent === "vitamins") {
      return (
        name.includes("vitamin") ||
        name.includes("d3") ||
        name.includes("magniy") ||
        name.includes("omega") ||
        name.includes("sink")
      );
    }
    if (categoryIntent === "stomach") {
      return (
        name.includes("omeprazol") ||
        name.includes("mezim") ||
        name.includes("oshqozon") ||
        name.includes("желудок")
      );
    }
    if (categoryIntent === "allergy") {
      return name.includes("loratadin") || name.includes("allergi") || name.includes("аллерг");
    }
    if (categoryIntent === "antibiotic") {
      return name.includes("amoksitsillin") || name.includes("amoxicillin") || name.includes("antibiotik");
    }
    return false;
  }).slice(0, 3);

  // If no clear medical category was detected and no medicines matched
  if (categoryIntent === "none" || relevantCandidates.length === 0) {
    let reply = "";
    if (lang === "ru") {
      reply = `🩺 **Медицинская консультация VaksinaMed:**\n\nЯ внимательно изучил ваш запрос. Для того чтобы дать вам точную и безопасную рекомендацию, мне требуется немного больше деталей:\n\n1. Какие конкретно симптомы вы ощущаете и как долго они длятся?\n2. Измеряли ли вы температуру или артериальное давление?\n3. Есть ли у вас хронические заболевания (язва, аллергия, почечная недостаточность)?\n\nВы также можете прикрепить фото рецепта от врача или ввести точное торговое название нужного лекарства.`;
    } else if (lang === "en") {
      reply = `🩺 **VaksinaMed Clinical Guidance:**\n\nI have reviewed your inquiry. In order to provide you with safe, medically grounded advice, please provide a few more details:\n\n1. What specific symptoms are you experiencing and when did they start?\n2. Have you checked your temperature or blood pressure?\n3. Do you have any known drug allergies or chronic conditions?\n\nYou can also attach a prescription photo or enter the specific medicine name you are looking for.`;
    } else {
      reply = `🩺 **VaksinaMed shifokorlik maslahati:**\n\nSo‘rovingizni ko‘rib chiqdim. Sizga aniq, xavfsiz va to‘g‘ri tibbiy yo‘nalish bera olishim uchun quyidagi ma'lumotlarni aniqlashtirib bersangiz:\n\n1. Aynan qanday alomatlar (og‘riq qayerda, qachondan boshlandi) bezovta qilyapti?\n2. Tana haroratingiz yoki qon bosimingizni o‘lchadingizmi?\n3. Biror surunkali kasalligingiz (oshqozon yarasi, jigar/buyrak yetishmovchiligi, allergiya) bormi?\n\nShuningdek, shifokor retsepti bo‘lsa, suratini yuborishingiz yoki aniq dori nomini yozishingiz mumkin.`;
    }

    return {
      success: true,
      reply,
      isMedical: true,
      matchedProducts: [], // Strictly NO products when uncertain!
      quickSuggestions: [
        lang === "ru" ? "Сфотографировать рецепт" : lang === "en" ? "Scan prescription" : "Retseptni rasmga olish",
        lang === "ru" ? "Головная боль" : lang === "en" ? "Headache inquiry" : "Bosh og‘rig‘i bo‘yicha savol",
        lang === "ru" ? "Простуда и температура" : lang === "en" ? "Cold & fever" : "Shamollash va isitma",
      ],
    };
  }

  // Build product cards for verified candidates
  const matchedCards: MatchedProductCard[] = [];
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
      inStock: (p.availableQuantity ?? 1) > 0,
    });
  }

  let reply = "";
  if (categoryIntent === "pain") {
    if (lang === "ru") {
      reply = `🩺 **Врачебная рекомендация: Головная и мышечная боль**\n\nПри головной, зубной или мышечной боли организм сигнализирует об усталости, спазме сосудов или воспалении. \n\n**Рекомендации врача:**\n1. Измерьте давление (часто головная боль вызвана спазмом сосудов). Проветрите комнату, выпейте чистой воды и отдохните в полумраке;\n2. При умеренной боли допустим прием безрецептурных анальгетиков (Парацетамол или Ибупрофен) **строго после еды**, запивая стаканом воды;\n3. Не превышайте суточную дозу (максимум 1000 мг парацетамола за один прием, не более 4 г в сутки). Не принимайте натощак при гастрите или язве;\n4. *Внимание: если боль возникла внезапно, очень резкая («как удар»), сопровождается рвотой или онемением — немедленно вызовите скорую 103!*\n\nНиже представлены проверенные препараты из нашего каталога:`;
    } else if (lang === "en") {
      reply = `🩺 **Clinical Advisory: Headache & Pain Management**\n\nPain often stems from fatigue, vascular tension, or localized inflammation.\n\n**Doctor's guidance:**\n1. Check your blood pressure first. Ensure proper hydration and rest in a calm, ventilated room;\n2. For mild-to-moderate pain, OTC analgesics like Paracetamol or Ibuprofen may be taken **strictly after food** with water;\n3. Observe dosing intervals (max 1000 mg paracetamol per dose; do not exceed 4000 mg daily). Avoid NSAIDs if you suffer from gastric ulcers;\n4. *Emergency note: if the headache is severe and sudden ("thunderclap"), accompanied by numbness or vomiting, call 103 immediately.*\n\nRecommended medications from our verified pharmacy catalog:`;
    } else {
      reply = `🩺 **Shifokor tavsiyasi: Bosh va tana og‘riqlarida nima qilish kerak?**\n\nOg‘riq ko‘pincha charchoq, qon tomirlar spazmi, qon bosimi o‘zgarishi yoki yallig‘lanish oqibatida yuzaga keladi.\n\n**Shifokor ko‘rsatmalari:**\n1. Birinchi navbatda qon bosimingizni o‘lchang. Xonani shamollatib, yetarli miqdorda toza suv iching va tinch holatda dam oling;\n2. Og‘riqni yengillashtirish uchun shifokorlar retseptsiz beriladigan Paratsetamol yoki Ibuprofen qabul qilishni tavsiya etadilar. Dorilarni **faqat ovqatdan keyin**, bir stakan suv bilan iching;\n3. Ruxsat etilgan me'yordan oshirmang (Paratsetamol bir martada 500–1000 mg dan, sutkada 4000 mg dan oshmasin). Oshqozon yarasi yoki gastrit bo‘lsa, og‘riq qoldiruvchilarni ehtiyotkorlik bilan qabul qiling;\n4. *Ogohlantirish: Agar og‘riq to‘satdan juda qattiq boshlansa, hushdan ketish, ko‘rish xiralashishi yoki qusish bilan kechsa — darhol 103 Tez yordam chaqiring!*\n\nDorixonamizdagi sertifikatlangan mos preparatlar:`;
    }
  } else if (categoryIntent === "cold") {
    if (lang === "ru") {
      reply = `🩺 **Врачебная рекомендация: Простуда и повышенная температура**\n\nПри ОРВИ повышенная температура до 38.5°C — это естественная защитная реакция иммунитета, поэтому сбивать её сразу не рекомендуется (если нет судорог).\n\n**Тактика лечения:**\n1. Соблюдайте постельный режим и пейте много теплой жидкости (чай с лимоном, настой шиповника);\n2. При температуре выше 38.5°C или выраженной ломоте примите жаропонижающее (Парацетамол);\n3. Витамин C поддерживает сосудистую стенку и сопротивляемость инфекциям;\n4. **Важное правило: Антибиотики не действуют на вирусы!** Прием антибиотиков без назначения врача вредит микрофлоре и вызывает устойчивость бактерий.\n\nДоступные препараты из нашей аптеки:`;
    } else if (lang === "en") {
      reply = `🩺 **Clinical Advisory: Colds, Flu & Fever**\n\nDuring viral infections, a fever up to 38.5°C (101.3°F) is an active immune defense mechanism. Do not rush to suppress mild fever unless advised.\n\n**Recommended approach:**\n1. Rest adequately and drink generous amounts of warm fluids (lemon tea, herbal infusions);\n2. If temperature exceeds 38.5°C or causes severe discomfort, an antipyretic such as Paracetamol can be taken after meals;\n3. Vitamin C aids cellular antioxidant defense;\n4. **Crucial warning: Antibiotics are completely ineffective against viruses!** Never take antibiotics without a physician's prescription.\n\nVerified options from our catalog:`;
    } else {
      reply = `🩺 **Shifokor tavsiyasi: Shamollash va tana harorati ko‘tarilganda**\n\nO‘tkir virusli infeksiyalarda tana harorati 38–38.5°C gacha bo‘lishi organizmning infeksiyaga qarshi tabiiy kurashidir. Uni darhol dori bilan tushirishga shoshilmang.\n\n**Shifokor ko‘rsatmalari:**\n1. Ko‘p miqdorda iliq suyuqlik (limonli choy, na'matak damlamasi) iching va to‘liq dam oling;\n2. Harorat 38.5°C dan oshganda yoki kuchli tana qaqshashi bo‘lsa, isitma tushiruvchi (Paratsetamol) qabul qilish mumkin;\n3. Vitamin C immunitet hujayralarini faollashtirishda yordam beradi;\n4. **Muhim eslatma: Antibiotiklar viruslarga mutlaqo ta'sir qilmaydi!** Ularni faqat shifokor laborator qon tahlillariga qarab yozgandagina ichish shart.\n\nDorixonamizdagi mos dori vositalari:`;
    }
  } else if (categoryIntent === "vitamins") {
    if (lang === "ru") {
      reply = `🩺 **Врачебная рекомендация: Витамины и поддержание тонуса**\n\nХроническая усталость и частые простуды могут указывать на дефицит витамина D3, железа или цинка.\n\n**Правила приема:**\n1. Витамин D3 — жирорастворимый витамин. Его лучше принимать в первой половине дня во время еды (содержащей полезные жиры);\n2. Для точного подбора лечебной дозы рекомендуется сдать анализ крови на 25-OH витамин D;\n3. Не совмещайте некоторые микроэлементы (например, кальций и железо) в один прием, делайте интервал 2-3 часа.\n\nСертифицированные витамины в каталоге VaksinaMed:`;
    } else if (lang === "en") {
      reply = `🩺 **Clinical Advisory: Vitamins & Energy Support**\n\nFatigue and weakened immunity are frequently linked to vitamin D3, iron, or zinc deficiency.\n\n**Doctor's tips:**\n1. Vitamin D3 is fat-soluble: take it in the morning alongside a meal containing healthy fats;\n2. A blood test (25-hydroxy vitamin D) is the best standard to pinpoint treatment vs preventive dosage;\n3. Separate incompatible minerals (such as iron and calcium) by at least 2–3 hours for optimal absorption.\n\nAvailable certified supplements:`;
    } else {
      reply = `🩺 **Shifokor tavsiyasi: Vitaminlar va quvvatni tiklash**\n\nDoimiy charchoq, holsizlik va tez-tez shamollash ko‘pincha organizmda D3 vitamini, temir yoki sink yetishmovchiligidan darak beradi.\n\n**To‘g‘ri qabul qilish qoidalari:**\n1. Vitamin D3 yog‘da eruvchi vitamin bo‘lgani uchun uni ertalab, yog‘li nonushta bilan birga ichish eng yaxshi samara beradi;\n2. Dori dozasini aniq belgilash uchun qondagi 25-OH D vitamini darajasini tekshirtirish tavsiya etiladi;\n3. Minerallarni (masalan temir va kalsiyni) bir vaqtda ichmang, oralarida 2–3 soat vaqt qoldiring.\n\nVaksinaMed dorixonasidagi original vitaminlar:`;
    }
  } else if (categoryIntent === "stomach") {
    if (lang === "ru") {
      reply = `🩺 **Врачебная рекомендация: Пищеварение и желудок**\n\nДискомфорт, изжога или тяжесть в желудке требуют бережного отношения к пищеварительному тракту.\n\n**Советы врача:**\n1. Исключите острое, жареное, газированные напитки и фастфуд. Питайтесь небольшими порциями 4-5 раз в день;\n2. При изжоге и повышенной кислотности применяются ингибиторы протонной помпы (Омепразол за 30 минут до еды) или антациды;\n3. При тяжести после еды помогают ферментные препараты (Мезим, Панкреатин);\n4. *Опасный симптом: при острой, «кинжальной» боли в животе категорически запрещено греть живот или пить обезболивающие — немедленно обратитесь к хирургу!*\n\nПрепараты из нашего каталога:`;
    } else if (lang === "en") {
      reply = `🩺 **Clinical Advisory: Digestive & Stomach Health**\n\nHeartburn, heaviness, or gastric irritation require dietary moderation and careful care.\n\n**Doctor's tips:**\n1. Avoid fried, spicy foods, carbonated drinks, and alcohol. Eat frequent, smaller portions;\n2. For acid reflux, PPIs (Omeprazole taken 30 minutes before breakfast) or antacids are commonly used;\n3. Digestive enzymes (Pancreatin) assist with post-meal fullness;\n4. *Alert: acute, piercing abdominal pain should never be masked with painkillers — seek emergency surgical evaluation!*\n\nRecommended medications from our catalog:`;
    } else {
      reply = `🩺 **Shifokor tavsiyasi: Oshqozon noqulayligi va hazm qilish**\n\nJig‘ildon qaynashi (izjoga), og‘irlik yoki oshqozondagi og‘riqlar ko‘pincha noto‘g‘ri ovqatlanish yoki oshqozon shirasining kislotaliligi oshishidan kelib chiqadi.\n\n**Shifokor ko‘rsatmalari:**\n1. Qovurilgan, achchiq, nordon taomlar va gazli ichimliklardan cheklaning. Kam-kamdan, kuniga 4–5 mahal yengil ovqatlaning;\n2. Jig‘ildon qaynashida kislotani kamaytiruvchi vositalar (Omeprazol nonushtadan 30 daqiqa oldin) tavsiya etiladi;\n3. Ovqatdan keyingi og‘irlikda hazm fermentlari (Mezim, Pankreatin) yordam beradi;\n4. *Xavfli belgi: Qorinda keskin, o‘tkir sanchiq bo‘lsa, og‘riq qoldiruvchi dori ichmang va issiq grelka qo‘ymang — zudlik bilan shifokor-jarroh ko‘rigiga boring!*\n\nDorixonamizdagi mavjud preparatlar:`;
    }
  } else if (categoryIntent === "allergy") {
    if (lang === "ru") {
      reply = `🩺 **Врачебная рекомендация: Аллергические реакции**\n\nЗуд, сыпь, чихание и заложенность носа — частые признаки аллергической реакции на пыльцу, пыль или продукты.\n\n**Советы врача:**\n1. Максимально устраните контакт с предполагаемым аллергеном;\n2. Антигистаминные препараты 2-го поколения (Лоратадин, Цетиризин) эффективно снимают симптомы и практически не вызывают сонливости;\n3. Принимать рекомендуется 1 раз в сутки, запивая водой;\n4. *Внимание: если возник отек губ, языка или затруднение дыхания (отек Квинке) — срочно вызывайте скорую 103!*\n\nДоступные антигистаминные препараты:`;
    } else if (lang === "en") {
      reply = `🩺 **Clinical Advisory: Allergy & Rash Management**\n\nItching, hives, sneezing, or nasal congestion are typical symptoms of an allergic reaction.\n\n**Doctor's tips:**\n1. Immediately discontinue contact with the suspected allergen;\n2. Second-generation antihistamines (Loratadine, Cetirizine) relieve symptoms without causing significant drowsiness;\n3. Take 1 tablet once daily with water;\n4. *Alert: if facial swelling, lip swelling, or breathing difficulty develops (angioedema), call 103 emergency services immediately!*\n\nVerified antihistamines in our catalog:`;
    } else {
      reply = `🩺 **Shifokor tavsiyasi: Allergiya va toshmalarda nima qilish kerak?**\n\nQichishish, toshmalar, ko‘z yoshlanishi va aksirish organizmning allergenlarga (chang, oziq-ovqat, dori yoki gul changi) ta'sirchanligidir.\n\n**Shifokor ko‘rsatmalari:**\n1. Shubhali allergen bilan aloqani zudlik bilan to‘xtating;\n2. Zamonaviy 2-avlod antigistamin dori vositalari (Loratadin, Setirizin) allergik reaksiyani tez bartaraf qiladi va uyquchanlik chaqirmaydi;\n3. Odatda kuniga 1 mahal, yetarli suv bilan ichiladi;\n4. *Ogohlantirish: Agar lab, til, tomoq sohasida shish paydo bo‘lsa va nafas olish qiyinlashsa (Kvinke shishi) — bir lahza ham kutmasdan 103 Tez yordam chaqiring!*\n\nDorixonamizdagi tavsiya etilgan allergiyaga qarshi dorilar:`;
    }
  } else if (categoryIntent === "antibiotic") {
    if (lang === "ru") {
      reply = `🩺 **Клиническое уведомление: Прием антибиотиков**\n\nАнтибактериальные препараты (например, Амоксициллин) борются исключительно с бактериальными инфекциями и бессильны против вирусов (гриппа, простуды).\n\n**Строгие правила безопасности:**\n1. Антибиотики отпускаются и принимаются **только по прямому назначению врача** с подтвержденным бактериальным диагнозом;\n2. Курс лечения необходимо завершить полностью (обычно 5–7 дней), даже если самочувствие улучшилось на 2-й день, чтобы бактерии не выработали устойчивость;\n3. Для защиты желудочно-кишечного тракта врач может назначить пробиотики с интервалом 2-3 часа после антибиотика.\n\nПрепараты из каталога:`;
    } else if (lang === "en") {
      reply = `🩺 **Clinical Notice: Antibiotic Use & Stewardship**\n\nAntibacterial agents (such as Amoxicillin) eradicate bacterial pathogens only and do not work against viruses (flu, common cold).\n\n**Crucial safety rules:**\n1. Antibiotics must strictly be taken **under verified medical prescription**;\n2. Always finish the entire prescribed treatment duration (typically 5–7 days) to prevent bacterial resistance;\n3. Take pro-biotics with a 2–3 hour interval if recommended by your physician.\n\nPrescription options in catalog:`;
    } else {
      reply = `🩺 **Shifokorlik ogohlantirishi: Antibiotiklar qabuli bo‘yicha muhim qoidalar**\n\nAntibiotiklar (masalan, Amoksitsillin) faqat bakterial infeksiyalarni davolash uchun mo‘ljallangan va virusli kasalliklarda (gripp, O‘RVI) mutlaqo yordam bermaydi.\n\n**Qat'iy xavfsizlik qoidalari:**\n1. Antibiotiklarni faqat va faqat **shifokor retsepti va ko‘rigidan so‘ng** qabul qilish shart;\n2. Davolash kursini to‘liq yakunlang (odatda 5–7 kun). Ahvolingiz 2-kuni yaxshilansa ham to‘xtatmang, aks holda bakteriyalarda doriga chidamlilik (rezistentlik) paydo bo‘ladi;\n3. Ichak mikroflorasini asrash uchun shifokor bilan birga probiotiklar qabul qilish tavsiya qilinadi (antibiotikdan 2–3 soat keyin).\n\nDorixonamizdagi preparatlar:`;
    }
  }

  return {
    success: true,
    reply,
    isMedical: true,
    matchedProducts: matchedCards,
    quickSuggestions: [
      lang === "ru" ? "Как правильно принимать?" : lang === "en" ? "How to use properly?" : "Qo‘llash qoidalari qanday?",
      lang === "ru" ? "Есть ли противопоказания?" : lang === "en" ? "Any contraindications?" : "Qarshi ko‘rsatmalar bormi?",
      lang === "ru" ? "Добавить в корзину" : lang === "en" ? "Add to cart" : "Savatga qo‘shish",
    ],
  };
}
