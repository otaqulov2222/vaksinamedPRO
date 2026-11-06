import { normalizeUserSpeech } from "./aiChatNlu";

/**
 * Hard product-card policy for VaksinaMed medical chat.
 * LLM suggestions are never trusted alone — cards must pass this gate.
 */

export type SymptomBucket =
  | "headache"
  | "cold_fever"
  | "throat"
  | "cough"
  | "nasal"
  | "stomach"
  | "diarrhea"
  | "allergy"
  | "dental"
  | "eye"
  | "vitamin"
  | "purchase"
  | "meta"
  | "other";

/** Catalog analogGroup values allowed per symptom. Empty = no auto cards. */
const ALLOWED_GROUPS: Record<SymptomBucket, string[]> = {
  headache: ["analgesic"],
  cold_fever: ["analgesic", "nasal"],
  throat: ["analgesic"],
  cough: ["cough"],
  nasal: ["nasal"],
  stomach: ["digest", "probiotic"],
  diarrhea: ["digest", "probiotic"],
  allergy: ["allergy"],
  dental: ["analgesic"],
  eye: [], // never auto-sell for eye redness/itch without ophthalmology path
  vitamin: ["vitamin-d", "vitamin-c", "magnesium", "omega", "zinc", "calcium", "prenatal"],
  purchase: [
    "analgesic",
    "nasal",
    "cough",
    "digest",
    "probiotic",
    "allergy",
    "vitamin-d",
    "vitamin-c",
    "magnesium",
    "omega",
    "zinc",
    "calcium",
    "prenatal",
    "skin",
    "antiseptic",
    "first-aid",
  ],
  meta: [], // greetings / capability — never attach products
  other: [],
};

/** Never auto-attach these groups on free-form symptom chat. */
const GLOBAL_BLOCK_GROUPS = new Set([
  "antibiotic",
  "diabetes",
  "cardio",
  "device",
]);

export function detectSymptomBucket(userText: string): SymptomBucket {
  const q = normalizeUserSpeech(userText);

  if (
    /(?:^|\s)(salom|assalom|rahmat|hello|hi)\s*$/i.test(q) ||
    /(?:nima\s+qila|nimalarga\s+javob|nima\s+qilaol|siz\s+kimsiz|what\s+can\s+you|чем\s+можешь|что\s+умеешь)/i.test(
      q,
    )
  ) {
    return "meta";
  }

  if (
    /(?:vitamin|витамин|\bd3\b|\bд3\b|omega|омега|magniy|магний|tsink|цинк|calcium|кальц|femibion)/i.test(
      q,
    )
  ) {
    return "vitamin";
  }

  if (
    /(?:sotib\s*ol|buyurtma|savatga|narxi|qancha\s*turadi|dorixonada\s*bormi|dokonda\s*bormi|\bprice\b|in\s*stock|купить|заказать)/i.test(
      q,
    ) ||
    /(?:paratsetamol|paracetamol|ibuprofen|smecta|linex|loratadin|acc|aqua\s*maris|nurofen|omeprazol|ambroksol|espumizan).{0,24}\bbormi\b/i.test(
      q,
    )
  ) {
    return "purchase";
  }

  if (/(?:ko['']?z|глаз|eye).{0,24}(?:qizar|achish|og['']?ri|зуд|красн|burn|itch)/i.test(q)) {
    return "eye";
  }

  if (
    /(?:\bbosh\b(?!qa).{0,40}og['']?ri|og['']?ri.{0,40}\bbosh\b(?!qa)|headache|головн|болит\s+голов)/i.test(
      q,
    )
  ) {
    return "headache";
  }

  if (/(?:tish|зуб|toothache|mil)/i.test(q) && /og['']?ri|боль|pain/i.test(q)) {
    return "dental";
  }

  if (/(?:ich\s*ket|diare|диаре|ishal|понос|diarrhea)/i.test(q)) {
    return "diarrhea";
  }

  if (/(?:qorin|qorn|oshqozon|живот|stomach|abdomen|belly|jigildon|изжог)/i.test(q)) {
    return "stomach";
  }

  if (/(?:allerg|аллерг|toshma|qichish|чиха|prurit)/i.test(q)) {
    return "allergy";
  }

  if (/(?:yo['']?tal|yotal|cough|кашел|balg)/i.test(q)) {
    return "cough";
  }

  if (/(?:tomoq|горл|throat|faring)/i.test(q)) {
    return "throat";
  }

  if (/(?:burun|насморк|nasal|bitib)/i.test(q)) {
    return "nasal";
  }

  if (/(?:shamol|gripp|простуд|\bcold\b|orvi|isitma|harorat|temperatura|fever)/i.test(q)) {
    return "cold_fever";
  }

  return "other";
}

export function allowedAnalogGroupsFor(userText: string): Set<string> | null {
  const bucket = detectSymptomBucket(userText);
  const allowed = ALLOWED_GROUPS[bucket];
  if (!allowed.length) return new Set(); // other → no cards
  return new Set(allowed);
}

export function productGroupKey(p: {
  analogGroup?: string;
  category?: string;
  nameUz?: string;
  nameRu?: string;
  requiresPrescription?: boolean;
}): string {
  const g = String(p.analogGroup || "").trim().toLowerCase();
  if (g) return g;
  const hay = normalizeUserSpeech(`${p.nameUz || ""} ${p.nameRu || ""} ${p.category || ""}`);
  if (/(?:amoks|azitrom|antibiot)/i.test(hay) || p.requiresPrescription) {
    if (/(?:amoks|azitrom|antibiot)/i.test(hay)) return "antibiotic";
  }
  if (/vitamin|d3|omega|magniy|tsink|calcium|femibion/i.test(hay)) return "vitamin-d";
  if (/paratsetamol|ibuprofen|nurofen|analgin|aspirin/i.test(hay)) return "analgesic";
  if (/loratadin|setirizin|klaritin/i.test(hay)) return "allergy";
  if (/\bacc\b|ацц|ambroksol/i.test(hay)) return "cough";
  if (/aqua\s*maris|oksalin|nozol/i.test(hay)) return "nasal";
  if (/smecta|omeprazol|espumizan|pankreatin/i.test(hay)) return "digest";
  if (/linex/i.test(hay)) return "probiotic";
  if (/accu|chek|глюкомет|strip|полоск|tonometr/i.test(hay)) return "device";
  return "unknown";
}

export function isProductAllowedForUserAsk(
  userText: string,
  product: {
    analogGroup?: string;
    category?: string;
    nameUz?: string;
    nameRu?: string;
    requiresPrescription?: boolean;
  },
): boolean {
  const group = productGroupKey(product);
  if (GLOBAL_BLOCK_GROUPS.has(group)) {
    // Explicit antibiotic purchase by name can still pass via purchase bucket + name ask
    const q = normalizeUserSpeech(userText);
    if (group === "antibiotic" && /(?:amoks|azitrom|antibiot).{0,20}\b(?:bormi|narxi|sotib|kerak)/i.test(q)) {
      return true;
    }
    return false;
  }

  const allowed = allowedAnalogGroupsFor(userText);
  if (!allowed) return false;
  if (allowed.size === 0) return false;

  // Purchase: allow if group is in purchase allow-list
  if (detectSymptomBucket(userText) === "purchase") {
    return allowed.has(group);
  }

  return allowed.has(group);
}
