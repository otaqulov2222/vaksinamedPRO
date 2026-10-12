import { count, eq } from "drizzle-orm";
import { branches } from "./schema/branches";
import { products, productStocks } from "./schema/catalog";
import officialBranches from "./data/branches.json";

export type StagingCatalogSeedResult = {
  ok: boolean;
  branchesInserted: number;
  branchesExisting: number;
  branchesTotal: number;
  productsInserted: number;
  productsExisting: number;
  productsTotal: number;
  stocksInserted: number;
  stocksExisting: number;
  stocksTotal: number;
};

/**
 * Validates that staging catalog seed execution is strictly permitted.
 * Both APP_ENV=staging and STAGING_DEMO_CATALOG_SEED_ENABLED=true are mandatory.
 * NODE_ENV is not altered (typically "production" on staging).
 */
export function assertStagingCatalogSeedAllowed(): void {
  const appEnv = (process.env.APP_ENV || "").trim().toLowerCase();
  const enabled = (process.env.STAGING_DEMO_CATALOG_SEED_ENABLED || "").trim().toLowerCase();

  if (appEnv !== "staging") {
    throw new Error(
      `[staging-catalog-seed] Refusing execution: APP_ENV must be "staging" (current: "${process.env.APP_ENV || ""}").`,
    );
  }

  if (enabled !== "true" && enabled !== "1") {
    throw new Error(
      `[staging-catalog-seed] Refusing execution: STAGING_DEMO_CATALOG_SEED_ENABLED must be "true" (current: "${process.env.STAGING_DEMO_CATALOG_SEED_ENABLED || ""}").`,
    );
  }
}

export function isStagingCatalogSeedAllowed(): boolean {
  const appEnv = (process.env.APP_ENV || "").trim().toLowerCase();
  const enabled = (process.env.STAGING_DEMO_CATALOG_SEED_ENABLED || "").trim().toLowerCase();
  return appEnv === "staging" && (enabled === "true" || enabled === "1");
}

export function buildOfficialBranches() {
  return officialBranches.map((item) => ({
    code: `VM-${String(item.code).padStart(3, "0")}`,
    name: String(item.name).startsWith("Vaksina") ? item.name : `Vaksina Med · ${item.name}`,
    city: item.city || item.region,
    region: item.region,
    district: item.region,
    address: item.address,
    phone: item.phone,
    hours: item.hours || "08:00 — 22:00",
    lat: item.lat,
    lng: item.lng,
    isOpen: item.status !== "inactive",
    is24h: Boolean(item.is24),
  }));
}

/**
 * Curated list of demo products for staging catalog.
 * Distinctly annotated as test/demo data to prevent confusion with real medicine pricing/availability.
 */
