import { branches } from "./schema/branches";
import { products, productStocks, rewards, promos } from "./schema/catalog";
import { customers } from "./schema/customers";
import { loyaltyLedger } from "./schema/commerce";
import { adminUsers } from "./schema/admin";
import { hashPassword } from "./password";
import { eq } from "drizzle-orm";
import officialBranches from "./data/branches.json";

function buildBranches() {
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

const PRODUCT_SEED = [
  { sku: "VM-D3-60", nameUz: "Vitamin D3 2000 IU", nameRu: "Витамин D3 2000 IU", category: "Vitaminlar", manufacturer: "Solgar", description: "Suyak va immunitet uchun D3 vitamini, 60 kapsula.", price: 89000, icon: "pill", analogGroup: "vitamin-d", rx: false },
  { sku: "VM-C-1000", nameUz: "Askorbin kislotasi 1000 mg", nameRu: "Аскорбиновая кислота 1000 мг", category: "Vitaminlar", manufacturer: "Evalar", description: "Immunitetni qo‘llab-quvvatlovchi C vitamini.", price: 42000, icon: "leaf", analogGroup: "vitamin-c", rx: false },
  { sku: "VM-MG-B6", nameUz: "Magniy + B6", nameRu: "Магний + B6", category: "Vitaminlar", manufacturer: "Now Foods", description: "Asab tizimi va uyqu uchun magniy kompleksi.", price: 76000, icon: "pill", analogGroup: "magnesium", rx: false },
  { sku: "VM-OMEGA", nameUz: "Omega-3 1000 mg", nameRu: "Омега-3 1000 мг", category: "Vitaminlar", manufacturer: "Doppelherz", description: "Yurak va tomirlar uchun baliq yog‘i.", price: 118000, icon: "water", analogGroup: "omega", rx: false },
  { sku: "VM-ZINC", nameUz: "Rux 25 mg", nameRu: "Цинк 25 мг", category: "Vitaminlar", manufacturer: "Nature's Bounty", description: "Immunitet va teri uchun rux preparati.", price: 39000, icon: "pill", analogGroup: "zinc", rx: false },
  { sku: "VM-PARA", nameUz: "Paratsetamol 500 mg", nameRu: "Парацетамол 500 мг", category: "Og‘riq va isitma", manufacturer: "Nika Pharm", description: "Isitma va og‘riqni pasaytiruvchi vosita.", price: 8000, icon: "thermometer", analogGroup: "analgesic", rx: false },
  { sku: "VM-IBU", nameUz: "Ibuprofen 400 mg", nameRu: "Ибупрофен 400 мг", category: "Og‘riq va isitma", manufacturer: "Bosnalijek", description: "Yallig‘lanishga qarshi og‘riq qoldiruvchi.", price: 14000, icon: "thermometer", analogGroup: "analgesic", rx: false },
  { sku: "VM-NURO", nameUz: "Nurofen 200 mg", nameRu: "Нурофен 200 мг", category: "Og‘riq va isitma", manufacturer: "Reckitt", description: "Tez ta’sir qiluvchi ibuprofen.", price: 28000, icon: "thermometer", analogGroup: "analgesic", rx: false },
  { sku: "VM-LOR", nameUz: "Loratadin 10 mg", nameRu: "Лоратадин 10 мг", category: "Allergiya", manufacturer: "Nobel", description: "Mavsumiy allergiya uchun antigistamin.", price: 16000, icon: "flower-outline", analogGroup: "allergy", rx: false },
  { sku: "VM-CLAR", nameUz: "Klaritin 10 mg", nameRu: "Кларитин 10 мг", category: "Allergiya", manufacturer: "Bayer", description: "Loratadin asosidagi allergiya vositasi.", price: 34000, icon: "flower-outline", analogGroup: "allergy", rx: false },
  { sku: "VM-CET", nameUz: "Setirizin 10 mg", nameRu: "Цетиризин 10 мг", category: "Allergiya", manufacturer: "Gedeon Richter", description: "Allergik rinit va toshma uchun.", price: 19000, icon: "flower-outline", analogGroup: "allergy", rx: false },
  { sku: "VM-ACC", nameUz: "ACC 200 mg", nameRu: "АЦЦ 200 мг", category: "Shamollash", manufacturer: "Sandoz", description: "Balg‘am ko‘chiruvchi asetilsistein.", price: 47000, icon: "weather-windy", analogGroup: "cough", rx: false },
  { sku: "VM-AMB", nameUz: "Ambroksol 30 mg", nameRu: "Амброксол 30 мг", category: "Shamollash", manufacturer: "Berlin-Chemie", description: "Yo‘tal va balg‘am uchun.", price: 21000, icon: "weather-windy", analogGroup: "cough", rx: false },
  { sku: "VM-AQUA", nameUz: "Aqua Maris sprey", nameRu: "Аква Марис спрей", category: "Shamollash", manufacturer: "Jadran", description: "Burun bo‘shlig‘ini yuvish uchun dengiz suvi.", price: 36000, icon: "water", analogGroup: "nasal", rx: false },
  { sku: "VM-OSK", nameUz: "Oksalin malham", nameRu: "Оксолиновая мазь", category: "Shamollash", manufacturer: "Nika Pharm", description: "Virusli infeksiyalardan himoya malhami.", price: 9000, icon: "medical-bag", analogGroup: "nasal", rx: false },
  { sku: "VM-SMEC", nameUz: "Smecta", nameRu: "Смекта", category: "Ovqat hazm", manufacturer: "Ipsen", description: "Ichak buzilishi uchun adsorbent.", price: 32000, icon: "medical-bag", analogGroup: "digest", rx: false },
  { sku: "VM-OME", nameUz: "Omeprazol 20 mg", nameRu: "Омепразол 20 мг", category: "Ovqat hazm", manufacturer: "KRKA", description: "Oshqozon kislotasini kamaytiradi.", price: 18000, icon: "medical-bag", analogGroup: "digest", rx: false },
  { sku: "VM-LINE", nameUz: "Linex", nameRu: "Линекс", category: "Ovqat hazm", manufacturer: "Sandoz", description: "Ichak florasini tiklovchi probiotik.", price: 64000, icon: "bacteria", analogGroup: "probiotic", rx: false },
  { sku: "VM-ESP", nameUz: "Espumizan", nameRu: "Эспумизан", category: "Ovqat hazm", manufacturer: "Berlin-Chemie", description: "Metiorizm va qorin shishishi uchun.", price: 41000, icon: "medical-bag", analogGroup: "digest", rx: false },
  { sku: "VM-PAN", nameUz: "Pankreatin 10000", nameRu: "Панкреатин 10000", category: "Ovqat hazm", manufacturer: "Bioline", description: "Ovqat hazm fermentlari.", price: 27000, icon: "medical-bag", analogGroup: "digest", rx: false },
  { sku: "VM-BET", nameUz: "Bepanten 5%", nameRu: "Бепантен 5%", category: "Teri parvarishi", manufacturer: "Bayer", description: "Teri tiklanishi uchun deksantenol.", price: 52000, icon: "spa", analogGroup: "skin", rx: false },
  { sku: "VM-DEX", nameUz: "Deksantenol krem", nameRu: "Декспантенол крем", category: "Teri parvarishi", manufacturer: "Nika Pharm", description: "Quruq va shikastlangan teri uchun.", price: 18000, icon: "spa", analogGroup: "skin", rx: false },
  { sku: "VM-IOD", nameUz: "Yod 5% 10 ml", nameRu: "Йод 5% 10 мл", category: "Antiseptik", manufacturer: "Nika Pharm", description: "Teri yuzasini davolash uchun yod eritmasi.", price: 4000, icon: "bottle-tonic", analogGroup: "antiseptic", rx: false },
  { sku: "VM-H2O2", nameUz: "Vodorod peroksid 3%", nameRu: "Перекись водорода 3%", category: "Antiseptik", manufacturer: "Nika Pharm", description: "Yaralarni tozalash uchun antiseptik.", price: 3500, icon: "bottle-tonic", analogGroup: "antiseptic", rx: false },
  { sku: "VM-BAND", nameUz: "Steril bint 5 m", nameRu: "Стерильный бинт 5 м", category: "Tibbiy buyumlar", manufacturer: "Medtex", description: "Bog‘lash uchun steril bint.", price: 6000, icon: "bandage", analogGroup: "first-aid", rx: false },
  { sku: "VM-TERM", nameUz: "Elektron termometr", nameRu: "Электронный термометр", category: "Tibbiy buyumlar", manufacturer: "Omron", description: "Tezkor tana haroratini o‘lchash.", price: 89000, icon: "thermometer", analogGroup: "device", rx: false },
  { sku: "VM-MASK", nameUz: "Tibbiy niqob 50 dona", nameRu: "Медицинская маска 50 шт", category: "Tibbiy buyumlar", manufacturer: "MedProtect", description: "Bir martalik 3 qatlamli niqob.", price: 18000, icon: "face-mask", analogGroup: "first-aid", rx: false },
  { sku: "VM-GLUC", nameUz: "Glyukometr test-lenta", nameRu: "Тест-полоски глюкометра", category: "Tibbiy buyumlar", manufacturer: "Accu-Chek", description: "Qon shakarini nazorat qilish uchun.", price: 125000, icon: "water", analogGroup: "device", rx: false },
  { sku: "VM-AMOX", nameUz: "Amoksitsillin 500 mg", nameRu: "Амоксициллин 500 мг", category: "Antibiotiklar", manufacturer: "Sandoz", description: "Shifokor retsepti bo‘yicha antibiotik.", price: 24000, icon: "pill", analogGroup: "antibiotic", rx: true },
  { sku: "VM-AZIT", nameUz: "Azitromitsin 500 mg", nameRu: "Азитромицин 500 мг", category: "Antibiotiklar", manufacturer: "KRKA", description: "Keng spektrli antibiotik, retsept bilan.", price: 38000, icon: "pill", analogGroup: "antibiotic", rx: true },
  { sku: "VM-METF", nameUz: "Metformin 850 mg", nameRu: "Метформин 850 мг", category: "Surunkali kasalliklar", manufacturer: "Merck", description: "Qandli diabet 2-toifa uchun, retsept bilan.", price: 29000, icon: "pill", analogGroup: "diabetes", rx: true },
  { sku: "VM-ENAL", nameUz: "Enalapril 10 mg", nameRu: "Эналаприл 10 мг", category: "Surunkali kasalliklar", manufacturer: "Gedeon Richter", description: "Qon bosimini nazorat qilish, retsept bilan.", price: 12000, icon: "heart-pulse", analogGroup: "cardio", rx: true },
  { sku: "VM-ASP", nameUz: "Aspirin Cardio 100 mg", nameRu: "Аспирин Кардио 100 мг", category: "Yurak-qon tomir", manufacturer: "Bayer", description: "Yurak xavfini kamaytirish uchun.", price: 31000, icon: "heart-pulse", analogGroup: "cardio", rx: false },
  { sku: "VM-CORV", nameUz: "Corvalol 25 ml", nameRu: "Корвалол 25 мл", category: "Yurak-qon tomir", manufacturer: "Farmak", description: "Yengil tinchlantiruvchi tomchilar.", price: 11000, icon: "bottle-tonic", analogGroup: "cardio", rx: false },
  { sku: "VM-KAL", nameUz: "Kaltsiy D3 Nycomed", nameRu: "Кальций Д3 Никомед", category: "Vitaminlar", manufacturer: "Takeda", description: "Suyak to‘qimasini mustahkamlash.", price: 72000, icon: "pill", analogGroup: "calcium", rx: false },
  { sku: "VM-FEM", nameUz: "Femibion natal", nameRu: "Фемибион natal", category: "Ona va bola", manufacturer: "Merck", description: "Homiladorlik davri uchun vitaminlar.", price: 186000, icon: "baby-face-outline", analogGroup: "prenatal", rx: false },
];

export async function seedDatabase(database: any) {
  const existing = await database.select().from(customers).limit(1);
  if (existing[0]) return;

  await database.insert(customers).values({
    telegramId: "firdavs",
    firstName: "Firdavs",
    lastName: "",
    phone: "+998 90 123 45 67",
    passwordHash: hashPassword("123456"),
    language: "uz",
    tier: "Gold",
    balance: 125500,
    purchasesCount: 18,
    totalPurchases: 4850000,
    savedAmount: 125500,
    redeemedRewards: "[]",
  });

  await database.insert(adminUsers).values([
    {
      email: "admin@vaksinamed.uz",
      name: "HQ Administrator",
      passwordHash: hashPassword("vaksinamed"),
      role: "super_admin",
    },
    {
      email: "kassa@vaksinamed.uz",
      name: "Filial kassiri",
      passwordHash: hashPassword("kassa123"),
      role: "cashier",
      branchId: 12,
    },
  ]);

  const branchRows = buildBranches();
  await database.insert(branches).values(branchRows);

  await database.insert(products).values(
    PRODUCT_SEED.map((item) => ({
      sku: item.sku,
      nameUz: item.nameUz,
      nameRu: item.nameRu,
      category: item.category,
      manufacturer: item.manufacturer,
      description: item.description,
      price: item.price,
      icon: item.icon,
      analogGroup: item.analogGroup,
      requiresPrescription: item.rx,
    })),
  );

  const allBranches = await database.select().from(branches);
  const allProducts = await database.select().from(products);
  const stocks = [];
  for (const product of allProducts) {
    for (const branch of allBranches) {
      const qty = product.requiresPrescription ? 8 + (branch.id * product.id) % 20 : 12 + ((branch.id + product.id) % 40);
      stocks.push({ productId: product.id, branchId: branch.id, quantity: qty });
    }
  }
  const chunk = 500;
  for (let i = 0; i < stocks.length; i += chunk) {
    await database.insert(productStocks).values(stocks.slice(i, i + chunk));
  }

  await database.insert(rewards).values([
    { code: "discount", title: "Barcha mahsulotlarga 10% chegirma", subtitle: "Keyingi xaridingizda", points: 500, icon: "percent", accent: "#fff1c9" },
    { code: "vitamin", title: "Vitamin D3", subtitle: "60 kapsula", points: 1000, icon: "pill", accent: "#fff2d5" },
    { code: "bag", title: "Kosmetichka", subtitle: "Vaksina Med", points: 1500, icon: "shopping", accent: "#f1e7f7" },
    { code: "thermos", title: "Termos", subtitle: "Vaksina Med", points: 2000, icon: "coffee", accent: "#fff1c9" },
  ]);

  await database.insert(promos).values([
    { title: "Vitaminlar haftaligi", subtitle: "Vitaminlar uchun 5% cashback", tag: "01.10 — 07.10", icon: "pill", background: "#f0e8f7" },
    { title: "Sodiq mijozlar kuni", subtitle: "Barcha mahsulotlarga 10% chegirma", tag: "Faqat Gold uchun", icon: "star-four-points", background: "#fff2d5" },
    { title: "Sog‘lom parvarish", subtitle: "Kosmetika xaridida maxsus bonuslar", tag: "Yangi", icon: "flower-outline", background: "#f9e9ee" },
  ]);

  const firdavs = await database.select().from(customers).where(eq(customers.telegramId, "firdavs")).limit(1);
  if (firdavs[0]) {
    await database.insert(loyaltyLedger).values([
      { customerId: firdavs[0].id, externalId: "10582", date: "18.09.2026", title: "Vitaminlar va parvarish", branch: "Vaksina Med №12", amount: 500000, cashback: 25000, kind: "earn" },
      { customerId: firdavs[0].id, externalId: "10321", date: "15.09.2026", title: "Oilaviy xarid", branch: "Vaksina Med №12", amount: 300000, cashback: 20000, kind: "use" },
      { customerId: firdavs[0].id, externalId: "9981", date: "10.09.2026", title: "Dori vositalari", branch: "Vaksina Med №7", amount: 420000, cashback: 15000, kind: "earn" },
      { customerId: firdavs[0].id, externalId: "9834", date: "04.09.2026", title: "Kosmetika", branch: "Vaksina Med №12", amount: 275000, cashback: 9000, kind: "earn" },
    ]);
  }
}
