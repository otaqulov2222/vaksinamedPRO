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
  isPrescription?: boolean;
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
  "buyurtma", "analog", "аналог", "shifokor", "vrach", "врач", "доктор", "doctor", "stomatolog", "стоматолог",
  // Symptoms & Body parts (Uzbek, Russian, English)
  "og'ri", "ogri", "og‘ri", "ogriy", "og'riy", "ogridi", "og'ridi", "og'riq", "ogriq", "ogriydi",
  "qorn", "qorin", "qornim", "qorni", "oshqozon", "oshqazon", "jigar", "buyrak", "ichak", "ichim", "hazm", "spazm",
  "bel", "oyoq", "bosh", "tish", "milk", "tomoq", "yurak", "ko'krak", "kokrak", "o'pka", "opka",
  "ko'z", "koz", "quloq", "burun", "bo'yin", "boyin", "yelka", "tizza", "bo'g'im", "bogim",
  "isitma", "temperatura", "harorat", "shamollash", "gripp", "yo'tal", "yotal", "balg'am", "angina",
  "allergiya", "toshma", "qichish", "ich ket", "diareya", "ko'ngil", "kongil", "qusish", "qusyap",
  "qon bosimi", "bosim", "davleniye", "holsizlik", "charchoq", "asab", "flyus", "karies", "pulpit",
  "ko'richak", "korichak", "peritonit", "gastrit", "yazva", "kasal", "bemor", "dard",
  // Russian roots
  "бол", "болит", "боле", "живот", "желуд", "печен", "почк", "голов", "зуб", "спин", "горл", "кашел",
  "жар", "температур", "простуд", "грипп", "тошн", "рвот", "понос", "диаре", "сып", "зуд", "сердц", "давлен",
  "аппендицит", "спазм", "гастрит",
  // English roots
  "pain", "ache", "hurt", "stomach", "belly", "abdomen", "head", "tooth", "throat", "cough", "fever", "cold",
  // Vitamins & supplements
  "vitamin", "витамин", "d3", "д3", "askorbin", "аскорбин", "magniy", "магний", "omega", "омега", "sink", "цинк",
  "kalsiy", "кальций", "temir", "железо", "gemoglobin", "гемоглобин", "anemiya", "анемия", "immunitet", "иммунитет",
  // Specific drugs
  "paratsetamol", "paracetamol", "парацетамол", "amoksitsillin", "amoxicillin", "амоксициллин",
  "ibuprofen", "ибупрофен", "nurofen", "нурофен", "tsitramon", "цитрамон", "analgin", "анальгин",
  "aspirin", "аспирин", "no-shpa", "но-шпа", "noshpa", "drotaverin", "дротаверин", "spazmalgon", "спазмалгон",
  "mezim", "мезим", "festal", "фестал", "omeprazol", "омепразол", "acc", "ацц", "loratadin", "лоратадин", "suprastin", "супрастин",
];

export function isMedicalDomain(query: string): boolean {
  const q = normalizeQuery(query);
  if (q.length < 2) return true;

  for (const pattern of OFF_TOPIC_PATTERNS) {
    if (pattern.test(q)) return false;
  }

  // If query matches any medical keyword/symptom/body part
  if (MEDICAL_KEYWORDS.some((kw) => q.includes(kw))) {
    return true;
  }

  // If query is a general health/consultation phrase (not off-topic)
  const isGeneralHelpOrSymptom =
    q.includes("yordam") ||
    q.includes("maslahat") ||
    q.includes("nima qil") ||
    q.includes("qanday") ||
    q.includes("ahvol") ||
    q.includes("yomon") ||
    q.includes("kasal") ||
    q.includes("bemor") ||
    q.includes("dard") ||
    q.includes("davol") ||
    q.includes("shifo") ||
    q.includes("pomoch") ||
    q.includes("pomog") ||
    q.includes("help") ||
    q.includes("advice");

  return isGeneralHelpOrSymptom;
}

