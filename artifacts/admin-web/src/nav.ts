import { isHqRole } from "./api";

export type NavWeight = "primary" | "secondary" | "low" | "system";

export type NavItem = {
  id: string;
  label: string;
  /** Required permission, or null for special gates */
  permission: string | null;
  hqOnly?: boolean;
  /** Needs one of these permissions */
  anyOf?: string[];
  /** Visual priority in sidebar (Phase 12.8) — does not affect RBAC */
  weight?: NavWeight;
};

export type NavGroup = {
  id: string;
  label: string;
  items: NavItem[];
};

/**
 * Phase 12.8 Information Architecture — operator jobs, not DB entities.
 * Routes/ids unchanged. RBAC unchanged. Server remains security authority.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: "overview",
    label: "Boshqaruv",
    items: [
      { id: "dashboard", label: "Dashboard", permission: "dashboard:read", weight: "primary" },
    ],
  },
  {
    id: "sales",
    label: "Savdo",
    items: [
      { id: "kassa", label: "Kassa POS", permission: "pos:sale", weight: "primary" },
      { id: "orders", label: "Buyurtmalar", permission: "orders:read", weight: "primary" },
      { id: "payments", label: "To‘lovlar", permission: "payments:read", weight: "secondary" },
    ],
  },
  {
    id: "stock",
    label: "Ombor",
    items: [
      { id: "inventory", label: "Ombor", permission: null, anyOf: ["inventory:adjust", "products:read"], weight: "primary" },
      { id: "products", label: "Katalog", permission: "products:read", weight: "secondary" },
      { id: "promos", label: "Aksiyalar", permission: "promos:read", weight: "low" },
    ],
  },
  {
    id: "customers",
    label: "Mijozlar",
    items: [
      { id: "customers", label: "Mijozlar", permission: "customers:read", weight: "secondary" },
      { id: "cashback", label: "Cashback / Loyalty", permission: "customers:read", weight: "low" },
      { id: "ratings", label: "Baholar", permission: "ratings:read", weight: "low" },
    ],
  },
  {
    id: "network",
    label: "Tarmoq",
    items: [
      { id: "branches", label: "Filiallar", permission: "branches:read", weight: "secondary" },
      { id: "delivery", label: "Yetkazib berish", permission: "delivery:update", weight: "secondary" },
    ],
  },
  {
    id: "analytics",
    label: "Tahlil",
    items: [
      { id: "reports", label: "Hisobotlar", permission: "dashboard:read", weight: "low" },
      { id: "audit", label: "Audit", permission: "audit:read", weight: "low" },
    ],
  },
  {
    id: "system",
    label: "Tizim",
    items: [
      { id: "fom", label: "FOM", permission: null, hqOnly: true, weight: "system" },
      { id: "admins", label: "Adminlar", permission: null, hqOnly: true, weight: "system" },
      { id: "settings", label: "Sozlamalar", permission: null, hqOnly: true, weight: "system" },
    ],
  },
];

/** Flat list for lookups / landing logic. */
export const NAV: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

export function navVisible(item: NavItem, permissions: string[], role: string): boolean {
  if (item.hqOnly) return isHqRole(role);
  if (item.anyOf?.length) return item.anyOf.some((p) => permissions.includes(p));
  if (!item.permission) return true;
  return permissions.includes(item.permission);
}

/** Prefer Dashboard as home — never land on FOM/Adminlar/Settings when better options exist. */
export function preferLandingTab(allowed: NavItem[]): string {
  const ids = new Set(allowed.map((i) => i.id));
  if (ids.has("dashboard")) return "dashboard";
  if (ids.has("kassa")) return "kassa";
  if (ids.has("orders")) return "orders";
  const operational = allowed.find((i) => i.id !== "fom" && i.id !== "settings" && i.id !== "admins");
  return operational?.id || allowed[0]?.id || "dashboard";
}

export function groupLabelForTab(tabId: string): string {
  for (const g of NAV_GROUPS) {
    if (g.items.some((i) => i.id === tabId)) return g.label;
  }
  return "Admin";
}

export const PAGE_TITLES: Record<string, string> = {
  dashboard: "Dashboard",
  kassa: "Kassa POS",
  branches: "Filiallar",
  products: "Katalog",
  inventory: "Ombor",
  orders: "Buyurtmalar",
  customers: "Mijozlar",
  cashback: "Cashback / Loyalty",
  payments: "To‘lovlar",
  promos: "Aksiyalar",
  ratings: "Baholar",
  delivery: "Yetkazib berish",
  reports: "Hisobotlar",
  audit: "Audit",
  fom: "FOM",
  admins: "Adminlar",
  settings: "Sozlamalar",
};

/** One short operator line — no technical axes / API jargon. */
export const PAGE_DESCRIPTIONS: Record<string, string> = {
  dashboard: "Bugungi operatsion holat.",
  kassa: "Savdo, cashback va chek.",
  branches: "Filiallar tarmog‘ini boshqarish.",
  products: "Mahsulot katalogini boshqarish.",
  inventory: "Mahsulot qoldig‘i va filiallar bo‘yicha ombor holatini boshqarish.",
  orders: "Buyurtmalarni kuzatish va holatini boshqarish.",
  customers: "Mijozlar, loyalty va cashback holati.",
  cashback: "Cashback balansi va operatsiyalar tarixi.",
  payments: "To‘lovlarni kuzatish va holatini boshqarish.",
  promos: "Aksiyalarni ko‘rish va boshqarish.",
  ratings: "Mijoz baholari va izohlar.",
  delivery: "Yetkazib berish jarayonlarini kuzatish va boshqarish.",
  reports: "Savdo va operatsiya bo‘yicha mavjud hisobotlarni ko‘rish.",
  audit: "Admin amallarining qaydi.",
  fom: "FOM integratsiyasi va operatsion holati.",
  admins: "Joriy sessiya roli va ruxsatlar chegarasi.",
  settings: "Tizim va biznes konfiguratsiyasi.",
};
