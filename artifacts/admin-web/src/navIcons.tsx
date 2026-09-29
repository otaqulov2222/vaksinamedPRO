/**
 * Admin sidebar lucide icons — semantic map (routes/permissions unchanged).
 * Decorative when label is visible; parent button provides accessible name.
 */
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Banknote,
  Receipt,
  CreditCard,
  Warehouse,
  Package,
  BadgePercent,
  Users,
  WalletCards,
  Star,
  Store,
  Truck,
  ChartNoAxesCombined,
  History,
  Cable,
  ShieldUser,
  Settings2,
  LogOut,
} from "lucide-react";

export const NAV_ICON_STROKE = 1.75;
export const NAV_ICON_SIZE = 16;

/** Sidebar nav item id → Lucide icon (routes/permissions unchanged). */
export const NAV_ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  kassa: Banknote,
  orders: Receipt,
  payments: CreditCard,
  inventory: Warehouse,
  products: Package,
  promos: BadgePercent,
  customers: Users,
  cashback: WalletCards,
  ratings: Star,
  branches: Store,
  delivery: Truck,
  reports: ChartNoAxesCombined,
  audit: History,
  fom: Cable,
  admins: ShieldUser,
  settings: Settings2,
};

export const LOGOUT_ICON: LucideIcon = LogOut;
