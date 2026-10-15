/**
 * Vaksinamed High-Accuracy Prescription Recognition & Catalog Matcher Engine
 *
 * Capabilities:
 * 1. Cyrillic <-> Latin Medical Transliteration & Normalization
 * 2. Medical Prescription Tokenizer (strips Rp, Tab, Caps, Dtd, Sig, dosages, frequency)
 * 3. Fuzzy Levenshtein & Trigram Catalog Matcher with Confidence Scoring (0 - 100%)
 * 4. Dosage Verification & Confidence Boost
 * 5. In-Stock verification and Analog Suggestions (INN/MNN)
 */

export interface ParsedPrescriptionItem {
  id: string;
  rawLine: string;
  cleanedQuery: string;
  extractedDosage?: string;
  instructions?: string;
  confidence: number;
  confidenceLevel: "high" | "medium" | "low";
  matchedProduct?: {
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
    availableQuantity?: number;
  };
  alternatives?: Array<{
    id: number;
    sku: string;
    nameUz: string;
    nameRu: string;
    price: number;
    manufacturer: string;
    isCheaper: boolean;
    priceDiff: number;
  }>;
}

export interface PrescriptionScanResult {
  success: boolean;
  totalLinesDetected: number;
  matchedCount: number;
  items: ParsedPrescriptionItem[];
  disclaimer: {
    uz: string;
    ru: string;
    en: string;
  };
}

// -------------------------------------------------------------
// Transliteration Maps (Uzbek Latin <-> Russian Cyrillic)
// -------------------------------------------------------------
const CYR_TO_LAT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh",
  з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o",
  п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "x", ц: "ts",
  ч: "ch", ш: "sh", щ: "sh", ъ: "", ы: "i", ь: "", э: "e", ю: "yu",
  я: "ya", ў: "o‘", ғ: "g‘", қ: "q", ҳ: "h",
};

export function transliterateCyrillicToLatin(text: string): string {
  return text
    .toLowerCase()
    .split("")
    .map((ch) => CYR_TO_LAT[ch] ?? ch)
    .join("");
}

// Medical Latin abbreviations and prefixes commonly found on Rx sheets
const MEDICAL_PREFIX_WORD =
  /\b(?:rp|tabl?|табл?|caps|капс|sol|р-р|susp|сусп|amp|амп|pulv|ung|мазь|krem|крем|dragee|драже|gutt|sir|сироп|aerosol|спрей)\b[\.\:\,\;]*/gi;

const MEDICAL_INSTRUCTIONS_REGEX =
  /(?:\b(?:d\.?t\.?d\.?|sig(?:na)?|d\.?s\.?)\b[\.\:\s]*|#\s*\d+|№\s*\d+|\b[nN]\s*\d+\b|\bpo\s*\d+\s*t(?:ab)?\s*[x*]\s*\d+\s*(?:m(?:ahal)?|r(?:aza)?)\b|\b\d+\s*t(?:ab)?\s*[x*]\s*\d+\s*(?:m(?:ahal)?|r(?:aza)?)\b|\b\d+\s*[x*]\s*\d+\b|\b(?:ovqatdan|do|posle)\s*(?:oldin|keyin|so['`‘]ng|edi)\b|\bkunda\s*\d+\s*mahal\b|\bisitma\s*(?:chiqqanda|bo['`‘]lganda)\b)/gi;

const DOSAGE_REGEX =
  /(\b\d+(?:[\.,]\d+)?\s*(?:mg|мг|ml|мл|iu|me|g|гр?|mcg|мкг|%)\b)/gi;

/**
 * Normalizes a drug name for fuzzy matching:
 * - strips punctuation, medical stop words, dosages
 * - converts to standard Latin lowercase
 */
export function normalizeDrugToken(input: string): {
  normalized: string;
  dosage?: string;
  instructions?: string;
} {
  // Transliterate to lowercase Latin first so regexes and word boundaries work consistently
  let cleaned = transliterateCyrillicToLatin(input.trim());

  // Strip leading numbering: e.g. "1.", "2)", "1 -"
  cleaned = cleaned.replace(/^\s*\d+[\.\)\-\:]\s*/, "");

  // Strip medical prefixes (can be chained: e.g. "rp: tab. ")
  cleaned = cleaned.replace(MEDICAL_PREFIX_WORD, " ");

  // Extract dosage if present
  let dosage: string | undefined;
  const dosageMatch = cleaned.match(DOSAGE_REGEX);
  if (dosageMatch && dosageMatch.length > 0) {
    dosage = dosageMatch[0].trim();
  }

  // Extract instruction markers
  let instructions: string | undefined;
  const instrMatch = cleaned.match(MEDICAL_INSTRUCTIONS_REGEX);
  if (instrMatch && instrMatch.length > 0) {
    instructions = instrMatch.map((s) => s.trim()).filter(Boolean).join("; ");
  }

  // Remove dosage first, then instructions
  cleaned = cleaned.replace(DOSAGE_REGEX, " ");
  cleaned = cleaned.replace(MEDICAL_INSTRUCTIONS_REGEX, " ");

  // Remove numbers, hashes, brackets and punctuation
  cleaned = cleaned.replace(/[#№\(\)\[\]\{\}\:\;\,\.\+\-\*\/]/g, " ");

  // Normalize common phonetic variations in drug names:
  // e.g. "paracetamol" vs "paratsetamol" ('c' before e/i/y often transliterated as 'ts')
  let normalized = cleaned
    .replace(/\b([a-z]+)c([eiy])/g, "$1ts$2")
    .replace(/ph/g, "f")
    .replace(/th/g, "t")
    .replace(/x/g, "ks")
    .replace(/\s+/g, " ")
    .trim();

  return {
    normalized,
    dosage,
    instructions,
  };
}

/**
 * Computes Levenshtein Distance between two strings
 */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp: number[][] = [];
  for (let i = 0; i <= m; i++) {
    dp[i] = [i];
  }
  for (let j = 0; j <= n; j++) {
    dp[0][j] = j;
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1, // deletion
        dp[i][j - 1] + 1, // insertion
        dp[i - 1][j - 1] + cost, // substitution
      );
    }
  }

  return dp[m][n];
}