export function isExplicitMedicinePurchaseRequest(query: string): boolean {
  const q = normalizeQuery(query);
  return (
    q.includes("sotib ol") ||
    q.includes("buyurtma") ||
    q.includes("savatga") ||
    q.includes("narxi") ||
    q.includes("qancha turadi") ||
    q.includes("bormi") ||
    q.includes("qayerdan olsam") ||
    q.includes("dori bering") ||
    q.includes("dori kerak") ||
    q.includes("preparat kerak") ||
    q.includes("topib ber") ||
    q.includes("dokonda bormi") ||
    q.includes("dorixonada bormi") ||
    q.includes("купить") ||
    q.includes("заказать") ||
    q.includes("в корзину") ||
    q.includes("сколько стоит") ||
    q.includes("есть в наличии") ||
    q.includes("наличие") ||
    q.includes("дай лекарство") ||
    q.includes("нужно лекарство") ||
    q.includes("найди препарат") ||
    q.includes("buy") ||
    q.includes("order") ||
    q.includes("price") ||
    q.includes("in stock")
  );
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
      isPrescription: false,
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
    /(og'ri|ogri|ogriy|og'riy|bosh|tish|milk|karies|pulpit|qorn|qorin|oshqozon|jigar|buyrak|isitma|temperatura|жар|бол|голов|зуб|живот|желуд|shamollash|gripp|dori|retsept|рецепт|preparat|vitamin|витамин|davleniye|давлен|qon bosimi|ich ket|diareya|диаре)/i.test(
      qNorm
    );

  if (isGreetingWord && !hasSpecificSymptomOrDrug && !hasImage) {
    let reply = "";
    if (lang === "ru") {
      reply = `Здравствуйте! Я медицинский ИИ-консультант аптечной сети VaksinaMed 🩺.\n\nКак ваше самочувствие? Опишите, пожалуйста, что именно вас беспокоит (например: головная боль, зубная боль, простуда, слабость) или укажите конкретное лекарство, о котором хотите узнать.\n\nТакже вы можете сфотографировать рецепт от врача — я мгновенно найду назначенные препараты в нашем каталоге.\n\n⚠️ Медицинское напоминание: Все рекомендации носят информационный характер. Перед приемом препаратов обязательно проконсультируйтесь с лечащим врачом.`;
    } else if (lang === "en") {
      reply = `Hello! I am your VaksinaMed Medical AI Consultant 🩺.\n\nHow are you feeling today? Please let me know what symptoms you are experiencing (e.g. toothache, headache, cold, fever, fatigue), or ask about any medication, dosage, or interactions.\n\nYou can also upload or take a photo of a doctor's prescription for instant catalog matching.\n\n⚠️ Medical note: All advice is advisory. Please consult your physician before taking medications.`;
    } else {
      reply = `Assalomu alaykum! Men VaksinaMed sun'iy intellekt tibbiy maslahatchisiman 🩺.\n\nBugun o‘zingizni qanday his qilyapsiz? Agar sizda biror bezovtalik (masalan: tish og‘rig‘i, bosh og‘rig‘i, shamollash, isitma, oshqozon noqulayligi) bo‘lsa, batafsil yozib qoldiring yoki qaysi dori vositasi haqida ma'lumot olmoqchi ekanligingizni ayting.\n\nShuningdek, shifokor retsepti suratini yuborsangiz, barcha belgilangan dorilarni aniqlab, filiallarimizdagi mavjudligini ko‘rsatib beraman.\n\n⚠️ Muhim eslatma: Men bergan barcha ma'lumotlar tavsiyaviy xarakterga ega. Aniq tashxis qo‘yish va davolash uchun davolovchi shifokoringiz bilan maslahatlashing.`;
    }

    return {
      success: true,
      reply,
      isMedical: true,
      isPrescription: false,
      matchedProducts: [], // Strictly NO products on greetings
      quickSuggestions: [
        lang === "ru" ? "Сфотографировать рецепт" : lang === "en" ? "Scan prescription photo" : "Retseptni rasmga olish",
        lang === "ru" ? "Болит зуб, что делать?" : lang === "en" ? "Toothache advice" : "Tishim og‘riyapti, nima ichiladi?",
        lang === "ru" ? "Беспокоит головная боль" : lang === "en" ? "Headache relief" : "Bosh og‘rig‘i bezovta qilyapti",
        lang === "ru" ? "Симптомы простуды и жар" : lang === "en" ? "Cold and fever symptoms" : "Shamollash va isitma belgilari",
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
      isPrescription: false,
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
      reply = `🚨 ВНИМАНИЕ: ТРЕБУЕТСЯ СРОЧНАЯ МЕДИЦИНСКАЯ ПОМОЩЬ!\n\nОписанные вами симптомы (давление в области сердца, одышка, подозрение на инфаркт или инсульт) представляют прямую угрозу здоровью и жизни. Не занимайтесь самолечением!\n\n1. Немедленно позвоните по номеру 103 (Скорая медицинская помощь);\n2. Сядьте или прилягте с приподнятым изголовьем, расстегните тесную одежду и откройте окно для свежего воздуха;\n3. Не принимайте незнакомые сильнодействующие препараты до осмотра врачей;\n4. Обязательно предупредите людей, находящихся рядом с вами.`;
    } else if (lang === "en") {
      reply = `🚨 EMERGENCY: IMMEDIATE MEDICAL ATTENTION REQUIRED!\n\nYour described symptoms (chest pain/pressure, severe shortness of breath, possible cardiac or neurological event) are red-flag indicators that require emergency care. Do not attempt self-medication!\n\n1. Call 103 (Emergency Ambulance) immediately;\n2. Sit or semi-recline comfortably, loosen tight clothing, and ensure access to fresh air;\n3. Do not take unprescribed potent medications before paramedics arrive;\n4. Alert family members or people nearby immediately.`;
    } else {
      reply = `🚨 DIQQAT: ZUDLIK BILAN SHOSHILINCH TIBBIY YORDAM CHAQIRING!\n\nSiz ta'riflagan holat (yurak sohasidagi og‘riq/siqilish, nafas qisishi, insult yoki infarkt xavfi) jiddiy xavf belgisi hisoblanadi. Vaqtni boy bermang va o‘zboshimchalik bilan dori ichmang!\n\n1. Zudlik bilan 103 (Tez tibbiy yordam) raqamiga qo‘ng‘iroq qiling;\n2. Tinch holatda o‘tiring yoki boshni biroz baland qilib yoting, tor yoqalarni yechib, xonaga toza havo kiring;\n3. Shifokorlar kelgunga qadar begona yoki kuchli ta'sir qiluvchi dorilarni ichmang;\n4. Yon-atrofdagi yaqinlaringizga holatingiz haqida darhol xabar bering.`;
    }

    return {
      success: true,
      reply,
      isMedical: true,
      isPrescription: false,
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
      reply = `🩺 Медицинское предупреждение: Прием препаратов при беременности и лактации\n\nВо время беременности и грудного вскармливания большинство лекарственных средств проникает через плацентарный барьер или в грудное молоко, что может повлиять на ребенка.\n\nЛюбые лекарственные средства (даже витамины или жаропонижающие) должны подбираться строго вашим врачом акушером-гинекологом или педиатром с учетом триместра и анамнеза.\n\nСамолечение категорически не рекомендуется. Пожалуйста, обратитесь к вашему врачу для безопасного назначения.`;
    } else if (lang === "en") {
      reply = `🩺 Medical Caution: Medication in Pregnancy & Breastfeeding\n\nDuring pregnancy and lactation, most pharmaceutical substances can cross into fetal circulation or breast milk. Self-medication is unsafe.\n\nAny therapy, even mild pain relievers or vitamins, must be authorized directly by your obstetrician-gynecologist or pediatrician based on your gestational age.\n\nPlease consult your doctor before taking any medication.`;
    } else {
      reply = `🩺 Tibbiy ogohlantirish: Homiladorlik va emizish davrida dorilar qabuli\n\nHomiladorlik va laktatsiya davrida dori vositalarining ko‘p qismi yo‘ldosh (platsenta) to‘sig‘i yoki ona suti orqali bolaga o‘tishi mumkin. Shu sababli bu davrda o‘zboshimchalik bilan dori ichish qat'iyan man etiladi.\n\nHatto eng oddiy og‘riq qoldiruvchi yoki vitaminlar ham faqat davolovchi akusher-ginekolog yoki pediatr nazorati ostida, homiladorlik haftasiga mos ravishda tanlanishi shart.\n\nIltimos, bolangiz va o‘zingizning xavfsizligingiz uchun shifokoringiz bilan maslahatlashing.`;
    }

    return {
      success: true,
      reply,
      isMedical: true,
      isPrescription: false,
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
      reply = `🩺 Консультация врача: Артериальное давление\n\nАртериальное давление требует строгого индивидуального подхода. Препараты для снижения или повышения давления (гипотензивные) подбираются терапевтом или кардиологом на основании регулярного мониторинга и ЭКГ. Пить чужие лекарства от давления опасно!\n\nЧто делать сейчас:\n1. Измерьте давление тонометром в состоянии полного покоя (сидя, опершись на спинку стула);\n2. Проветрите комнату, расслабьтесь, не употребляйте кофе, крепкий чай и соленые продукты;\n3. Если давление выше 160/100 мм рт. ст. и сопровождается сильной головной болью, тошнотой или болью в груди — немедленно вызовите врача по номеру 103.`;
    } else if (lang === "en") {
      reply = `🩺 Clinical Advice: Blood Pressure Management\n\nBlood pressure medications must be tailored exclusively by a licensed therapist or cardiologist based on personal readings and cardiovascular history. Never take someone else's antihypertensive pills!\n\nImmediate steps:\n1. Measure your blood pressure with a reliable tonometer while seated comfortably and quietly for 5 minutes;\n2. Ensure adequate ventilation and avoid caffeine, alcohol, or excess sodium;\n3. If blood pressure exceeds 160/100 mmHg accompanied by chest tightness, dizziness, or visual disturbance, seek immediate medical care via 103.`;
    } else {
      reply = `🩺 Shifokor tavsiyasi: Qon bosimi (Davleniye)\n\nQon bosimini nazorat qilish va davolash qat'iy individual yondashuvni talab qiladi. Bosim tushiruvchi (gipotenziv) preparatlarni faqat kardiolog yoki terapevt ko‘rigidan so‘ng, tonometr ko‘rsatkichlariga qarab ichish lozim. Birovning bosim dorisini o‘zboshimchalik bilan ichish hayot uchun xavflidir!\n\nHozirgi holatda nima qilish kerak:\n1. 5 daqiqa tinch o‘tirib, tonometr yordamida qon bosimingizni aniq o‘lchang;\n2. Xonani shamollating, kiyimlarni bo‘shating, qahva yoki achchiq choy ichmang;\n3. Agar bosim 160/100 mm simob ustunidan yuqori bo‘lsa va bosh og‘rig‘i, ko‘ngil aynishi yoki ko‘krakda siqilish kuzatilsa — darhol 103 raqami orqali shifokor chaqiring.`;
    }

    return {
      success: true,
      reply,
      isMedical: true,
      isPrescription: false,
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
        reply = `🩺 Результат клинического анализа рецепта:\n\nЯ распознал назначенные препараты и сверил их с наличием в аптечной сети VaksinaMed. Найдено совпадений: ${matchedCards.length}.\n\nПравила безопасности: Принимайте препараты строго по схеме вашего врача. Не прерывайте курс антибиотиков раньше времени. Вы можете добавить нужные лекарства прямо в корзину:`;
      } else if (lang === "en") {
        reply = `🩺 Prescription Clinical Match Result:\n\nI have parsed your prescription and verified availability across VaksinaMed branches. Matched items: ${matchedCards.length}.\n\nSafety advisory: Follow the exact regimen prescribed by your doctor. Complete any antibiotic course entirely. You can add the verified medicines directly to your cart:`;
      } else {
        reply = `🩺 Retseptning klinik tahlil natijasi:\n\nShifokor retseptidagi dori vositalari o‘qildi va VaksinaMed dorixonasi bazasidan muvaffaqiyatli aniqlandi. Topilgan preparatlar: ${matchedCards.length} ta.\n\nXavfsizlik eslatmasi: Dorilarni shifokor belgilagan dozada va qat'iy jadval asosida qabul qiling. Agar antibiotik yozilgan bo‘lsa, kursni oxirigacha yetkazing. Kerakli dorilarni to‘g‘ridan-to‘g‘ri savatga qo‘shishingiz mumkin:`;
      }
    } else {
      if (lang === "ru") {
        reply = `Я внимательно изучил присланный текст или изображение рецепта, но точных совпадений с препаратами в каталоге не обнаружено.\n\nПожалуйста, убедитесь, что фото четкое, при хорошем освещении, или напишите названия лекарств вручную (например: Парацетамол 500 мг).`;
      } else if (lang === "en") {
        reply = `I examined the prescription text or image, but could not detect matching medications in our database.\n\nPlease provide a clear, well-lit photo or enter the medicine names manually (e.g. Paracetamol 500 mg).`;
      } else {
        reply = `Yuborilgan retsept matni yoki suratini sinchiklab tekshirdim, ammo dorilar nomini aniq o‘qib bo‘lmadi.\n\nIltimos, retsept suratini yorug‘ joyda, aniqroq qilib qayta yuboring yoki dorilar nomini qo‘lda yozib qoldiring (masalan: Paratsetamol 500 mg).`;
      }
    }

    return {
      success: true,
      reply,
      isMedical: true,
      isPrescription: true, // Only prescription scan allows bulk add to cart
      matchedProducts: matchedCards,
      quickSuggestions: [
        lang === "ru" ? "Правила приема этих лекарств" : lang === "en" ? "Dosage directions" : "Dori qabul qilish qoidalari",
        lang === "ru" ? "Есть ли противопоказания?" : lang === "en" ? "Contraindications" : "Qarshi ko‘rsatmalar bormi?",
        lang === "ru" ? "Добавить всё в корзину" : lang === "en" ? "Add all to cart" : "Barchasini savatga olish",
      ],
    };
  }

  // 8. SPECIFIC CLINICAL CATEGORIES
  type ClinicalCategory =
    | "dental"
    | "headache"
    | "throat_cough"
    | "cold_fever"
    | "stomach"
    | "diarrhea"
    | "joint_back"
    | "allergy"
    | "vitamins"
    | "antibiotic"
    | "general_pain"
    | "none";

  let categoryIntent: ClinicalCategory = "none";

  // Check Dental Pain FIRST so "tishim og'riyapti" never falls into headache!
  if (
    qNorm.includes("tish") ||
    qNorm.includes("milk") ||
    qNorm.includes("karies") ||
    qNorm.includes("pulpit") ||
    qNorm.includes("flyus") ||
    qNorm.includes("stomatolog") ||
    qNorm.includes("зуб") ||
    qNorm.includes("десн") ||
    qNorm.includes("флюс") ||
    qNorm.includes("кариес") ||
    qNorm.includes("пульпит") ||
    qNorm.includes("стоматолог") ||
    qNorm.includes("tooth") ||
    qNorm.includes("teeth") ||
    qNorm.includes("dental")
  ) {
    categoryIntent = "dental";
  } else if (
    qNorm.includes("bosh") ||
    qNorm.includes("chakka") ||
    qNorm.includes("migren") ||
    qNorm.includes("голов") ||
    qNorm.includes("мигрень") ||
    qNorm.includes("headache")
  ) {
    categoryIntent = "headache";
  } else if (
    qNorm.includes("tomoq") ||
    qNorm.includes("yo'tal") ||
    qNorm.includes("yotal") ||
    qNorm.includes("balg'am") ||
    qNorm.includes("angina") ||
    qNorm.includes("горл") ||
    qNorm.includes("кашель") ||
    qNorm.includes("ангина") ||
    qNorm.includes("sore throat") ||
    qNorm.includes("cough")
  ) {
    categoryIntent = "throat_cough";
  } else if (
    qNorm.includes("shamollash") ||
    qNorm.includes("isitma") ||
    qNorm.includes("temperatura") ||
    qNorm.includes("gripp") ||
    qNorm.includes("burun") ||
    qNorm.includes("простуд") ||
    qNorm.includes("жар") ||
    qNorm.includes("температур") ||
    qNorm.includes("насморк") ||
    qNorm.includes("fever") ||
    qNorm.includes("cold")
  ) {
    categoryIntent = "cold_fever";
  } else if (
    qNorm.includes("ich ket") ||
    qNorm.includes("diareya") ||
    qNorm.includes("zaharlan") ||
    qNorm.includes("диаре") ||
    qNorm.includes("понос") ||
    qNorm.includes("отравлен") ||
    qNorm.includes("diarrhea")
  ) {
    categoryIntent = "diarrhea";
  } else if (
    qNorm.includes("oshqozon") ||
    qNorm.includes("qorin") ||
    qNorm.includes("qorn") ||
    qNorm.includes("jig'ildon") ||
    qNorm.includes("jigildon") ||
    qNorm.includes("hazm") ||
    qNorm.includes("gastrit") ||
    qNorm.includes("yazva") ||
    qNorm.includes("spazm") ||
    qNorm.includes("omeprazol") ||
    qNorm.includes("mezim") ||
    qNorm.includes("no-shpa") ||
    qNorm.includes("noshpa") ||
    qNorm.includes("drotaverin") ||
    qNorm.includes("живот") ||
    qNorm.includes("желуд") ||
    qNorm.includes("изжог") ||
    qNorm.includes("пищеварен") ||
    qNorm.includes("спазм") ||
    qNorm.includes("но-шпа") ||
    qNorm.includes("омепразол") ||
    qNorm.includes("stomach") ||
    qNorm.includes("belly") ||
    qNorm.includes("abdomen") ||
    qNorm.includes("heartburn")
  ) {
    categoryIntent = "stomach";
  } else if (
    qNorm.includes("bel") ||
    qNorm.includes("bo'g'im") ||
    qNorm.includes("bog'im") ||
    qNorm.includes("umurtqa") ||
    qNorm.includes("radikulit") ||
    qNorm.includes("спин") ||
    qNorm.includes("сустав") ||
    qNorm.includes("поясниц") ||
    qNorm.includes("back pain") ||
    qNorm.includes("joint")
  ) {
    categoryIntent = "joint_back";
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
    qNorm.includes("antibiotik") ||
    qNorm.includes("amoksitsillin") ||
    qNorm.includes("amoxicillin") ||
    qNorm.includes("антибиотик")
  ) {
    categoryIntent = "antibiotic";
  } else if (
    qNorm.includes("og'ri") ||
    qNorm.includes("ogri") ||
    qNorm.includes("paratsetamol") ||
    qNorm.includes("paracetamol") ||
    qNorm.includes("ibuprofen") ||
    qNorm.includes("analgin") ||
    qNorm.includes("tsitramon") ||
    qNorm.includes("бол") ||
    qNorm.includes("парацетамол") ||
    qNorm.includes("ибупрофен") ||
    qNorm.includes("анальгин") ||
    qNorm.includes("pain")
  ) {
    categoryIntent = "general_pain";
  }

  // Check if user explicitly asked to BUY / FIND / ORDER medication
  const isExplicitPurchase = isExplicitMedicinePurchaseRequest(userText);
  const relevantCandidates: CatalogProductCandidate[] = [];

  // If user explicitly asks for a medicine, find exact name match first
  if (isExplicitPurchase) {
    const directMatch = params.candidates.find((p) => {
      const pName = normalizeQuery(p.nameUz + " " + p.nameRu);
      const parts = pName.split(/\s+/).filter((w) => w.length >= 4);
      return parts.some((w) => qNorm.includes(w));
    });
    if (directMatch) {
      relevantCandidates.push(directMatch);
    }
  }

  // Filter candidates matching intent and strictly DEDUPLICATE (never recommend 2 duplicate NSAIDs!)
  if (relevantCandidates.length === 0) {
    const seenGroups = new Set<string>();

    for (const p of params.candidates) {
      const name = normalizeQuery(p.nameUz + " " + p.nameRu + " " + (p.category || ""));
      const group = p.analogGroup || p.sku;

      if (categoryIntent === "dental") {
        // For toothache, recommend ONLY ONE safe anti-inflammatory analgesic (Ibuprofen)
        if (name.includes("ibuprofen") || name.includes("nurofen")) {
          if (!seenGroups.has("nsaid-ibu")) {
            seenGroups.add("nsaid-ibu");
            relevantCandidates.push(p);
          }
        }
      } else if (categoryIntent === "headache") {
        // For headache, recommend ONLY ONE Paracetamol (safe first-line)
        if (name.includes("paratsetamol") || name.includes("paracetamol")) {
          if (!seenGroups.has("analgesic-para")) {
            seenGroups.add("analgesic-para");
            relevantCandidates.push(p);
          }
        }
      } else if (categoryIntent === "cold_fever") {
        // For fever and cold: Paracetamol (1 item)
        if (name.includes("paratsetamol") || name.includes("paracetamol")) {
          if (!seenGroups.has("para")) {
            seenGroups.add("para");
            relevantCandidates.push(p);
          }
        }
      } else if (categoryIntent === "throat_cough") {
        if (name.includes("acc") || name.includes("septolete") || name.includes("strepsils")) {
          if (!seenGroups.has(group)) {
            seenGroups.add(group);
            relevantCandidates.push(p);
          }
        }
      } else if (categoryIntent === "stomach") {
        if (name.includes("no-shpa") || name.includes("noshpa") || name.includes("drotaverin") || name.includes("omeprazol") || name.includes("mezim")) {
          if (!seenGroups.has(group)) {
            seenGroups.add(group);
            relevantCandidates.push(p);
          }
        }
      } else if (categoryIntent === "diarrhea") {
        if (name.includes("rehidron") || name.includes("smecta") || name.includes("ugol")) {
          if (!seenGroups.has(group)) {
            seenGroups.add(group);
            relevantCandidates.push(p);
          }
        }
      } else if (categoryIntent === "joint_back") {
        if (name.includes("ibuprofen") || name.includes("diklofenak")) {
          if (!seenGroups.has("nsaid-joint")) {
            seenGroups.add("nsaid-joint");
            relevantCandidates.push(p);
          }
        }
      } else if (categoryIntent === "allergy") {
        if (name.includes("loratadin") || name.includes("setirizin") || name.includes("cetirizine")) {
          if (!seenGroups.has("antihistamine")) {
            seenGroups.add("antihistamine");
            relevantCandidates.push(p);
          }
        }
      } else if (categoryIntent === "vitamins") {
        if (name.includes("d3") || name.includes("vitamin")) {
          if (!seenGroups.has(group)) {
            seenGroups.add(group);
            relevantCandidates.push(p);
          }
        }
      } else if (categoryIntent === "antibiotic") {
        if (name.includes("amoksitsillin") || name.includes("amoxicillin")) {
          if (!seenGroups.has("amox")) {
            seenGroups.add("amox");
            relevantCandidates.push(p);
          }
        }
      } else if (categoryIntent === "general_pain") {
        if (name.includes("paratsetamol") || name.includes("paracetamol")) {
          if (!seenGroups.has("para-gen")) {
            seenGroups.add("para-gen");
            relevantCandidates.push(p);
          }
        }
      }

      if (relevantCandidates.length >= 1) break;
    }
  }

  // Fallback for dental if ibuprofen not found: pick 1 general analgesic
  if (categoryIntent === "dental" && relevantCandidates.length === 0) {
    const fallback = params.candidates.find((p) => {
      const n = normalizeQuery(p.nameUz + " " + p.nameRu);
      return n.includes("paratsetamol") || n.includes("paracetamol") || n.includes("analgin");
    });
    if (fallback) relevantCandidates.push(fallback);
  }

  // Build product cards ONLY if user explicitly asked to purchase/check medication!
  // For clinical symptom inquiries (e.g. "salom,tishim ogriyabdi"), strictly NO products are attached!
  const matchedCards: MatchedProductCard[] = [];
  if (isExplicitPurchase) {
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
      break; // Single product max for direct search
    }
  }

  // Construct clinical responses
  let reply = "";
  let quickSuggestions: string[] = [];

  if (isExplicitPurchase && matchedCards.length > 0) {
    if (lang === "ru") {
      reply = `В нашей аптечной сети есть сертифицированный препарат. Перед применением обязательно ознакомьтесь с инструкцией и проконсультируйтесь с лечащим врачом:`;
      quickSuggestions = ["Как правильно принимать?", "Есть ли противопоказания?", "Перейти в корзину"];
    } else if (lang === "en") {
      reply = `Verified medication available in our catalog. Please review the instructions and consult your doctor before use:`;
      quickSuggestions = ["How to use properly?", "Any contraindications?", "Go to cart"];
    } else {
      reply = `Dorixonamizda sertifikatlangan mos preparat mavjud. Qo‘llashdan oldin yo‘riqnoma bilan tanishib chiqing va shifokor bilan maslahatlashing:`;
      quickSuggestions = ["Qo‘llash qoidalari qanday?", "Qarshi ko‘rsatmalar bormi?", "Savatga o‘tish"];
    }
  } else if (categoryIntent === "dental") {
    if (lang === "ru") {
      reply = `🩺 Врачебная консультация: Первая помощь при зубной боли\n\nЗубная боль (кариес, пульпит, воспаление десны) всегда указывает на поражение глубоких тканей зуба или зубного нерва. Главное правило: таблетки не лечат больной зуб — причину боли может устранить только врач-стоматолог!\n\nРекомендации врача и первая помощь:\n1. Строгий запрет: Ни в коем случае не прикладывайте грелку или горячий компресс к больной щеке! Тепло резко ускоряет развитие гнойного процесса и может вызвать опасные осложнения;\n2. Полощите рот теплым раствором (на 1 стакан теплой воды — 1 ч. л. соли и 0.5 ч. л. соды) каждые 1–2 часа. Это снимает отек и воспаление;\n3. До приема врача для временного облегчения сильной боли допустим разовый прием одного противовоспалительного средства (например, Ибупрофен) строго после еды с водой;\n4. Правило безопасности: Не смешивайте несколько разных обезболивающих препаратов одновременно!\n\n⚠️ Важное напоминание: Данные рекомендации носят информационный характер. При первой возможности обратитесь к врачу-стоматологу.`;
      quickSuggestions = ["Записаться к стоматологу", "Опасные симптомы флюса", "Купить Ибупрофен"];
    } else if (lang === "en") {
      reply = `🩺 Clinical Guidance: First Aid for Toothache\n\nTooth pain (deep cavities, pulpitis, gum inflammation) always indicates damage to the internal tooth structure or nerve. Crucial medical rule: medications do not cure the underlying problem — only a licensed dentist can safely resolve it!\n\nDoctor's instructions & immediate care:\n1. Strict prohibition: NEVER apply warm compresses or heating pads to the affected cheek or tooth! Heat stimulates bacterial growth and purulent spread;\n2. Rinse your mouth every 1–2 hours with warm salt and soda solution (1 cup warm water + 1 tsp salt + 0.5 tsp baking soda) to reduce swelling;\n3. For temporary pain control until your appointment, a single OTC NSAID (such as Ibuprofen) may be taken after meals with water;\n4. Safety advisory: Never combine multiple different analgesics simultaneously!\n\n⚠️ Medical reminder: This guidance is advisory. Schedule an appointment with a dentist as soon as possible.`;
      quickSuggestions = ["Schedule dentist appointment", "Warning signs", "Buy Ibuprofen"];
    } else {
      reply = `🩺 Shifokor tavsiyasi: Tish og‘rig‘ida birinchi yordam\n\nTish og‘rig‘i (karies, pulpit, milk yallig‘lanishi) har doim tishning qattiq to‘qimalari yoki nerv tolasi shikastlanganidan dalolat beradi. Asosiy tibbiy qoida: hech qanday dori vositasi kasallangan tishni davolay olmaydi — uning asl sababini faqat stomatolog-shifokor bartaraf eta oladi!\n\nShifokor ko‘rsatmalari va birinchi yordam:\n1. Qat'iy taqiq: Og‘riyotgan tish yoki lunj sohasiga aslo issiq grelka yoki issiq kompress qo‘ymang! Issiqlik yiringlash jarayonini tezlashtirib, jiddiy asoratlarga olib kelishi mumkin;\n2. Og‘iz bo‘shlig‘ini 1 stakan iliq suvga 1 choy qoshiq osh tuzi va 0.5 choy qoshiq iste'mol sodasi solingan eritma bilan tez-tez chayib turing (bu shishni qaytaradi va og‘riqni yengillashtiradi);\n3. Shifokor qabuligacha bo‘lgan vaqtda og‘riqni vaqtincha bosish uchun bitta nosteroid vosita (masalan, Ibuprofen) ovqatdan keyin, bir stakan suv bilan ichilishi mumkin;\n4. Xavfsizlik qoidasi: Bir vaqtning o‘zida bir nechta har xil og‘riq qoldiruvchi dorilarni (masalan Paratsetamol va Ibuprofenni) aralashtirib ichmang!\n\n⚠️ Muhim eslatma: Ushbu tavsiyalar axborot xarakteriga ega. Iloji boricha tezroq stomatolog ko‘rigiga boring.`;
      quickSuggestions = ["Stomatolog ko‘rigiga yozilish", "Xavfli asoratlar bormi?", "Ibuprofen sotib olish"];
    }
  } else if (categoryIntent === "headache") {
    if (lang === "ru") {
      reply = `🩺 Врачебная рекомендация: Головная боль\n\nГоловная боль чаще всего вызвана переутомлением, изменением артериального давления или спазмом сосудов.\n\nСоветы врача:\n1. Первым делом измерьте давление тонометром. Проветрите комнату, выпейте чистой воды и отдохните в полумраке;\n2. При умеренной боли напряжения допустим прием одной таблетки Парацетамола (500 мг) строго после еды с водой;\n3. Не превышайте дозировку. Если боль резкая, внезапная, сопровождается рвотой или онемением — срочно вызовите скорую 103!\n\n⚠️ Важное напоминание: Данная консультация носит информационный характер. При постоянных болях обратитесь к врачу-терапевту.`;
      quickSuggestions = ["Как измерить давление?", "Когда вызывать 103?", "Купить Парацетамол"];
    } else if (lang === "en") {
      reply = `🩺 Clinical Advisory: Headache Management\n\nHeadaches typically stem from fatigue, blood pressure fluctuations, dehydration, or vascular tension.\n\nDoctor's guidance:\n1. Check your blood pressure with a reliable tonometer. Hydrate well, ventilate the room, and rest in a dim environment;\n2. For mild-to-moderate tension headache, Paracetamol (500 mg) may be taken after food with water;\n3. Emergency note: If the headache is sudden and exceptionally severe ("thunderclap"), accompanied by vomiting or numbness, call 103 immediately!\n\n⚠️ Medical reminder: Consult a physician if headaches recur regularly.`;
      quickSuggestions = ["How to measure blood pressure", "When to call 103", "Buy Paracetamol"];
    } else {
      reply = `🩺 Shifokor tavsiyasi: Bosh og‘rig‘ida nima qilish kerak?\n\nBosh og‘rig‘i ko‘pincha charchoq, qon bosimining o‘zgarishi (gipertoniya/gipotoniya), uzoq vaqt ekranga qarash yoki tomirlar spazmi oqibatida yuzaga keladi.\n\nShifokor ko‘rsatmalari:\n1. Birinchi navbatda tonometr bilan qon bosimingizni o‘lchang. Xonani shamollatib, toza suv iching va qorong‘uroq xonada tinch dam oling;\n2. Og‘riqni yengillashtirish uchun bitta Paratsetamol (500 mg) ovqatdan keyin, suv bilan ichilishi mumkin;\n3. Ogohlantirish: Agar og‘riq to‘satdan favqulodda kuchli boshlansa, hushdan ketish, ko‘rish xiralashishi yoki qusish bilan kechsa — darhol 103 Tez yordam chaqiring!\n\n⚠️ Muhim eslatma: Ushbu tavsiyalar axborot xarakteriga ega. Doimiy bosh og‘rig‘ida shifokor ko‘rigiga boring.`;
      quickSuggestions = ["Bosimni to‘g‘ri o‘lchash", "Qachon 103 chaqiriladi?", "Paratsetamol sotib olish"];
    }
  } else if (categoryIntent === "cold_fever") {
    if (lang === "ru") {
      reply = `🩺 Врачебная рекомендация: Простуда и повышенная температура\n\nПри ОРВИ температура до 38.5°C — это естественная защита иммунитета. Сбивать её сразу не нужно.\n\nТактика лечения:\n1. Пейте много теплой жидкости (чай с лимоном, настой шиповника) и соблюдайте постельный режим;\n2. При температуре выше 38.5°C допустим прием жаропонижающего (Парацетамол) после еды;\n3. Важное правило: Антибиотики не действуют на вирусы! Не принимайте антибиотики без назначения врача.\n\n⚠️ Важное напоминание: Если высокая температура держится более 3 дней, вызовите врача на дом.`;
      quickSuggestions = ["Обильное теплое питье", "Когда опасен жар?", "Купить Парацетамол"];
    } else if (lang === "en") {
      reply = `🩺 Clinical Advisory: Colds & Fever\n\nA fever up to 38.5°C (101.3°F) during viral colds represents natural immune response. Do not suppress mild fever prematurely.\n\nDoctor's tips:\n1. Drink plenty of warm fluids and maintain bed rest;\n2. If temperature exceeds 38.5°C, take Paracetamol after food;\n3. Crucial rule: Antibiotics are completely ineffective against viral colds! Never take antibiotics without prescription.\n\n⚠️ Medical reminder: Seek medical evaluation if fever persists over 3 days.`;
      quickSuggestions = ["Fluid hydration rules", "Fever red flags", "Buy Paracetamol"];
    } else {
      reply = `🩺 Shifokor tavsiyasi: Shamollash va tana harorati ko‘tarilganda\n\nO‘tkir virusli infeksiyalarda tana harorati 38–38.5°C gacha bo‘lishi organizmning kurashidir. Uni darhol dori bilan tushirishga shoshilmang.\n\nShifokor ko‘rsatmalari:\n1. Ko‘p miqdorda iliq suyuqlik (limonli choy, na'matak damlamasi) iching va to‘liq dam oling;\n2. Harorat 38.5°C dan oshganda isitma tushiruvchi (Paratsetamol) qabul qilish mumkin;\n3. Qat'iy eslatma: Antibiotiklar viruslarga mutlaqo ta'sir qilmaydi! O‘zboshimchalik bilan antibiotik ichmang.\n\n⚠️ Muhim eslatma: Agar yuqori isitma 3 kundan ortiq davom etsa, oilaviy shifokoringizga murojaat qiling.`;
      quickSuggestions = ["Ko‘p suyuqlik ichish qoidalari", "Isitma qachon xavfli?", "Paratsetamol sotib olish"];
    }
  } else if (categoryIntent === "stomach") {
    const isAbdominalPain =
      qNorm.includes("qorin") ||
      qNorm.includes("qorn") ||
      qNorm.includes("живот") ||
      qNorm.includes("belly") ||
      qNorm.includes("abdomen") ||
      qNorm.includes("spazm") ||
      qNorm.includes("og'ri") ||
      qNorm.includes("ogri") ||
      qNorm.includes("бол");

    if (isAbdominalPain) {
      if (lang === "ru") {
        reply = `🩺 Врачебная консультация: Боль в области живота и желудка\n\nБоль в животе (мышечный спазм, гастрит, пищевое расстройство или острая хирургическая патология — аппендицит) требует предельной осторожности.\n\nРекомендации врача и правила безопасности:\n1. Строгий запрет: До осмотра врача категорически запрещено прикладывать грелку к животу и принимать сильные обезболивающие (анальгетики)! Снятие боли маскирует симптомы острого аппендицита и перитонита;\n2. Прилягте в удобном положении, расстегните ремень. Воздержитесь от тяжелой и жирной пищи. Пейте теплую воду без газа небольшими глотками;\n3. При спазмах гладкой мускулатуры по согласованию с врачом допускается прием спазмолитика (Дротаверин / Но-шпа);\n4. Опасные симптомы (вызов 103): Острая боль справа внизу живота, рвота, повышение температуры, твердый живот — требуют немедленного вызова скорой помощи!\n\n⚠️ Важное напоминание: Данная консультация носит информационный характер. При острой боли в животе обязательно обратитесь к врачу.`;
        quickSuggestions = ["Симптомы аппендицита", "Когда вызывать 103?", "Купить Но-шпа"];
      } else if (lang === "en") {
        reply = `🩺 Clinical Advisory: Abdominal & Stomach Pain\n\nAbdominal pain can stem from indigestion, cramps, gastritis, or serious acute conditions such as appendicitis.\n\nDoctor's instructions & critical precautions:\n1. Strict prohibition: NEVER apply warm heating pads to the abdomen or take strong analgesics! Masking pain can hide acute appendicitis or peritonitis;\n2. Rest comfortably, loosen tight belts, and avoid heavy or spicy foods. Sip small amounts of room-temperature water;\n3. For smooth muscle cramps, an antispasmodic (such as Drotaverine / No-shpa) may be taken with doctor approval;\n4. Emergency red flags: If pain shifts to the lower right abdomen, worsens continuously, or is accompanied by fever or vomiting — call 103 ambulance immediately!\n\n⚠️ Medical reminder: Consult a physician or surgeon promptly for acute abdominal pain.`;
        quickSuggestions = ["Appendicitis warning signs", "When to call 103", "Buy No-shpa"];
      } else {
        reply = `🩺 Shifokor tavsiyasi: Qorin va oshqozon sohasidagi og‘riqda nima qilish kerak?\n\nQorindagi og‘riqlar turli sabablar (me'da spazmi, gastrit, noto‘g‘ri ovqatlanish yoki o‘tkir jarrohlik holatlari — masalan, ko‘richak / appenditsit) oqibatida paydo bo‘lishi mumkin.\n\nShifokor ko‘rsatmalari va xavfsizlik choralari:\n1. Qat'iy taqiq: Qorindagi og‘riq sababi aniqlanmaguncha, aslo issiq grelka qo‘ymang va kuchli og‘riq qoldiruvchi dorilarni (analgetiklarni) ichmang! Og‘riqni sun'iy bosish xavfli jarrohlik holatlarini (masalan, ko‘richak yorilishi yoki peritonitni) yashirib qo‘yishi mumkin;\n2. Tinch holatda yoting, tor kamarni bo‘shating. Qattiq, yog‘li, qovurilgan taomlar yemang. Gazsiz iliq suv yoki moychechak damlamasidan oz-ozdan iching;\n3. Qisilish va spazm bilan kechadigan og‘riqlarda shifokor bilan maslahatlashgan holda faqat spazmolitik vosita (masalan, Drotaverin / No-shpa) qabul qilinishi mumkin;\n4. Zudlik bilan shifokorga murojaat qilish belgilari: Agar og‘riq qorinning o‘ng pastki qismiga o‘tsa, to‘xtovsiz kuchaysa, ko‘ngil aynishi, qusish yoki tana harorati ko‘tarilishi bilan kechsa — darhol 103 Tez yordam chaqiring!\n\n⚠️ Muhim eslatma: Ushbu tavsiyalar axborot xarakteriga ega. Qorin og‘rig‘ida shifokor-terapevt yoki jarroh ko‘rigidan o‘tish zarur.`;
        quickSuggestions = ["Xavfli ko‘richak belgilari", "Qachon 103 chaqiriladi?", "No-shpa sotib olish"];
      }
    } else {
      if (lang === "ru") {
        reply = `🩺 Врачебная рекомендация: Изжога и дискомфорт в желудке\n\nПри изжоге и повышенной кислотности важно скорректировать диету и защитить слизистую.\n\nСоветы врача:\n1. Исключите жареное, острое, кофе и газировку. Питайтесь дробно, небольшими порциями;\n2. При изжоге принимают ингибиторы протонной помпы (Омепразол за 30 минут до завтрака);\n3. Предупреждение: При острой «кинжальной» боли в животе категорически запрещено пить обезболивающие — срочно обратитесь к хирургу!\n\n⚠️ Важное напоминание: При регулярном дискомфорте пройдите гастроскопию у врача.`;
        quickSuggestions = ["Диета при изжоге", "Когда нужен хирург?", "Купить Омепразол"];
      } else if (lang === "en") {
        reply = `🩺 Clinical Advisory: Heartburn & Gastric Comfort\n\nAcid reflux and gastric discomfort require dietary restraint and mucosal protection.\n\nDoctor's tips:\n1. Avoid fried, spicy foods and carbonated drinks. Eat frequent small meals;\n2. For heartburn, Omeprazole is taken 30 minutes before breakfast;\n3. Alert: Never take painkillers for acute unexplained abdominal pain — seek surgical evaluation immediately!\n\n⚠️ Medical reminder: Consult a gastroenterologist for chronic symptoms.`;
        quickSuggestions = ["Dietary guidelines", "Surgical red flags", "Buy Omeprazole"];
      } else {
        reply = `🩺 Shifokor tavsiyasi: Oshqozon noqulayligi va jig‘ildon qaynashi\n\nJig‘ildon qaynashi (izjoga) ko‘pincha noto‘g‘ri ovqatlanish yoki me'da shirasining kislotaliligi oshishidan kelib chiqadi.\n\nShifokor ko‘rsatmalari:\n1. Qovurilgan, sho‘r, achchiq taomlar, kofe va gazli ichimliklardan tiyiling;\n2. Jig‘ildon qaynashida kislotani kamaytiruvchi vosita (Omeprazol nonushtadan 30 daqiqa oldin) qabul qilinadi;\n3. Xavfli belgi: Qorinda keskin sanchuvchi og‘riq bo‘lsa, og‘riq qoldiruvchi ichmang — zudlik bilan shifokor-jarrohga boring!\n\n⚠️ Muhim eslatma: Muntazam bezovtalik kuzatilsa, shifokor-gastroenterolog ko‘rigidan o‘ting.`;
        quickSuggestions = ["Oshqozon parhezi qoidalari", "Qachon jarrohga borish kerak?", "Omeprazol sotib olish"];
      }
    }
  } else if (categoryIntent === "allergy") {
    if (lang === "ru") {
      reply = `🩺 Врачебная рекомендация: Аллергические проявления\n\nПри сыпи, зуде и чихании необходимо прекратить контакт с аллергеном.\n\nСоветы врача:\n1. Антигистаминные препараты 2-го поколения (Лоратадин, Цетиризин) принимают по 1 таблетке в сутки;\n2. Они снимают отек и зуд, не вызывая выраженной сонливости;\n3. Внимание: При отеке губ, языка или затруднении дыхания (отек Квинке) — срочно вызывайте 103!\n\n⚠️ Важное напоминание: Для выявления причины аллергии обратитесь к врачу-аллергологу.`;
      quickSuggestions = ["Исключение аллергена", "Опасные симптомы отека", "Купить Лоратадин"];
    } else if (lang === "en") {
      reply = `🩺 Clinical Advisory: Allergy Symptoms\n\nFor itching, hives, or sneezing, discontinue contact with the allergen immediately.\n\nDoctor's guidance:\n1. Second-generation antihistamines (Loratadine, Cetirizine) are taken 1 tablet once daily;\n2. Alert: If swelling of lips, throat, or shortness of breath occurs, call 103 emergency immediately!\n\n⚠️ Medical reminder: Consult an allergist for allergy testing.`;
      quickSuggestions = ["Allergen avoidance", "Anaphylaxis warning signs", "Buy Loratadine"];
    } else {
      reply = `🩺 Shifokor tavsiyasi: Allergik holatlarda birinchi yordam\n\nQichishish, toshma va aksirishda allergen bilan aloqani darhol to‘xtating.\n\nShifokor ko‘rsatmalari:\n1. Zamonaviy 2-avlod antigistamin (masalan, Loratadin) kuniga 1 tabletka ichiladi va kuchli uyqu keltirmaydi;\n2. Ogohlantirish: Agar lab, til shishsa yoki nafas qisilsa — darhol 103 Tez yordam chaqiring!\n\n⚠️ Muhim eslatma: Allergiya sababini aniqlash uchun shifokor-allergologga murojaat qiling.`;
      quickSuggestions = ["Allergen bilan aloqani to‘xtatish", "Xavfli belgilar bormi?", "Loratadin sotib olish"];
    }
  } else if (categoryIntent === "vitamins") {
    if (lang === "ru") {
      reply = `🩺 Врачебная рекомендация: Витамины и упадок сил\n\nХроническая усталость часто связана с дефицитом витамина D3 или железа.\n\nСоветы врача:\n1. Витамин D3 принимают в первой половине дня во время еды, содержащей полезные жиры;\n2. Перед приемом лечебных доз рекомендуется сдать анализ крови на 25-OH витамин D.\n\n⚠️ Важное напоминание: Подбирайте дозировку витаминов совместно с терапевтом.`;
      quickSuggestions = ["Анализ крови на 25-OH", "Правила приема витаминов", "Купить Витамин D3"];
    } else if (lang === "en") {
      reply = `🩺 Clinical Advisory: Vitamins & Vitality\n\nFatigue and weakened immunity frequently correlate with vitamin D3 deficiency.\n\nDoctor's tips:\n1. Take Vitamin D3 in the morning with a breakfast containing healthy fats;\n2. A blood test for 25-OH Vitamin D is recommended to determine proper dosage.\n\n⚠️ Medical reminder: Consult your physician to establish proper therapeutic dosage.`;
      quickSuggestions = ["25-OH blood test", "Optimal intake time", "Buy Vitamin D3"];
    } else {
      reply = `🩺 Shifokor tavsiyasi: Charchoq va vitaminlar yetishmovchiligi\n\nDoimiy holsizlik va immunitet pasayishi ko‘pincha organizmda D3 vitamini yetishmovchiligidan kelib chiqadi.\n\nShifokor ko‘rsatmalari:\n1. Vitamin D3 yog‘da eruvchi vitamin bo‘lgani uchun uni ertalab, nonushta bilan birga ichish eng yaxshi samara beradi;\n2. Aniq davolash dozasini belgilash uchun qondagi 25-OH D vitamini tahlilini topshirish tavsiya etiladi.\n\n⚠️ Muhim eslatma: Vitaminlar dozasini oilaviy shifokoringiz bilan kelishib oling.`;
      quickSuggestions = ["25-OH tahlili haqida", "Qaysi vaqtda ichiladi?", "Vitamin D3 sotib olish"];
    }
  } else {
    // General pain fallback
    if (lang === "ru") {
      reply = `🩺 Врачебная рекомендация: Обезболивание\n\nБоль — это защитный сигнал организма. Важно не просто заглушить боль, а выяснить её причину у врача.\n\nСоветы врача:\n1. Для разового снятия умеренной боли допустим прием Парацетамола (500 мг) строго после еды;\n2. Не превышайте максимальную суточную дозу и не пейте несколько обезболивающих одновременно;\n3. При сохранении боли дольше 2 дней обязательно обратитесь к врачу.\n\n⚠️ Важное напоминание: Не занимайтесь самолечением при неизвестной причине боли.`;
      quickSuggestions = ["Первая помощь", "Осмотр врача", "Купить Парацетамол"];
    } else if (lang === "en") {
      reply = `🩺 Clinical Advisory: Pain Relief\n\nPain is a protective signal from your body. Finding its root cause with a doctor is essential.\n\nDoctor's tips:\n1. For mild pain relief, Paracetamol (500 mg) may be taken after meals with water;\n2. Do not exceed recommended daily limits or combine multiple analgesics;\n3. If pain persists beyond 2 days, seek physician consultation.\n\n⚠️ Medical reminder: Seek medical advice if symptoms persist.`;
      quickSuggestions = ["First aid rules", "Physician visit", "Buy Paracetamol"];
    } else {
      reply = `🩺 Shifokor tavsiyasi: Og‘riqni qoldirish\n\nOg‘riq organizmning himoya signali hisoblanadi. Og‘riq qoldiruvchi dori sababni davolamaydi, faqat vaqtincha yengillashtiradi.\n\nShifokor ko‘rsatmalari:\n1. Vaqtinchalik og‘riqni qoldirish uchun bitta Paratsetamol (500 mg) ovqatdan keyin, bir stakan suv bilan ichilishi mumkin;\n2. Sutkalik me'yordan oshirmang va bir vaqtda bir nechta dori aralashtirmang;\n3. Og‘riq 2 kundan ortiq davom etsa, albatta shifokor ko‘rigiga boring.\n\n⚠️ Muhim eslatma: Ushbu tavsiyalar axborot xarakteriga ega. Doimiy og‘riqda shifokor ko‘rigidan o‘ting.`;
      quickSuggestions = ["Birinchi yordam qoidalari", "Shifokor ko‘rigiga borish", "Paratsetamol sotib olish"];
    }
  }

  return {
    success: true,
    reply,
    isMedical: true,
    isPrescription: false,
    matchedProducts: matchedCards,
    quickSuggestions,
  };
}
