/**
 * Informal Uzbek / mixed-lang speech normalizer for the medical chat assistant.
 * Goal: understand casual typing the way a careful human reader would —
 * typos (gapr, ogriydi), missing apostrophes, slang, Latin↔Cyrillic roots.
 */

/** Longest-first informal → canonical replacements (applied as whole-token or substring). */
const INFORMAL_CANONICAL: Array<[RegExp, string]> = [
  // Pain / body — very common chat typos
  [/\bogriyabdi\b/g, "og'riyapti"],
  [/\bogriyapti\b/g, "og'riyapti"],
  [/\bogriyab\b/g, "og'riyap"],
  [/\bogriyap\b/g, "og'riyap"],
  [/\bogriydi\b/g, "og'riydi"],
  [/\bogridi\b/g, "og'ridi"],
  [/\bogriyot\b/g, "og'riyap"],
  [/\bogriyt\b/g, "og'riyap"],
  [/\bogriy\b/g, "og'ri"],
  [/\bogriq\b/g, "og'riq"],
  [/\bogri\b/g, "og'ri"],
  [/\bboshim\b/g, "bosh"],
  [/\bboshimni\b/g, "bosh"],
  [/\bchakkam\b/g, "chakka"],
  [/\btishim\b/g, "tish"],
  [/\btomogim\b/g, "tomoq"],
  [/\btomog'im\b/g, "tomoq"],
  [/\bqornim\b/g, "qorin"],
  [/\bqornimni\b/g, "qorin"],
  [/\bqorni\b/g, "qorin"],
  [/\boqshom\b/g, "oshqozon"],
  [/\boshqazon\b/g, "oshqozon"],
  [/\bjigildon\b/g, "jig'ildon"],
  [/\bkokrak\b/g, "ko'krak"],
  [/\bkokragim\b/g, "ko'krak"],
  [/\bko'kragim\b/g, "ko'krak"],
  [/\byuragim\b/g, "yurak"],
  [/\bopkam\b/g, "o'pka"],
  [/\bopka\b/g, "o'pka"],
  [/\bkozim\b/g, "ko'z"],
  [/\bkoz\b/g, "ko'z"],
  [/\bqulogim\b/g, "quloq"],
  [/\bqulog'im\b/g, "quloq"],
  [/\bqulog\b/g, "quloq"],
  [/\bburnim\b/g, "burun"],
  [/\bboyinim\b/g, "bo'yin"],
  [/\bboyin\b/g, "bo'yin"],
  [/\bbogim\b/g, "bo'g'im"],
  [/\bbog'im\b/g, "bo'g'im"],
  // Fever / cold / cough
  [/\bisitmam\b/g, "isitma"],
  [/\bharoratim\b/g, "harorat"],
  [/\btemperaturam\b/g, "temperatura"],
  [/\bshamollab\b/g, "shamollash"],
  [/\bshamolab\b/g, "shamollash"],
  [/\byotalyap\b/g, "yo'tal"],
  [/\byotal\b/g, "yo'tal"],
  [/\byotalim\b/g, "yo'tal"],
  [/\bbalgam\b/g, "balg'am"],
  [/\bburun bitgan\b/g, "burun biti"],
  [/\bburun bitib\b/g, "burun biti"],
  // GI / stool
  [/\bichim\s*ket\w*/g, "ich ket"],
  [/\bichket\b/g, "ich ket"],
  [/\bichim\s*qot\w*/g, "ich qot"],
  [/\bqusyap\w*/g, "qusish"],
  [/\bqusayap\w*/g, "qusish"],
  [/\bkongil\b/g, "ko'ngil"],
  [/\bko'nglim\b/g, "ko'ngil"],
  [/\bkonglim\b/g, "ko'ngil"],
  // Sleep / stress
  [/\buxlolmayap\w*/g, "uxlolmay"],
  [/\buxlolmayman\b/g, "uxlolmay"],
  [/\buyqum\s*kelmay\w*/g, "uyqusiz"],
  [/\basabim\b/g, "asab"],
  // BP / diabetes slang
  [/\bbosimim\b/g, "bosim"],
  [/\bqonbosim\b/g, "qon bosimi"],
  [/\bdavleniye\b/g, "bosim"],
  [/\bdavlenie\b/g, "bosim"],
  [/\bqandim\s*ko['']?taril\w*/g, "qandim"],
  // Meds / pharmacy ask slang
  [/\bnma\b/g, "nima"],
  [/\bnmaga\b/g, "nimaga"],
  [/\bqalesan\b/g, "qalaysiz"],
  [/\bqalesiz\b/g, "qalaysiz"],
  [/\bqandey\b/g, "qanday"],
  [/\bboladi\b/g, "bo'ladi"],
  [/\bbuladi\b/g, "bo'ladi"],
  [/\bichaymi\b/g, "ichay"],
  [/\bichaylik\b/g, "ichay"],
  [/\bichsammi\b/g, "ichsam"],
  [/\bichila\b/g, "ichiladi"],
  [/\bdorim\b/g, "dori"],
  [/\bdorixonada\b/g, "dorixona"],
  [/\bapteka\b/g, "dorixona"],
  [/\bbormikan\b/g, "bormi"],
  [/\bmavjudmi\b/g, "bormi"],
  [/\bkerakmi\b/g, "kerak"],
  [/\bberingchi\b/g, "bering"],
  [/\bpls\b/g, "iltimos"],
  [/\bplz\b/g, "iltimos"],
  // Language switch typos
  [/\bgapr\b/g, "gapir"],
  [/\bgapirchi\b/g, "gapir"],
  [/\bozbek\b/g, "o'zbek"],
  [/\bozbekcha\b/g, "o'zbekcha"],
  [/\bruschada\b/g, "ruscha"],
  [/\binglizchada\b/g, "inglizcha"],
  // Emergency slang
  [/\bezilyap\w*/g, "ezil"],
  [/\bsiqilyap\w*/g, "siqil"],
  [/\bqisilyap\w*/g, "qisil"],
  [/\bhushdan\s*ket\w*/g, "hushdan"],
  [/\bhushini\s*yo['']?qot\w*/g, "hushidan"],
  [/\bbehush\b/g, "hushdan"],
  // Child / pregnancy informal
  [/\bbolamga\b/g, "bolam"],
  [/\bbolaga\b/g, "bola"],
  [/\bchaqalog\b/g, "chaqaloq"],
  [/\bgodak\b/g, "go'dak"],
  // Common Cyrillic roots → Latin (partial, high-value)
  [/\bболит\b/g, "og'ri"],
  [/\bболь\b/g, "og'ri"],
  [/\bголова\b/g, "bosh"],
  [/\bголовн\w*/g, "bosh"],
  [/\bживот\b/g, "qorin"],
  [/\bжелудок\b/g, "oshqozon"],
  [/\bтемпература\b/g, "temperatura"],
  [/\bпростуд\w*/g, "shamollash"],
  [/\bкашель\b/g, "yo'tal"],
  [/\bгорло\b/g, "tomoq"],
  [/\bтошнит\b/g, "ko'ngil"],
  [/\bрвота\b/g, "qusish"],
  [/\bдавлени\w*/g, "bosim"],
  [/\bрецепт\b/g, "retsept"],
  [/\bлекарств\w*/g, "dori"],
];

/** Extra tokens appended so older includes()/regex still fire. */
const SYNONYM_EXPAND: Array<[RegExp, string]> = [
  [/og['']ri/, " og'ri ogri pain "],
  [/\bbosh\b/, " bosh headache "],
  [/\btomoq\b/, " tomoq throat "],
  [/\byo['']tal\b/, " yo'tal yotal cough "],
  [/\bisitma\b/, " isitma fever temperatura "],
  [/\bshamollash\b/, " shamollash cold gripp "],
  [/\bqorin\b/, " qorin qorn oshqozon stomach "],
  [/\boshqozon\b/, " oshqozon qorin stomach "],
  [/\byurak\b/, " yurak heart "],
  [/\bko['']krak\b/, " ko'krak kokrak chest "],
  [/\bbosim\b/, " bosim pressure qon bosimi "],
  [/\bdori\b/, " dori preparat medicine "],
  [/\bretsept\b/, " retsept prescription "],
  [/\btish\b/, " tish dental "],
  [/\ballergi/, " allergiya allergy "],
  [/\bich ket\b/, " ich ket diareya diarrhea "],
  [/\bich qot\b/, " ich qot qabziyat constipation "],
];

export function normalizeUserSpeech(raw: string): string {
  let s = String(raw || "")
    .toLowerCase()
    .normalize("NFKC")
    // Unify apostrophe-like characters (incl. Uzbek ʼ U+02BC)
    .replace(/[ʻʼ’‘`´′]/g, "'")
    // Soften punctuation noise but keep spaces
    .replace(/[?!.,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  for (const [re, to] of INFORMAL_CANONICAL) {
    s = s.replace(re, to);
  }

  // Collapse elongated chat letters: "salooom" → "saloom" → keep mild; "ооо" noise
  s = s.replace(/(.)\1{2,}/g, "$1$1");

  // Append synonym hints (does not remove original wording)
  let expanded = ` ${s} `;
  for (const [re, extra] of SYNONYM_EXPAND) {
    if (re.test(expanded)) {
      expanded += extra;
    }
  }

  return expanded.replace(/\s+/g, " ").trim();
}

/** True when message looks like asking what medicine to take / buy / stock. */
export function isMedicineSeekingAsk(query: string): boolean {
  const q = normalizeUserSpeech(query);
  return (
    /(?:nima|qaysi|qanaqa)\s+(?:dori|preparat|tabletka)?\s*(?:ich|ol|bers|tavsiya)/i.test(q) ||
    /(?:ichay|ichsam|ichiladi|ichish)\b/i.test(q) ||
    /(?:dori|preparat)\s*(?:kerak|bering|bormi|top)/i.test(q) ||
    /(?:sotib\s*ol|buyurtma|savatga|narxi|qancha\s*turadi|bormi|mavjud)/i.test(q) ||
    /(?:купить|заказать|в корзину|сколько стоит|есть в наличии|найди препарат)/i.test(q) ||
    /(?:\bbuy\b|\border\b|\bprice\b|in stock|what (?:should|can) i take)/i.test(q) ||
    /(?:tavsiya\s*qil|maslahat\s*ber|yordam\s*ber.*dori)/i.test(q)
  );
}

/** Stronger symptom/drug presence check after normalization. */
export function hasClinicalContent(query: string): boolean {
  const q = normalizeUserSpeech(query);
  // Word-boundary for short tokens so "boshqa" ≠ headache, "qanday" ≠ diabetes "qand"
  return /(?:og['']ri|ogri|sanch|\bbosh\b(?!qa)|(?:^|[\s])tish(?:im)?\b|milk|karies|pulpit|qorn|qorin|oshqozon|jigar|buyrak|isitma|temperatura|harorat|shamol|gripp|\bdori\b|retsept|preparat|vitamin|davlen|\bbosim\b|ich ket|diareya|ich qot|qabziyat|ko['']z|\bkoz\b|quloq|burun|kuyish|kuydi|kuydim|zahar|uyqu|uxla|peshob|siydik|\bqandim\b|\bqandli\b|diabet|tsistit|jarohat|бол|зуб|голов|живот|желуд|жар|температур|сердц|порез|ожог|травм|перелом|простуд|кашель|горл|тошн|рвот|отравл|глаз|ухо|отит|kesil|singan|sinish|lat ye|\bqon\b|shish|yiring|toshma|allergi|tomoq|yo['']tal|balg|nafas|bo['']g['']il|hush|behush|\basab\b|yurak|ko['']krak|ezil|siqil|qisil|parasetamol|paratsetamol|analgin|aspirin|ibuprofen|antibiotik|tabletka|bolam|chaqaloq|homilador|\bpain\b|fever|cough|headache|stomach|medicine|prescription)/i.test(
    q,
  );
}
