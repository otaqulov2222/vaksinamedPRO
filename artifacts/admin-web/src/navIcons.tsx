/**
 * Phase 12.25.1 — Admin sidebar lucide icons (FINAL mapping).
 * Decorative when label is visible; parent button provides accessible name.
 */
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  MonitorSmartphone,
  ShoppingBag,
  CreditCard,
  Warehouse,
  PackageSearch,
  BadgePercent,
  Users,
  WalletCards,
  Star,
  Store,
  Truck,
  ChartNoAxesCombined,
  ClipboardCheck,
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
  kassa: MonitorSmartphone,
  orders: ShoppingBag,
  payments: CreditCard,
  inventory: Warehouse,
  products: PackageSearch,
  promos: BadgePercent,
  customers: Users,
  cashback: WalletCards,
  ratings: Star,
  branches: Store,
  delivery: Truck,
  reports: ChartNoAxesCombined,
  audit: ClipboardCheck,
  fom: Cable,
  admins: ShieldUser,
  settings: Settings2,
};

export const LOGOUT_ICON: LucideIcon = LogOut;
