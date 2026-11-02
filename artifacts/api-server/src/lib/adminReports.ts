import { and, count, desc, eq, gte, lt, sql, type SQL } from "drizzle-orm";
import {
  branches,
  cashbackAccounts,
  cashbackLedger,
  customers,
  db,
  deliveries,
  orderItems,
  orders,
  payments,
  posSales,
  products,
  productStocks,
} from "@workspace/db";
import { tashkentBusinessDayUtcRange } from "./adminOrderOps";
import { resolveStaffBranchFilter } from "./rbac";
import type { AdminUser } from "@workspace/db";

const DAILY_MAX_DAYS = 90;
const PRODUCT_ROW_CAP = 30;
const BRANCH_ROW_CAP = 50;

export type ReportRange = { start: Date; endExclusive: Date } | null;

export type AdminReportFilters = {
  branchFilter: number | undefined;
  fromRange: ReportRange;
  toRange: ReportRange;
  createdFrom: string | null;
  createdTo: string | null;
};

export function parseReportDateFilters(query: {
  createdFrom?: unknown;
  createdTo?: unknown;
}): { ok: true; fromRange: ReportRange; toRange: ReportRange; createdFrom: string | null; createdTo: string | null }
  | { ok: false } {
  const fromRaw = typeof query.createdFrom === "string" ? query.createdFrom.trim() : "";
  const toRaw = typeof query.createdTo === "string" ? query.createdTo.trim() : "";
  const fromRange = fromRaw ? tashkentBusinessDayUtcRange(fromRaw) : null;
  const toRange = toRaw ? tashkentBusinessDayUtcRange(toRaw) : null;
  if ((fromRaw && !fromRange) || (toRaw && !toRange)) return { ok: false };
  return {
    ok: true,
    fromRange,
    toRange,
    createdFrom: fromRaw || null,
    createdTo: toRaw || null,
  };
}

export function resolveReportFilters(
  user: AdminUser,
  query: { branchId?: unknown; createdFrom?: unknown; createdTo?: unknown },
): AdminReportFilters {
  const dates = parseReportDateFilters(query);
  if (!dates.ok) {
    throw Object.assign(new Error("createdFrom/createdTo YYYY-MM-DD (Asia/Tashkent business day) bo‘lishi kerak"), {
      status: 400,
      code: "INVALID_DATE_FILTER",
    });
  }
  const requestedBranch = query.branchId != null ? Number(query.branchId) : undefined;
  const branchFilter = resolveStaffBranchFilter(
    user,
    Number.isFinite(requestedBranch as number) ? (requestedBranch as number) : undefined,
  );
  return {
    branchFilter,
    fromRange: dates.fromRange,
    toRange: dates.toRange,
    createdFrom: dates.createdFrom,
    createdTo: dates.createdTo,
  };
}

function tashkentDayExpr(column: typeof orders.createdAt | typeof posSales.createdAt) {
  return sql<string>`timezone('Asia/Tashkent', ${column})::date`;
}

function spanDays(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.round((b - a) / 86400000) + 1;
}