export const STAGING_CATALOG_PRODUCTS = [
  {
    sku: "VM-D3-60",
    nameUz: "Vitamin D3 2000 IU (Demo)",
    nameRu: "Витамин D3 2000 IU (Демо)",
    category: "Vitaminlar",
    manufacturer: "Solgar (Demo)",
    description: "[TEST / DEMO] Suyak va immunitet uchun D3 vitamini, 60 kapsula. Ushbu ma’lumot staging sinov muhiti uchun demo hisoblanadi. Haqiqiy dori narxi va zaxirasi emas.",
    unit: "quti",
    price: 89000,
    icon: "pill",
    analogGroup: "vitamin-d",
    requiresPrescription: false,
  },
  {
    sku: "VM-C-1000",
    nameUz: "Askorbin kislotasi 1000 mg (Demo)",
    nameRu: "Аскорбиновая кислота 1000 мг (Демо)",
    category: "Vitaminlar",
    manufacturer: "Evalar (Demo)",
    description: "[TEST / DEMO] Immunitetni qo‘llab-quvvatlovchi C vitamini. Staging sinov mahsuloti.",
    unit: "quti",
    price: 42000,
    icon: "leaf",
    analogGroup: "vitamin-c",
    requiresPrescription: false,
  },
  {
    sku: "VM-MG-B6",
    nameUz: "Magniy + B6 (Demo)",
    nameRu: "Магний + B6 (Демо)",
    category: "Vitaminlar",
    manufacturer: "Now Foods (Demo)",
    description: "[TEST / DEMO] Asab tizimi va uyqu uchun magniy kompleksi. Staging sinov mahsuloti.",
    unit: "quti",
    price: 76000,
    icon: "pill",
    analogGroup: "magnesium",
    requiresPrescription: false,
  },
  {
    sku: "VM-OMEGA",
    nameUz: "Omega-3 1000 mg (Demo)",
    nameRu: "Омега-3 1000 мг (Демо)",
    category: "Vitaminlar",
    manufacturer: "Doppelherz (Demo)",
    description: "[TEST / DEMO] Yurak va tomirlar uchun baliq yog‘i. Staging sinov mahsuloti.",
    unit: "quti",
    price: 118000,
    icon: "water",
    analogGroup: "omega",
    requiresPrescription: false,
  },
  {
    sku: "VM-ZINC",
    nameUz: "Rux 25 mg (Demo)",
    nameRu: "Цинк 25 мг (Демо)",
    category: "Vitaminlar",
    manufacturer: "Nature's Bounty (Demo)",
    description: "[TEST / DEMO] Immunitet va teri uchun rux preparati. Staging sinov mahsuloti.",
    unit: "quti",
    price: 39000,
    icon: "pill",
    analogGroup: "zinc",
    requiresPrescription: false,
  },
  {
    sku: "VM-PARA",
    nameUz: "Paratsetamol 500 mg (Demo)",
    nameRu: "Парацетамол 500 мг (Демо)",
    category: "Og‘riq va isitma",
    manufacturer: "Nika Pharm (Demo)",
    description: "[TEST / DEMO] Isitma va og‘riqni pasaytiruvchi vosita. Staging test ma’lumoti.",
    unit: "quti",
    price: 8000,
    icon: "thermometer",
    analogGroup: "analgesic",
    requiresPrescription: false,
  },
  {
    sku: "VM-IBU",
    nameUz: "Ibuprofen 400 mg (Demo)",
    nameRu: "Ибупрофен 400 мг (Демо)",
    category: "Og‘riq va isitma",
    manufacturer: "Bosnalijek (Demo)",
    description: "[TEST / DEMO] Yallig‘lanishga qarshi og‘riq qoldiruvchi. Staging test ma’lumoti.",
    unit: "quti",
    price: 14000,
    icon: "thermometer",
    analogGroup: "analgesic",
    requiresPrescription: false,
  },
  {
    sku: "VM-NURO",
    nameUz: "Nurofen 200 mg (Demo)",
    nameRu: "Нурофен 200 мг (Демо)",
    category: "Og‘riq va isitma",
    manufacturer: "Reckitt (Demo)",
    description: "[TEST / DEMO] Tez ta’sir qiluvchi ibuprofen. Staging test ma’lumoti.",
    unit: "quti",
    price: 28000,
    icon: "thermometer",
    analogGroup: "analgesic",
    requiresPrescription: false,
  },
  {
    sku: "VM-LOR",
    nameUz: "Loratadin 10 mg (Demo)",
    nameRu: "Лоратадин 10 мг (Демо)",
    category: "Allergiya",
    manufacturer: "Nobel (Demo)",
    description: "[TEST / DEMO] Mavsumiy allergiya uchun antigistamin. Staging test ma’lumoti.",
    unit: "quti",
    price: 16000,
    icon: "flower-outline",
    analogGroup: "allergy",
    requiresPrescription: false,
  },
  {
    sku: "VM-CLAR",
    nameUz: "Klaritin 10 mg (Demo)",
    nameRu: "Кларитин 10 мг (Демо)",
    category: "Allergiya",
    manufacturer: "Bayer (Demo)",
    description: "[TEST / DEMO] Loratadin asosidagi allergiya vositasi. Staging test ma’lumoti.",
    unit: "quti",
    price: 34000,
    icon: "flower-outline",
    analogGroup: "allergy",
    requiresPrescription: false,
  },
  {
    sku: "VM-CET",
    nameUz: "Setirizin 10 mg (Demo)",
    nameRu: "Цетиризин 10 мг (Демо)",
    category: "Allergiya",
    manufacturer: "Gedeon Richter (Demo)",
    description: "[TEST / DEMO] Allergik rinit va toshma uchun. Staging test ma’lumoti.",
    unit: "quti",
    price: 19000,
    icon: "flower-outline",
    analogGroup: "allergy",
    requiresPrescription: false,
  },
  {
    sku: "VM-ACC",
    nameUz: "ACC 200 mg (Demo)",
    nameRu: "АЦЦ 200 мг (Демо)",
    category: "Shamollash",
    manufacturer: "Sandoz (Demo)",
    description: "[TEST / DEMO] Balg‘am ko‘chiruvchi asetilsistein. Staging test ma’lumoti.",
    unit: "quti",
    price: 47000,
    icon: "weather-windy",
    analogGroup: "cough",
    requiresPrescription: false,
  },
  {
    sku: "VM-AMB",
    nameUz: "Ambroksol 30 mg (Demo)",
    nameRu: "Амброксол 30 мг (Демо)",
    category: "Shamollash",
    manufacturer: "Berlin-Chemie (Demo)",
    description: "[TEST / DEMO] Yo‘tal va balg‘am uchun vosita. Staging test ma’lumoti.",
    unit: "quti",
    price: 21000,
    icon: "weather-windy",
    analogGroup: "cough",
    requiresPrescription: false,
  },
  {
    sku: "VM-AQUA",
    nameUz: "Aqua Maris sprey (Demo)",
    nameRu: "Аква Марис спрей (Демо)",
    category: "Shamollash",
    manufacturer: "Jadran (Demo)",
    description: "[TEST / DEMO] Burun bo‘shlig‘ini yuvish uchun dengiz suvi. Staging test ma’lumoti.",
    unit: "flakon",
    price: 36000,
    icon: "water",
    analogGroup: "nasal",
    requiresPrescription: false,
  },
  {
    sku: "VM-OSK",
    nameUz: "Oksalin malham (Demo)",
    nameRu: "Оксолиновая мазь (Демо)",
    category: "Shamollash",
    manufacturer: "Nika Pharm (Demo)",
    description: "[TEST / DEMO] Virusli infeksiyalardan himoya malhami. Staging test ma’lumoti.",
    unit: "tyubik",
    price: 9000,
    icon: "medical-bag",
    analogGroup: "nasal",
    requiresPrescription: false,
  },
  {
    sku: "VM-SMEC",
    nameUz: "Smecta (Demo)",
    nameRu: "Смекта (Демо)",
    category: "Ovqat hazm",
    manufacturer: "Ipsen (Demo)",
    description: "[TEST / DEMO] Ichak buzilishi uchun adsorbent. Staging test ma’lumoti.",
    unit: "quti",
    price: 32000,
    icon: "medical-bag",
    analogGroup: "digest",
    requiresPrescription: false,
  },
  {
    sku: "VM-OME",
    nameUz: "Omeprazol 20 mg (Demo)",
    nameRu: "Омепразол 20 мг (Демо)",
    category: "Ovqat hazm",
    manufacturer: "KRKA (Demo)",
    description: "[TEST / DEMO] Oshqozon kislotasini kamaytiruvchi dori vositasi. Staging test ma’lumoti.",
    unit: "quti",
    price: 18000,
    icon: "medical-bag",
    analogGroup: "digest",
    requiresPrescription: false,
  },
  {
    sku: "VM-LINE",
    nameUz: "Linex (Demo)",
    nameRu: "Линекс (Демо)",
    category: "Ovqat hazm",
    manufacturer: "Sandoz (Demo)",
    description: "[TEST / DEMO] Ichak mikroflorasini tiklovchi probiotik. Staging test ma’lumoti.",
    unit: "quti",
    price: 64000,
    icon: "bacteria",
    analogGroup: "probiotic",
    requiresPrescription: false,
  },
  {
    sku: "VM-ESP",
    nameUz: "Espumizan (Demo)",
    nameRu: "Эспумизан (Демо)",
    category: "Ovqat hazm",
    manufacturer: "Berlin-Chemie (Demo)",
    description: "[TEST / DEMO] Meteorizm va qorin shishishi uchun simetikon. Staging test ma’lumoti.",
    unit: "quti",
    price: 41000,
    icon: "medical-bag",
    analogGroup: "digest",
    requiresPrescription: false,
  },
  {
    sku: "VM-PAN",
    nameUz: "Pankreatin 10000 (Demo)",
    nameRu: "Панкреатин 10000 (Демо)",
    category: "Ovqat hazm",
    manufacturer: "Bioline (Demo)",
    description: "[TEST / DEMO] Ovqat hazm fermentlari. Staging test ma’lumoti.",
    unit: "quti",
    price: 27000,
    icon: "medical-bag",
    analogGroup: "digest",
    requiresPrescription: false,
  },
  {
    sku: "VM-BET",
    nameUz: "Bepanten 5% (Demo)",
    nameRu: "Бепантен 5% (Демо)",
    category: "Teri parvarishi",
    manufacturer: "Bayer (Demo)",
    description: "[TEST / DEMO] Teri tiklanishi uchun deksantenol malhami. Staging test ma’lumoti.",
    unit: "tyubik",
    price: 52000,
    icon: "spa",
    analogGroup: "skin",
    requiresPrescription: false,
  },
  {
    sku: "VM-DEX",
    nameUz: "Deksantenol krem (Demo)",
    nameRu: "Декспантенол крем (Демо)",
    category: "Teri parvarishi",
    manufacturer: "Nika Pharm (Demo)",
    description: "[TEST / DEMO] Quruq va shikastlangan teri uchun krem. Staging test ma’lumoti.",
    unit: "tyubik",
    price: 18000,
    icon: "spa",
    analogGroup: "skin",
    requiresPrescription: false,
  },
  {
    sku: "VM-IOD",
    nameUz: "Yod 5% 10 ml (Demo)",
    nameRu: "Йод 5% 10 мл (Демо)",
    category: "Antiseptik",
    manufacturer: "Nika Pharm (Demo)",
    description: "[TEST / DEMO] Teri yuzasini zararsizlantirish uchun yod eritmasi. Staging test ma’lumoti.",
    unit: "flakon",
    price: 4000,
    icon: "bottle-tonic",
    analogGroup: "antiseptic",
    requiresPrescription: false,
  },
  {
    sku: "VM-H2O2",
    nameUz: "Vodorod peroksid 3% (Demo)",
    nameRu: "Перекись водорода 3% (Демо)",
    category: "Antiseptik",
    manufacturer: "Nika Pharm (Demo)",
    description: "[TEST / DEMO] Yaralarni tozalash uchun antiseptik eritma. Staging test ma’lumoti.",
    unit: "flakon",
    price: 3500,
    icon: "bottle-tonic",
    analogGroup: "antiseptic",
    requiresPrescription: false,
  },
  {
    sku: "VM-BAND",
    nameUz: "Steril bint 5 m (Demo)",
    nameRu: "Стерильный бинт 5 м (Демо)",
    category: "Tibbiy buyumlar",
    manufacturer: "Medtex (Demo)",
    description: "[TEST / DEMO] Bog‘lash uchun steril tibbiy bint. Staging test ma’lumoti.",
    unit: "dona",
    price: 6000,
    icon: "bandage",
    analogGroup: "first-aid",
    requiresPrescription: false,
  },
  {
    sku: "VM-TERM",
    nameUz: "Elektron termometr (Demo)",
    nameRu: "Электронный термометр (Демо)",
    category: "Tibbiy buyumlar",
    manufacturer: "Omron (Demo)",
    description: "[TEST / DEMO] Tezkor va aniq elektron tana harorati o‘lchagich. Staging test ma’lumoti.",
    unit: "dona",
    price: 89000,
    icon: "thermometer",
    analogGroup: "device",
    requiresPrescription: false,
  },
  {
    sku: "VM-MASK",
    nameUz: "Tibbiy niqob 50 dona (Demo)",
    nameRu: "Медицинская маска 50 шт (Демо)",
    category: "Tibbiy buyumlar",
    manufacturer: "MedProtect (Demo)",
    description: "[TEST / DEMO] Bir martalik 3 qatlamli himoya niqobi. Staging test ma’lumoti.",
    unit: "quti",
    price: 18000,
    icon: "face-mask",
    analogGroup: "first-aid",
    requiresPrescription: false,
  },
  {
    sku: "VM-GLUC",
    nameUz: "Glyukometr test-lenta (Demo)",
    nameRu: "Тест-полоски глюкометра (Демо)",
    category: "Tibbiy buyumlar",
    manufacturer: "Accu-Chek (Demo)",
    description: "[TEST / DEMO] Qon qand miqdorini aniqlash test lentasi. Staging test ma’lumoti.",
    unit: "quti",
    price: 125000,
    icon: "water",
    analogGroup: "device",
    requiresPrescription: false,
  },
  {
    sku: "VM-AMOX",
    nameUz: "Amoksitsillin 500 mg (Demo)",
    nameRu: "Амоксициллин 500 мг (Демо)",
    category: "Antibiotiklar",
    manufacturer: "Sandoz (Demo)",
    description: "[TEST / DEMO] Shifokor retsepti bo‘yicha keng spektrli antibakterial vosita. Staging test ma’lumoti.",
    unit: "quti",
    price: 24000,
    icon: "pill",
    analogGroup: "antibiotic",
    requiresPrescription: true,
  },
  {
    sku: "VM-AZIT",
    nameUz: "Azitromitsin 500 mg (Demo)",
    nameRu: "Азитромицин 500 мг (Демо)",
    category: "Antibiotiklar",
    manufacturer: "KRKA (Demo)",
    description: "[TEST / DEMO] Retseptli makrolid guruhi antibiotigi. Staging test ma’lumoti.",
    unit: "quti",
    price: 38000,
    icon: "pill",
    analogGroup: "antibiotic",
    requiresPrescription: true,
  },
  {
    sku: "VM-METF",
    nameUz: "Metformin 850 mg (Demo)",
    nameRu: "Метформин 850 мг (Демо)",
    category: "Surunkali kasalliklar",
    manufacturer: "Merck (Demo)",
    description: "[TEST / DEMO] 2-toifa qandli diabet uchun gipoglikemik vosita. Retsept talab qilinadi. Staging test ma’lumoti.",
    unit: "quti",
    price: 29000,
    icon: "pill",
    analogGroup: "diabetes",
    requiresPrescription: true,
  },
  {
    sku: "VM-ENAL",
    nameUz: "Enalapril 10 mg (Demo)",
    nameRu: "Эналаприл 10 мг (Демо)",
    category: "Surunkali kasalliklar",
    manufacturer: "Gedeon Richter (Demo)",
    description: "[TEST / DEMO] Qon bosimini tushiruvchi APF blokatori. Retsept talab qilinadi. Staging test ma’lumoti.",
    unit: "quti",
    price: 12000,
    icon: "heart-pulse",
    analogGroup: "cardio",
    requiresPrescription: true,
  },
  {
    sku: "VM-ASP",
    nameUz: "Aspirin Cardio 100 mg (Demo)",
    nameRu: "Аспирин Кардио 100 мг (Демо)",
    category: "Yurak-qon tomir",
    manufacturer: "Bayer (Demo)",
    description: "[TEST / DEMO] Tromboz xavfini kamaytiruvchi atsetilsalitsil kislotasi. Staging test ma’lumoti.",
    unit: "quti",
    price: 31000,
    icon: "heart-pulse",
    analogGroup: "cardio",
    requiresPrescription: false,
  },
  {
    sku: "VM-CORV",
    nameUz: "Corvalol 25 ml (Demo)",
    nameRu: "Корвалол 25 мл (Демо)",
    category: "Yurak-qon tomir",
    manufacturer: "Farmak (Demo)",
    description: "[TEST / DEMO] Yengil tinchlantiruvchi sedativ tomchilar. Staging test ma’lumoti.",
    unit: "flakon",
    price: 11000,
    icon: "bottle-tonic",
    analogGroup: "cardio",
    requiresPrescription: false,
  },
  {
    sku: "VM-KAL",
    nameUz: "Kaltsiy D3 Nycomed (Demo)",
    nameRu: "Кальций Д3 Никомед (Демо)",
    category: "Vitaminlar",
    manufacturer: "Takeda (Demo)",
    description: "[TEST / DEMO] Suyak to‘qimasini mustahkamlovchi kaltsiy va vitamin D3. Staging test ma’lumoti.",
    unit: "quti",
    price: 72000,
    icon: "pill",
    analogGroup: "calcium",
    requiresPrescription: false,
  },
  {
    sku: "VM-FEM",
    nameUz: "Femibion natal (Demo)",
    nameRu: "Фемибион natal (Демо)",
    category: "Ona va bola",
    manufacturer: "Merck (Demo)",
    description: "[TEST / DEMO] Homiladorlik va laktatsiya davri uchun multivitamin kompleksi. Staging test ma’lumoti.",
    unit: "quti",
    price: 186000,
    icon: "baby-face-outline",
    analogGroup: "prenatal",
    requiresPrescription: false,
  },
];