/**
 * String similarity ratio (0.0 to 1.0)
 */
export function stringSimilarity(str1: string, str2: string): number {
  const s1 = str1.trim().toLowerCase();
  const s2 = str2.trim().toLowerCase();
  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0.0;

  const maxLen = Math.max(s1.length, s2.length);
  const dist = levenshteinDistance(s1, s2);
  return Math.max(0, (maxLen - dist) / maxLen);
}

/**
 * Trigram Jaccard similarity for multi-word or compound medical names
 */
export function trigramSimilarity(str1: string, str2: string): number {
  const s1 = `  ${str1.toLowerCase().trim()} `;
  const s2 = `  ${str2.toLowerCase().trim()} `;

  const getTrigrams = (s: string) => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 2; i++) {
      set.add(s.slice(i, i + 3));
    }
    return set;
  };

  const t1 = getTrigrams(s1);
  const t2 = getTrigrams(s2);

  let intersection = 0;
  for (const tri of t1) {
    if (t2.has(tri)) intersection++;
  }

  const union = t1.size + t2.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export interface CatalogProductCandidate {
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
  availableQuantity?: number;
}

/**
 * Matches a single extracted prescription line against catalog candidates
 */
export function matchPrescriptionLine(
  rawLine: string,
  catalog: CatalogProductCandidate[],
): ParsedPrescriptionItem | null {
  const trimmed = rawLine.trim();
  if (!trimmed || trimmed.length < 3) return null;

  // Ignore lines that look purely like headers, dates, doctor stamps, or patient names
  const ignorePatterns = [
    /^(retsept|рецепт|shifokor|врач|bemor|пациент|sana|дата|imzo|подпись|muhr|печать|toshkent|klinika|клиника|poliklinika|поликлиника)\b/i,
    /^\s*(?:s|sig|signa)\s*[\:\.\-]/i,
    /^\d{2}[\.\/\-]\d{2}[\.\/\-]\d{2,4}$/,
  ];
  if (ignorePatterns.some((pattern) => pattern.test(trimmed))) {
    return null;
  }

  const { normalized: query, dosage, instructions } = normalizeDrugToken(trimmed);
  if (!query || query.length < 2) return null;

  let bestProduct: CatalogProductCandidate | null = null;
  let bestScore = 0;

  for (const product of catalog) {
    const uzNorm = normalizeDrugToken(product.nameUz).normalized;
    const ruNorm = normalizeDrugToken(product.nameRu).normalized;

    // 1. Direct equality
    let score = 0;
    if (uzNorm === query || ruNorm === query) {
      score = 0.96;
    } else if (
      uzNorm.startsWith(query) ||
      ruNorm.startsWith(query) ||
      query.startsWith(uzNorm) ||
      query.startsWith(ruNorm)
    ) {
      score = 0.90;
    } else {
      // 2. Fuzzy similarity (Levenshtein + Trigram)
      const levUz = stringSimilarity(query, uzNorm);
      const levRu = stringSimilarity(query, ruNorm);
      const triUz = trigramSimilarity(query, uzNorm);
      const triRu = trigramSimilarity(query, ruNorm);

      const maxFuzzy = Math.max(
        levUz * 0.7 + triUz * 0.3,
        levRu * 0.7 + triRu * 0.3,
      );
      score = maxFuzzy;
    }

    // 3. Dosage boost: If prescribed dosage matches product dosage
    if (dosage) {
      const dClean = dosage.replace(/\s+/g, "").toLowerCase();
      const pUzHasDosage = product.nameUz.replace(/\s+/g, "").toLowerCase().includes(dClean);
      const pRuHasDosage = product.nameRu.replace(/\s+/g, "").toLowerCase().includes(dClean);
      if (pUzHasDosage || pRuHasDosage) {
        score = Math.min(1.0, score + 0.08);
      } else {
        // If product has a completely different conflicting dosage, slightly reduce
        score = Math.max(0, score - 0.05);
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestProduct = product;
    }
  }

  // Calculate percentage confidence
  const confidence = Math.round(bestScore * 100);
  const confidenceLevel: "high" | "medium" | "low" =
    confidence >= 80 ? "high" : confidence >= 60 ? "medium" : "low";

  // If even the best score is very weak (< 55%), still report line but without false product match
  if (!bestProduct || confidence < 55) {
    return {
      id: `rx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      rawLine,
      cleanedQuery: query,
      extractedDosage: dosage,
      instructions,
      confidence: Math.max(15, confidence),
      confidenceLevel: "low",
    };
  }

  // Find alternatives in the same analogGroup (cheaper or available options)
  let alternatives: ParsedPrescriptionItem["alternatives"];
  if (bestProduct.analogGroup && bestProduct.analogGroup.trim() !== "") {
    alternatives = catalog
      .filter(
        (p) =>
          p.id !== bestProduct!.id &&
          p.analogGroup === bestProduct!.analogGroup,
      )
      .slice(0, 3)
      .map((alt) => ({
        id: alt.id,
        sku: alt.sku,
        nameUz: alt.nameUz,
        nameRu: alt.nameRu,
        price: alt.price,
        manufacturer: alt.manufacturer,
        isCheaper: alt.price < bestProduct!.price,
        priceDiff: Math.abs(bestProduct!.price - alt.price),
      }));
  }

  const inStock = (bestProduct.availableQuantity ?? 1) > 0;

  return {
    id: `rx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    rawLine,
    cleanedQuery: query,
    extractedDosage: dosage,
    instructions,
    confidence,
    confidenceLevel,
    matchedProduct: {
      id: bestProduct.id,
      sku: bestProduct.sku,
      nameUz: bestProduct.nameUz,
      nameRu: bestProduct.nameRu,
      category: bestProduct.category,
      manufacturer: bestProduct.manufacturer,
      price: bestProduct.price,
      unit: bestProduct.unit,
      requiresPrescription: bestProduct.requiresPrescription,
      analogGroup: bestProduct.analogGroup,
      inStock,
      availableQuantity: bestProduct.availableQuantity,
    },
    alternatives,
  };
}

/**
 * Splits raw OCR text into lines and processes each through the matcher
 */
export function scanAndMatchPrescriptionText(
  rawText: string,
  catalog: CatalogProductCandidate[],
): PrescriptionScanResult {
  // Normalize newline characters and split into lines
  const rawLines = rawText
    .split(/\r?\n|;/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 2);

  // Group continuation lines (e.g. "S: 1 t x 2 mahal") into preceding item
  const combinedLines: string[] = [];
  for (const line of rawLines) {
    if (/^\s*(?:s|sig|signa)\s*[\:\.\-]/i.test(line) && combinedLines.length > 0) {
      combinedLines[combinedLines.length - 1] += ` ${line}`;
    } else {
      combinedLines.push(line);
    }
  }

  const items: ParsedPrescriptionItem[] = [];
  const seenProductIds = new Set<number>();

  for (const line of combinedLines) {
    const item = matchPrescriptionLine(line, catalog);
    if (!item) continue;

    // Deduplicate same product recognized twice on different lines
    if (item.matchedProduct) {
      if (seenProductIds.has(item.matchedProduct.id)) {
        continue;
      }
      seenProductIds.add(item.matchedProduct.id);
    }

    items.push(item);
  }

  const matchedCount = items.filter((i) => i.matchedProduct != null).length;

  return {
    success: true,
    totalLinesDetected: items.length,
    matchedCount,
    items,
    disclaimer: {
      uz: "Diqqat: Retsept asosida beriladigan preparatlar dorixonada farmatsevt tomonidan tekshirilgandan so‘ng beriladi.",
      ru: "Внимание: Рецептурные препараты отпускаются только после проверки рецепта фармацевтом в аптеке.",
      en: "Notice: Prescription medications are dispensed only after verification by a licensed pharmacist at the branch.",
    },
  };
}
