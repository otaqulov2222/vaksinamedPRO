import { sql } from "drizzle-orm";

type Executor = {
  execute: (query: ReturnType<typeof sql>) => Promise<unknown>;
};

export type DatabaseHealth = {
  ok: boolean;
  database: "up" | "down";
  driver?: "postgres" | "pglite";
  error?: string;
  checkedAt: string;
};

/** Basic connectivity check — not full observability (Q18 later). */
export async function checkDatabaseHealth(
  database: Executor,
  driver?: "postgres" | "pglite",
): Promise<DatabaseHealth> {
  const checkedAt = new Date().toISOString();
  try {
    await database.execute(sql`select 1`);
    return { ok: true, database: "up", driver, checkedAt };
  } catch (error) {
    return {
      ok: false,
      database: "down",
      driver,
      checkedAt,
      error: error instanceof Error ? error.message : "unknown",
    };
  }
}

/** Expected baseline tables after 0000_baseline migration. */
export const BASELINE_TABLES = [
  "customers",
  "auth_otps",
  "pos_sales",
  "branches",
  "products",
  "product_stocks",
  "rewards",
  "promos",
  "carts",
  "cart_items",
  "orders",
  "order_items",
  "payments",
  "deliveries",
  "loyalty_ledger",
  "staff_ratings",
  "admin_users",
  "audit_log",
] as const;

/** P8–P10 delivery / FOM / worker tables (0008_delivery_fom_workers). */
export const P8_P10_TABLES = [
  "delivery_status_history",
  "fom_sale_events",
  "worker_jobs",
] as const;

/** P3 sessions + RBAC tables (0001_sessions_rbac). */
export const P3_AUTH_TABLES = [
  "auth_sessions",
  "auth_roles",
  "auth_permissions",
  "auth_role_permissions",
  "auth_events",
] as const;

/** P4.1 inventory foundation tables (0002_inventory_foundation). */
export const P4_INVENTORY_TABLES = [
  "reservations",
  "reservation_items",
  "inventory_movements",
] as const;

/** P6.1 cashback financial tables (0006_cashback_foundation). */
export const P6_CASHBACK_TABLES = [
  "commercial_transactions",
  "cashback_accounts",
  "cashback_ledger",
  "system_settings",
] as const;

/** P7.1 payment foundation tables (0007_payment_foundation). */
export const P7_PAYMENT_TABLES = [
  "payment_intents",
  "payment_attempts",
  "payment_captures",
  "payment_refunds",
  "payment_webhook_events",
] as const;

export async function listPublicTables(database: Executor): Promise<string[]> {
  const result: unknown = await database.execute(sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);

  const rows = extractRows(result);
  return rows
    .map((row) => String((row as { table_name?: string; tableName?: string }).table_name
      ?? (row as { table_name?: string; tableName?: string }).tableName
      ?? ""))
    .filter(Boolean);
}

export async function listAppliedMigrationHashes(database: Executor): Promise<string[]> {
  try {
    const result: unknown = await database.execute(sql`
      SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at
    `);
    const rows = extractRows(result);
    return rows.map((row) => String((row as { hash?: string }).hash ?? "")).filter(Boolean);
  } catch {
    // Older / alternate table location
    try {
      const result: unknown = await database.execute(sql`
        SELECT hash FROM __drizzle_migrations ORDER BY created_at
      `);
      const rows = extractRows(result);
      return rows.map((row) => String((row as { hash?: string }).hash ?? "")).filter(Boolean);
    } catch {
      return [];
    }
  }
}

function extractRows(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object" && Array.isArray((result as { rows?: unknown[] }).rows)) {
    return (result as { rows: unknown[] }).rows;
  }
  return [];
}