export async function loadAdminReport(filters: AdminReportFilters) {
  const orderFilters: SQL[] = [];
  if (filters.branchFilter != null) orderFilters.push(eq(orders.branchId, filters.branchFilter));
  if (filters.fromRange) orderFilters.push(gte(orders.createdAt, filters.fromRange.start));
  if (filters.toRange) orderFilters.push(lt(orders.createdAt, filters.toRange.endExclusive));
  const orderWhere = orderFilters.length ? and(...orderFilters) : undefined;

  const [orderKpis] = await db
    .select({
      orders: count(),
      completed: sql<number>`count(*) filter (where ${orders.status} = 'completed')`.mapWith(Number),
      reserved: sql<number>`count(*) filter (where ${orders.status} = 'reserved')`.mapWith(Number),
      delivering: sql<number>`count(*) filter (where ${orders.status} in ('awaiting_delivery', 'paid'))`.mapWith(Number),
      pendingPayment: sql<number>`count(*) filter (where ${orders.status} = 'pending_payment')`.mapWith(Number),
      cancelled: sql<number>`count(*) filter (where ${orders.status} = 'cancelled')`.mapWith(Number),
      revenue: sql<number>`coalesce(sum(${orders.total}) filter (where ${orders.status} = 'completed'), 0)`.mapWith(Number),
    })
    .from(orders)
    .where(orderWhere);

  const posFilters: SQL[] = [];
  if (filters.branchFilter != null) posFilters.push(eq(posSales.branchId, filters.branchFilter));
  if (filters.fromRange) posFilters.push(gte(posSales.createdAt, filters.fromRange.start));
  if (filters.toRange) posFilters.push(lt(posSales.createdAt, filters.toRange.endExclusive));
  const posWhere = posFilters.length ? and(...posFilters) : undefined;

  const [posKpis] = await db
    .select({
      sales: count(),
      amount: sql<number>`coalesce(sum(${posSales.amount}), 0)`.mapWith(Number),
      payable: sql<number>`coalesce(sum(${posSales.payable}), 0)`.mapWith(Number),
      cashbackEarned: sql<number>`coalesce(sum(${posSales.cashbackEarned}), 0)`.mapWith(Number),
      cashbackUsed: sql<number>`coalesce(sum(${posSales.cashbackUsed}), 0)`.mapWith(Number),
    })
    .from(posSales)
    .where(posWhere);

  const completedOrderFilters: SQL[] = [eq(orders.status, "completed")];
  if (filters.branchFilter != null) completedOrderFilters.push(eq(orders.branchId, filters.branchFilter));
  if (filters.fromRange) completedOrderFilters.push(gte(orders.createdAt, filters.fromRange.start));
  if (filters.toRange) completedOrderFilters.push(lt(orders.createdAt, filters.toRange.endExclusive));
  const completedWhere = and(...completedOrderFilters);

  const productRows = await db
    .select({
      productId: orderItems.productId,
      title: sql<string>`min(${orderItems.title})`,
      sku: sql<string | null>`min(${products.sku})`,
      category: sql<string | null>`min(${products.category})`,
      quantity: sql<number>`coalesce(sum(${orderItems.quantity}), 0)`.mapWith(Number),
      revenue: sql<number>`coalesce(sum(${orderItems.price} * ${orderItems.quantity}), 0)`.mapWith(Number),
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .leftJoin(products, eq(products.id, orderItems.productId))
    .where(completedWhere)
    .groupBy(orderItems.productId)
    .orderBy(desc(sql`coalesce(sum(${orderItems.price} * ${orderItems.quantity}), 0)`))
    .limit(PRODUCT_ROW_CAP);

  const categoryExpr = sql<string>`coalesce(${products.category}, '—')`;
  const categoryRows = await db
    .select({
      category: categoryExpr,
      quantity: sql<number>`coalesce(sum(${orderItems.quantity}), 0)`.mapWith(Number),
      revenue: sql<number>`coalesce(sum(${orderItems.price} * ${orderItems.quantity}), 0)`.mapWith(Number),
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .leftJoin(products, eq(products.id, orderItems.productId))
    .where(completedWhere)
    .groupBy(categoryExpr)
    .orderBy(desc(sql`coalesce(sum(${orderItems.price} * ${orderItems.quantity}), 0)`))
    .limit(20);

  const [productTotals] = await db
    .select({
      quantity: sql<number>`coalesce(sum(${orderItems.quantity}), 0)`.mapWith(Number),
      revenue: sql<number>`coalesce(sum(${orderItems.price} * ${orderItems.quantity}), 0)`.mapWith(Number),
      skus: sql<number>`count(distinct ${orderItems.productId})`.mapWith(Number),
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(completedWhere);

  const branchRows = await db
    .select({
      branchId: orders.branchId,
      name: sql<string>`coalesce(min(${branches.name}), '—')`,
      orders: count(),
      revenue: sql<number>`coalesce(sum(${orders.total}) filter (where ${orders.status} = 'completed'), 0)`.mapWith(Number),
    })
    .from(orders)
    .leftJoin(branches, eq(branches.id, orders.branchId))
    .where(orderWhere)
    .groupBy(orders.branchId)
    .orderBy(desc(sql`coalesce(sum(${orders.total}) filter (where ${orders.status} = 'completed'), 0)`))
    .limit(BRANCH_ROW_CAP);

  const paymentFilters: SQL[] = [];
  if (filters.branchFilter != null) paymentFilters.push(eq(payments.branchId, filters.branchFilter));
  if (filters.fromRange) paymentFilters.push(gte(payments.createdAt, filters.fromRange.start));
  if (filters.toRange) paymentFilters.push(lt(payments.createdAt, filters.toRange.endExclusive));
  const paymentWhere = paymentFilters.length ? and(...paymentFilters) : undefined;

  const paymentRows = await db
    .select({
      status: payments.status,
      provider: payments.provider,
      count: count(),
      amount: sql<number>`coalesce(sum(${payments.amount}), 0)`.mapWith(Number),
    })
    .from(payments)
    .where(paymentWhere)
    .groupBy(payments.status, payments.provider)
    .orderBy(desc(sql`coalesce(sum(${payments.amount}), 0)`));

  const [paymentTotals] = await db
    .select({
      count: count(),
      amount: sql<number>`coalesce(sum(${payments.amount}), 0)`.mapWith(Number),
    })
    .from(payments)
    .where(paymentWhere);

  const ledgerFilters: SQL[] = [];
  if (filters.fromRange) ledgerFilters.push(gte(cashbackLedger.createdAt, filters.fromRange.start));
  if (filters.toRange) ledgerFilters.push(lt(cashbackLedger.createdAt, filters.toRange.endExclusive));
  const ledgerWhere = ledgerFilters.length ? and(...ledgerFilters) : undefined;

  const [cashbackPeriod] = await db
    .select({
      entries: count(),
      earned: sql<number>`coalesce(sum(${cashbackLedger.amount}) filter (where ${cashbackLedger.entryType} = 'EARN'), 0)`.mapWith(Number),
      used: sql<number>`coalesce(sum(${cashbackLedger.amount}) filter (where ${cashbackLedger.entryType} = 'USE'), 0)`.mapWith(Number),
      reversed: sql<number>`coalesce(sum(${cashbackLedger.amount}) filter (where ${cashbackLedger.entryType} = 'REVERSAL'), 0)`.mapWith(Number),
    })
    .from(cashbackLedger)
    .where(ledgerWhere);

  const deliveryRows = await db
    .select({
      status: deliveries.status,
      count: count(),
    })
    .from(deliveries)
    .innerJoin(orders, eq(deliveries.orderId, orders.id))
    .where(orderWhere)
    .groupBy(deliveries.status)
    .orderBy(desc(count()));

  const days = spanDays(filters.createdFrom, filters.createdTo);
  const dailyEnabled = days != null && days > 0 && days <= DAILY_MAX_DAYS;
  let daily: {
    rows: Array<{ day: string; orders: number; orderRevenue: number; posSales: number; posAmount: number }>;
    note: string;
  };
  if (!dailyEnabled) {
    daily = {
      rows: [],
      note: filters.createdFrom && filters.createdTo
        ? `Kunlik qator faqat ${DAILY_MAX_DAYS} kungacha davrda qaytariladi.`
        : "Kunlik qator uchun davr tanlang (maks. 90 kun).",
    };
  } else {
    const orderDay = tashkentDayExpr(orders.createdAt);
    const posDay = tashkentDayExpr(posSales.createdAt);
    const orderDaily = await db
      .select({
        day: orderDay,
        orders: count(),
        orderRevenue: sql<number>`coalesce(sum(${orders.total}) filter (where ${orders.status} = 'completed'), 0)`.mapWith(Number),
      })
      .from(orders)
      .where(orderWhere)
      .groupBy(orderDay)
      .orderBy(orderDay);
    const posDaily = await db
      .select({
        day: posDay,
        posSales: count(),
        posAmount: sql<number>`coalesce(sum(${posSales.amount}), 0)`.mapWith(Number),
      })
      .from(posSales)
      .where(posWhere)
      .groupBy(posDay)
      .orderBy(posDay);
    const byDay = new Map<string, { day: string; orders: number; orderRevenue: number; posSales: number; posAmount: number }>();
    for (const row of orderDaily) {
      const day = String(row.day);
      byDay.set(day, {
        day,
        orders: Number(row.orders) || 0,
        orderRevenue: Number(row.orderRevenue) || 0,
        posSales: 0,
        posAmount: 0,
      });
    }
    for (const row of posDaily) {
      const day = String(row.day);
      const current = byDay.get(day) || { day, orders: 0, orderRevenue: 0, posSales: 0, posAmount: 0 };
      current.posSales = Number(row.posSales) || 0;
      current.posAmount = Number(row.posAmount) || 0;
      byDay.set(day, current);
    }
    daily = {
      rows: [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)),
      note: "Kun — Asia/Tashkent biznes kuni. Buyurtma tushumi faqat yakunlangan.",
    };
  }

  let inventory: {
    branchId: number;
    stockRows: number;
    zeroAvailable: number;
    items: Array<{
      productId: number;
      sku: string;
      nameUz: string;
      physical: number;
      reserved: number;
      available: number;
    }>;
    note: string;
  } | null = null;

  if (filters.branchFilter != null) {
    const stockRows = await db
      .select({
        productId: productStocks.productId,
        physical: productStocks.physicalQuantity,
        reserved: productStocks.reservedQuantity,
        available: productStocks.availableQuantity,
        sku: products.sku,
        nameUz: products.nameUz,
      })
      .from(productStocks)
      .innerJoin(products, eq(products.id, productStocks.productId))
      .where(eq(productStocks.branchId, filters.branchFilter));
    const mapped = stockRows.map((s) => {
      const physical = Number(s.physical) || 0;
      const reserved = Number(s.reserved) || 0;
      const available = s.available != null ? Number(s.available) : physical - reserved;
      return {
        productId: s.productId,
        sku: s.sku,
        nameUz: s.nameUz,
        physical,
        reserved,
        available,
      };
    });
    inventory = {
      branchId: filters.branchFilter,
      stockRows: mapped.length,
      zeroAvailable: mapped.filter((m) => m.available <= 0).length,
      items: [...mapped].sort((a, b) => a.available - b.available || a.sku.localeCompare(b.sku)).slice(0, 12),
      note: "Threshold yo‘q — Available ≤ 0 va eng past available qatorlari (product_stocks).",
    };
  }

  const [customerCount] = await db.select({ value: count() }).from(customers);
  const [branchCount] = await db.select({ value: count() }).from(branches);
  const [cashbackSum] = await db
    .select({
      value: sql<number>`coalesce(sum(${cashbackAccounts.balance}), 0)`.mapWith(Number),
    })
    .from(cashbackAccounts);

  return {
    kpis: {
      revenue: Number(orderKpis?.revenue || 0),
      orders: Number(orderKpis?.orders || 0),
      completed: Number(orderKpis?.completed || 0),
      reserved: Number(orderKpis?.reserved || 0),
      delivering: Number(orderKpis?.delivering || 0),
      pendingPayment: Number(orderKpis?.pendingPayment || 0),
      cancelled: Number(orderKpis?.cancelled || 0),
      customers: Number(customerCount?.value || 0),
      branches: Number(branchCount?.value || 0),
      cashback: Number(cashbackSum?.value || 0),
      cashbackSource: "cashback_accounts" as const,
      customersScope: "global" as const,
      cashbackScope: "global" as const,
      branchesScope: "global" as const,
    },
    pos: {
      sales: Number(posKpis?.sales || 0),
      amount: Number(posKpis?.amount || 0),
      payable: Number(posKpis?.payable || 0),
      cashbackEarned: Number(posKpis?.cashbackEarned || 0),
      cashbackUsed: Number(posKpis?.cashbackUsed || 0),
      source: "pos_sales" as const,
      note: "Kassa savdosi summa asosida — mahsulot qatorlari yo‘q.",
    },
    products: {
      rows: productRows.map((row) => ({
        productId: row.productId,
        title: String(row.title || "—"),
        sku: row.sku ? String(row.sku) : "—",
        category: row.category ? String(row.category) : "—",
        quantity: Number(row.quantity) || 0,
        revenue: Number(row.revenue) || 0,
      })),
      totals: {
        quantity: Number(productTotals?.quantity || 0),
        revenue: Number(productTotals?.revenue || 0),
        skus: Number(productTotals?.skus || 0),
      },
      cap: PRODUCT_ROW_CAP,
      source: "order_items+completed_orders" as const,
      note: "Faqat yakunlangan buyurtmalar. POS mahsulot kesimi yo‘q.",
    },
    categories: {
      rows: categoryRows.map((row) => ({
        category: String(row.category || "—"),
        quantity: Number(row.quantity) || 0,
        revenue: Number(row.revenue) || 0,
      })),
      source: "order_items+completed_orders" as const,
    },
    branchBreakdown: {
      rows: branchRows.map((row) => ({
        branchId: row.branchId,
        name: String(row.name || "—"),
        orders: Number(row.orders) || 0,
        revenue: Number(row.revenue) || 0,
      })),
      cap: BRANCH_ROW_CAP,
      source: "orders" as const,
    },
    payments: {
      rows: paymentRows.map((row) => ({
        status: String(row.status || ""),
        provider: String(row.provider || ""),
        count: Number(row.count) || 0,
        amount: Number(row.amount) || 0,
      })),
      totals: {
        count: Number(paymentTotals?.count || 0),
        amount: Number(paymentTotals?.amount || 0),
      },
      source: "payments" as const,
    },
    cashbackPeriod: {
      entries: Number(cashbackPeriod?.entries || 0),
      earned: Number(cashbackPeriod?.earned || 0),
      used: Number(cashbackPeriod?.used || 0),
      reversed: Number(cashbackPeriod?.reversed || 0),
      source: "cashback_ledger" as const,
      note: "Filial filtri ledgerda yo‘q — butun tarmoq.",
    },
    delivery: {
      rows: deliveryRows.map((row) => ({
        status: String(row.status || ""),
        count: Number(row.count) || 0,
      })),
      source: "deliveries+orders" as const,
    },
    daily,
    inventory,
    filters: {
      branchId: filters.branchFilter ?? null,
      createdFrom: filters.createdFrom,
      createdTo: filters.createdTo,
      timezone: "Asia/Tashkent",
    },
  };
}

function csvEscape(value: unknown): string {
  const s = String(value ?? "");
  if (/[;"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function reportToCsv(report: Awaited<ReturnType<typeof loadAdminReport>>): string {
  const lines: string[] = [];
  const row = (...cells: unknown[]) => lines.push(cells.map(csvEscape).join(";"));
  row("Hisobot", "VaksinaMed");
  row("Davr", report.filters.createdFrom || "…", report.filters.createdTo || "…");
  row("Filial", report.filters.branchId ?? "barcha");
  row("Vaqt mintaqasi", report.filters.timezone);
  row("");
  row("Buyurtmalar");
  row("Tushum", report.kpis.revenue);
  row("Buyurtmalar", report.kpis.orders);
  row("Yakunlangan", report.kpis.completed);
  row("Bekor", report.kpis.cancelled);
  row("");
  row("Kassa POS");
  row("Sotuvlar", report.pos.sales);
  row("Summa", report.pos.amount);
  row("To‘lov", report.pos.payable);
  row("");
  row("Mahsulot", "SKU", "Kategoriya", "Soni", "Tushum");
  for (const item of report.products.rows) {
    row(item.title, item.sku, item.category, item.quantity, item.revenue);
  }
  row("Jami SKU", report.products.totals.skus, "", report.products.totals.quantity, report.products.totals.revenue);
  row("");
  row("Kun", "Buyurtmalar", "Buyurtma tushumi", "POS", "POS summa");
  for (const item of report.daily.rows) {
    row(item.day, item.orders, item.orderRevenue, item.posSales, item.posAmount);
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