/**
 * Executes a controlled, idempotent catalog data seed specifically for staging.
 *
 * Invariants:
 * 1. Strictly asserts APP_ENV=staging and STAGING_DEMO_CATALOG_SEED_ENABLED=true.
 * 2. Writes ONLY to branches, products, and product_stocks tables.
 * 3. Never writes to customers, admin_users, orders, cashback, payments or accounting tables.
 * 4. Idempotent: Skips existing branch codes, product SKUs, and stock (branch_id, product_id) pairs.
 * 5. Non-destructive: Never updates or deletes pre-existing rows.
 * 6. Complies with product_stocks CHECK constraints and bridge trigger:
 *    physical_quantity == quantity, reserved_quantity == 0, available_quantity is not inserted.
 */
export async function seedStagingCatalog(database: any): Promise<StagingCatalogSeedResult> {
  assertStagingCatalogSeedAllowed();

  // 1. Branches: Seed official branches if not already present
  const candidateBranches = buildOfficialBranches();
  const existingBranchRows = await database.select({ code: branches.code }).from(branches);
  const existingBranchCodes = new Set(existingBranchRows.map((r: any) => r.code));
  const branchesToInsert = candidateBranches.filter((b) => !existingBranchCodes.has(b.code));

  let branchesInserted = 0;
  const BRANCH_CHUNK = 50;
  for (let i = 0; i < branchesToInsert.length; i += BRANCH_CHUNK) {
    const chunk = branchesToInsert.slice(i, i + BRANCH_CHUNK);
    await database.insert(branches).values(chunk);
    branchesInserted += chunk.length;
  }

  // 2. Products: Seed demo products if not already present
  const existingProductRows = await database.select({ sku: products.sku }).from(products);
  const existingProductSkus = new Set(existingProductRows.map((r: any) => r.sku));
  const productsToInsert = STAGING_CATALOG_PRODUCTS.filter((p) => !existingProductSkus.has(p.sku));

  let productsInserted = 0;
  const PRODUCT_CHUNK = 50;
  for (let i = 0; i < productsToInsert.length; i += PRODUCT_CHUNK) {
    const chunk = productsToInsert.slice(i, i + PRODUCT_CHUNK);
    await database.insert(products).values(chunk);
    productsInserted += chunk.length;
  }

  // 3. Product Stocks: Establish stock records linking all current branches and products
  const currentBranches = await database.select({ id: branches.id, code: branches.code }).from(branches);
  const currentProducts = await database.select({ id: products.id, sku: products.sku, requiresPrescription: products.requiresPrescription }).from(products);

  const existingStocks = await database
    .select({ branchId: productStocks.branchId, productId: productStocks.productId })
    .from(productStocks);
  const existingStockSet = new Set(existingStocks.map((r: any) => `${r.branchId}:${r.productId}`));

  const stocksToInsert: Array<{
    productId: number;
    branchId: number;
    quantity: number;
    physicalQuantity: number;
    reservedQuantity: number;
  }> = [];

  for (const product of currentProducts) {
    for (const branch of currentBranches) {
      const key = `${branch.id}:${product.id}`;
      if (existingStockSet.has(key)) continue;

      // Realistic non-negative test stock: 8-32 for Rx, 15-59 for OTC
      const baseQty = product.requiresPrescription
        ? 8 + ((branch.id * 7 + product.id * 3) % 25)
        : 15 + ((branch.id * 5 + product.id * 2) % 45);

      stocksToInsert.push({
        productId: product.id,
        branchId: branch.id,
        quantity: baseQty,
        physicalQuantity: baseQty,
        reservedQuantity: 0,
        // availableQuantity is STORED generated column in SQL — must NOT be included in insert
      });
    }
  }

  let stocksInserted = 0;
  const STOCK_CHUNK = 500;
  for (let i = 0; i < stocksToInsert.length; i += STOCK_CHUNK) {
    const chunk = stocksToInsert.slice(i, i + STOCK_CHUNK);
    await database.insert(productStocks).values(chunk);
    stocksInserted += chunk.length;
  }

  // Calculate totals
  const [branchesTotalCount] = await database.select({ count: count() }).from(branches);
  const [productsTotalCount] = await database.select({ count: count() }).from(products);
  const [stocksTotalCount] = await database.select({ count: count() }).from(productStocks);

  return {
    ok: true,
    branchesInserted,
    branchesExisting: existingBranchCodes.size,
    branchesTotal: Number(branchesTotalCount?.count || 0),
    productsInserted,
    productsExisting: existingProductSkus.size,
    productsTotal: Number(productsTotalCount?.count || 0),
    stocksInserted,
    stocksExisting: existingStockSet.size,
    stocksTotal: Number(stocksTotalCount?.count || 0),
  };
}

/**
 * One-off runner against DATABASE_URL (PostgreSQL only).
 * Opens a single connection pool, runs seedStagingCatalog under strict guards, and closes the pool.
 */
export async function runStagingCatalogSeed(): Promise<StagingCatalogSeedResult> {
  assertStagingCatalogSeedAllowed();
  const { isPostgresUrl, resolveDatabaseUrl } = await import("./env");
  const url = resolveDatabaseUrl();
  if (!isPostgresUrl(url)) {
    throw new Error("[staging-catalog-seed] DATABASE_URL=postgres://... is required (PGlite is not a staging database).");
  }
  const pg = (await import("pg")).default;
  const { drizzle: drizzlePg } = await import("drizzle-orm/node-postgres");
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    const database = drizzlePg(pool);
    return await seedStagingCatalog(database);
  } finally {
    await pool.end();
  }
}

