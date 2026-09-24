import { isHqRole } from "./api";

export type NavItem = {
  id: string;
  label: string;
  /** Required permission, or null for special gates */
  permission: string | null;
  hqOnly?: boolean;
  /** Needs one of these permissions */
  anyOf?: string[];
};

/**
 * Master-spec navigation. Only modules with real API backing.
 * Sozlamalar: HQ-only placeholder — admin users/roles API yo‘q, sahifa buni ochiq aytadi.
 * Hisobotlar: dashboard aggregates only (partial).
 */
export const NAV: NavItem[] = [
  { id: "dashboard", label: "Dashboard", permission: "dashboard:read" },
  { id: "kassa", label: "Kassa POS", permission: "pos:sale" },
  { id: "branches", label: "Filiallar", permission: "branches:read" },
  { id: "products", label: "Katalog", permission: "products:read" },
  { id: "inventory", label: "Ombor", permission: null, anyOf: ["inventory:adjust", "products:read"] },
  { id: "orders", label: "Buyurtmalar", permission: "orders:read" },
  { id: "customers", label: "Mijozlar", permission: "customers:read" },
  { id: "cashback", label: "Cashback", permission: "customers:read" },
  { id: "payments", label: "To‘lovlar", permission: "payments:read" },
  { id: "promos", label: "Aksiyalar", permission: "promos:read" },
  { id: "ratings", label: "Baholar", permission: "ratings:read" },
  { id: "delivery", label: "Yetkazib berish", permission: "delivery:update" },
  { id: "reports", label: "Hisobotlar", permission: "dashboard:read" },
  { id: "audit", label: "Audit", permission: "audit:read" },
  { id: "fom", label: "FOM", permission: null, hqOnly: true },
  { id: "settings", label: "Sozlamalar", permission: null, hqOnly: true },
];

export function navVisible(item: NavItem, permissions: string[], role: string): boolean {
  if (item.hqOnly) return isHqRole(role);
  if (item.anyOf?.length) return item.anyOf.some((p) => permissions.includes(p));
  if (!item.permission) return true;
  return permissions.includes(item.permission);
}

export const PAGE_TITLES: Record<string, string> = {
  dashboard: "Dashboard",
  kassa: "Kassa POS",
  branches: "Filiallar",
  products: "Katalog",
  inventory: "Ombor / Inventory",
  orders: "Buyurtmalar",
  customers: "Mijozlar",
  cashback: "Cashback / Loyalty",
  payments: "To‘lovlar",
  promos: "Aksiyalar",
  ratings: "Baholar",
  delivery: "Yetkazib berish",
  reports: "Hisobotlar",
  audit: "Audit",
  fom: "FOM adapter",
  settings: "Sozlamalar",
};
