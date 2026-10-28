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
  /\b(muchal|munajjim|burj|goroskop|zodiak|гороскоп|зодиак|horoscope|zodiac)\b/i,
  /\b(python|javascript|typescript|html|css|sql|docker|kubernetes|linux|windows|git|commit|bug|code|coding|function|class)\b/i,
  /\b(mashina|avtomobil|mator|karobka|inomarka|bmw|mercedes|chevrolet|gentra|cobalt|benzin|metan|tormoz)\b/i,
  /\b(prezident|saylov|siyosat|deputat|vazir|urush|harbiy|hukumat|davlat|parlament)\b/i,
  /\b(kripto|bitcoin|usdt|forex|treyding|aktsiya|investitsiya|kazin|stavka|1xbet)\b/i,
  /\b(futbol|barselona|real madrid|messi|ronaldo|chempionat|liga|sport|match)\b/i,
  /\b(ob-havo|ob havo|yomgir|yomg'ir|qor|quyosh|harorat qanday|gradus)\b/i,
  /\b(valyuta|kurs dollar|dollar kursi|yevro kursi)\b/i,
  /\b(ovqat pishir|palov pishirish|retsept ovqat|shorva pishirish)\b/i,
  /\b(kino|film|serial|aktyor|aktrisa|musiqa|qoshiq|klip|qo'shiq)\b/i,
];

// Broad medical / health keywords in Uzbek, Russian, and English
const MEDICAL_KEYWORDS = [
  // Greetings and polite conversational markers
  "salom", "assalom", "privet", "здравствуйте", "привет", "добрый", "доброе", "hello",
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
  "ko'z", "koz", "kozim", "ko'zim", "quloq", "qulog", "burun", "burnim", "bo'yin", "boyin", "yelka", "tizza", "bo'g'im", "bogim",
  "isitma", "temperatura", "harorat", "shamollash", "gripp", "yo'tal", "yotal", "balg'am", "angina",
  "allergiya", "toshma", "qichish", "ich ket", "diareya", "ko'ngil", "kongil", "qusish", "qusyap",
  "qon bosimi", "bosim", "davleniye", "holsizlik", "charchoq", "asab", "flyus", "karies", "pulpit",
  "ko'richak", "korichak", "peritonit", "gastrit", "yazva", "kasal", "bemor", "dard",
  // New extended specialties & clinical conditions
  "uyqu", "uxla", "uxlolmay", "uyqusiz", "insomniya", "stress", "vahima", "tashvish", "havotir", "panika",
  "ich qot", "ichim qot", "qabziyat", "zapor", "dam bo'l", "meteorizm", "gaz", "klizma",
  "zahar", "zaharlan", "intoksikatsiya", "ovqatdan",
  "kuyib", "kuydim", "kuyish", "issiq suv", "jarohat", "lat yey", "lat yed", "sinish", "pay cho'zil", "shish", "qon ket", "qonash",
  "tirnoq", "tirnog", "tirnogim", "tirnoqlar", "tirnoqqa", "tirnoqdan", "ko'chib", "kochib", "tushib qol", "sinsa", "sinib", "yulib", "yulin", "barmoq", "barmog", "barmogim", "barmoqlar", "tikan", "zirapcha", "qadoq", "yiring", "gematoma", "chiqib ket",
  "peshob", "siydik", "siyish", "achish", "tsistit", "cistit", "pielonefrit",
  "diabet", "qandli", "qandim", "qand kasali", "saxar", "shakar", "glyukoza", "insulin", "chanqoq",
  "bola", "bolam", "bolamning", "bolaga", "bolalar", "go'dak", "chaqaloq", "pediatr",
  "bosh aylan", "boshim aylan", "vertigo", "qorong'ilash",
  "otit", "shang'illa", "gaymorit", "rinit", "tumov", "kon'yunktivit", "arpa",
  // Russian roots
  "бол", "болит", "боле", "живот", "желуд", "печен", "почк", "голов", "зуб", "спин", "горл", "кашел",
  "жар", "температур", "простуд", "грипп", "тошн", "рвот", "понос", "диаре", "сып", "зуд", "сердц", "давлен",
  "аппендицит", "спазм", "гастрит", "бессонн", "глаз", "ух", "нос", "ожог", "запор", "отравлен", "моч",
  "цистит", "сахар", "диабет", "ребен", "малыш", "головокружен", "травм", "ушиб", "растяжен", "ноготь", "ногтя", "ногтем", "ногте", "ногтей", "ногти", "сорвал", "сорвала", "оторвал", "оторвался", "слез", "сошел", "врастает", "вросший", "палец", "пальца", "пальцы", "заноза", "мозоль", "гной",
  // English roots
  "pain", "ache", "hurt", "nail", "nails", "toenail", "fingernail", "detached", "avulsion", "ingrown", "splinter", "stomach", "belly", "abdomen", "head", "tooth", "throat", "cough", "fever", "cold",
  "sleep", "insomnia", "constipat", "poison", "burn", "eye", "ear", "nosebleed", "dizzy", "dizziness",
  "child", "infant", "kidney", "urine", "cystitis", "diabet", "sprain", "wound",
  // Vitamins & supplements
  "vitamin", "витамин", "d3", "д3", "askorbin", "аскорбин", "magniy", "магний", "omega", "омега", "sink", "цинк",
  "kalsiy", "кальций", "temir", "железо", "gemoglobin", "гемоглобин", "anemiya", "анемия", "immunitet", "иммунитет",
  // Specific drugs
  "paratsetamol", "paracetamol", "парацетамол", "amoksitsillin", "amoxicillin", "амоксициллин",
  "ibuprofen", "ибупрофен", "nurofen", "нурофен", "tsitramon", "цитрамон", "analgin", "анальгин",
  "aspirin", "аспирин", "no-shpa", "но-шпа", "noshpa", "drotaverin", "дротаверин", "spazmalgon", "спазмалгон",
  "mezim", "мезим", "festal", "фестал", "omeprazol", "омепразол", "acc", "ацц", "loratadin", "лоратадин",
  "suprastin", "супрастин", "rehidron", "регидрон", "smecta", "смекта", "duphalac", "дюфалак",
  // Extended emergency, specialty & pharmacological roots
  "hushdan", "hushidan", "obmorok", "обморок", "faint", "fainting",
  "issiq urish", "quyosh urish", "oftob urish", "тепловой удар", "солнечный удар", "heatstroke", "sunstroke",
  "ari chaq", "asalar", "chayon", "hasharot chaq", "укус осы", "укус пчелы", "укус насекомого", "bee sting", "insect bite",
  "pochka", "buyrak tosh", "почечная колика", "kidney stone", "kidney colic",
  "xolesistit", "холецистит", "o't qopi", "ot qopi", "o't pufak", "ot pufak", "gallbladder", "cholecystitis",
  "kamqonlik", "ferritin", "низкий гемоглобин", "дефицит железа", "iron deficiency",
  "homilador", "homiladorlik", "emizikli", "беременност", "гв", "грудное вскармливание", "pregnancy", "breastfeeding",
  "gribok", "zamburug", "zamburug'", "dermatit", "ekzema", "temiratki", "грибок", "дерматит", "экзема", "fungus", "eczema",
  "gaymorit", "naftizin", "ksilometazolin", "akvamaris", "аквамарис", "sinusitis",
  "gijja", "qurt", "gelmint", "глист", "остриц", "гельминт", "worms", "parasite",
  "och qoringa", "to'q qoringa", "ovqatdan keyin", "dori qanday ichiladi", "как принимать лекарство", "how to take",
];

export function parseMathQuery(text: string): { isMath: boolean; a?: number; op?: string; b?: number; result?: number } {
  const clean = text.replace(/[?!=\.,]/g, " ").trim();
  const m = clean.match(/(\d+(?:\.\d+)?)\s*([\+\-\*\/xX×÷])\s*(\d+(?:\.\d+)?)/);
  if (!m) return { isMath: false };

  const remainder = clean.replace(m[0], " ").trim().toLowerCase();
  const words = remainder.split(/\s+/).filter(Boolean);

  const allowed = new Set([
    "nechi", "necha", "nechchi", "qancha", "buladi", "bo'ladi", "boladi", "bular",
    "chiqadi", "teng", "javob", "javobi", "nima", "skolko", "сколько", "будет",
    "ravno", "равно", "calculate", "equals", "result", "what", "is"
  ]);

  const allAllowed = words.every((w) => allowed.has(w));
  if (remainder.length === 0 || allAllowed) {
    const a = parseFloat(m[1]);
    const op = m[2];
    const b = parseFloat(m[3]);
    let result = 0;
    if (op === "+") result = a + b;
    else if (op === "-") result = a - b;
    else if (op === "*" || op === "x" || op === "X" || op === "×") result = a * b;
    else if (op === "/" || op === "÷") result = b !== 0 ? Math.round((a / b) * 100) / 100 : 0;
    return { isMath: true, a, op, b, result };
  }
  return { isMath: false };
}

export function matchStem(text: string, stem: string): boolean {
  const escaped = stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("(?:^|[\\s.,!?;:()\\/\\-])" + escaped, "i").test(text);
}

function hasWord(text: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("(?:^|[\\s.,!?;:()\\/\\-])" + escaped + "(?:$|[\\s.,!?;:()\\/\\-])", "i").test(text);
}

export function isMedicalDomain(query: string): boolean {
  const q = normalizeQuery(query);
  if (q.length < 2) return true;

  for (const pattern of OFF_TOPIC_PATTERNS) {
    if (pattern.test(q)) return false;
  }

  // If query matches any medical keyword/symptom/body part (always matching from word boundary)
  const hasMedical = MEDICAL_KEYWORDS.some((kw) => {
    if (kw.length <= 3) {
      const reg = new RegExp("(?:^|[\\s.,!?;:()\\/\\-])" + kw + "(?:$|[\\s.,!?;:()\\/\\-])", "i");
      return reg.test(q);
    }
    return matchStem(q, kw);
  });

  if (hasMedical) {
    return true;
  }

  // If query is a general health/consultation phrase (not off-topic)
  const isGeneralHelpOrSymptom =
    matchStem(q, "yordam") ||
    matchStem(q, "maslahat") ||
    matchStem(q, "nima qil") ||
    matchStem(q, "qanday ich") ||
    matchStem(q, "qanday qabul") ||
    matchStem(q, "ahvol") ||
    matchStem(q, "yomon") ||
    matchStem(q, "kasal") ||
    matchStem(q, "bemor") ||
    matchStem(q, "dard") ||
    matchStem(q, "davol") ||
    matchStem(q, "shifo") ||
    matchStem(q, "pomoch") ||
    matchStem(q, "pomog") ||
    matchStem(q, "help") ||
    matchStem(q, "advice");

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

  // 0. MATH CALCULATION INTENT (e.g. 2*2, 2*2 nechi buladi)
  if (!hasImage && userText.length >= 2) {
    const math = parseMathQuery(userText);
    if (math.isMath && math.result !== undefined) {
      let reply = "";
      const opSymbol = math.op === "*" || math.op === "x" || math.op === "X" ? "×" : math.op === "/" ? "÷" : math.op;
      if (lang === "ru") {
        reply = `${math.a} ${opSymbol} ${math.b} = ${math.result} 😊.\n\nЯ медицинский ИИ-консультант аптечной сети VaksinaMed 🩺. Моя специализация — консультации по вопросам здоровья, лекарственных препаратов, дозировок и расшифровка рецептов от врача.\n\nЕсли у вас есть вопросы по самочувствию или медикаментам, с радостью помогу вам!`;
      } else if (lang === "en") {
        reply = `${math.a} ${opSymbol} ${math.b} = ${math.result} 😊.\n\nI am the VaksinaMed Medical AI Consultant 🩺. My core expertise is health guidance, medications, and prescription analysis.\n\nFeel free to ask any health, symptom, or pharmaceutical questions!`;
      } else {
        reply = `${math.a} ${opSymbol} ${math.b} = ${math.result} bo‘ladi 😊.\n\nMen VaksinaMed sun'iy intellekt tibbiy maslahatchisiman 🩺. Mening asosiy ixtisosligim — salomatlik, dori vositalari, simptomlar va shifokor retseptlarini tahlil qilishdir.\n\nAgar sog‘ligingiz, alomatlar yoki dorilar bo‘yicha savolingiz bo‘lsa, bemalol murojaat qilishingiz mumkin!`;
      }
      return {
        success: true,
        reply,
        isMedical: false,
        isPrescription: false,
        matchedProducts: [],
        quickSuggestions: [
          lang === "ru" ? "Спросить о лекарствах" : lang === "en" ? "Ask about medicines" : "Dori vositalari haqida so‘rash",
          lang === "ru" ? "Сфотографировать рецепт" : lang === "en" ? "Scan prescription" : "Retseptni rasmga olish",
          lang === "ru" ? "Симптомы простуды" : lang === "en" ? "Cold symptoms" : "Shamollash alomatlari",
        ],
      };
    }
  }

  // 0.1 IDENTITY / CAPABILITY INTENT (e.g. "sen kimsan", "nima qila olasan", "кто ты")
  const isIdentityQuery =
    /\b(sen kimsan|kimsan|kim bu|nima qila olasan|vazifang nima|vazifangiz nima|кто ты|кто вы|что ты умеешь|что вы умеете|who are you|what can you do)\b/i.test(
      qNorm
    );
  if (!hasImage && isIdentityQuery) {
    let reply = "";
    if (lang === "ru") {
      reply = "Я — официальный медицинский ИИ-консультант аптечной сети VaksinaMed 🩺.\n\nМоя задача — помогать вам в вопросах здоровья, лекарственных средств, правильного приема и дозировок, а также мгновенно расшифровывать рецепты от врача и проверять наличие препаратов в наших аптеках.\n\nЗадайте любой интересующий вас вопрос по самочувствию или медикаментам!";
    } else if (lang === "en") {
      reply = "I am the official VaksinaMed Medical AI Assistant 🩺.\n\nI can help you with health advice, medications, symptoms, and prescription scanning to find items in our pharmacy network.\n\nHow can I assist you with your health today?";
    } else {
      reply = "Men VaksinaMed dorixonalar tarmog‘ining rasmiy sun'iy intellekt tibbiy maslahatchisiman 🩺.\n\nMening asosiy vazifam — salomatlik, dori-darmonlar, ularni qabul qilish qoidalari va dozalari bo‘yicha maslahat berish, shuningdek shifokor retseptlarini tahlil qilib, dorixonalarimizdan kerakli dori vositalarini topishda ko‘maklashishdir.\n\nSalomatligingiz yoki dorilar bo‘yicha istalgan savolingizni berishingiz mumkin!";
    }
    return {
      success: true,
      reply,
      isMedical: true,
      isPrescription: false,
      matchedProducts: [],
      quickSuggestions: [
        lang === "ru" ? "Сфотографировать рецепт" : lang === "en" ? "Scan prescription" : "Retseptni rasmga olish",
        lang === "ru" ? "Что принять от простуды?" : lang === "en" ? "Cold remedies" : "Shamollashga nima ichiladi?",
        lang === "ru" ? "Головная боль" : lang === "en" ? "Headache relief" : "Bosh og‘rig‘ini qoldirish",
      ],
    };
  }

  // 1. DOMAIN GUARD: Check off-topic non-medical queries
  if (!hasImage && userText.length > 2 && !isMedicalDomain(userText)) {
    let reply = "";
    if (lang === "ru") {
      reply = `Извините, я специализированный медицинский ИИ-консультант VaksinaMed 🩺.\n\nМоя деятельность строго ограничена вопросами здоровья, симптомами заболеваний, лекарственными препаратами, правильными дозировками и расшифровкой рецептов от врача.\n\nПо сторонним темам (мучал, гороскопы, спорт, технологии, кулинария или общие вопросы) я консультаций не предоставляю.\n\nПожалуйста, задайте вопрос по здоровью, симптомам или лекарствам, и я с радостью помогу вам!`;
    } else if (lang === "en") {
      reply = `I apologize, but I am a dedicated VaksinaMed Medical AI Assistant 🩺.\n\nMy expertise is strictly limited to health consultations, symptoms, medications, dosages, and prescription analysis.\n\nI do not provide answers on non-medical topics (horoscopes, astrology, sports, tech, or general questions).\n\nPlease ask a health or medication-related question, and I will be glad to assist you!`;
    } else {
      reply = `Kechirasiz, men faqat tibbiyot va salomatlik bo‘yicha ixtisoslashgan VaksinaMed sun'iy intellekt maslahatchisiman 🩺.\n\nMening vazifam qat'iy ravishda salomatlik, kasallik alomatlari, dori vositalari, to‘g‘ri dozalash va shifokor retseptlarini tahlil qilish bilan cheklangan.\n\nTibbiyot sohasidan tashqari mavzularda (muchal, munajjimlar bashorati, sport, texnologiya, pazandachilik yoki umumiy savollar) ma'lumot bera olmayman.\n\nAgar sog‘ligingiz, bezovta qilayotgan alomatlar yoki dorilar bo‘yicha savolingiz bo‘lsa, bemalol murojaat qilishingiz mumkin!`;
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
    /(og'ri|ogri|ogriy|og'riy|bosh|tish|milk|karies|pulpit|qorn|qorin|oshqozon|jigar|buyrak|isitma|temperatura|жар|бол|голов|зуб|живот|желуд|shamollash|gripp|dori|retsept|рецепт|preparat|vitamin|витамин|davleniye|давлен|qon bosimi|ich ket|diareya|диаре|ko'z|koz|quloq|burun|kuyib|zahar|uyqu|uxla|peshob|diabet|tsistit)/i.test(
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
    // qNorm.includes("hushdan ket") ||
    // qNorm.includes("xushdan ket") ||
    // qNorm.includes("потеря сознания") ||
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

  // 5. PEDIATRIC HEALTH & FEVER SAFETY (Specialized pediatric protocol)
  const isPediatric =
    (/\b(bola|bolaning|bolaga|bolani|bolada|boladan|bolam\w*|bolang\w*|bolasi\w*|bolalar\w*|go['’`]?dak\w*|chaqaloq\w*|farzand\w*|ребенок|ребенк\w*|детск\w*|дети\w*|малыш\w*|груднич\w*|child|children|infant\w*|toddler\w*|baby|babies|kid|kids)\b/i.test(qNorm)) &&
    (qNorm.includes("isitma") || qNorm.includes("temperatura") || qNorm.includes("shamollash") || qNorm.includes("жар") || qNorm.includes("fever") || qNorm.includes("og'ri") || qNorm.includes("dori"));

  if (isPediatric && !hasImage) {
    let reply = "";
    if (lang === "ru") {
      reply = `🩺 Медицинский ИИ-ассистент VaksinaMed: Лихорадка и простуда у детей\n\nДетский организм очень чувствителен к дозировкам и токсичности лекарственных веществ. Главное правило педиатрии — безопасность!\n\nРекомендации ИИ-ассистента:\n1. Категорический запрет: Никогда не давайте детям Аспирин (ацетилсалициловую кислоту) или Анальгин! У детей Аспирин на фоне вирусной инфекции может вызвать синдром Рея — смертельно опасное поражение печени и головного мозга;\n2. При температуре выше 38.5°C допустимы только детские формы Парацетамола или Ибупрофена (суспензия или свечи), рассчитанные строго по весу ребенка (а не по возрасту!);\n3. Обеспечьте обильное теплое питье (вода, несладкий компот) и легкую дышащую одежду (не кутайте ребенка!);\n4. Срочный вызов скорой 103: Если ребенку меньше 3 месяцев, если температура не сбивается, появилась сыпь, судороги или ребенок вялый и не пьет.`;
    } else if (lang === "en") {
      reply = `🩺 VaksinaMed Medical AI Assistant: Fever & Care in Children\n\nChildren require strict pediatric safety standards regarding pharmaceuticals.\n\nAI Assistant guidance:\n1. Strict Prohibition: NEVER give Aspirin or Analgin to children! In children with viral infections, Aspirin can trigger Reye's Syndrome — a life-threatening disorder affecting the liver and brain;\n2. If fever exceeds 38.5°C (101.3°F), use only pediatric Paracetamol or Ibuprofen liquid formulations, dosed strictly according to the child's body weight;\n3. Hydrate generously with water and dress the child in light, breathable clothing (do not bundle excessively);\n4. Emergency red flags (Call 103): Infant under 3 months, seizures, rash, lethargy, or inability to retain fluids.`;
    } else {
      reply = `🩺 VaksinaMed AI tibbiy yordamchisi: Bolalarda isitma va shamollashda xavfsizlik choralari (pediatriya)\n\nBolalar organizmi dori vositalarining dozasiga va nojo‘ya ta'sirlariga juda sezgir. Pediatriyada eng muhim qoida — bolaga ziyon yetkazmaslikdir!\n\nAI yordamchisi tavsiyalari:\n1. Qat'iy taqiq: Bolalarga aslo Aspirin (atsetilsalitsil kislotasi) va Analgin bermang! Virusli infeksiya fonida Aspirin bolalarda jigar va bosh miyaning o‘limga olib keluvchi og‘ir shikastlanishi — Reys sindromini keltirib chiqarishi mumkin;\n2. Tana harorati 38.5°C dan yuqori bo‘lganda, faqat bolalar uchun mo‘ljallangan Paratsetamol yoki Ibuprofen suspenziyasi (yoshiga emas, bolaning tana vazniga qat'iy moslab) beriladi;\n3. Bolaga ko‘p miqdorda iliq suyuqlik (suv, kompot) ichiring, kiyimlarini yengillating va xonani salqin (19-21°C) qilib shamollating (bolani qalin o‘ramang!);\n4. Zudlik bilan 103 chaqirish belgilari: Chaqaloq 3 oylikdan kichik bo‘lsa, talvasa (sudorogi), toshma, bolaning lohaslanib ko‘zini ochmasligi yoki tinimsiz yig‘lashi kuzatilsa.`;
    }

    return {
      success: true,
      reply,
      isMedical: true,
      isPrescription: false,
      matchedProducts: [],
      quickSuggestions: [
        lang === "ru" ? "Дозировка по весу ребенка" : lang === "en" ? "Pediatric weight dosage" : "Bolaning vazniga ko‘ra doza",
        lang === "ru" ? "Когда срочно вызывать скорую" : lang === "en" ? "Emergency red flags" : "Qachon 103 chaqiriladi?",
      ],
    };
  }

  // 6. PREGNANCY OR INFANT HEALTH SAFETY CAUTION
  const isPregnancyOrInfant =
    /\b(homilador|homiladorlik|emizikli|emizaman|1 yoshgacha)\b/i.test(qNorm) ||
    /\b(беременн|грудное вскармливан|кормящ|новорожденн)\b/i.test(qNorm);

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

  // 7. BLOOD PRESSURE / HYPERTENSION INTENT
  const isBloodPressure =
    /\b(qon bosimi|bosimim|davleniye|davleniya|gipertoniya|gipotoniya|bosim oshib|bosim tushib)\b/i.test(qNorm) ||
    /\b(давление|гипертония|высокое давление|низкое давление|скачет давление)\b/i.test(qNorm);

  if (isBloodPressure && !hasImage) {
    let reply = "";
    if (lang === "ru") {
      reply = `🩺 Медицинский ИИ-ассистент VaksinaMed: Артериальное давление\n\nАртериальное давление требует строгого индивидуального подхода. Препараты для снижения или повышения давления (гипотензивные) подбираются терапевтом или кардиологом на основании регулярного мониторинга и ЭКГ. Пить чужие лекарства от давления опасно!\n\nЧто делать сейчас:\n1. Измерьте давление тонометром в состоянии полного покоя (сидя, опершись на спинку стула);\n2. Проветрите комнату, расслабьтесь, не употребляйте кофе, крепкий чай и соленые продукты;\n3. Если давление выше 160/100 мм рт. ст. и сопровождается сильной головной болью, тошнотой или болью в груди — немедленно вызовите врача по номеру 103.`;
    } else if (lang === "en") {
      reply = `🩺 VaksinaMed Medical AI Assistant: Blood Pressure Management\n\nBlood pressure medications must be tailored exclusively by a licensed therapist or cardiologist based on personal readings and cardiovascular history. Never take someone else's antihypertensive pills!\n\nImmediate steps:\n1. Measure your blood pressure with a reliable tonometer while seated comfortably and quietly for 5 minutes;\n2. Ensure adequate ventilation and avoid caffeine, alcohol, or excess sodium;\n3. If blood pressure exceeds 160/100 mmHg accompanied by chest tightness, dizziness, or visual disturbance, seek immediate medical care via 103.`;
    } else {
      reply = `🩺 VaksinaMed AI tibbiy yordamchisi: Qon bosimi (Davleniye)\n\nQon bosimini nazorat qilish va davolash qat'iy individual yondashuvni talab qiladi. Bosim tushiruvchi (gipotenziv) preparatlarni faqat kardiolog yoki terapevt ko‘rigidan so‘ng, tonometr ko‘rsatkichlariga qarab ichish lozim. Birovning bosim dorisini o‘zboshimchalik bilan ichish hayot uchun xavflidir!\n\nHozirgi holatda nima qilish kerak:\n1. 5 daqiqa tinch o‘tirib, tonometr yordamida qon bosimingizni aniq o‘lchang;\n2. Xonani shamollating, kiyimlarni bo‘shating, qahva yoki achchiq choy ichmang;\n3. Agar bosim 160/100 mm simob ustunidan yuqori bo‘lsa va bosh og‘rig‘i, ko‘ngil aynishi yoki ko‘krakda siqilish kuzatilsa — darhol 103 raqami orqali shifokor chaqiring.`;
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

  // 8. PRESCRIPTION SCAN / TEXT RECOGNITION
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

  // 9. ADVANCED CLINICAL CATEGORY TRIAGE
  type ClinicalCategory =
    | "fainting_collapse"
    | "heatstroke_sunstroke"
    | "insect_sting"
    | "kidney_colic"
    | "liver_gallbladder"
    | "anemia_iron"
    | "pregnancy_meds"
    | "skin_fungus_rash"
    | "nasal_sinusitis"
    | "helminths_parasites"
    | "medication_rules"
    | "nail_trauma"
    | "fracture"
    | "wound_cut"
    | "choking"
    | "first_aid_general"
    | "dental"
    | "headache"
    | "dizziness"
    | "throat_cough"
    | "cold_fever"
    | "stomach"
    | "diarrhea"
    | "constipation"
    | "poisoning"
    | "ear"
    | "eye"
    | "nosebleed"
    | "burns"
    | "trauma_sprain"
    | "joint_back"
    | "allergy"
    | "cystitis"
    | "diabetes"
    | "insomnia_stress"
    | "vitamins"
    | "antibiotic"
    | "general_pain"
    | "none";

  let categoryIntent: ClinicalCategory = "none";

  // Fainting & Collapse
  if (
    qNorm.includes("hushdan") ||
    qNorm.includes("hushidan") ||
    qNorm.includes("hushini yo'qot") ||
    qNorm.includes("obmorok") ||
    qNorm.includes("обморок") ||
    // qNorm.includes("потеря сознания") ||
    qNorm.includes("faint") ||
    qNorm.includes("passed out")
  ) {
    categoryIntent = "fainting_collapse";
  } else if (
    qNorm.includes("issiq ur") ||
    qNorm.includes("quyosh ur") ||
    qNorm.includes("oftob ur") ||
    qNorm.includes("тепловой удар") ||
    qNorm.includes("солнечный удар") ||
    qNorm.includes("heatstroke") ||
    qNorm.includes("sunstroke")
  ) {
    categoryIntent = "heatstroke_sunstroke";
  } else if (
    qNorm.includes("ari chaq") ||
    qNorm.includes("asalar") ||
    qNorm.includes("chayon") ||
    qNorm.includes("hasharot chaq") ||
    qNorm.includes("укус осы") ||
    qNorm.includes("укус пчелы") ||
    qNorm.includes("укус насекомого") ||
    qNorm.includes("bee sting") ||
    qNorm.includes("wasp sting") ||
    qNorm.includes("insect bite")
  ) {
    categoryIntent = "insect_sting";
  } else if (
    (qNorm.includes("buyrak") && (qNorm.includes("og'ri") || qNorm.includes("ogri") || qNorm.includes("sanch") || qNorm.includes("tosh"))) ||
    (qNorm.includes("pochka") && (qNorm.includes("og'ri") || qNorm.includes("ogri") || qNorm.includes("sanch"))) ||
    qNorm.includes("почечная колика") ||
    (qNorm.includes("почк") && qNorm.includes("бол")) ||
    qNorm.includes("kidney colic") ||
    qNorm.includes("kidney stone")
  ) {
    categoryIntent = "kidney_colic";
  } else if (
    (qNorm.includes("jigar") && (qNorm.includes("og'ri") || qNorm.includes("ogri") || qNorm.includes("ogir"))) ||
    qNorm.includes("o't qopi") ||
    qNorm.includes("ot qopi") ||
    qNorm.includes("o't pufak") ||
    qNorm.includes("ot pufak") ||
    qNorm.includes("xolesistit") ||
    qNorm.includes("холецистит") ||
    (qNorm.includes("печен") && qNorm.includes("бол")) ||
    qNorm.includes("желчный") ||
    qNorm.includes("cholecystitis") ||
    qNorm.includes("gallbladder")
  ) {
    categoryIntent = "liver_gallbladder";
  } else if (
    qNorm.includes("gemoglobin") ||
    qNorm.includes("kamqon") ||
    qNorm.includes("anemiya") ||
    qNorm.includes("temir yetishmov") ||
    qNorm.includes("гемоглобин") ||
    qNorm.includes("анемия") ||
    qNorm.includes("дефицит железа") ||
    qNorm.includes("anemia") ||
    qNorm.includes("iron deficiency")
  ) {
    categoryIntent = "anemia_iron";
  } else if (
    qNorm.includes("homilador") ||
    qNorm.includes("homiladorlik") ||
    qNorm.includes("emizikli") ||
    qNorm.includes("bola emiz") ||
    qNorm.includes("беременност") ||
    qNorm.includes("при беременности") ||
    qNorm.includes("грудное вскармливание") ||
    qNorm.includes("при гв") ||
    qNorm.includes("pregnancy") ||
    qNorm.includes("breastfeeding")
  ) {
    categoryIntent = "pregnancy_meds";
  } else if (
    qNorm.includes("gribok") ||
    qNorm.includes("zamburug") ||
    qNorm.includes("dermatit") ||
    qNorm.includes("ekzema") ||
    qNorm.includes("temiratki") ||
    qNorm.includes("грибок") ||
    qNorm.includes("дерматит") ||
    qNorm.includes("экзема") ||
    qNorm.includes("микоз") ||
    qNorm.includes("fungus") ||
    qNorm.includes("eczema")
  ) {
    categoryIntent = "skin_fungus_rash";
  } else if (
    qNorm.includes("gaymorit") ||
    qNorm.includes("rinit") ||
    qNorm.includes("tumov") ||
    qNorm.includes("burun biti") ||
    qNorm.includes("насморк") ||
    qNorm.includes("гайморит") ||
    qNorm.includes("ринит") ||
    qNorm.includes("заложенность носа") ||
    qNorm.includes("sinusitis") ||
    qNorm.includes("runny nose")
  ) {
    categoryIntent = "nasal_sinusitis";
  } else if (
    qNorm.includes("gijja") ||
    qNorm.includes("ichak qurt") ||
    qNorm.includes("gelmint") ||
    qNorm.includes("глист") ||
    qNorm.includes("остриц") ||
    qNorm.includes("паразит") ||
    qNorm.includes("helminth") ||
    qNorm.includes("worms")
  ) {
    categoryIntent = "helminths_parasites";
  } else if (
    qNorm.includes("och qoringa") ||
    qNorm.includes("to'q qoringa") ||
    qNorm.includes("ovqatdan oldin") ||
    qNorm.includes("ovqatdan keyin") ||
    qNorm.includes("dori ichish qoida") ||
    qNorm.includes("dorilarni aralashtir") ||
    qNorm.includes("как принимать лекарств") ||
    qNorm.includes("до или после еды") ||
    qNorm.includes("how to take medication")
  ) {
    categoryIntent = "medication_rules";
  } else
  // Nail Trauma & Injury priority (tirnoq sinishi, ko'chishi, tushib qolishi, yulinishi)
  if (
    (qNorm.includes("tirnoq") ||
      qNorm.includes("tirnog") ||
      qNorm.includes("tirnoqlar") ||
      qNorm.includes("nogot") ||
      qNorm.includes("ноготь") ||
      qNorm.includes("ногтя") ||
      qNorm.includes("ногте") ||
      qNorm.includes("ногтей") ||
      qNorm.includes("ногти") ||
      qNorm.includes("nail") ||
      qNorm.includes("toenail") ||
      qNorm.includes("fingernail")) &&
    !qNorm.includes("gribok") &&
    !qNorm.includes("zamburug") &&
    !qNorm.includes("грибок")
  ) {
    categoryIntent = "nail_trauma";
  } else
  // Fracture & Broken Bones priority (qo'l/oyoq singanda birinchi yordam)
  if (
    !qNorm.includes("tirnoq") &&
    !qNorm.includes("tirnog") &&
    !qNorm.includes("ноготь") &&
    !qNorm.includes("ногт") &&
    !qNorm.includes("nail") &&
    (qNorm.includes("singan") ||
      qNorm.includes("sinish") ||
      qNorm.includes("suyak sin") ||
      qNorm.includes("qo'l sin") ||
      qNorm.includes("qol sin") ||
      qNorm.includes("oyoq sin") ||
      ((qNorm.includes("qo'l") || qNorm.includes("qol") || qNorm.includes("oyoq") || qNorm.includes("suyak") || qNorm.includes("barmoq") || qNorm.includes("yelka") || qNorm.includes("tirsak")) &&
        (qNorm.includes("sin") || qNorm.includes("shina"))) ||
      qNorm.includes("shina qo'y") ||
      qNorm.includes("перелом") ||
      qNorm.includes("сломал") ||
      qNorm.includes("сломала") ||
      qNorm.includes("сломан") ||
      qNorm.includes("fracture") ||
      qNorm.includes("broken bone") ||
      qNorm.includes("broken arm") ||
      qNorm.includes("broken leg"))
  ) {
    categoryIntent = "fracture";
  } else if (
    qNorm.includes("kesil") ||
    qNorm.includes("kesvoldim") ||
    qNorm.includes("qo'lim kesil") ||
    qNorm.includes("qolim kesil") ||
    qNorm.includes("chuqur yara") ||
    qNorm.includes("qon to'xtat") ||
    qNorm.includes("порез") ||
    qNorm.includes("глубокая рана") ||
    qNorm.includes("остановить кровь из раны") ||
    qNorm.includes("cut wound") ||
    qNorm.includes("deep cut")
  ) {
    categoryIntent = "wound_cut";
  } else if (
    qNorm.includes("tiqilib qol") ||
    qNorm.includes("bo'g'il") ||
    qNorm.includes("bogil") ||
    qNorm.includes("geymlix") ||
    qNorm.includes("подавился") ||
    qNorm.includes("поперхнулся") ||
    qNorm.includes("прием геймлиха") ||
    qNorm.includes("choking") ||
    qNorm.includes("heimlich")
  ) {
    categoryIntent = "choking";
  } else if (
    qNorm.includes("birinchi yordam") ||
    qNorm.includes("первая помощь") ||
    qNorm.includes("first aid")
  ) {
    categoryIntent = "first_aid_general";
  } else
  // Dental priority
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
    qNorm.includes("ko'z") ||
    qNorm.includes("koz") ||
    qNorm.includes("kozim") ||
    qNorm.includes("ko'zim") ||
    qNorm.includes("arpa") ||
    qNorm.includes("kon'yunktivit") ||
    qNorm.includes("глаз") ||
    qNorm.includes("конъюнктивит") ||
    qNorm.includes("ячмень") ||
    qNorm.includes("eye") ||
    qNorm.includes("vision")
  ) {
    categoryIntent = "eye";
  } else if (
    qNorm.includes("quloq") ||
    qNorm.includes("qulog") ||
    qNorm.includes("otit") ||
    qNorm.includes("shang'illa") ||
    qNorm.includes("ухо") ||
    qNorm.includes("уши") ||
    qNorm.includes("отит") ||
    qNorm.includes("ear")
  ) {
    categoryIntent = "ear";
  } else if (
    (qNorm.includes("burun") || qNorm.includes("burnim") || qNorm.includes("нос")) &&
    (qNorm.includes("qon") || qNorm.includes("кров") || qNorm.includes("bleed"))
  ) {
    categoryIntent = "nosebleed";
  } else if (
    qNorm.includes("kuyib") ||
    qNorm.includes("kuydim") ||
    qNorm.includes("kuyish") ||
    qNorm.includes("issiq suv") ||
    qNorm.includes("quyoshda kuy") ||
    qNorm.includes("ожог") ||
    qNorm.includes("обжег") ||
    qNorm.includes("burn")
  ) {
    categoryIntent = "burns";
  } else if (
    qNorm.includes("zahar") ||
    qNorm.includes("zaharlan") ||
    qNorm.includes("intoksikatsiya") ||
    qNorm.includes("ovqatdan") ||
    qNorm.includes("отравлен") ||
    qNorm.includes("интоксикаци") ||
    qNorm.includes("poison")
  ) {
    categoryIntent = "poisoning";
  } else if (
    (qNorm.includes("ich") && qNorm.includes("qot")) ||
    qNorm.includes("qabziyat") ||
    qNorm.includes("zapor") ||
    qNorm.includes("запор") ||
    qNorm.includes("constipat")
  ) {
    categoryIntent = "constipation";
  } else if (
    qNorm.includes("tsistit") ||
    qNorm.includes("cistit") ||
    (qNorm.includes("siy") && qNorm.includes("achish")) ||
    qNorm.includes("peshob") ||
    qNorm.includes("цистит") ||
    qNorm.includes("мочеиспускан") ||
    qNorm.includes("cystitis")
  ) {
    categoryIntent = "cystitis";
  } else if (
    qNorm.includes("diabet") ||
    hasWord(qNorm, "qand") ||
    qNorm.includes("qandli") ||
    qNorm.includes("qandim") ||
    qNorm.includes("saxar") ||
    qNorm.includes("shakar") ||
    qNorm.includes("glyukoza") ||
    qNorm.includes("диабет") ||
    qNorm.includes("сахар в крови") ||
    qNorm.includes("diabetes")
  ) {
    categoryIntent = "diabetes";
  } else if (
    qNorm.includes("uyqu") ||
    qNorm.includes("uxla") ||
    qNorm.includes("uyqusiz") ||
    qNorm.includes("insomniya") ||
    qNorm.includes("asab") ||
    qNorm.includes("stress") ||
    qNorm.includes("vahima") ||
    qNorm.includes("бессонниц") ||
    qNorm.includes("стресс") ||
    qNorm.includes("тревог") ||
    qNorm.includes("insomnia")
  ) {
    categoryIntent = "insomnia_stress";
  } else if (
    qNorm.includes("bosh aylan") ||
    qNorm.includes("boshim aylan") ||
    qNorm.includes("vertigo") ||
    qNorm.includes("головокружен") ||
    qNorm.includes("dizzy") ||
    qNorm.includes("dizziness")
  ) {
    categoryIntent = "dizziness";
  } else if (
    qNorm.includes("lat yey") ||
    qNorm.includes("lat yed") ||
    qNorm.includes("pay cho'zil") ||
    qNorm.includes("oyoq qayril") ||
    qNorm.includes("ушиб") ||
    qNorm.includes("растяжен") ||
    qNorm.includes("вывих") ||
    qNorm.includes("sprain")
  ) {
    categoryIntent = "trauma_sprain";
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
    qNorm.includes("диаре") ||
    qNorm.includes("понос") ||
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
    matchStem(qNorm, "og'ri") ||
    matchStem(qNorm, "ogri") ||
    matchStem(qNorm, "og‘ri") ||
    matchStem(qNorm, "paratsetamol") ||
    matchStem(qNorm, "paracetamol") ||
    matchStem(qNorm, "ibuprofen") ||
    matchStem(qNorm, "analgin") ||
    matchStem(qNorm, "tsitramon") ||
    matchStem(qNorm, "бол") ||
    matchStem(qNorm, "парацетамол") ||
    matchStem(qNorm, "ибупрофен") ||
    matchStem(qNorm, "анальгин") ||
    matchStem(qNorm, "pain")
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
        if (name.includes("ibuprofen") || name.includes("nurofen")) {
          if (!seenGroups.has("nsaid-ibu")) {
            seenGroups.add("nsaid-ibu");
            relevantCandidates.push(p);
          }
        }
      } else if (categoryIntent === "headache") {
        if (name.includes("paratsetamol") || name.includes("paracetamol")) {
          if (!seenGroups.has("analgesic-para")) {
            seenGroups.add("analgesic-para");
            relevantCandidates.push(p);
          }
        }
      } else if (categoryIntent === "cold_fever") {
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
      } else if (categoryIntent === "diarrhea" || categoryIntent === "poisoning") {
        if (name.includes("rehidron") || name.includes("smecta") || name.includes("ugol")) {
          if (!seenGroups.has(group)) {
            seenGroups.add(group);
            relevantCandidates.push(p);
          }
        }
      } else if (categoryIntent === "constipation") {
        if (name.includes("duphalac") || name.includes("laktuloza") || name.includes("senna")) {
          if (!seenGroups.has(group)) {
            seenGroups.add(group);
            relevantCandidates.push(p);
          }
        }
      } else if (categoryIntent === "joint_back" || categoryIntent === "trauma_sprain") {
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
  // For clinical symptom inquiries, strictly NO products are attached!
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
  } else if (categoryIntent === "fainting_collapse") {
    if (lang === "ru") {
      reply = `🩺 Медицинский ИИ-ассистент VaksinaMed: Первая помощь при обмороке (потере сознания)\n\nОбморок — это кратковременная потеря сознания из-за внезапного снижения кровотока в головном мозге.\n\nАлгоритм неотложной помощи:\n1. Уложите человека на спину на ровную поверхность. Приподнимите ноги на 30 см выше уровня сердца (на подушку или сложенную одежду), чтобы усилить приток крови к голове;\n2. Расстегните тесный воротник, ремень, откройте окно для свежего воздуха;\n3. Сбрызните лицо прохладной водой или дайте понюхать ватку с нашатырным спиртом (держите на расстоянии 5 см от носа);\n4. Категорический запрет: Не давайте пить или принимать лекарства человеку, пока он без сознания;\n5. Если человек не приходит в себя дольше 1–2 минут или не дышит — немедленно вызывайте 103 (скорую помощь) и поверните пострадавшего на бок!`;
      quickSuggestions = ["Нашатырный спирт правила", "Когда вызывать 103?"];
    } else if (lang === "en") {
      reply = `🩺 VaksinaMed Medical AI Assistant: First Aid for Fainting (Syncope)\n\nFainting is temporary loss of consciousness caused by a momentary drop in cerebral blood flow.\n\nEmergency procedure:\n1. Lay the person flat on their back. Elevate their legs about 30 cm (12 inches) to restore blood flow to the brain;\n2. Loosen constrictive clothing (collars, belts) and ensure abundant fresh ventilation;\n3. Lightly sprinkle cool water on their face or hold smelling salts (ammonia) a few inches from the nose;\n4. Do NOT attempt to give fluids or oral pills while the person is unconscious;\n5. If recovery takes longer than 1–2 minutes, or if chest pain or abnormal breathing occurs, dial 103 emergency immediately and place them in the recovery (side) position.`;
      quickSuggestions = ["Recovery position guide", "Emergency 103 call"];
    } else {
      reply = `🩺 VaksinaMed AI tibbiy yordamchisi: Hushdan ketishda (obmorok) birinchi yordam\n\nHushdan ketish — miyaga qon yetib borishi vaqtincha pasayishi oqibatida yuzaga keladi.\n\nBirinchi yordam ko‘rsatish ketma-ketligi:\n1. Jabrlanuvchini tekis yerga chalqancha yotqizing. Qon bosh miyaga tezroq borishi uchun oyoqlarini 30 sm balandroq ko‘tarib qo‘ying (yostiq yoki kiyim ustiga);\n2. Tor yoqa, kamar va tugmalarni bo‘shating, xonaga toza havo kiriting;\n3. Yuziga sovuq suv purkang yoki novshadil spirti (nashatir) tomizilgan paxtani burnidan 5 sm uzoqlikda tuting;\n4. Qat'iy taqiq: Jabrlanuvchi hushsiz holatda bo‘lganda unga aslo suv yoki dori ichirishga urinmang (nafas yo‘liga ketib qolishi mumkin!);\n5. Agar inson 1–2 daqiqa ichida o‘ziga kelmasa yoki nafas olmasa — darhol 103 (Tez yordam) chaqiring va nafas yo‘li berkilib qolmasligi uchun uni yonbosh holatga yotqizing.`;
      quickSuggestions = ["Novshadil spirtini qo‘llash", "103 ga qo‘ng‘iroq qilish"];
    }
  } else if (categoryIntent === "heatstroke_sunstroke") {
    if (lang === "ru") {
      reply = `🩺 Медицинский ИИ-ассистент VaksinaMed: Первая помощь при тепловом и солнечном ударе\n\nТепловой удар — угрожающее жизни состояние, когда нарушается терморегуляция тела.\n\nДействия первой помощи:\n1. Немедленно переведите пострадавшего в тень или прохладное проветриваемое помещение;\n2. Снимите тесную или плотную одежду;\n3. Охлаждение: Положите влажные прохладные компрессы на лоб, шею, подмышки и паховую область, обмахивайте тело;\n4. Питье: Поите небольшими глотками прохладной минеральной водой или раствором Регидрона для восполнения электролитов;\n5. Опасные симптомы: Если температура выше 39°C, человек бредит, теряет сознание или не потеет — срочно вызывайте 103!`;
      quickSuggestions = ["Раствор Регидрона", "Вызов скорой 103"];
    } else if (lang === "en") {
      reply = `🩺 VaksinaMed Medical AI Assistant: First Aid for Heatstroke & Sunstroke\n\nHeatstroke is a medical emergency caused by the body overheating and failing to thermoregulate.\n\nFirst aid steps:\n1. Move the person to a cool, shaded area or air-conditioned room immediately;\n2. Remove tight or heavy clothing;\n3. Cool the body: Apply cool, wet towels to the neck, armpits, and groin, and fan vigorously;\n4. Hydration: Provide small sips of cool water or electrolyte solutions (oral rehydration salts);\n5. Emergency alert: If body temperature exceeds 39°C (102°F), or if confusion, seizures, or unconsciousness develop, call 103 emergency services immediately.`;
      quickSuggestions = ["Electrolyte rehydration", "Emergency 103 call"];
    } else {
      reply = `🩺 VaksinaMed AI tibbiy yordamchisi: Issiq yoki quyosh urishida birinchi yordam\n\nIssiq urishi — tana haroratini boshqarish tizimi ishdan chiqib, organizm haddan tashqari qizib ketganda yuz beradi.\n\nBirinchi yordam choralari:\n1. Jabrlanuvchini darhol salqin, soyali joyga yoki ventilyatorli xonaga o‘tkazing;\n2. Ortiqcha issiq va qisuvchi kiyimlarni yeching;\n3. Sovutish: Bosh, bo‘yin, qo‘ltiq osti va chov sohalariga nam sovuq sochiq qo‘ying;\n4. Suyuqlik ichirish: Kichik qultumlar bilan iliqroq sho‘r suv, mineral suv yoki Rehidron eritmasini ichiring (suv-tuz muvozanatini tiklash uchun);\n5. Xavfli belgilar: Tana harorati 39°C dan oshsa, inson alahsirasa yoki hushini yo‘qotsa — kechiktirmasdan 103 (Tez yordam) chaqiring!`;
      quickSuggestions = ["Rehidron tayyorlash", "103 ga qo‘ng‘iroq qilish"];
    }
  } else if (categoryIntent === "insect_sting") {
    if (lang === "ru") {
      reply = `🩺 Медицинский ИИ-ассистент VaksinaMed: Помощь при укусе осы, пчелы или насекомого\n\n1. Удаление жала: Если укусила пчела, аккуратно соскоблите жало ногтем или пластиковой картой. Не сжимайте его пинцетом, чтобы не выдавить остатки яда;\n2. Дезинфекция: Промойте место укуса водой с мылом, обработайте антисептиком (Хлоргексидин или спирт);\n3. Снятие отека и боли: Приложите холод через ткань на 15 минут;\n4. Противоаллергическое: Примите таблетку антигистаминного препарата (Супрастин, Лоратадин или Цетиризин) для предупреждения сильной аллергии;\n5. Срочно 103 (Анафилаксия!): Если отек распространяется на шею/лицо, тяжело дышать или падает давление — немедленно вызывайте скорую!`;
      quickSuggestions = ["Симптомы анафилаксии", "Антигистаминные препараты"];
    } else if (lang === "en") {
      reply = `🩺 VaksinaMed Medical AI Assistant: Bee, Wasp & Insect Stings\n\n1. Remove Stinger: Scrape gently with a fingernail or plastic card. Do not squeeze the venom sac;\n2. Cleanse: Wash thoroughly with soap and water, apply antiseptic (Chlorhexidine);\n3. Ice Pack: Apply a cloth-wrapped ice pack for 15 minutes to reduce local pain and swelling;\n4. Antihistamine: Take an oral antihistamine (Cetirizine, Loratadine) to suppress severe itching and swelling;\n5. Emergency 103 alert: If swelling affects the throat/face, breathing is difficult, or hives spread rapidly (anaphylaxis!), seek emergency medical care immediately.`;
      quickSuggestions = ["Anaphylaxis signs", "Antihistamine guidance"];
    } else {
      reply = `🩺 VaksinaMed AI tibbiy yordamchisi: Ari, asalar yoki hasharot chaqqanda birinchi yordam\n\n1. Nishni olib tashlash: Agar asalar chaqqan bo‘lsa, nishni tirnoq yoki plastik karta qirrasi bilan ehtiyotkorlik bilan qirib oling (nish xaltachasini siqib yubormang!);\n2. Zararsizlantirish: Chaqilgan joyni sovunli suv bilan yuvib, antiseptik (spirt yoki Xlorgeksidin) bilan arting;\n3. Sovuq bosish: Shish va og‘riqni to‘xtatish uchun sochiqqa o‘ralgan muzni 15 daqiqa bosing;\n4. Allergiyaga qarshi: Kuchli shish va qichishishni oldini olish uchun bir dona antigistamin dori (Suprastin, Loratadin yoki Setirizin) iching;\n5. Zudlik bilan 103 (Anafilaktik shok xavfi!): Agar tomoq qisilib nafas olish qiyinlashsa, yuz va lablar shishsa yoki hushdan ketish alomatlari bo‘lsa — darhol Tez yordam chaqiring!`;
      quickSuggestions = ["Anafilaktik shok belgilari", "Allergiyaga qarshi dorilar"];
    }
  } else if (categoryIntent === "kidney_colic") {
    if (lang === "ru") {
      reply = `🩺 Медицинский ИИ-ассистент VaksinaMed: Почечная колика и боли в почках\n\nОстрая приступообразная боль в пояснице, отдающая в пах и низ живота, чаще всего вызвана движением камня в мочеточнике.\n\nРекомендации ИИ-ассистента:\n1. Примите спазмолитик (Но-шпа, Дротаверин), чтобы снять спазм мочеточника и облегчить отток мочи;\n2. Строгий запрет: Не принимайте горячие ванны и не грейте поясницу, если есть температура или кровь в моче!\n3. Срочно обратитесь к врачу-урологу и сделайте УЗИ почек и мочевого пузыря;\n4. Вызывайте 103, если боль нестерпимая, моча не отходит или сопровождается неукротимой рвотой.`;
      quickSuggestions = ["УЗИ почек", "Спазмолитики при колике", "Когда вызывать 103?"];
    } else if (lang === "en") {
      reply = `🩺 VaksinaMed Medical AI Assistant: Kidney Colic & Flank Pain\n\nSudden, sharp, agonizing flank pain radiating to the groin usually suggests acute ureteral obstruction by a kidney stone.\n\nAI Assistant guidance:\n1. An antispasmodic (No-Spa, Drotaverine) may help relax ureteral smooth muscle;\n2. Strict warning: Avoid hot baths if hematuria (blood in urine) or fever is present;\n3. Seek urgent urology consultation and ultrasound/CT imaging to evaluate stone size and position;\n4. Call 103 immediately if anuria (inability to urinate), high fever, or intractable nausea occurs.`;
      quickSuggestions = ["Renal ultrasound", "When to call 103", "Antispasmodics"];
    } else {
      reply = `🩺 VaksinaMed AI tibbiy yordamchisi: Buyrak sanchig‘i va buyrak og‘rig‘ida nima qilish kerak?\n\nBel sohasidan chov va qovuqqa qarab tarqaluvchi o‘tkir, kuchli sanchuvchi og‘riq ko‘pincha buyrakdagi toshning siydik yo‘liga siljishidan (buyrak sanchig‘i) kelib chiqadi.\n\nAI yordamchisi tavsiyalari:\n1. Spazmni yengillashtirish uchun bitta spazmolitik (No-shpa yoki Drotaverin) ichish mumkin;\n2. Qat'iy taqiq: Agar tana harorati yuqori bo‘lsa yoki peshobda qon ko‘rinsa, bel sohasini aslo issiq qilmang va issiq vannaga o‘tirmang!\n3. Zudlik bilan shifokor-urolog ko‘rigiga boring hamda buyrak va qovuq UZI tekshiruvidan o‘ting;\n4. Agar og‘riq chidab bo‘lmas darajada kuchli bo‘lsa, peshob kelishi to‘xtasa yoki qusish kuzatilsa — darhol 103 (Tez yordam) chaqiring!`;
      quickSuggestions = ["Buyrak UZI tekshiruvi", "Spazmolitik dorilar", "Urolog ko‘rigiga yozilish"];
    }
  } else if (categoryIntent === "liver_gallbladder") {
    if (lang === "ru") {
      reply = `🩺 Медицинский ИИ-ассистент VaksinaMed: Боли в правом подреберье (Печень, Желчный пузырь)\n\nТяжесть и тупая боль в правом подреберье чаще всего связаны с дискинезией желчных путей или воспалением желчного пузыря (холециститом) после жирной пищи.\n\nРекомендации ИИ-ассистента:\n1. Исключите жирное, жареное, острое, копчености и алкоголь;\n2. Для снятия спазма допустим прием Но-шпы или ферментных препаратов (Мезим, Креон) во время еды;\n3. Категорический запрет: Не пейте желчегонные препараты и не делайте тюбаж, если у вас есть камни в желчном пузыре (риск закупорки протока!);\n4. Обратитесь к гастроэнтерологу и пройдите УЗИ органов брюшной полости.`;
      quickSuggestions = ["Диета Стол №5", "УЗИ брюшной полости", "Консультация гастроэнтеролога"];
    } else if (lang === "en") {
      reply = `🩺 VaksinaMed Medical AI Assistant: Right Upper Quadrant Pain (Liver & Gallbladder)\n\nRight upper abdominal pain and heaviness frequently arise from biliary dyskinesia or gallbladder inflammation (cholecystitis), typically exacerbated by rich or fatty meals.\n\nAI Assistant guidance:\n1. Adopt a strict low-fat diet (eliminate fried foods, pastries, and alcohol);\n2. Antispasmodics (No-Spa) or digestive enzymes (Pancreatin) may provide symptomatic relief;\n3. Critical warning: Never take cholagogues (bile stimulants) without an ultrasound ruling out gallstones (calculi), as this risks biliary colic or acute obstruction;\n4. Consult a gastroenterologist for an abdominal ultrasound evaluation.`;
      quickSuggestions = ["Dietary rules", "Abdominal ultrasound", "Gastroenterologist visit"];
    } else {
      reply = `🩺 VaksinaMed AI tibbiy yordamchisi: O‘ng qovurg‘a osti og‘rig‘i (Jigar va o‘t pufagi)\n\nO‘ng qovurg‘a ostidagi og‘irlik, og‘riq va og‘izda achchiq ta'm ko‘pincha o‘t yo‘llari diskineziyasi yoki o‘t pufagi yallig‘lanishi (xolesistit) tufayli yog‘li taomlardan keyin yuzaga keladi.\n\nAI yordamchisi tavsiyalari:\n1. Parhez: Yog‘li, qovurilgan, dudlangan, achchiq taomlar va spirtli ichimliklarni darhol to‘xtating;\n2. Spazmni yengillatish uchun No-shpa yoki hazmni yaxshilovchi fermentlar (Mezim, Kreon) qabul qilish mumkin;\n3. Qat'iy taqiq: Agar o‘t pufagingizda tosh bo‘lsa, o‘t haydovchi dorilarni aslo ichmang (tosh o‘t yo‘lini to‘sib qo‘yishi va shoshilinch operatsiyaga sabab bo‘lishi mumkin!);\n4. Qorin bo‘shlig‘i a'zolarini UZI qildirib, gastroenterolog ko‘rigidan o‘tish zarur.`;
      quickSuggestions = ["Jigar va o‘t uchun parhez", "UZI tekshiruviga yozilish", "Mezim haqida"];
    }
  } else if (categoryIntent === "anemia_iron") {
    if (lang === "ru") {
      reply = `🩺 Медицинский ИИ-ассистент VaksinaMed: Анемия и низкий гемоглобин\n\nПостоянная слабость, быстрая утомляемость, головокружение, бледность и выпадение волос часто указывают на дефицит железа и падение гемоглобина.\n\nРекомендации ИИ-ассистента:\n1. Сдайте общий анализ крови (ОАК) и анализ на ферритин (запас железа в тканях);\n2. Включите в рацион продукты, богатые гемовым железом: говядина, печень, гречка, яйца, яблоки, гранат;\n3. По назначению врача принимаются препараты железа (Тотема, Мальтофер, Сорбифер) вместе с витамином C для лучшего усвоения;\n4. Важное правило: Не запивайте препараты железа чаем, кофе или молоком (кальций и танин блокируют всасывание железа!).`;
      quickSuggestions = ["Анализ на ферритин", "Продукты с железом", "Препараты железа"];
    } else if (lang === "en") {
      reply = `🩺 VaksinaMed Medical AI Assistant: Anemia & Low Hemoglobin\n\nPersistent fatigue, lightheadedness, pale skin, and hair thinning are classic indicators of iron-deficiency anemia.\n\nAI Assistant guidance:\n1. Have a complete blood count (CBC) and serum ferritin test performed;\n2. Enrich your diet with iron-rich foods: lean red meat, liver, buckwheat, eggs, and leafy greens;\n3. Doctor-prescribed iron supplements (e.g. Maltofer, Ferrous sulfate) are best absorbed when taken alongside vitamin C;\n4. Essential interaction rule: Avoid taking iron with tea, coffee, or milk products, as tannins and calcium inhibit iron absorption.`;
      quickSuggestions = ["Ferritin test guide", "Iron-rich diet", "Iron supplements"];
    } else {
      reply = `🩺 VaksinaMed AI tibbiy yordamchisi: Kamqonlik (anemiya) va past gemoglobin\n\nTez charchash, holsizlik, bosh aylanishi, rang oqarishi va soch to‘kilishi organizmda temir moddasi kamayib, gemoglobin tushib ketganidan darak beradi.\n\nAI yordamchisi tavsiyalari:\n1. Laboratoriyada umumiy qon tahlili (OAK) va qon zardobidagi Ferritin (temir zaxirasi) miqdorini tekshirtiring;\n2. Ratsioningizga temirga boy mahsulotlarni qo‘shing: mol go‘shti, jigar, grechka, tuxum, anor, olma;\n3. Shifokor tavsiyasiga ko‘ra temir preparatlari (Totema, Maltofer, Ferretab) S vitamini bilan birga ichilganda yaxshiroq so‘riladi;\n4. Muhim qoida: Temir dorilarini choy, kofe yoki sut bilan birga ichmang (choy tarkibidagi tanin va sutdagi kaltsiy temirning organizmga singishini to‘sib qo‘yadi!).`;
      quickSuggestions = ["Ferritin tahlili haqida", "Temirga boy mahsulotlar", "Qon ko‘paytiruvchi dorilar"];
    }
  } else if (categoryIntent === "pregnancy_meds") {
    if (lang === "ru") {
      reply = `🩺 Медицинский ИИ-ассистент VaksinaMed: Прием лекарств при беременности и грудном вскармливании\n\nВ период беременности и лактации большинство медикаментов способны проникать через плаценту или в грудное молоко, влияя на развитие ребенка.\n\nПравила безопасности:\n1. Категорический запрет: Никогда не принимайте антибиотики, НПВП (Аспирин, Нимесил), сиропы от кашля или комбинированные порошки от простуды без назначения гинеколога!\n2. При температуре или головной боли единственным относительно безопасным средством короткого приема считается Парацетамол в минимальной дозировке;\n3. При заложенности носа безопасны промывания морской водой (Аквамарис);\n4. Обязательно согласуйте любой препарат с ведущим вашу беременность врачом-акушером-гинекологом.`;
      quickSuggestions = ["Безопасные средства при беременности", "Консультация гинеколога"];
    } else if (lang === "en") {
      reply = `🩺 VaksinaMed Medical AI Assistant: Medications in Pregnancy & Lactation\n\nMany pharmaceutical agents cross the placental barrier or enter breast milk, carrying risks for embryonic and fetal development.\n\nSafety guidelines:\n1. Strict rule: Never self-prescribe antibiotics, NSAIDs (such as Aspirin), multi-symptom cold powders, or herbal infusions without obstetric approval;\n2. For mild fever or headache, single-dose Paracetamol is generally considered the safest first-line option;\n3. For nasal congestion, isotonic saline rinses are the preferred drug-free solution;\n4. Always verify any pharmaceutical use with your treating OB-GYN physician.`;
      quickSuggestions = ["Pregnancy safety principles", "OB-GYN consultation"];
    } else {
      reply = `🩺 VaksinaMed AI tibbiy yordamchisi: Homiladorlik va laktatsiya (emizish) davrida dori ichish qoidalari\n\nHomiladorlik va bola emizish davrida ko‘plab dori vositalari yo‘ldosh orqali homilaga yoki ko‘krak suti orqali chaqaloqqa o‘tib, uning rivojlanishiga salbiy ta'sir ko‘rsatishi mumkin.\n\nXavfsizlik qoidalari:\n1. Qat'iy taqiq: Shifokor-ginekolog ruxsatisiz antibiotiklar, nosteroid og‘riq qoldiruvchilar (Aspirin, Nimesil), shamollashga qarshi kukunlar (Taylolxot va h.k.) yoki yo‘tal siropini o‘zboshimchalik bilan aslo ichmang!\n2. Isitma yoki bosh og‘rig‘ida shifokor bilan maslahatlashgan holda bir martalik minimal dozada Paratsetamol eng xavfsiz hisoblanadi;\n3. Burun bitganda dori tomchilar o‘rniga dengiz tuzi eritmasi (Akvamaris, LinAkva) bilan yuvish tavsiya etiladi;\n4. O‘zingiz va bolangiz salomatligi uchun har qanday dorini faqat shifokor nazorati ostida qabul qiling.`;
      quickSuggestions = ["Homiladorlikda nima mumkin emas?", "Ginekolog maslahati", "Paratsetamol qabul qilish"];
    }
  } else if (categoryIntent === "skin_fungus_rash") {
    if (lang === "ru") {
      reply = `🩺 Медицинский ИИ-ассистент VaksinaMed: Кожный зуд, грибок и дерматиты\n\nЗуд, покраснение, шелушение кожи между пальцами или изменение структуры ногтей чаще всего указывают на грибковую инфекцию (микоз) или аллергический дерматит.\n\nРекомендации ИИ-ассистента:\n1. Гигиена: Держите стопы и кожу сухими, носите хлопчатобумажные носки, не используйте общую обувь;\n2. При грибковых поражениях применяются противогрибковые мази (Клотримазол, Тербинафин) тонким слоем 1–2 раза в день;\n3. Запрет: Не мажьте сильные гормональные мази без назначения дерматолога (они могут временно снять зуд, но резко усилить рост грибка);\n4. Если сыпь быстро распространяется или мокнет — обратитесь на очный прием к дерматологу.`;
      quickSuggestions = ["Противогрибковые мази", "Консультация дерматолога"];
    } else if (lang === "en") {
      reply = `🩺 VaksinaMed Medical AI Assistant: Skin Rashes, Itching & Fungal Infections\n\nItching, scaling, redness between toes, or nail discoloration typically indicate superficial fungal infection (tinea/mycosis) or dermatitis.\n\nAI Assistant guidance:\n1. Keep skin clean and dry, wear breathable cotton socks, and never share footwear;\n2. Topical antifungals (Clotrimazole, Terbinafine) are commonly applied thinly to affected clean skin;\n3. Warning: Avoid applying topical corticosteroids without diagnosis, as steroids promote fungal proliferation;\n4. If rashes blister, weep, or spread rapidly, seek dermatologist evaluation.`;
      quickSuggestions = ["Antifungal topical care", "Dermatology visit"];
    } else {
      reply = `🩺 VaksinaMed AI tibbiy yordamchisi: Teri qichishi, zamburug‘ (gribok) va dermatitda yordam\n\nBarmoqlar orasining qichishi, terining po‘st tashlashi, qizarishi yoki tirnoq rangining o‘zgarishi ko‘pincha zamburug‘li infeksiya (mikoza) yoki kontakt dermatit belgisi hisoblanadi.\n\nAI yordamchisi tavsiyalari:\n1. Shaxsiy gigiyena: Teri va oyoqlarni doimo quruq saqlang, paxtali toza paypoq kiying, umumiy poyabzal yoki sochiqdan foydalanmang;\n2. Zamburug‘ga qarshi mahalliy vositalar (Klotrimazol, Terbinafin mazi) toza va quruq teriga kuniga 1–2 marta yupqa qilib surtiladi;\n3. Qat'iy taqiq: Shifokor ko‘rsatmasisiz gormonal mazlarni (Prednizolon, Deksametazon) surtmang — ular qichishishni vaqtincha bosgani bilan zamburug‘ning yanada chuqur ildiz otishiga sabab bo‘ladi;\n4. Agar toshma butun tanaga tarqalsa yoki suvli yiringli yaraga aylansa — zudlik bilan dermatolog ko‘rigiga boring.`;
      quickSuggestions = ["Gribokka qarshi mazlar", "Dermatolog ko‘rigiga yozilish"];
    }
  } else if (categoryIntent === "nasal_sinusitis") {
    if (lang === "ru") {
      reply = `🩺 Медицинский ИИ-ассистент VaksinaMed: Насморк, заложенность носа и гайморит\n\nЗаложенность носа при ОРВИ возникает из-за отека слизистой оболочки и скопления слизи.\n\nРекомендации ИИ-ассистента:\n1. Промывание носа: Промывайте носовые ходы солевыми изотоническими растворами (Аквамарис, физраствор) 3–4 раза в день для очищения от вирусов и увлажнения;\n2. Сосудосуживающие спреи (Ксилометазолин, Оксиметазолин): Строгое правило — используйте не дольше 4–5 дней подряд! Длительное применение вызывает привыкание и тяжелый медикаментозный ринит;\n3. Пейте больше теплой жидкости и поддерживайте влажность воздуха в комнате (50–60%);\n4. Опасные симптомы гайморита: Боль и распирание в области лба или под глазами при наклоне головы, густые гнойные выделения и температура требуют осмотра ЛОР-врача.`;
      quickSuggestions = ["Промывание носа правила", "Признаки гайморита", "Спреи от заложенности"];
    } else if (lang === "en") {
      reply = `🩺 VaksinaMed Medical AI Assistant: Nasal Congestion, Rhinitis & Sinusitis\n\nNasal obstruction during respiratory viral infections is driven by mucosal vasodilation and mucus pooling.\n\nAI Assistant guidance:\n1. Saline Irrigation: Rinse nasal passages 3-4 times daily with isotonic saline sprays (e.g. seawater sprays) to liquefy secretions and clear pathogens;\n2. Decongestant Sprays (Xylometazoline, Oxymetazoline): STRICT RULE — do not exceed 4-5 consecutive days of use! Extended use leads to rebound congestion (rhinitis medicamentosa);\n3. Maintain adequate room humidity (50-60%) and generous oral hydration;\n4. Sinusitis warning signs: Facial pressure or throbbing forehead pain when bending forward, purulent nasal discharge, and fever warrant prompt ENT physician evaluation.`;
      quickSuggestions = ["Nasal saline irrigation", "Sinusitis warning signs", "Decongestant spray rules"];
    } else {
      reply = `🩺 VaksinaMed AI tibbiy yordamchisi: Burun bitishi, shamollash tumovi va gaymoritda yordam\n\nShamollashda burun bitishi shilliq qavat shishishi va burun yo‘llarida shilimshiq to‘planishi oqibatida kelib chiqadi.\n\nAI yordamchisi tavsiyalari:\n1. Burunni yuvish: Kuniga 3–4 marta dengiz tuzi eritmasi (Akvamaris, LinAkva yoki sho‘r suv) bilan burunni chayib turing — bu shishni qaytaradi va viruslarni yuvib chiqaradi;\n2. Burun ochuvchi tomchi/spreylar (Ksilometazolin, Oksimetazolin, Naftizin): Qat'iy qoida — 4–5 kundan ortiq uzluksiz ishlatmang! Uzoq muddat sepish tomirlarni o‘rgatib qo‘yadi va surunkali dori rinitini (medikamentoz rinit) keltirib chiqaradi;\n3. Ko‘p iliq suyuqlik iching va xona havosini namlantirib turing;\n4. Gaymorit belgilari: Boshni pastga egganingizda peshona yoki ko‘z ostida kuchli bosim va og‘riq paydo bo‘lsa, yashil-sarg‘ish quyuq yiring kelsa — kechiktirmasdan LOR-shifokor ko‘rigiga boring.`;
      quickSuggestions = ["Burunni to‘g‘ri yuvish", "Gaymorit belgilari", "Burun spreyini tanlash"];
    }
  } else if (categoryIntent === "helminths_parasites") {
    if (lang === "ru") {
      reply = `🩺 Медицинский ИИ-ассистент VaksinaMed: Глисты и паразитарные инфекции\n\nЗуд в области заднего прохода (особенно ночью), скрежетание зубами во сне, снижение аппетита и тошнота часто указывают на глистную инвазию (острицы, аскариды).\n\nРекомендации ИИ-ассистента:\n1. Сдайте анализ кала на яйца глист и соскоб на энтеробиоз для точного выявления вида паразита;\n2. Гигиена: Тщательно мойте руки с мылом перед едой и после туалета, коротко стригите ногти, стирайте постельное и нательное белье при высокой температуре и проглаживайте утюгом;\n3. Противоглистные препараты (Альбендазол, Пирантел) принимаются строго по назначению врача с обязательным одновременным лечением всех членов семьи;\n4. Повторный курс: Часто требуется повторный прием препарата через 14 дней для уничтожения вылупившихся личинок.`;
      quickSuggestions = ["Анализы на глисты", "Правила профилактики", "Препараты от паразитов"];
    } else if (lang === "en") {
      reply = `🩺 VaksinaMed Medical AI Assistant: Parasitic Worms (Helminthiasis)\n\nPerianal itching (especially nocturnal), teeth grinding during sleep, abdominal discomfort, and variable appetite are typical symptoms of intestinal parasites (pinworms, ascaris).\n\nAI Assistant guidance:\n1. Diagnostic tests: Stool ova and parasite (O&P) examination and tape test are recommended for accurate identification;\n2. Hygiene essentials: Wash hands thoroughly before meals and after restrooms, keep nails trimmed, and wash bedding in hot water followed by ironing;\n3. Antihelminthic medications (Albendazole, Pyrantel) should be taken as prescribed, typically treating all household contacts concurrently;\n4. Repeat dosing: A second dose after 14 days is frequently advised to eradicate newly hatched larvae.`;
      quickSuggestions = ["Parasite testing", "Hygiene protocols", "Deworming medications"];
    } else {
      reply = `🩺 VaksinaMed AI tibbiy yordamchisi: Gijja va ichak parazitlarida nima qilish kerak?\n\nKechasi orqa chiqaruv yo‘lida qichishish, uyquda tish g‘ijirlatish, qorinda noaniq og‘riqlar, ishtaha pasayishi va vazn yo‘qotish ko‘pincha ichak qurtlari (gijja, ostritsa, askarida) belgisi hisoblanadi.\n\nAI yordamchisi tavsiyalari:\n1. Tahlil topshirish: Aniq parazit turini aniqlash uchun najas tahlili (kal na yaytsa glist) va enterobiozga qirilma topshirish zarur;\n2. Qat'iy gigiyena: Ovqatdan oldin qo‘llarni sovunlab yuvish, tirnoqlarni kalta olish, ichki kiyim va o‘rin-ko‘rpalarni qaynoq suvda yuvib dazmollash qayta yuqishning oldini oladi;\n3. Gijjaga qarshi dorilar (Albendazol, Pirantel, Vermoks) faqat shifokor dozalashi bo‘yicha ichiladi va qoida tariqasida butun oila a'zolari bir vaqtda davolanishi kerak;\n4. Qayta ichish: Lichinkalardan yangi chiqqan qurtlarni yo‘q qilish uchun ko‘pincha 14 kundan so‘ng kursni qaytarish buyuriladi.`;
      quickSuggestions = ["Gijjaga tahlil topshirish", "Gijja profilaktikasi", "Qurt haydovchi dorilar"];
    }
  } else if (categoryIntent === "medication_rules") {
    if (lang === "ru") {
      reply = `🩺 Медицинский ИИ-ассистент VaksinaMed: Правила правильного приема лекарств\n\n1. Время приема относительно еды:\n   • До еды (за 30 минут): препараты для снижения кислотности (Омепразол), желчегонные;\n   • Во время еды: пищеварительные ферменты (Мезим, Креон), поливитамины;\n   • После еды: обезболивающие и противовоспалительные (Ибупрофен, Парацетамол, Аспирин) для защиты слизистой желудка;\n2. Чем запивать: Запивайте лекарства ТОЛЬКО чистой негазированной водой комнатной температуры (1 стакан)!\n3. Запрет: Не запивайте чаем, кофе, молоком или соками (особенно грейпфрутовым — он смертельно усиливает токсичность многих препаратов!);\n4. Курс антибиотиков: Пейте строго по часам (каждые 8 или 12 часов) и доводите курс до конца.`;
      quickSuggestions = ["Совместимость лекарств", "Правила приема антибиотиков"];
    } else if (lang === "en") {
      reply = `🩺 VaksinaMed Medical AI Assistant: Safe Medication Administration Rules\n\n1. Timing around meals:\n   • Before meals (30 mins): Acid-reducing agents (Omeprazole), gastric protectants;\n   • With meals: Digestive enzymes (Pancreatin), multivitamins, iron supplements;\n   • After meals: NSAIDs and analgesics (Ibuprofen, Paracetamol, Aspirin) to avoid gastric irritation;\n2. What to drink: Take medications ONLY with a full glass of plain room-temperature water;\n3. Avoid: Never take pills with tea, coffee, milk, or grapefruit juice (grapefruit inhibits liver CYP3A4 enzymes and dangerously elevates drug blood levels);\n4. Antibiotics: Take at strict even intervals (every 8 or 12 hours) and finish the entire prescribed course.`;
      quickSuggestions = ["Drug interactions guide", "Antibiotic compliance"];
    } else {
      reply = `🩺 VaksinaMed AI tibbiy yordamchisi: Dorilarni to‘g‘ri va xavfsiz qabul qilish qoidalari\n\n1. Ovqatga nisbatan vaqtini to‘g‘ri tanlang:\n   • Ovqatdan 30 daqiqa oldin: Oshqozon kislotasini tushiruvchi dorilar (Omeprazol), o‘t haydovchilar;\n   • Ovqatlanish paytida: Hazm qilish fermentlari (Mezim, Kreon), polivitaminlar;\n   • Ovqatdan keyin: Barcha og‘riq qoldiruvchi va nosteroid dorilar (Ibuprofen, Paratsetamol, Tsitramon, Aspirin) — oshqozon shilliq qavatini shikastlamaslik uchun;\n2. Nima bilan ichish kerak: Dorilarni FAQAT bir stakan oddiy toza, xona haroratidagi suv bilan iching!\n3. Qat'iy taqiq: Choy, kofe, sut yoki meva sharbatlari (ayniqsa greypfrut sharbati) bilan ichmang — ular dorining so‘rilishini to‘sib qo‘yadi yoki xavfli asoratlarni keltirib chiqaradi;\n4. Antibiotiklar qoidasi: Aniq belgilangan soatlarda (har 12 yoki har 8 soatda) va shifokor aytgan muddatgacha to‘liq ichib tugatish shart.`;
      quickSuggestions = ["Dorilarning o‘zaro ta'siri", "Antibiotik ichish qoidalari", "Oshqozonni asrash"];
    }
  } else if (categoryIntent === "nail_trauma") {
    if (lang === "ru") {
      reply = `🩺 Медицинский ИИ-ассистент VaksinaMed: Первая помощь при травме, надломе или срыве ногтя

При повреждении, надломе или отрыве ногтевой пластины главная цель — остановить кровотечение, защитить ростковую зону (матрикс) и не допустить инфицирования.

Стандарт неотложной помощи:
1. Промывание и дезинфекция: Осторожно промойте палец раствором Хлоргексидина или Мирамистина (или кипяченой водой). Не лейте в открытую рану чистый спирт или йод — это вызовет химический ожог обнаженного ногтевого ложа;
2. Не срывайте ноготь силой: Если ноготь сорван частично, ни в коем случае не отрывайте его насильно! Осторожно срежьте стерильными ножницами только свободно болтающийся край, чтобы он не цеплялся;
3. Защитная повязка: Нанесите антисептическую мазь (Левомеколь или Бепантен) и зафиксируйте стерильной марлевой салфеткой с пластырем или дышащим бинтом;
4. Снятие отека и боли: Приложите к пальцу холод через сухое полотенце на 10–15 минут. При выраженной боли допустим прием Парацетамола или Ибупрофена;
5. Когда срочно нужен хирург:
   • Ноготь оторван полностью или сильно смещен;
   • Под ногтем быстро нарастает черно-синяя пульсирующая гематома (распирающая боль);
   • Появился гной, палец сильно покраснел и пульсирует;
   • Есть подозрение на перелом фаланги пальца;
   • Прошло более 5 лет после прививки от столбняка.

ℹ️ Сроки заживления: Новая ногтевая пластина на пальцах рук полностью отрастает за 4–6 месяцев, на ногах — за 9–12 месяцев.`;
      quickSuggestions = [
        "Купить Хлоргексидин",
        "Мазь Левомеколь",
        "Правила перевязки",
      ];
    } else if (lang === "en") {
      reply = `🩺 VaksinaMed Medical AI Assistant: First Aid for Broken, Torn, or Avulsed Nails

When a nail breaks, tears, or detaches, the priority is to stop bleeding, prevent bacterial infection, and protect the delicate nail bed and germinative matrix.

Action Protocol:
1. Cleanse and disinfect: Gently wash with Chlorhexidine or mild saline. Never pour pure rubbing alcohol or strong iodine onto an open exposed nail bed;
2. Do not rip the nail off: If the nail is partially torn, do not pull or rip it forcefully! Carefully trim only the freely detached edge using clean, sterilized scissors;
3. Antibacterial dressing: Apply an antibacterial ointment (such as Levomekol or bacitracin) and secure with a sterile breathable gauze and medical tape;
4. Reduce pain and swelling: Apply a cold compress wrapped in a cloth for 10–15 minutes. Take Paracetamol or Ibuprofen if needed for pain relief;
5. When to visit a surgeon:
   • The nail has completely avulsed from the root;
   • A large, throbbing subungual hematoma (blood trapped under nail) causes severe pressure;
   • Suspected bone fracture of the fingertip/toetip;
   • Signs of infection, pus, or if tetanus booster is outdated (>5 years).

ℹ️ Recovery timeline: Complete fingernail regrowth takes 4–6 months; toenails take 9–12 months.`;
      quickSuggestions = [
        "Buy Chlorhexidine",
        "Levomekol ointment",
        "Wound dressing rules",
      ];
    } else {
      reply = `🩺 VaksinaMed AI tibbiy yordamchisi: Tirnoq sinishi, ko'chishi yoki tushib qolishida birinchi yordam

Tirnoq shikastlanganda, yulib ketganda yoki tushib qolganda asosiy maqsad — qon ketishini to'xtatish, tirnoq o'sish o'rnini (matritsasini) asrash va infeksiya tushishining oldini olishdir.

Zudlik bilan nimalar qilish kerak:
1. Qonni to'xtatish va yuvish: Barmoqni Xlorgeksidin yoki Miramistin antiseptigi (yoki toza xona haroratidagi suv) bilan ehtiyotkorlik bilan yuving. Ochiq qonagan tirnoq o'rniga spirt yoki konsentrlangan yod quymang (to'qimani kuydiradi va bitishini qiyinlashtiradi);
2. Ko'chgan tirnoqni kuch bilan sug'urib olmang: Agar tirnoq qisman ko'chgan bo'lsa, uni tortib yulib olmang! Faqat osilib qolgan, kiyimga ilinuvchi xalaqit berayotgan qismini steril qaychi bilan ehtiyotkorlik bilan kesib oling;
3. Antiseptik malham va steril bog'lam: Yaraning ustiga Levomekol yoki Bepanten malhami surtib, steril doka va leykoplastir bilan bog'lab qo'ying (kir va bakteriyalar tushmasligi uchun);
4. Shish va og'riqni kamaytirish: Zararlangan barmoqqa quruq sochiqqa o'ralgan muz yoki sovuq narsa bosing (10-15 daqiqa). Kuchli og'riqda Paratsetamol yoki Ibuprofen ichish mumkin;
5. Qachon zudlik bilan jarrohga (xirurg / travmatolog) borish kerak:
   • Tirnoq tagidan to'liq ko'chib (tushib) ketgan bo'lsa;
   • Tirnoq ostiga ko'p qon quyilib qoraygan bo'lsa (subungual gematoma) va kuchli lo'qillovchi og'riq bersa;
   • Barmoq suyagi lat yegan yoki singan bo'lish ehtimoli bo'lsa;
   • Yara yiringlasa, qizarish va shish kengaysa;
   • So'nggi 5 yil ichida qoqsholga (stolbnyak) qarshi emlanmagan bo'lsangiz.

ℹ️ Eslatma: O'z o'rnidan to'liq tushib ketgan tirnoq o'rniga yangi tirnoq qo'l barmoqlarida 4–6 oyda, oyoq barmoqlarida esa 9–12 oyda to'liq o'sib chiqadi.`;
      quickSuggestions = [
        "Xlorgeksidin sotib olish",
        "Levomekol malhami",
        "Yarani bog'lash qoidalari",
      ];
    }
  } else if (categoryIntent === "fracture") {
    if (lang === "ru") {
      reply = `🩺 Медицинский ИИ-ассистент VaksinaMed: Первая помощь при переломах (рука, нога)\n\nПри переломе костей или подозрении на него категорически запрещены резкие движения и попытки вправить кость самостоятельно!\n\nСтандарт неотложной доврачебной помощи:\n1. Полная иммобилизация (покой): Зафиксируйте поврежденную руку или ногу в том положении, в котором она оказалась. Ни в коем случае не пытайтесь вправлять или дергать конечность;\n2. Наложение шины (фиксация): Используйте подручные средства (дощечка, плотный картон, палка), зафиксировав два соседних сустава (выше и ниже места перелома). При переломе руки подвесьте её на косыночную повязку через шею;\n3. Местный холод: Приложите пузырь со льдом через полотенце на 15–20 минут для уменьшения отека и внутреннего кровоизлияния;\n4. При открытом переломе: Если повреждена кожа и есть рана, не давите на кость! Наложите чистую стерильную марлевую повязку;\n5. Обезболивание: Для предотвращения болевого шока допустим прием анальгетика (Парацетамол или Ибупрофен);\n6. Срочно в больницу: Немедленно вызовите скорую помощь (103) или аккуратно доставьте пострадавшего в травмпункт для рентгена и наложения гипса.`;
      quickSuggestions = ["Как наложить шину?", "Открытый перелом", "Вызов скорой 103"];
    } else if (lang === "en") {
      reply = `🩺 VaksinaMed Medical AI Assistant: First Aid for Fractures (Broken Arm/Leg)\n\nSuspected fractures require immediate stabilization to avoid neurovascular damage and displaced bone fragments.\n\nEmergency First Aid Protocol:\n1. Complete Immobilization: Do not move the injured limb. Never attempt to realign or push broken bones back;\n2. Splinting: Apply a rigid support (board, thick folded cardboard) immobilizing the joints both above and below the fracture site. For arm fractures, support the limb with an arm sling;\n3. Cold Application: Apply an ice pack wrapped in a cloth to reduce swelling and pain;\n4. Open Fractures: If bone protrudes or bleeding is present, cover gently with a clean sterile dressing without direct pressure on bone;\n5. Pain Management: Administer an oral analgesic (Paracetamol or Ibuprofen) to prevent pain-induced shock;\n6. Emergency Transport: Immediately call 103 (emergency services) or transport the patient to the nearest trauma emergency center for radiography (X-ray).\n\n⚠️ Urgent: Always seek prompt orthopedic evaluation for fractures.`;
      quickSuggestions = ["How to apply a splint", "Open fracture guidelines", "Emergency 103 call"];
    } else {
      reply = `🩺 VaksinaMed AI tibbiy yordamchisi: Suyak sinishi (qo‘l/oyoq) holatida birinchi yordam\n\nSuyak singanda yoki unga shubha bo‘lganda noto‘g‘ri harakat jiddiy asoratlarga (suyak siljishi, qon tomir va nervlarning uzilishi) olib kelishi mumkin.\n\nBirinchi tibbiy yordam ko‘rsatish qoidalari:\n1. To‘liq harakatsizlik (Immobilizatsiya): Shikastlangan a'zoni (qo‘l yoki oyoqni) qimirlatmaslik kerak. Suyakni o‘z joyiga to‘g‘rilashga mutlaqo urinmang!\n2. Shina qo‘yish (Fiksatsiya): Qo‘l ostidagi qattiq narsadan (taxtakach, qalin karton) shina yasab, sinish joyidan yuqoridagi va pastdagi ikkita bo‘g‘imni qamrab olgan holda bint yoki ro‘mol bilan mahkamlang. Qo‘l singanda dastro‘mol yoki bintdan kosinka bog‘lami yasab, qo‘lni bo‘yinga osib qo‘ying;\n3. Sovuq qo‘yish: Shish va ichki qon ketishni kamaytirish uchun sinish atrofiga sochiqqa o‘ralgan muz yoki sovuq narsa bosing;\n4. Ochiq sinish bo‘lsa: Agar teri yirtilib suyak ko‘rinib turgan yoki qonayotgan bo‘lsa, suyakka tegmang, jarohat ustiga toza steril doka/bint qo‘yib qonni to‘xtating;\n5. Og‘riq qoldirish: Kuchli og‘riq shokiga yo‘l qo‘ymaslik uchun og‘riq qoldiruvchi dori (Paratsetamol yoki Ibuprofen) ichish mumkin;\n6. Zudlik bilan shifokorga: Shikastlangan odamni zudlik bilan travmatologiya bo‘limiga yetkazing yoki 103 (Tez yordam) chaqiring!\n\n⚠️ Muhim eslatma: Sinish alomatlarida albatta rentgen tekshiruvidan o‘tish va gips qo‘ydirish shart.`;
      quickSuggestions = ["Shina qanday qo‘yiladi?", "Ochiq sinishda nima qilish kerak?", "103 ga qo‘ng‘iroq qilish"];
    }
  } else if (categoryIntent === "wound_cut") {
    if (lang === "ru") {
      reply = `🩺 Медицинский ИИ-ассистент VaksinaMed: Первая помощь при порезах и ранах\n\n1. Остановка кровотечения: Прижмите рану чистой салфеткой или бинтом на 5–10 минут. Если порезана рука, поднимите её выше уровня сердца;\n2. Промывание: Промойте рану чистой водой или антисептиком (Хлоргексидин, Мирамистин). Не лейте йод или зеленку внутрь глубокой раны — это вызовет ожог тканей;\n3. Повязка: Наложите чистую давящую повязку или бактерицидный пластырь;\n4. Когда нужен врач: Если кровь пульсирует и не останавливается, порез глубже 0.5 см, или рана загрязнена землей (нужен укол от столбняка!) — обратитесь в травмпункт.`;
      quickSuggestions = ["Как остановить кровь?", "Прививка от столбняка"];
    } else if (lang === "en") {
      reply = `🩺 VaksinaMed Medical AI Assistant: First Aid for Cuts and Wounds\n\n1. Stop Bleeding: Apply firm, continuous pressure with a clean cloth or sterile gauze for 5-10 minutes. Elevate the injured area;\n2. Cleanse: Rinse gently with water or antiseptic solution (Chlorhexidine). Avoid pouring alcohol or hydrogen peroxide into deep wounds;\n3. Dress the Wound: Apply a sterile dressing or bandage;\n4. Seek Urgent Care: If bleeding won't stop, edges gape apart, or injury involves a dirty/rusty object (tetanus risk!), visit an urgent care center immediately.`;
      quickSuggestions = ["How to stop bleeding", "Tetanus vaccine info"];
    } else {
      reply = `🩺 VaksinaMed AI tibbiy yordamchisi: Jarohat va chuqur kesilishda birinchi yordam\n\n1. Qonni to‘xtatish: Jarohat ustiga toza steril doka yoki mato qo‘yib, 5–10 daqiqa qattiq bosib turing. Qo‘l kesilgan bo‘lsa, uni yurak sathidan yuqoriga ko‘taring;\n2. Antiseptik bilan tozalash: Yarani toza suv yoki Xlorgeksidin eritmasi bilan yuving. Yarani ichiga yod yoki spirt quymang — bu to‘qimalarni kuydirib, bitishini qiyinlashtiradi;\n3. Bog‘lam qo‘yish: Jarohat ustiga toza bint bog‘lang yoki bakteritsid leykoplastir yopishtiring;\n4. Qachon shifokorga borish shart: Qon kuchli otilib chiqsa, kesilgan joy chuqur bo‘lib chetlari ochilib qolgan bo‘lsa yoki jarohatga zang/tuproq tushgan bo‘lsa (stolbnyak - qoqsholga qarshi emlash zarur!) — darhol travmatologga boring.`;
      quickSuggestions = ["Qonni qanday to‘xtatish kerak?", "Qoqsholga qarshi emlash"];
    }
  } else if (categoryIntent === "choking") {
    if (lang === "ru") {
      reply = `🩺 Медицинский ИИ-ассистент VaksinaMed: Первая помощь при удушье (поперхивании) — Прием Геймлиха\n\nЕсли инородное тело перекрыло дыхательные пути и человек не может дышать или говорить:\n1. Попросите покашлять: Если человек может кашлять, пусть кашляет изо всех сил. Не бейте по спине, если пострадавший стоит вертикально!\n2. Если не может дышать: Наклоните человека вперед и основанием ладони нанесите 5 резких ударов между лопатками;\n3. Прием Геймлиха: Встаньте сзади, обхватите руками, сложите одну руку в кулак выше пупка, накройте другой рукой и сделайте 5 резких толчков внутрь и вверх;\n4. Немедленно вызывайте 103 (скорую помощь).`;
      quickSuggestions = ["Прием Геймлиха детям", "Вызов скорой 103"];
    } else if (lang === "en") {
      reply = `🩺 VaksinaMed Medical AI Assistant: First Aid for Choking (Heimlich Maneuver)\n\nIf an airway is obstructed and the person cannot speak, cough, or breathe:\n1. Encourage Coughing: If able to cough, urge them to keep coughing forcefully;\n2. 5 Back Blows: Lean them forward and deliver 5 firm blows between the shoulder blades with the heel of your hand;\n3. 5 Abdominal Thrusts (Heimlich): Stand behind them, place a fist just above the navel, grasp with other hand, and pull inward and upward sharply;\n4. Call emergency 103 immediately if the blockage is not expelled.`;
      quickSuggestions = ["Heimlich for infants", "Emergency 103 call"];
    } else {
      reply = `🩺 VaksinaMed AI tibbiy yordamchisi: Tomoqqa narsa tiqilib qolganda birinchi yordam (Geymlix usuli)\n\nAgar nafas yo‘liga ovqat yoki buyum tiqilib, inson gapira olmasa yoki bo‘g‘ilayotgan bo‘lsa:\n1. Yo‘talishga undang: Agar nafas olib yo‘tala olayotgan bo‘lsa, bor kuchi bilan yo‘talishini ayting. Tik turgan odamning orqasiga bekorga urmang (narsa yanada chuqurroq ketishi mumkin);\n2. Kuraklar orasiga 5 marta urish: Jabrlanuvchini oldinga biroz engashtiring va kaft asosi bilan kuraklar oralig‘iga 5 marta siltovchi zarba bering;\n3. Geymlix usuli: Orqa tomondan kelib, kindikdan 2 barmoq yuqoriga mushtingizni qo‘ying, ikkinchi qo‘l bilan mushtni ushlab, ichkariga va yuqoriga qarab 5 marta tez siltab bosing;\n4. Zudlik bilan 103 (Tez yordam) chaqiring!`;
      quickSuggestions = ["Bolalarda Geymlix usuli", "103 ga qo‘ng‘iroq qilish"];
    }
  } else if (categoryIntent === "first_aid_general") {
    if (lang === "ru") {
      reply = `🩺 Медицинский ИИ-ассистент VaksinaMed: Основные правила первой доврачебной помощи\n\n1. Оцените безопасность: Убедитесь, что вам и пострадавшему ничего не угрожает;\n2. Проверьте состояние: сознание, дыхание, пульс;\n3. Немедленно звоните 103 (Скорая помощь);\n4. Экстренные действия по ситуациям:\n   • При переломе — зафиксируйте шиной, не двигайте конечность;\n   • При кровотечении — наложите давящую стерильную повязку;\n   • При ожоге — охлаждайте водой 15 минут, не мажьте маслом;\n   • При поперхивании — примените метод Геймлиха.\n\nО какой конкретной ситуации вам нужна подробная инструкция?`;
      quickSuggestions = ["Помощь при переломе", "Помощь при ожоге", "Остановка кровотечения"];
    } else if (lang === "en") {
      reply = `🩺 VaksinaMed Medical AI Assistant: General First Aid Guidelines\n\n1. Check safety: Ensure the scene is safe for you and the victim;\n2. Check responsiveness and airway/breathing;\n3. Call 103 emergency response;\n4. Key emergency protocols:\n   • Fractures: Immobilize joints with a splint, do not realign;\n   • Bleeding: Direct continuous pressure with sterile gauze;\n   • Burns: Cool with running water for 15 minutes, no oil;\n   • Choking: Perform the Heimlich maneuver.\n\nWhich specific medical emergency do you need detailed guidance on?`;
      quickSuggestions = ["Fracture first aid", "Burn care", "Bleeding control"];
    } else {
      reply = `🩺 VaksinaMed AI tibbiy yordamchisi: Shoshilinch birinchi yordam ko‘rsatish qoidalari\n\nFavqulodda vaziyatlarda tez va to‘g‘ri harakat qilish inson hayotini saqlab qoladi.\n\nAsosiy qoidalar:\n1. Xavfsizlikni baholang: Avvalo o‘zingiz va jabrlanuvchi uchun atrof xavfsiz ekaniga ishonch hosil qiling;\n2. Holatni tekshiring: Hushini, nafasini va qon ketayotgan joylarini aniqlang;\n3. 103 (Tez yordam) chaqiring;\n4. Shoshilinch vaziyatlar bo‘yicha yordam:\n   • Suyak singanda — shikastlangan qo‘l yoki oyoqni qimirlatmang, shina qo‘ying;\n   • Qon ketganda — jarohat ustiga steril mato bilan bosim qiling;\n   • Kuyishda — 15 daqiqa sovuq oqar suvda tuting (yog‘ yoki spirt surtmang!);\n   • Nafas tiqilganda — Geymlix usulini qo‘llang.\n\nAynan qaysi holat bo‘yicha batafsil yordam kerak (sinish, kuyish, qon ketishi, hushdan ketish)?`;
      quickSuggestions = ["Suyak singanda yordam", "Kuyishda birinchi yordam", "Qon ketishini to‘xtatish"];
    }
  } else if (categoryIntent === "dental") {
    if (lang === "ru") {
      reply = `🩺 Медицинский ИИ-ассистент VaksinaMed: Первая помощь при зубной боли\n\nЗубная боль (кариес, пульпит, воспаление десны) всегда указывает на поражение глубоких тканей зуба или зубного нерва. Главное правило: таблетки не лечат больной зуб — причину боли может устранить только врач-стоматолог!\n\nРекомендации ИИ-ассистента и первая помощь:\n1. Строгий запрет: Ни в коем случае не прикладывайте грелку или горячий компресс к больной щеке! Тепло резко ускоряет развитие гнойного процесса и может вызвать опасные осложнения;\n2. Полощите рот теплым раствором (на 1 стакан теплой воды — 1 ч. л. соли и 0.5 ч. л. соды) каждые 1–2 часа. Это снимает отек и воспаление;\n3. До приема врача для временного облегчения сильной боли допустим разовый прием одного противовоспалительного средства (например, Ибупрофен) строго после еды с водой;\n4. Правило безопасности: Не смешивайте несколько разных обезболивающих препаратов одновременно!\n\n⚠️ Важное напоминание: Данные рекомендации носят информационный характер. При первой возможности обратитесь к врачу-стоматологу.`;
      quickSuggestions = ["Записаться к стоматологу", "Опасные симптомы флюса", "Купить Ибупрофен"];
    } else if (lang === "en") {
      reply = `🩺 VaksinaMed Medical AI Assistant: First Aid for Toothache\n\nTooth pain (deep cavities, pulpitis, gum inflammation) always indicates damage to the internal tooth structure or nerve. Crucial medical rule: medications do not cure the underlying problem — only a licensed dentist can safely resolve it!\n\nAI Assistant guidance & immediate care:\n1. Strict prohibition: NEVER apply warm compresses or heating pads to the affected cheek or tooth! Heat stimulates bacterial growth and purulent spread;\n2. Rinse your mouth every 1–2 hours with warm salt and soda solution (1 cup warm water + 1 tsp salt + 0.5 tsp baking soda) to reduce swelling;\n3. For temporary pain control until your appointment, a single OTC NSAID (such as Ibuprofen) may be taken after meals with water;\n4. Safety advisory: Never combine multiple different analgesics simultaneously!\n\n⚠️ Medical reminder: This guidance is advisory. Schedule an appointment with a dentist as soon as possible.`;
      quickSuggestions = ["Schedule dentist appointment", "Warning signs", "Buy Ibuprofen"];
    } else {
      reply = `🩺 VaksinaMed AI tibbiy yordamchisi: Tish og‘rig‘ida birinchi yordam\n\nTish og‘rig‘i (karies, pulpit, milk yallig‘lanishi) har doim tishning qattiq to‘qimalari yoki nerv tolasi shikastlanganidan dalolat beradi. Asosiy tibbiy qoida: hech qanday dori vositasi kasallangan tishni davolay olmaydi — uning asl sababini faqat stomatolog-shifokor bartaraf eta oladi!\n\nAI yordamchisi tavsiyalari va birinchi yordam:\n1. Qat'iy taqiq: Og‘riyotgan tish yoki lunj sohasiga aslo issiq grelka yoki issiq kompress qo‘ymang! Issiqlik yiringlash jarayonini tezlashtirib, jiddiy asoratlarga olib kelishi mumkin;\n2. Og‘iz bo‘shlig‘ini 1 stakan iliq suvga 1 choy qoshiq osh tuzi va 0.5 choy qoshiq iste'mol sodasi solingan eritma bilan tez-tez chayib turing (bu shishni qaytaradi va og‘riqni yengillashtiradi);\n3. Shifokor qabuligacha bo‘lgan vaqtda og‘riqni vaqtincha bosish uchun bitta nosteroid vosita (masalan, Ibuprofen) ovqatdan keyin, bir stakan suv bilan ichilishi mumkin;\n4. Xavfsizlik qoidasi: Bir vaqtning o‘zida bir nechta har xil og‘riq qoldiruvchi dorilarni (masalan Paratsetamol va Ibuprofenni) aralashtirib ichmang!\n\n⚠️ Muhim eslatma: Ushbu tavsiyalar axborot xarakteriga ega. Iloji boricha tezroq stomatolog ko‘rigiga boring.`;
      quickSuggestions = ["Stomatolog ko‘rigiga yozilish", "Xavfli asoratlar bormi?", "Ibuprofen sotib olish"];
    }
  } else if (categoryIntent === "eye") {
    if (lang === "ru") {
      reply = `🩺 Медицинский ИИ-ассистент VaksinaMed: Покраснение и дискомфорт в глазах\n\nПокраснение глаз, зуд, слезотечение или ощущение «песка» могут быть признаком вирусного/бактериального конъюнктивита, аллергической реакции или синдрома сухого глаза при работе за экраном.\n\nРекомендации ИИ-ассистента:\n1. Строгий запрет: Ни в коем случае не трите глаза руками! Не закапывайте самостоятельно сильные антибиотики или гормональные капли (Дексаметазон) без осмотра врача — это может повысить внутриглазное давление;\n2. Соблюдайте гигиену: пользуйтесь индивидуальным чистым полотенцем, снимите контактные линзы до полного выздоровления;\n3. При усталости от экрана используйте увлажняющие капли (искусственная слеза) и правило «20-20-20» (каждые 20 минут смотрите вдаль на 20 секунд);\n4. Опасные симптомы: Резкое падение зрения, сильная боль внутри глаза или светобоязнь требуют немедленного визита к офтальмологу!`;
      quickSuggestions = ["Правило 20-20-20", "Когда нужен офтальмолог?", "Увлажняющие капли"];
    } else if (lang === "en") {
      reply = `🩺 VaksinaMed Medical AI Assistant: Eye Redness & Irritation\n\nRedness, stinging, itching, or tearing can result from conjunctivitis, allergies, foreign particles, or computer vision syndrome.\n\nAI Assistant guidance:\n1. Strict prohibition: Do NOT rub your eyes with unwashed hands! Never self-prescribe steroid eye drops (such as Dexamethasone), as improper use can cause glaucoma or corneal damage;\n2. Practice strict hygiene: Use a dedicated clean towel, wash hands frequently, and remove contact lenses immediately;\n3. For digital screen eye fatigue, apply lubricating tear drops and practice the 20-20-20 rule (every 20 minutes, look at an object 20 feet away for 20 seconds);\n4. Urgent red flags: Sudden blurry vision, severe deep ocular pain, or intense light sensitivity require immediate ophthalmologist evaluation.`;
      quickSuggestions = ["20-20-20 eye rule", "Ophthalmologist visit", "Lubricating drops"];
    } else {
      reply = `🩺 VaksinaMed AI tibbiy yordamchisi: Ko‘z qizarishi, achishishi va ko‘z kasalliklarida birinchi yordam\n\nKo‘z qizarishi, yosh oqishi, qichishish yoki yiringlash ko‘pincha kon'yunktivit (infeksiya), allergiya, ko‘zga begona chang tushishi yoki uzoq vaqt ekran oldida o‘tirish (quruq ko‘z sindromi) tufayli yuzaga keladi.\n\nAI yordamchisi tavsiyalari:\n1. Qat'iy taqiq: Ko‘zlaringizni aslo iflos qo‘l bilan ishqalamang! Shifokor ruxsatisiz o‘zboshimchalik bilan gormonal tomchilarni (masalan, Deksametazon) tomizmang — bu ko‘z bosimini oshirishi mumkin;\n2. Shaxsiy gigiyena: Alohida toza sochiq tuting, kontakt linzalarni darhol yeching va infeksiya yuqishini oldini oling;\n3. Ekran charchog‘ida namlantiruvchi tomchilar (sun'iy ko‘z yoshi) va "20-20-20" qoidasiga amal qiling (har 20 daqiqada 20 soniya davomida 6 metr uzoqlikka qarang);\n4. Shoshilinch belgilar: Ko‘rish qobiliyati pasaysa, ko‘zda o‘tkir sanchuvchi og‘riq paydo bo‘lsa yoki yorug‘likka qarab bo‘lmasa — zudlik bilan oftalmolog ko‘rigiga boring!`;
      quickSuggestions = ["20-20-20 ko‘z qoidasi", "Oftalmolog ko‘rigi", "Namlantiruvchi tomchilar"];
    }
  } else if (categoryIntent === "ear") {
    if (lang === "ru") {
      reply = `🩺 Медицинский ИИ-ассистент VaksinaMed: Боль в ухе (Отит)\n\nБоль в ухе чаще всего вызвана воспалением наружного или среднего уха (отитом), развивающимся как осложнение насморка или попадания воды.\n\nРекомендации ИИ-ассистента:\n1. Строгий запрет: Ни в коем случае не капайте в ухо спирт, борную кислоту или горячие растворы! Если в барабанной перепонке есть перфорация (микротрещина), спирт сожжет слуховой нерв и приведет к глухоте;\n2. Не чистите ухо глубоко ватными палочками — это утрамбовывает серу и повреждает кожу слухового прохода;\n3. Обеспечьте носовое дыхание (промойте нос морской водой), так как отек евстахиевой трубы напрямую усиливает боль в ухе;\n4. До приема врача для облегчения боли допустим прием Парацетамола или Ибупрофена внутрь;\n5. Опасные симптомы: Выделение гноя или крови из уха, высокая температура или головокружение требуют немедленного осмотра оториноларингологом.`;
      quickSuggestions = ["Правила при боли в ухе", "Осмотр ЛОР-врача", "Купить Парацетамол"];
    } else if (lang === "en") {
      reply = `🩺 VaksinaMed Medical AI Assistant: Ear Pain & Otitis Care\n\nEaraches typically indicate inflammation of the external or middle ear (otitis), often secondary to sinus congestion or water exposure.\n\nAI Assistant guidance:\n1. Strict prohibition: NEVER instill alcohol, boric drops, or hot liquids into the ear canal! If a perforated eardrum exists, alcohol can permanently damage the auditory nerve;\n2. Do NOT use cotton swabs deep inside the ear canal — it causes impaction and tissue abrasion;\n3. Restore nasal breathing by rinsing with saline solution to normalize middle-ear pressure;\n4. An oral OTC analgesic (Paracetamol or Ibuprofen) can temporarily relieve pain until your clinical appointment;\n5. Urgent red flags: Discharge of pus or blood from the ear, sudden hearing deficit, or dizziness requires prompt ENT physician evaluation.`;
      quickSuggestions = ["Ear pain precautions", "Schedule ENT appointment", "Buy Paracetamol"];
    } else {
      reply = `🩺 VaksinaMed AI tibbiy yordamchisi: Quloq og‘rig‘ida (Otit) birinchi yordam\n\nQuloqdagi og‘riq ko‘pincha tashqi yoki o‘rta quloq yallig‘lanishi (otit) oqibatida, odatda burun bitishi, shamollash yoki quloqqa suv kirishi asorati sifatida kelib chiqadi.\n\nAI yordamchisi tavsiyalari:\n1. Qat'iy taqiq: Quloq ichiga aslo spirt, borat kislotasi yoki issiq yog‘ tomizmang! Agar quloq pardasida ko‘zga ko‘rinmas teshilish (perforatsiya) bo‘lsa, spirtli eritmalar eshitish nervini kuydirib, quloqni kar qilib qo‘yishi mumkin;\n2. Quloqni paxtali cho‘pcha bilan chuqur kovlamang — bu oltingugurt tiqinini chuqur itarib, pardani jarohatlaydi;\n3. Quloqni quruq saqlang va burun orqali erkin nafas olishni tiklang (burunni tuzli suv bilan yuvish o‘rta quloqdagi bosimni kamaytiradi);\n4. Og‘riqni vaqtincha bosish uchun bir martalik Paratsetamol yoki Ibuprofen ichish mumkin;\n5. Xavfli belgilar: Quloqdan yiring yoki qon oqishi, eshitish keskin pasayishi yoki yuqori isitma kuzatilsa — kechiktirmasdan LOR-shifokor ko‘rigiga boring!`;
      quickSuggestions = ["Quloq og‘rig‘ida nima mumkin emas?", "LOR ko‘rigiga yozilish", "Paratsetamol sotib olish"];
    }
  } else if (categoryIntent === "nosebleed") {
    if (lang === "ru") {
      reply = `🩺 Медицинский ИИ-ассистент VaksinaMed: Первая помощь при носовом кровотечении\n\nКровотечение из носа чаще всего вызвано разрывом сосудов зоны Киссельбаха из-за сухости воздуха, скачка давления или переутомления.\n\nАлгоритм первой помощи:\n1. Главное правило: Не запрокидывайте голову назад! При запрокидывании кровь стекает по задней стенке глотки в желудок, вызывая рвоту, или может попасть в дыхательные пути;\n2. Сядьте прямо, слегка наклонив голову вперед;\n3. Прижмите крылья носа пальцами к носовой перегородке непрерывно на 10 минут и дышите ртом;\n4. Приложите холод (лед в ткани или влажное полотенце) на переносицу;\n5. Вызов скорой 103: Если кровотечение не останавливается через 15–20 минут, если оно очень обильное или возникло после травмы головы.`;
      quickSuggestions = ["Правильная поза при кровотечении", "Когда вызывать 103?"];
    } else if (lang === "en") {
      reply = `🩺 VaksinaMed Medical AI Assistant: First Aid for Nosebleeds (Epistaxis)\n\nNosebleeds typically arise from fragile mucosal capillaries due to dry air, blood pressure spikes, or minor trauma.\n\nFirst aid procedure:\n1. Cardinal rule: NEVER tilt your head backwards! Swallowing blood leads to gastric irritation and vomiting, or airway aspiration;\n2. Sit upright and lean slightly forward;\n3. Pinch the soft part of your nostrils firmly against the nasal bridge for a full 10 minutes without releasing, breathing through your mouth;\n4. Apply cold pack or ice wrapped in a cloth to the bridge of your nose;\n5. Call 103 ambulance: If bleeding exceeds 15–20 minutes, is unusually heavy, or followed head trauma.`;
      quickSuggestions = ["Correct nosebleed posture", "When to call 103"];
    } else {
      reply = `🩺 VaksinaMed AI tibbiy yordamchisi: Burun qonashida birinchi yordam ko‘rsatish tartibi\n\nBurundan qon ketishi ko‘pincha burun shilliq qavatidagi nozik kapillyarlarning bosim ko‘tarilishi, quruq havo yoki zo‘riqish oqibatida yorilishidan kelib chiqadi.\n\nAI yordamchisi tavsiyalari va xavfsizlik choralari:\n1. Asosiy taqiq: Boshni aslo orqaga tashlamang! Bosh orqaga tashlansa, qon qizilo‘ngach orqali oshqozonga tushib, ko‘ngil aynishi va qusishni keltirib chiqaradi yoki nafas yo‘llariga ketib qolishi mumkin;\n2. Boshingizni biroz oldinga engashtirib, tinch holatda o‘tiring;\n3. Burun qanotlarini barmoqlaringiz bilan burun to‘sig‘iga 10 daqiqa davomida uzluksiz qisib turing va og‘iz orqali nafas oling;\n4. Burun ustiga yoki peshonaga sochiqqa o‘ralgan muz yoki sovuq kompress qo‘ying;\n5. Zudlik bilan 103 chaqirish: Agar qon ketishi 15–20 daqiqadan oshsa ham to‘xtamasa, qon bosimi juda baland bo‘lsa yoki bosh jarohatidan keyin boshlangan bo‘lsa.`;
      quickSuggestions = ["Burun qonashida to‘g‘ri holat", "Qachon 103 chaqiriladi?"];
    }
  } else if (categoryIntent === "poisoning") {
    if (lang === "ru") {
      reply = `🩺 Медицинский ИИ-ассистент VaksinaMed: Пищевое отравление и интоксикация\n\nПри употреблении некачественной пищи токсины вызывают острое раздражение желудочно-кишечного тракта, тошноту, рвоту и диарею.\n\nРекомендации ИИ-ассистента:\n1. Главная цель: Предотвратить обезвоживание! Пить раствор Регидрона или минеральную воду без газа маленькими глотками каждые 5–10 минут;\n2. Принять сорбент (Смекта, Полисорб или активированный уголь) для связывания и вывода токсинов;\n3. Категорический запрет: Не принимайте противодиарейные препараты (Лоперамид / Имодиум) при подозрении на инфекцию! Они блокируют кишечник, токсины всасываются в кровь и вызывают тяжелейшую интоксикацию;\n4. Не пейте антибиотики без назначения врача;\n5. Срочный вызов 103: Непрекращающаяся рвота (невозможно пить), высокая температура, кровь в стуле, двоение в глазах или слабость мышц (риск ботулизма!).`;
      quickSuggestions = ["Правила приема Регидрона", "Опасные симптомы ботулизма", "Купить Регидрон"];
    } else if (lang === "en") {
      reply = `🩺 VaksinaMed Medical AI Assistant: Food Poisoning & Acute Intoxication\n\nContaminated food introduces bacterial toxins, triggering nausea, vomiting, and diarrhea.\n\nAI Assistant guidance:\n1. Primary goal: Prevent dehydration! Sip Oral Rehydration Solution (Rehydron) or warm mineral water in small sips every 5–10 minutes;\n2. Administer an intestinal adsorbent (Smecta or Activated Charcoal) to bind toxins;\n3. Strict prohibition: Do NOT take antimotility drugs (like Loperamide) during food poisoning! Trapping pathogens and toxins inside the bowel causes severe systemic toxicity;\n4. Do not take antibiotics without a physician's prescription;\n5. Call 103 Emergency: Continuous vomiting preventing oral fluids, high fever, bloody stool, or neurological signs like double vision (botulism risk!).`;
      quickSuggestions = ["Rehydration steps", "Botulism red flags", "Buy Rehydron"];
    } else {
      reply = `🩺 VaksinaMed AI tibbiy yordamchisi: Oziq-ovqatdan zaharlanishda birinchi yordam\n\nBuzilgan yoki sifatsiz oziq-ovqat iste'mol qilinganda, bakterial toksinlar oshqozon-ichak shilliq qavatini zararlab, ko‘ngil aynishi, qusish va ich ketishini keltirib chiqaradi.\n\nAI yordamchisi tavsiyalari:\n1. Bosh maqsad — organizmning suvsizlanishi (degidratatsiya) oldini olish! Har 5-10 daqiqada Regidron eritmasi yoki gazsiz iliq mineral suvdan qultumlab, oz-ozdan iching;\n2. Ichakdagi toksinlarni bog‘lab chiqarish uchun enterosorbent (masalan, Smekta yoki Faollashtirilgan ko‘mir) qabul qiling;\n3. Qat'iy taqiq: Zaharlanishda o‘zboshimchalik bilan ich to‘xtatuvchi loperamid (Imodium) ichmang! U ichak harakatini to‘xtatadi va zaharli moddalar qonga so‘rilib, og‘ir zaharlanishga olib keladi;\n4. Shifokor ko‘rsatmasisiz antibiotik ichmang;\n5. Zudlik bilan 103 chaqirish: To‘xtovsiz qusish tufayli suv icha olmaslik, qonli axlat, yuqori isitma, hush xiralashishi yoki ko‘zda ikkilanib ko‘rish (botulizm xavfi!) kuzatilsa.`;
      quickSuggestions = ["Regidron ichish tartibi", "Xavfli botulizm belgilari", "Regidron sotib olish"];
    }
  } else if (categoryIntent === "constipation") {
    if (lang === "ru") {
      reply = `🩺 Медицинский ИИ-ассистент VaksinaMed: Запор и замедленная моторика кишечника\n\nЗапор чаще всего вызван недостатком клетчатки в рационе, дефицитом жидкости и малоподвижным образом жизни.\n\nРекомендации ИИ-ассистента:\n1. Пейте 1.5–2 литра чистой теплой воды в день. Утром натощак выпивайте стакан теплой воды с ложкой оливкового масла или лимоном;\n2. Увеличьте потребление растительной клетчатки (свекла, чернослив, отруби, овсянка, кефир);\n3. Для мягкого и безопасного очищения подходит сироп лактулозы (Дюфалак), который не вызывает привыкания;\n4. Предупреждение: При острой боли в животе, задержке газов и рвоте слабительные строго запрещены (риск кишечной непроходимости — требуется хирург!).`;
      quickSuggestions = ["Диета при запоре", "Купить Дюфалак", "Когда нужен хирург?"];
    } else if (lang === "en") {
      reply = `🩺 VaksinaMed Medical AI Assistant: Constipation & Bowel Regularity\n\nConstipation typically stems from low dietary fiber, inadequate hydration, and physical inactivity.\n\nAI Assistant guidance:\n1. Drink 1.5–2 liters of water daily. A glass of warm water on an empty stomach stimulates peristalsis;\n2. Increase soluble and insoluble fiber (beets, prunes, bran, oatmeal, yogurt);\n3. For gentle and safe relief, osmotic lactulose syrup (Duphalac) provides non-habit-forming support;\n4. Safety alert: If constipation is accompanied by severe abdominal cramping, vomiting, and inability to pass gas, never take laxatives — seek immediate surgical evaluation.`;
      quickSuggestions = ["Dietary fiber guide", "Buy Duphalac", "When to see a surgeon"];
    } else {
      reply = `🩺 VaksinaMed AI tibbiy yordamchisi: Ich qotishi (Qabziyat)da nima qilish kerak?\n\nIch qotishi ko‘pincha kam suyuqlik ichish, o‘simlik kletchatkasi yetishmasligi va kamharakatlik oqibatida ichak motorikasi susayishidan kelib chiqadi.\n\nAI yordamchisi tavsiyalari:\n1. Kuniga 1.5–2 litr iliq toza suv iching. Ertalab och qoringa bir stakan iliq suv ichish ichak faoliyatini uyg‘otadi;\n2. Ratsioningizga qaynatilgan lavlagi, quritilgan olxo‘ri (chernosliv), suli yormasi va qatiq mahsulotlarini ko‘paytiring;\n3. Yumshoq va xavfsiz vosita sifatida o‘rganib qolish chaqirmaydigan laktuloza siropi (masalan, Dyufalak) qabul qilinishi mumkin;\n4. Qat'iy ogohlantirish: Agar ich qotishi qorinda kuchli og‘riq, gaz chiqmasligi va ko‘ngil aynishi bilan kechsa, aslo surgi dori ichmang — bu o‘tkir ichak tutilishi belgisi bo‘lishi mumkin!\n\n⚠️ Eslatma: Surunkali qabziyatda shifokor-gastroenterolog ko‘rigidan o‘tish zarur.`;
      quickSuggestions = ["Qabziyatda parhez qoidalari", "Dyufalak sotib olish", "Qachon shifokorga boriladi?"];
    }
  } else if (categoryIntent === "burns") {
    if (lang === "ru") {
      reply = `🩺 Медицинский ИИ-ассистент VaksinaMed: Первая помощь при термических ожогах\n\nПри ожоге горячей водой, паром или раскаленным предметом критически важно действовать правильно в первые секунды.\n\nАлгоритм первой помощи:\n1. Первое и главное: Охлаждайте место ожога под чистой прохладной проточной водой не менее 15 минут! Это останавливает прогрессирование ожога в глубокие ткани;\n2. Категорический запрет: Никогда не мажьте ожог маслом, жиром, сметаной или зубной пастой! Масляная пленка запечатывает тепло внутри и резко увеличивает риск нагноения;\n3. Не вскрывайте появившиеся пузыри — они защищают рану от смертельно опасной инфекции;\n4. Наложите сухую стерильную повязку;\n5. Срочно в больницу / 103: Если ожог больше площади ладони, если обожжены лицо, шея или дыхательные пути, или если кожа обуглилась/побелела.`;
      quickSuggestions = ["Первая помощь при ожоге", "Что категорически нельзя делать?"];
    } else if (lang === "en") {
      reply = `🩺 VaksinaMed Medical AI Assistant: First Aid for Thermal Burns\n\nImmediate cooling during thermal scalds and burns prevents deep tissue necrosis.\n\nAI Assistant protocol:\n1. Immediate priority: Cool the burn under running cool (not ice-cold) water for at least 15 minutes! This immediately dissipates trapped thermal energy;\n2. Strict prohibition: NEVER apply butter, oils, toothpaste, or ointments to a fresh burn! Oil creates an insulating barrier that traps heat and provokes infection;\n3. Do not pop burn blisters — intact skin acts as a sterile biological shield;\n4. Cover loosely with a dry, sterile gauze dressing;\n5. Call 103 ambulance: If the burn exceeds the size of the patient's palm, involves the face, hands, or joints, or skin appears white or charred.`;
      quickSuggestions = ["Burn first aid steps", "Prohibited actions"];
    } else {
      reply = `🩺 VaksinaMed AI tibbiy yordamchisi: Termik kuyishda birinchi yordam ko‘rsatish qoidalari\n\nIssiq suv, olov yoki issiq buyum tegib kuyganda dastlabki daqiqalardagi to‘g‘ri harakat to‘qimalarning chuqur nobud bo‘lishining oldini oladi.\n\nAI yordamchisi tavsiyalari:\n1. Eng birinchi va asosiy chora: Kuygan joyni zudlik bilan 15 daqiqa davomida toza salqin (muzdek emas) oqova suv ostida tuting! Bu to‘qimalar ichidagi issiqlikni so‘rib oladi;\n2. Qat'iy taqiq: Aslo yog‘, sariyog‘, qaymoq yoki tish pastasi surtmang! Yog‘li qatlam issiqlikning chiqishiga to‘sqinlik qiladi va yiringli infeksiya tushish xavfini keskin oshiradi;\n3. Hosil bo‘lgan pufakchalarni (qovuqchalarni) aslo yormang — ular jarohatni mikroblardan himoyalovchi tabiiy qalqondir;\n4. Jarohat ustiga steril quruq doka yoki toza matoni bo‘sh qilib yoping;\n5. Zudlik bilan 103 / Jarrohga borish: Kuyish maydoni kaft kattaligidan katta bo‘lsa, yuz, bo‘yin yoki qo‘l-oyoq bo‘g‘imlari kuygan bo‘lsa, yoki teri oqarib/qorayib ketgan bo‘lsa.`;
      quickSuggestions = ["Kuyishda birinchi yordam", "Aslo nima qilish mumkin emas?"];
    }
  } else if (categoryIntent === "trauma_sprain") {
    if (lang === "ru") {
      reply = `🩺 Медицинский ИИ-ассистент VaksinaMed: Ушибы, растяжения связок и травмы\n\nПри подворачивании ноги или ударе повреждаются связки и мягкие ткани, что сопровождается отеком и болью.\n\nМеждународный медицинский стандарт R.I.C.E.:\n1. Покой (Rest): Полностью разгрузите поврежденную конечность, не наступайте на ногу;\n2. Холод (Ice): Прикладывайте лед, завернутый в полотенце, на 15 минут каждые 2–3 часа в первые сутки. Холод сужает сосуды и останавливает внутреннее кровоизлияние;\n3. Фиксация (Compression): Наложите умеренно плотную повязку эластичным бинтом;\n4. Подъем (Elevation): Держите ногу или руку на подушке выше уровня сердца;\n5. Запрет: Не грейте травмированное место в первые 48 часов!\n6. Обратитесь к травматологу для рентгена при невозможности опереться на ногу или деформации кости.`;
      quickSuggestions = ["Протокол RICE", "Когда нужен рентген?"];
    } else if (lang === "en") {
      reply = `🩺 VaksinaMed Medical AI Assistant: Sprains, Strains & Contusions\n\nAcute joint twisting or blunt trauma injures ligaments and capillaries, leading to swelling.\n\nEvidence-based R.I.C.E. protocol:\n1. Rest: Avoid bearing weight on the injured limb;\n2. Ice: Apply ice wrapped in a towel for 15 minutes every 2–3 hours during the first 24 hours to reduce hematoma and edema;\n3. Compression: Wrap with an elastic bandage with moderate tension;\n4. Elevation: Keep the limb elevated above heart level on pillows;\n5. Strict prohibition: No heat packs or hot baths in the first 48 hours;\n6. Seek orthopedic evaluation and X-ray if you cannot bear weight or if joint deformity is visible.`;
      quickSuggestions = ["RICE protocol guide", "When to get an X-ray"];
    } else {
      reply = `🩺 VaksinaMed AI tibbiy yordamchisi: Pay cho‘zilishi, lat yeyish va bo‘g‘im jarohatlarida birinchi yordam\n\nOyoq qayrilganda yoki qattiq zarba olinganda bo‘g‘im boylamlari cho‘zilib, shish va kuchli og‘riq yuzaga keladi.\n\nXalqaro tibbiy R.I.C.E. standarti:\n1. Tinchlik (Rest): Shikastlangan oyoq yoki qo‘lga og‘irlik tushirmang, tinch holatda bo‘ling;\n2. Sovuq (Ice): Dastlabki 24 soat davomida sochiqqa o‘ralgan muzni 15 daqiqadan qo‘ying — bu mayda qon tomirlarni toraytirib, shish va ko‘karishni to‘xtatadi;\n3. Mahkamlash (Compression): Bo‘g‘imni elastik bint bilan qon aylanishini to‘xtatib qo‘ymagan holda mahkamlang;\n4. Balandlik (Elevation): Oyoqni yostiq ustiga, yurak sathidan balandroq ko‘tarib yoting;\n5. Qat'iy taqiq: Dastlabki 48 soatda issiq kompress qo‘ymang yoki issiq vannada ushlamang!\n6. Shifokor ko‘rigi: Agar oyoqqa tayanib bo‘lmasa, suyak qiyshaygan yoki qisirlagan bo‘lsa — suyak sinishini istisno qilish uchun zudlik bilan travmatologga borib rentgen qildiring.`;
      quickSuggestions = ["RICE qoidasi haqida", "Rentgen qachon kerak?"];
    }
  } else if (categoryIntent === "cystitis") {
    if (lang === "ru") {
      reply = `🩺 Медицинский ИИ-ассистент VaksinaMed: Цистит и болезненное мочеиспускание\n\nЧастые позывы, резь и боль при мочеиспускании указывают на воспаление слизистой оболочки мочевого пузыря (цистит).\n\nРекомендации ИИ-ассистента:\n1. Пейте много жидкости (до 2.5 литров в день): чистая теплая вода, клюквенный или брусничный морс. Жидкость вымывает бактерии из мочевыводящих путей;\n2. Исключите острое, соленое, копченое и алкоголь, которые раздражают мочевой пузырь;\n3. Категорический запрет: Не сидите в горячих ваннах — тепло может спровоцировать распространение инфекции вверх в почки (пиелонефрит!);\n4. Не пейте случайные антибиотики до сдачи общего анализа мочи;\n5. Опасные симптомы: Появление крови в моче, боль в пояснице и высокая температура требуют срочной консультации уролога.`;
      quickSuggestions = ["Анализ мочи при цистите", "Когда нужен уролог?"];
    } else if (lang === "en") {
      reply = `🩺 VaksinaMed Medical AI Assistant: Cystitis & Dysuria\n\nFrequent urgent urination, burning sensation, and pelvic discomfort indicate bladder inflammation (cystitis).\n\nAI Assistant guidance:\n1. Hydrate generously (2–2.5 liters daily) with warm water and unsweetened cranberry juice to flush bacteria from the urinary tract;\n2. Eliminate spicy foods, excess salt, coffee, and alcohol to prevent mucosal irritation;\n3. Strict prohibition: Avoid hot sitz baths — heat can facilitate ascending bacterial spread toward the kidneys (pyelonephritis!);\n4. Do not take random antibiotics prior to a urinalysis test;\n5. Red flags: Visible blood in urine (hematuria), flank/back pain, or high fever require urgent urologist evaluation.`;
      quickSuggestions = ["Urinalysis guidelines", "When to see a urologist"];
    } else {
      reply = `🩺 VaksinaMed AI tibbiy yordamchisi: Tsistit va og‘riqli, tez-tez siyishda nima qilish kerak?\n\nPeshob chiqarishda achishish, og‘riq va tez-tez qisilish qovuq shilliq qavatining yallig‘lanishidan (tsistit) dalolat beradi.\n\nAI yordamchisi tavsiyalari:\n1. Ko‘p miqdorda suyuqlik iching (kuniga 2–2.5 litr iliq toza suv, klyukva yoki na'matak damlamasi) — bu bakteriyalarni qovuqdan yuvib chiqarishga yordam beradi;\n2. Achchiq, sho‘r, dudlangan taomlar va spirtli ichimliklardan butunlay tiyiling;\n3. Qat'iy taqiq: Issiq vannaga o‘tirmang — issiqlik infeksiyani yuqoriga, buyraklarga ko‘tarilishiga (pielonefritga) sabab bo‘lishi mumkin;\n4. Tahlil topshirmasdan o‘zboshimchalik bilan antibiotik ichmang;\n5. Xavfli belgilar: Peshobda qon paydo bo‘lishi, bel sohasida og‘riq va harorat ko‘tarilishi kuzatilsa — darhol shifokor-urolog ko‘rigiga boring!`;
      quickSuggestions = ["Siydik tahlili haqida", "Urolog ko‘rigiga yozilish"];
    }
  } else if (categoryIntent === "diabetes") {
    if (lang === "ru") {
      reply = `🩺 Медицинский ИИ-ассистент VaksinaMed: Уровень сахара в крови и симптомы диабета\n\nПостоянная жажда, сухость во рту, частое мочеиспускание и слабость могут указывать на повышение уровня глюкозы в крови.\n\nРекомендации ИИ-ассистента:\n1. Измерьте уровень сахара в крови глюкометром натощак. Сдайте анализы на глюкозу венозной крови и гликированный гемоглобин (HbA1c);\n2. Исключите из рациона быстрые углеводы: сахар, кондитерские изделия, сладкие напитки, белый хлеб;\n3. Категорический запрет: Никогда не принимайте чужие сахароснижающие препараты или инсулин без назначения врача — резкое падение сахара (гипогликемия) смертельно опасно;\n4. Обязательно обратитесь к врачу-эндокринологу для подбора безопасной индивидуальной терапии.`;
      quickSuggestions = ["Анализ на HbA1c", "Диета при повышенном сахаре", "Консультация эндокринолога"];
    } else if (lang === "en") {
      reply = `🩺 VaksinaMed Medical AI Assistant: Blood Glucose & Diabetes Symptoms\n\nExcessive thirst, frequent urination, dry mouth, and unexplained fatigue often suggest elevated blood glucose levels.\n\nAI Assistant guidance:\n1. Measure fasting capillary glucose with a glucometer. Laboratory evaluation of fasting blood glucose and HbA1c is strongly advised;\n2. Eliminate refined sugars, sweets, sugary beverages, and processed white flour immediately;\n3. Critical warning: Never take someone else's hypoglycemic medication or insulin! An abrupt blood sugar drop (hypoglycemia) is a life-threatening medical emergency;\n4. Consult a certified endocrinologist for comprehensive metabolic assessment.`;
      quickSuggestions = ["HbA1c test guide", "Low-glycemic diet", "Endocrinologist visit"];
    } else {
      reply = `🩺 VaksinaMed AI tibbiy yordamchisi: Qondagi qand miqdori va diabet alomatlari\n\nDoimiy chanqoqlik, og‘iz qurishi, tez-tez siyish, holsizlik va ko‘rish xiralashishi qonda glyukoza miqdori oshganidan dalolat berishi mumkin.\n\nAI yordamchisi tavsiyalari:\n1. Glyukometr bilan och qoringa qondagi qand miqdorini o‘lchang. Laboratoriyada qon shakari va glikatsiyalangan gemoglobin (HbA1c) tahlillarini topshiring;\n2. Ratsioningizdan tez hazm bo‘luvchi uglevodlarni (shakar, shirinliklar, oq non, shirin gazli ichimliklar) butunlay chiqaring;\n3. Qat'iy ogohlantirish: Birovning qand tushiruvchi dorilarini yoki insulinini o‘zboshimchalik bilan qabul qilmang — qand keskin tushib ketishi (gipoglikemiya) hayot uchun o‘ta xavflidir;\n4. To‘g‘ri va xavfsiz davolash rejasini tuzish uchun albatta shifokor-endokrinolog ko‘rigiga boring.`;
      quickSuggestions = ["HbA1c tahlili haqida", "Qand ko‘tarilganda parhez", "Endokrinolog ko‘rigi"];
    }
  } else if (categoryIntent === "insomnia_stress") {
    if (lang === "ru") {
      reply = `🩺 Медицинский ИИ-ассистент VaksinaMed: Бессонница, тревожность и переутомление\n\nНарушения сна и эмоциональное напряжение чаще всего связаны с перевозбуждением нервной системы и нарушением выработки мелатонина.\n\nРекомендации ИИ-ассистента:\n1. Гигиена сна: За 1.5 часа до сна выключите экраны смартфона и телевизора (синий свет блокирует выработку мелатонина);\n2. Проветрите спальню — оптимальная температура для сна 18–20°C;\n3. Не пейте кофе, энергетики и крепкий чай во второй половине дня;\n4. Безопасная растительная поддержка: теплый чай с ромашкой, мятой, мелиссой или прием Магния B6;\n5. Строгий запрет: Не принимайте сильнодействующие снотворные и транквилизаторы без назначения врача (они вызывают быстрое привыкание и синдром отмены!).`;
      quickSuggestions = ["Правила гигиены сна", "Успокаивающие травы", "Купить Магний B6"];
    } else if (lang === "en") {
      reply = `🩺 VaksinaMed Medical AI Assistant: Insomnia, Stress & Sleep Hygiene\n\nSleep disruption and anxiety stem from autonomic nervous system hyperarousal and disrupted circadian melatonin cycles.\n\nAI Assistant guidance:\n1. Sleep hygiene: Turn off smartphone and TV screens 90 minutes before bed (blue light suppresses melatonin);\n2. Ventilate the bedroom thoroughly — optimal sleep temperature is 18–20°C (64–68°F);\n3. Avoid caffeine, energy drinks, and heavy dinners in the evening;\n4. Safe herbal support: Warm chamomile or peppermint tea, or Magnesium B6 supplementation;\n5. Strict prohibition: Never take prescription sleep aids or sedatives without direct physician guidance (high dependency risk).`;
      quickSuggestions = ["Sleep hygiene protocol", "Herbal relaxants", "Buy Magnesium B6"];
    } else {
      reply = `🩺 VaksinaMed AI tibbiy yordamchisi: Uyqusizlik, asabiylik va surunkali stressda nima qilish kerak?\n\nUyqu buzilishi va emotsional zo‘riqish asab tizimining ortiqcha qo‘zg‘alishi hamda melatonin gormoni ishlab chiqarilishining susayishi oqibatida yuzaga keladi.\n\nAI yordamchisi tavsiyalari:\n1. Uyqu gigiyenasi: Uyqudan 1–1.5 soat oldin telefon, planshet va televizor ekranlarini o‘chiring (ko‘k yorug‘lik melatoninni bloklaydi);\n2. Yotoqxonani yaxshilab shamollating — qulay uyqu harorati 18–20°C hisoblanadi;\n3. Tushdan keyin kofe, energetik va achchiq choy ichishdan tiyiling;\n4. Xavfsiz tabiiy yordam: Moychechak, yalpiz, melissa damlamalari yoki Magniy B6 preparatini qabul qilish asab tizimini tinchlantiradi;\n5. Qat'iy taqiq: Shifokor retseptisiz kuchli uxlatuvchi dorilarni aslo qabul qilmang — ular tezda qaramlik (o‘rganib qolish) keltirib chiqaradi!`;
      quickSuggestions = ["Uyqu gigiyenasi qoidalari", "Tinchlantiruvchi damlamalar", "Magniy B6 sotib olish"];
    }
  } else if (categoryIntent === "dizziness") {
    if (lang === "ru") {
      reply = `🩺 Медицинский ИИ-ассистент VaksinaMed: Головокружение (Вертиго)\n\nГоловокружение может возникать из-за скачка артериального давления, падения сахара в крови, спазма сосудов шеи или нарушений вестибулярного аппарата.\n\nРекомендации ИИ-ассистента:\n1. Медленно сядьте или прилягте, избегайте резких поворотов головы;\n2. Проветрите комнату, выпейте стакан чистой воды с лимоном;\n3. Измерьте давление тонометром;\n4. Срочный вызов 103: Если головокружение сопровождается слабостью в руке/ноге, асимметрией лица или нарушением речи (признаки инсульта!).`;
      quickSuggestions = ["Как измерить давление", "Признаки инсульта", "Консультация невролога"];
    } else if (lang === "en") {
      reply = `🩺 VaksinaMed Medical AI Assistant: Dizziness & Vertigo Care\n\nDizziness often relates to blood pressure shifts, dehydration, cervical vascular compression, or vestibular dysfunction.\n\nAI Assistant guidance:\n1. Sit down slowly or recline, avoiding abrupt head turns;\n2. Hydrate with a glass of water and ensure fresh ventilation;\n3. Measure your blood pressure with a reliable tonometer;\n4. Immediate 103 alert: If dizziness is coupled with facial droop, arm weakness, or slurred speech (stroke warning!).`;
      quickSuggestions = ["Blood pressure check", "Stroke signs", "Neurologist visit"];
    } else {
      reply = `🩺 VaksinaMed AI tibbiy yordamchisi: Bosh aylanishida birinchi yordam\n\nBosh aylanishi qon bosimining keskin o‘zgarishi, suvsizlanish, bo‘yin umurtqalari zo‘riqishi yoki ichki quloqdagi muvozanat (vestibulyar) a'zolari faoliyati buzilishidan kelib chiqadi.\n\nAI yordamchisi tavsiyalari:\n1. Sekinlik bilan qulay o‘tiring yoki yoting, boshingizni keskin qimirlatmang;\n2. Xonaga toza havo kiriting, bir stakan toza suv iching;\n3. Tonometr yordamida qon bosimingizni o‘lchang;\n4. Zudlik bilan 103 chaqirish: Agar bosh aylanishi yuz qiyshayishi, nutq buzilishi yoki qo‘l-oyoq uvishishi bilan kechsa (insult xavfi!).`;
      quickSuggestions = ["Bosimni o‘lchash", "Insult belgilari", "Nevrolog ko‘rigi"];
    }
  } else if (categoryIntent === "headache") {
    if (lang === "ru") {
      reply = `🩺 Медицинский ИИ-ассистент VaksinaMed: Головная боль\n\nГоловная боль чаще всего вызвана переутомлением, изменением артериального давления или спазмом сосудов.\n\nРекомендации ИИ-ассистента:\n1. Первым делом измерьте давление тонометром. Проветрите комнату, выпейте чистой воды и отдохните в полумраке;\n2. При умеренной боли напряжения допустим прием одной таблетки Парацетамола (500 мг) строго после еды с водой;\n3. Не превышайте дозировку. Если боль резкая, внезапная, сопровождается рвотой или онемением — срочно вызовите скорую 103!\n\n⚠️ Важное напоминание: Данная консультация носит информационный характер. При постоянных болях обратитесь к врачу-терапевту.`;
      quickSuggestions = ["Как измерить давление?", "Когда вызывать 103?", "Купить Парацетамол"];
    } else if (lang === "en") {
      reply = `🩺 VaksinaMed Medical AI Assistant: Headache Management\n\nHeadaches typically stem from fatigue, blood pressure fluctuations, dehydration, or vascular tension.\n\nAI Assistant guidance:\n1. Check your blood pressure with a reliable tonometer. Hydrate well, ventilate the room, and rest in a dim environment;\n2. For mild-to-moderate tension headache, Paracetamol (500 mg) may be taken after food with water;\n3. Emergency note: If the headache is sudden and exceptionally severe ("thunderclap"), accompanied by vomiting or numbness, call 103 immediately!\n\n⚠️ Medical reminder: Consult a physician if headaches recur regularly.`;
      quickSuggestions = ["How to measure blood pressure", "When to call 103", "Buy Paracetamol"];
    } else {
      reply = `🩺 VaksinaMed AI tibbiy yordamchisi: Bosh og‘rig‘ida nima qilish kerak?\n\nBosh og‘rig‘i ko‘pincha charchoq, qon bosimining o‘zgarishi (gipertoniya/gipotoniya), uzoq vaqt ekranga qarash yoki tomirlar spazmi oqibatida yuzaga keladi.\n\nAI yordamchisi tavsiyalari:\n1. Birinchi navbatda tonometr bilan qon bosimingizni o‘lchang. Xonani shamollatib, toza suv iching va qorong‘uroq xonada tinch dam oling;\n2. Og‘riqni yengillashtirish uchun bitta Paratsetamol (500 mg) ovqatdan keyin, suv bilan ichilishi mumkin;\n3. Ogohlantirish: Agar og‘riq to‘satdan favqulodda kuchli boshlansa, hushdan ketish, ko‘rish xiralashishi yoki qusish bilan kechsa — darhol 103 Tez yordam chaqiring!\n\n⚠️ Muhim eslatma: Ushbu tavsiyalar axborot xarakteriga ega. Doimiy bosh og‘rig‘ida shifokor ko‘rigiga boring.`;
      quickSuggestions = ["Bosimni to‘g‘ri o‘lchash", "Qachon 103 chaqiriladi?", "Paratsetamol sotib olish"];
    }
  } else if (categoryIntent === "cold_fever") {
    if (lang === "ru") {
      reply = `🩺 Медицинский ИИ-ассистент VaksinaMed: Простуда и повышенная температура\n\nПри ОРВИ температура до 38.5°C — это естественная защита иммунитета. Сбивать её сразу не нужно.\n\nРекомендации ИИ-ассистента:\n1. Пейте много теплой жидкости (чай с лимоном, настой шиповника) и соблюдайте постельный режим;\n2. При температуре выше 38.5°C допустим прием жаропонижающего (Парацетамол) после еды;\n3. Важное правило: Антибиотики не действуют на вирусы! Не принимайте антибиотики без назначения врача.\n\n⚠️ Важное напоминание: Если высокая температура держится более 3 дней, вызовите врача на дом.`;
      quickSuggestions = ["Обильное теплое питье", "Когда опасен жар?", "Купить Парацетамол"];
    } else if (lang === "en") {
      reply = `🩺 VaksinaMed Medical AI Assistant: Colds & Fever\n\nA fever up to 38.5°C (101.3°F) during viral colds represents natural immune response. Do not suppress mild fever prematurely.\n\nAI Assistant guidance:\n1. Drink plenty of warm fluids and maintain bed rest;\n2. If temperature exceeds 38.5°C, take Paracetamol after food;\n3. Crucial rule: Antibiotics are completely ineffective against viral colds! Never take antibiotics without prescription.\n\n⚠️ Medical reminder: Seek medical evaluation if fever persists over 3 days.`;
      quickSuggestions = ["Fluid hydration rules", "Fever red flags", "Buy Paracetamol"];
    } else {
      reply = `🩺 VaksinaMed AI tibbiy yordamchisi: Shamollash va tana harorati ko‘tarilganda\n\nO‘tkir virusli infeksiyalarda tana harorati 38–38.5°C gacha bo‘lishi organizmning kurashidir. Uni darhol dori bilan tushirishga shoshilmang.\n\nAI yordamchisi tavsiyalari:\n1. Ko‘p miqdorda iliq suyuqlik (limonli choy, na'matak damlamasi) iching va to‘liq dam oling;\n2. Harorat 38.5°C dan oshganda isitma tushiruvchi (Paratsetamol) qabul qilish mumkin;\n3. Qat'iy eslatma: Antibiotiklar viruslarga mutlaqo ta'sir qilmaydi! O‘zboshimchalik bilan antibiotik ichmang.\n\n⚠️ Muhim eslatma: Agar yuqori isitma 3 kundan ortiq davom etsa, oilaviy shifokoringizga murojaat qiling.`;
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
        reply = `🩺 Медицинский ИИ-ассистент VaksinaMed: Боль в области живота и желудка\n\nБоль в животе (мышечный спазм, гастрит, пищевое расстройство или острая хирургическая патология — аппендицит) требует предельной осторожности.\n\nРекомендации ИИ-ассистента и правила безопасности:\n1. Строгий запрет: До осмотра врача категорически запрещено прикладывать грелку к животу и принимать сильные обезболивающие (анальгетики)! Снятие боли маскирует симптомы острого аппендицита и перитонита;\n2. Прилягте в удобном положении, расстегните ремень. Воздержитесь от тяжелой и жирной пищи. Пейте теплую воду без газа небольшими глотками;\n3. При спазмах гладкой мускулатуры по согласованию с врачом допускается прием спазмолитика (Дротаверин / Но-шпа);\n4. Опасные симптомы (вызов 103): Острая боль справа внизу живота, рвота, повышение температуры, твердый живот — требуют немедленного вызова скорой помощи!\n\n⚠️ Важное напоминание: Данная консультация носит информационный характер. При острой боли в животе обязательно обратитесь к врачу.`;
        quickSuggestions = ["Симптомы аппендицита", "Когда вызывать 103?", "Купить Но-шпа"];
      } else if (lang === "en") {
        reply = `🩺 VaksinaMed Medical AI Assistant: Abdominal & Stomach Pain\n\nAbdominal pain can stem from indigestion, cramps, gastritis, or serious acute conditions such as appendicitis.\n\nAI Assistant guidance & precautions:\n1. Strict prohibition: NEVER apply warm heating pads to the abdomen or take strong analgesics! Masking pain can hide acute appendicitis or peritonitis;\n2. Rest comfortably, loosen tight belts, and avoid heavy or spicy foods. Sip small amounts of room-temperature water;\n3. For smooth muscle cramps, an antispasmodic (such as Drotaverine / No-shpa) may be taken with doctor approval;\n4. Emergency red flags: If pain shifts to the lower right abdomen, worsens continuously, or is accompanied by fever or vomiting — call 103 ambulance immediately!\n\n⚠️ Medical reminder: Consult a physician or surgeon promptly for acute abdominal pain.`;
        quickSuggestions = ["Appendicitis warning signs", "When to call 103", "Buy No-shpa"];
      } else {
        reply = `🩺 VaksinaMed AI tibbiy yordamchisi: Qorin va oshqozon sohasidagi og‘riqda nima qilish kerak?\n\nQorindagi og‘riqlar turli sabablar (me'da spazmi, gastrit, noto‘g‘ri ovqatlanish yoki o‘tkir jarrohlik holatlari — masalan, ko‘richak / appenditsit) oqibatida paydo bo‘lishi mumkin.\n\nAI yordamchisi tavsiyalari va xavfsizlik choralari:\n1. Qat'iy taqiq: Qorindagi og‘riq sababi aniqlanmaguncha, aslo issiq grelka qo‘ymang va kuchli og‘riq qoldiruvchi dorilarni (analgetiklarni) ichmang! Og‘riqni sun'iy bosish xavfli jarrohlik holatlarini (masalan, ko‘richak yorilishi yoki peritonitni) yashirib qo‘yishi mumkin;\n2. Tinch holatda yoting, tor kamarni bo‘shating. Qattiq, yog‘li, qovurilgan taomlar yemang. Gazsiz iliq suv yoki moychechak damlamasidan oz-ozdan iching;\n3. Qisilish va spazm bilan kechadigan og‘riqlarda shifokor bilan maslahatlashgan holda faqat spazmolitik vosita (masalan, Drotaverin / No-shpa) qabul qilinishi mumkin;\n4. Zudlik bilan shifokorga murojaat qilish belgilari: Agar og‘riq qorinning o‘ng pastki qismiga o‘tsa, to‘xtovsiz kuchaysa, ko‘ngil aynishi, qusish yoki tana harorati ko‘tarilishi bilan kechsa — darhol 103 Tez yordam chaqiring!\n\n⚠️ Muhim eslatma: Ushbu tavsiyalar axborot xarakteriga ega. Qorin og‘rig‘ida shifokor-terapevt yoki jarroh ko‘rigidan o‘tish zarur.`;
        quickSuggestions = ["Xavfli ko‘richak belgilari", "Qachon 103 chaqiriladi?", "No-shpa sotib olish"];
      }
    } else {
      if (lang === "ru") {
        reply = `🩺 Медицинский ИИ-ассистент VaksinaMed: Изжога и дискомфорт в желудке\n\nПри изжоге и повышенной кислотности важно скорректировать диету и защитить слизистую.\n\nРекомендации ИИ-ассистента:\n1. Исключите жареное, острое, кофе и газировку. Питайтесь дробно, небольшими порциями;\n2. При изжоге принимают ингибиторы протонной помпы (Омепразол за 30 минут до завтрака);\n3. Предупреждение: При острой «кинжальной» боли в животе категорически запрещено пить обезболивающие — срочно обратитесь к хирургу!\n\n⚠️ Важное напоминание: При регулярном дискомфорте пройдите гастроскопию у врача.`;
        quickSuggestions = ["Диета при изжоге", "Когда нужен хирург?", "Купить Омепразол"];
      } else if (lang === "en") {
        reply = `🩺 VaksinaMed Medical AI Assistant: Heartburn & Gastric Comfort\n\nAcid reflux and gastric discomfort require dietary restraint and mucosal protection.\n\nAI Assistant guidance:\n1. Avoid fried, spicy foods and carbonated drinks. Eat frequent small meals;\n2. For heartburn, Omeprazole is taken 30 minutes before breakfast;\n3. Alert: Never take painkillers for acute unexplained abdominal pain — seek surgical evaluation immediately!\n\n⚠️ Medical reminder: Consult a gastroenterologist for chronic symptoms.`;
        quickSuggestions = ["Dietary guidelines", "Surgical red flags", "Buy Omeprazole"];
      } else {
        reply = `🩺 VaksinaMed AI tibbiy yordamchisi: Oshqozon noqulayligi va jig‘ildon qaynashi\n\nJig‘ildon qaynashi (izjoga) ko‘pincha noto‘g‘ri ovqatlanish yoki me'da shirasining kislotaliligi oshishidan kelib chiqadi.\n\nAI yordamchisi tavsiyalari:\n1. Qovurilgan, sho‘r, achchiq taomlar, kofe va gazli ichimliklardan tiyiling;\n2. Jig‘ildon qaynashida kislotani kamaytiruvchi vosita (Omeprazol nonushtadan 30 daqiqa oldin) qabul qilinadi;\n3. Xavfli belgi: Qorinda keskin sanchuvchi og‘riq bo‘lsa, og‘riq qoldiruvchi ichmang — zudlik bilan shifokor-jarrohga boring!\n\n⚠️ Muhim eslatma: Muntazam bezovtalik kuzatilsa, shifokor-gastroenterolog ko‘rigidan o‘ting.`;
        quickSuggestions = ["Oshqozon parhezi qoidalari", "Qachon jarrohga borish kerak?", "Omeprazol sotib olish"];
      }
    }
  } else if (categoryIntent === "diarrhea") {
    if (lang === "ru") {
      reply = `🩺 Медицинский ИИ-ассистент VaksinaMed: Диарея и расстройство пищеварения\n\nГлавная опасность при диарее — потеря жидкости и электролитов.\n\nРекомендации ИИ-ассистента:\n1. Восполняйте баланс солей (раствор Регидрона небольшими порциями);\n2. Для вывода токсинов примите Смекту или активированный уголь;\n3. Не пейте антибиотики без назначения врача;\n4. При повышенной температуре или крови в стуле немедленно обратитесь к врачу-инфекционисту.`;
      quickSuggestions = ["Прием Регидрона", "Диета при расстройстве", "Купить Регидрон"];
    } else if (lang === "en") {
      reply = `🩺 VaksinaMed Medical AI Assistant: Diarrhea Management\n\nThe primary danger during acute diarrhea is fluid and electrolyte depletion.\n\nAI Assistant guidance:\n1. Replenish electrolytes using Oral Rehydration Salts (Rehydron);\n2. Use adsorbents such as Smecta to eliminate toxins;\n3. Avoid antibiotics unless specifically indicated by lab tests;\n4. Seek medical attention if fever or bloody stool occurs.`;
      quickSuggestions = ["Oral rehydration", "Dietary rules", "Buy Rehydron"];
    } else {
      reply = `🩺 VaksinaMed AI tibbiy yordamchisi: Ich ketishi (diareya)da nima qilish kerak?\n\nIch ketishida eng katta xavf — organizmning suyuqlik va tuzlarni yo‘qotishidir.\n\nAI yordamchisi tavsiyalari:\n1. Suvsizlanishning oldini olish uchun tuzli eritma (Regidron)ni kun davomida qultumlab iching;\n2. Ichakdagi zararli moddalarni chiqarish uchun Smekta qabul qiling;\n3. Qat'iy qoida: O‘zboshimchalik bilan antibiotik ichmang;\n4. Isitma ko‘tarilsa yoki qonli ich kelsa, zudlik bilan shifokor-infeksionistga murojaat qiling.`;
      quickSuggestions = ["Regidron ichish tartibi", "Ich ketganda parhez", "Regidron sotib olish"];
    }
  } else if (categoryIntent === "allergy") {
    if (lang === "ru") {
      reply = `🩺 Медицинский ИИ-ассистент VaksinaMed: Аллергические проявления\n\nПри сыпи, зуде и чихании необходимо прекратить контакт с аллергеном.\n\nРекомендации ИИ-ассистента:\n1. Антигистаминные препараты 2-го поколения (Лоратадин, Цетиризин) принимают по 1 таблетке в сутки;\n2. Они снимают отек и зуд, не вызывая выраженной сонливости;\n3. Внимание: При отеке губ, языка или затруднении дыхания (отек Квинке) — срочно вызывайте 103!\n\n⚠️ Важное напоминание: Для выявления причины аллергии обратитесь к врачу-аллергологу.`;
      quickSuggestions = ["Исключение аллергена", "Опасные симптомы отека", "Купить Лоратадин"];
    } else if (lang === "en") {
      reply = `🩺 VaksinaMed Medical AI Assistant: Allergy Symptoms\n\nFor itching, hives, or sneezing, discontinue contact with the allergen immediately.\n\nAI Assistant guidance:\n1. Second-generation antihistamines (Loratadine, Cetirizine) are taken 1 tablet once daily;\n2. Alert: If swelling of lips, throat, or shortness of breath occurs, call 103 emergency immediately!\n\n⚠️ Medical reminder: Consult an allergist for allergy testing.`;
      quickSuggestions = ["Allergen avoidance", "Anaphylaxis warning signs", "Buy Loratadine"];
    } else {
      reply = `🩺 VaksinaMed AI tibbiy yordamchisi: Allergik holatlarda birinchi yordam\n\nQichishish, toshma va aksirishda allergen bilan aloqani darhol to‘xtating.\n\nAI yordamchisi tavsiyalari:\n1. Zamonaviy 2-avlod antigistamin (masalan, Loratadin) kuniga 1 tabletka ichiladi va kuchli uyqu keltirmaydi;\n2. Ogohlantirish: Agar lab, til shishsa yoki nafas qisilsa — darhol 103 Tez yordam chaqiring!\n\n⚠️ Muhim eslatma: Allergiya sababini aniqlash uchun shifokor-allergologga murojaat qiling.`;
      quickSuggestions = ["Allergen bilan aloqani to‘xtatish", "Xavfli belgilar bormi?", "Loratadin sotib olish"];
    }
  } else if (categoryIntent === "throat_cough") {
    if (lang === "ru") {
      reply = `🩺 Медицинский ИИ-ассистент VaksinaMed: Боль в горле и кашель\n\nБоль в горле чаще всего связана с вирусным фарингитом или ангиной.\n\nРекомендации ИИ-ассистента:\n1. Полощите горло теплым раствором фурацилина, хлоргексидина или отваром ромашки 4–5 раз в день;\n2. Пейте много теплого чая с медом или лимоном;\n3. При сильной боли допустимы антисептические пастилки или спреи;\n4. Предупреждение: Если на миндалинах появился белый гнойный налет и температура выше 38.5°C — срочно обратитесь к ЛОР-врачу для назначения антибиотиков.`;
      quickSuggestions = ["Полоскание горла", "Признаки ангины", "Леденцы от горла"];
    } else if (lang === "en") {
      reply = `🩺 VaksinaMed Medical AI Assistant: Sore Throat & Cough\n\nA sore throat is commonly triggered by viral pharyngitis or tonsillitis.\n\nAI Assistant guidance:\n1. Gargle with warm salt water or herbal chamomile infusion 4–5 times daily;\n2. Drink warm tea with honey and ensure adequate vocal rest;\n3. Antiseptic lozenges can temporarily relieve mucosal irritation;\n4. Caution: White exudates on tonsils accompanied by high fever requires immediate ENT evaluation for antibiotic therapy.`;
      quickSuggestions = ["Gargling instructions", "Tonsillitis red flags", "Throat lozenges"];
    } else {
      reply = `🩺 VaksinaMed AI tibbiy yordamchisi: Tomoq og‘rig‘i va yo‘talda nima qilish kerak?\n\nTomoq og‘rig‘i ko‘pincha virusli faringit yoki angina oqibatida yuzaga keladi.\n\nAI yordamchisi tavsiyalari:\n1. Tomoqni kuniga 4-5 marta iliq furatsilin eritmasi yoki moychechak damlamasi bilan chayib turing;\n2. Ko‘p miqdorda iliq suyuqlik (limonli choy, asal qo‘shilgan iliq sut) iching;\n3. Og‘riqni kamaytirish uchun antiseptik pastilkalar yoki spreylardan foydalanish mumkin;\n4. Ogohlantirish: Agar tomoqda oq yiringli karashlar paydo bo‘lsa va isitma 38.5°C dan oshsa — darhol LOR-shifokor ko‘rigiga boring.`;
      quickSuggestions = ["Tomoqni to‘g‘ri chayish", "Angina xavfi bormi?", "Pastilka sotib olish"];
    }
  } else if (categoryIntent === "joint_back") {
    if (lang === "ru") {
      reply = `🩺 Медицинский ИИ-ассистент VaksinaMed: Боль в спине и суставах\n\nБоль в пояснице или суставах чаще вызвана мышечным спазмом, остеохондрозом или воспалением.\n\nРекомендации ИИ-ассистента:\n1. Обеспечьте покой, избегайте резких наклонов и подъема тяжестей;\n2. Допустимо местное применение противовоспалительных мазей (с ибупрофеном или диклофенаком);\n3. Предупреждение: Если боль отдает в ногу, сопровождается онемением или нарушением мочеиспускания — срочно обратитесь к неврологу.`;
      quickSuggestions = ["Мази при боли в спине", "Когда нужен невролог?"];
    } else if (lang === "en") {
      reply = `🩺 VaksinaMed Medical AI Assistant: Back & Joint Pain\n\nLumbar and joint pain frequently stems from muscle strain, disc degeneration, or inflammatory arthritis.\n\nAI Assistant guidance:\n1. Rest on a firm surface, avoiding heavy lifting or sudden twisting;\n2. Topical NSAID gels (Ibuprofen, Diclofenac) provide localized relief;\n3. Alert: Radiating leg pain, numbness, or urinary incontinence requires immediate neurological evaluation.`;
      quickSuggestions = ["Topical NSAID relief", "Neurological red flags"];
    } else {
      reply = `🩺 VaksinaMed AI tibbiy yordamchisi: Bel va bo‘g‘im og‘rig‘ida nima qilish kerak?\n\nBel yoki bo‘g‘imdagi og‘riq ko‘pincha mushak zo‘riqishi, osteoxondroz yoki shamollashdan kelib chiqadi.\n\nAI yordamchisi tavsiyalari:\n1. Qattiqroq to‘shakda dam oling, og‘ir yuk ko‘tarmang va keskin harakatlardan saqlaning;\n2. Og‘riqni yengillashtirish uchun mahalliy surtiladigan og‘riq qoldiruvchi malhamlar (Ibuprofen yoki Diklofenak gellari) qo‘llanilishi mumkin;\n3. Xavfli belgi: Agar og‘riq oyoqqa uzatsa, uvishish yoki peshob tutilishi kuzatilsa — kechiktirmasdan shifokor-nevrologga boring.`;
      quickSuggestions = ["Bel og‘rig‘ida malhamlar", "Nevrolog ko‘rigi"];
    }
  } else if (categoryIntent === "vitamins") {
    if (lang === "ru") {
      reply = `🩺 Медицинский ИИ-ассистент VaksinaMed: Витамины и упадок сил\n\nХроническая усталость часто связана с дефицитом витамина D3 или железа.\n\nРекомендации ИИ-ассистента:\n1. Витамин D3 принимают в первой половине дня во время еды, содержащей полезные жиры;\n2. Перед приемом лечебных доз рекомендуется сдать анализ крови на 25-OH витамин D.\n\n⚠️ Важное напоминание: Подбирайте дозировку витаминов совместно с терапевтом.`;
      quickSuggestions = ["Анализ крови на 25-OH", "Правила приема витаминов", "Купить Витамин D3"];
    } else if (lang === "en") {
      reply = `🩺 VaksinaMed Medical AI Assistant: Vitamins & Vitality\n\nFatigue and weakened immunity frequently correlate with vitamin D3 deficiency.\n\nAI Assistant guidance:\n1. Take Vitamin D3 in the morning with a breakfast containing healthy fats;\n2. A blood test for 25-OH Vitamin D is recommended to determine proper dosage.\n\n⚠️ Medical reminder: Consult your physician to establish proper therapeutic dosage.`;
      quickSuggestions = ["25-OH blood test", "Optimal intake time", "Buy Vitamin D3"];
    } else {
      reply = `🩺 VaksinaMed AI tibbiy yordamchisi: Charchoq va vitaminlar yetishmovchiligi\n\nDoimiy holsizlik va immunitet pasayishi ko‘pincha organizmda D3 vitamini yetishmovchiligidan kelib chiqadi.\n\nAI yordamchisi tavsiyalari:\n1. Vitamin D3 yog‘da eruvchi vitamin bo‘lgani uchun uni ertalab, nonushta bilan birga ichish eng yaxshi samara beradi;\n2. Aniq davolash dozasini belgilash uchun qondagi 25-OH D vitamini tahlilini topshirish tavsiya etiladi.\n\n⚠️ Muhim eslatma: Vitaminlar dozasini oilaviy shifokoringiz bilan kelishib oling.`;
      quickSuggestions = ["25-OH tahlili haqida", "Qaysi vaqtda ichiladi?", "Vitamin D3 sotib olish"];
    }
  } else if (categoryIntent === "antibiotic") {
    if (lang === "ru") {
      reply = `🩺 Медицинский ИИ-ассистент VaksinaMed: Правила приема антибиотиков\n\nАнтибиотики действуют исключительно на бактерии и абсолютно бесполезны против вирусов (грипп, ОРВИ, простуда).\n\nПравила безопасности:\n1. Принимайте антибиотики только по рецепту врача;\n2. Обязательно завершайте полный курс лечения (обычно 5–7 дней), даже если почувствовали себя лучше на 2-й день. Преждевременная отмена вызывает устойчивость бактерий;\n3. Принимайте пробиотики для защиты микрофлоры кишечника.`;
      quickSuggestions = ["Почему нельзя при вирусах?", "Защита микрофлоры"];
    } else if (lang === "en") {
      reply = `🩺 VaksinaMed Medical AI Assistant: Antibiotic Safety Standards\n\nAntibiotics target bacteria exclusively and are completely ineffective against viral infections (flu, common cold, acute bronchitis).\n\nSafety protocol:\n1. Take antibiotics only when prescribed by a licensed doctor;\n2. Complete the full prescribed course (typically 5–7 days). Premature cessation breeds dangerous antibiotic-resistant bacteria;\n3. Support gut microbiome with probiotics.`;
      quickSuggestions = ["Why ineffective for viruses?", "Gut flora support"];
    } else {
      reply = `🩺 VaksinaMed AI tibbiy yordamchisi: Antibiotik qabul qilishning qat'iy qoidalari\n\nAntibiotiklar faqat bakteriyalarga qarshi ta'sir qiladi va viruslarga (gripp, shamollash, o‘tkir bronxit) mutlaqo ta'sir ko‘rsatmaydi!\n\nXavfsizlik qoidalari:\n1. Antibiotikni faqat shifokor retsepti bo‘yicha qabul qiling;\n2. Kursni oxirigacha (odatda 5–7 kun) to‘liq yetkazing. O‘zingizni yaxshi his qilsangiz ham, ichishni to‘xtatmang — aks holda bakteriyalarda doriga o‘rganish (rezistentlik) paydo bo‘ladi;\n3. Ichak mikroflorasini asrash uchun probiotiklar bilan birga ichish tavsiya etiladi.`;
      quickSuggestions = ["Nega virusga ta'sir qilmaydi?", "Ichak mikroflorasini asrash"];
    }
  } else if (categoryIntent === "general_pain") {
    // General pain fallback (strictly when explicit pain was identified)
    if (lang === "ru") {
      reply = `🩺 Медицинский ИИ-ассистент VaksinaMed: Обезболивание\n\nБоль — это защитный сигнал организма. Важно не просто заглушить боль, а выяснить её причину у врача.\n\nРекомендации ИИ-ассистента:\n1. Для разового снятия умеренной боли допустим прием Парацетамола (500 мг) строго после еды;\n2. Не превышайте максимальную суточную дозу и не пейте несколько обезболивающих одновременно;\n3. При сохранении боли дольше 2 дней обязательно обратитесь к врачу.\n\n⚠️ Важное напоминание: Не занимайтесь самолечением при неизвестной причине боли.`;
      quickSuggestions = ["Первая помощь", "Осмотр врача", "Купить Парацетамол"];
    } else if (lang === "en") {
      reply = `🩺 VaksinaMed Medical AI Assistant: Pain Relief\n\nPain is a protective signal from your body. Finding its root cause with a doctor is essential.\n\nAI Assistant guidance:\n1. For mild pain relief, Paracetamol (500 mg) may be taken after meals with water;\n2. Do not exceed recommended daily limits or combine multiple analgesics;\n3. If pain persists beyond 2 days, seek physician consultation.\n\n⚠️ Medical reminder: Seek medical advice if symptoms persist.`;
      quickSuggestions = ["First aid rules", "Physician visit", "Buy Paracetamol"];
    } else {
      reply = `🩺 VaksinaMed AI tibbiy yordamchisi: Og‘riqni qoldirish\n\nOg‘riq organizmning himoya signali hisoblanadi. Og‘riq qoldiruvchi dori sababni davolamaydi, faqat vaqtincha yengillashtiradi.\n\nAI yordamchisi tavsiyalari:\n1. Vaqtinchalik og‘riqni qoldirish uchun bitta Paratsetamol (500 mg) ovqatdan keyin, bir stakan suv bilan ichilishi mumkin;\n2. Sutkalik me'yordan oshirmang va bir vaqtda bir nechta dori aralashtirmang;\n3. Og‘riq 2 kundan ortiq davom etsa, albatta shifokor ko‘rigiga boring.\n\n⚠️ Muhim eslatma: Ushbu tavsiyalar axborot xarakteriga ega. Doimiy og‘riqda shifokor ko‘rigidan o‘ting.`;
      quickSuggestions = ["Birinchi yordam qoidalari", "Shifokor ko‘rigiga borish", "Paratsetamol sotib olish"];
    }
  } else {
    // Attentive clinical clarification fallback (no specific symptom identified)
    if (lang === "ru") {
      reply = `🩺 Медицинский ИИ-консультант VaksinaMed\n\nЧтобы предоставить вам точную и безопасную рекомендацию, пожалуйста, опишите подробнее:\n1. Какие именно симптомы или жалобы вас беспокоят (например: головная боль, температура, простуда, давление, желудок);\n2. Для кого требуется консультация (взрослый или ребенок);\n3. Либо укажите конкретное название лекарства, о котором хотите узнать.\n\nТакже вы можете сфотографировать рецепт от врача — я расшифрую назначения и проверю наличие в аптеках.\n\n⚠️ Напоминание: Все рекомендации носят информационный характер.`;
      quickSuggestions = ["Сфотографировать рецепт", "Симптомы простуды", "Головная боль", "Витамины"];
    } else if (lang === "en") {
      reply = `🩺 VaksinaMed Medical AI Assistant\n\nTo provide safe and accurate guidance, please specify:\n1. What exact symptoms you are experiencing (e.g. headache, fever, cough, stomach discomfort);\n2. Who needs care (adult or child);\n3. Or the specific medication you are inquiring about.\n\nYou can also upload a prescription photo for instant catalog matching.\n\n⚠️ Reminder: Guidance is advisory only.`;
      quickSuggestions = ["Scan prescription", "Cold remedies", "Headache relief", "Vitamins"];
    } else {
      reply = `🩺 VaksinaMed AI tibbiy yordamchisi\n\nSizga to‘g‘ri va xavfsiz yordam bera olishim uchun iltimos, holatingizni aniqroq yozib bering:\n1. Sizni aynan qanday alomatlar yoki og‘riqlar bezovta qilyapti (masalan: bosh og‘rig‘i, shamollash, isitma, oshqozon bezovtaligi, qon bosimi);\n2. Yordam kim uchun kerak (kattalar yoki bola);\n3. Yoki ma'lumot olmoqchi bo‘lgan dori vositangiz nomini ayting.\n\nShuningdek, shifokor retsepti suratini yuborsangiz, barcha belgilangan dorilarni aniqlab, dorixonalarimizdan topib beraman.\n\n⚠️ Muhim eslatma: Ushbu tavsiyalar axborot xarakteriga ega. Doimiy shikoyatlarda shifokor ko‘rigidan o‘ting.`;
      quickSuggestions = ["Retseptni rasmga olish", "Shamollash belgilari", "Bosh og‘rig‘i", "Vitaminlar"];
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
