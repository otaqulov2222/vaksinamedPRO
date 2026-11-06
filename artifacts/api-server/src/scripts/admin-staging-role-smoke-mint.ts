/**
 * On-box session mint for staging role smoke when WebAuthn blocks password login.
 *
 * Guards:
 *   SMOKE_MINT_ENABLED=1
 *   APP_ENV=staging (or SMOKE_MINT_ALLOW_NON_STAGING=1)
 *
 * Env:
 *   SMOKE_HQ_EMAIL (default admin@vaksinamed.uz)
 *   SMOKE_CASHIER_EMAIL (default first active cashier in DB)
 *
 * Prints JSON: { hqToken, cashierToken, hqEmail, cashierEmail } — no passwords.
 * Run on the API host with the same DATABASE_URL / ADMIN_SECRET as the API.
 *
 *   SMOKE_MINT_ENABLED=1 npx tsx src/scripts/admin-staging-role-smoke-mint.ts
 */
import { eq, and } from "drizzle-orm";
import { adminUsers, db } from "@workspace/db";
import { issueAdminSession } from "../lib/auth";
import { flagEnabled } from "../lib/securityEnv";

async function main() {
  if (!flagEnabled("SMOKE_MINT_ENABLED")) {
    throw new Error("Refusing: set SMOKE_MINT_ENABLED=1");
  }
  const appEnv = (process.env.APP_ENV || "").toLowerCase();
  if (appEnv !== "staging" && !flagEnabled("SMOKE_MINT_ALLOW_NON_STAGING")) {
    throw new Error(`Refusing: APP_ENV=${appEnv || "(empty)"} (want staging)`);
  }

  const hqEmail = String(process.env.SMOKE_HQ_EMAIL || "admin@vaksinamed.uz").trim().toLowerCase();
  let cashierEmail = String(process.env.SMOKE_CASHIER_EMAIL || "").trim().toLowerCase();

  const hqRows = await db.select().from(adminUsers).where(eq(adminUsers.email, hqEmail)).limit(1);
  const hq = hqRows[0];
  if (!hq) throw new Error(`HQ admin not found: ${hqEmail}`);

  let cashier = null as typeof hq | null;
  if (cashierEmail) {
    const rows = await db.select().from(adminUsers).where(eq(adminUsers.email, cashierEmail)).limit(1);
    cashier = rows[0] || null;
  } else {
    const rows = await db
      .select()
      .from(adminUsers)
      .where(and(eq(adminUsers.role, "cashier"), eq(adminUsers.status, "active")))
      .limit(1);
    cashier = rows[0] || null;
    cashierEmail = cashier?.email || "";
  }
  if (!cashier) throw new Error("No active cashier found (set SMOKE_CASHIER_EMAIL)");

  const hqToken = await issueAdminSession(hq.id);
  const cashierToken = await issueAdminSession(cashier.id);

  process.stdout.write(
    JSON.stringify(
      {
        hqEmail: hq.email,
        cashierEmail: cashier.email,
        hqRole: hq.role,
        cashierRole: cashier.role,
        cashierBranchId: cashier.branchId,
        hqToken,
        cashierToken,
      },
      null,
      2,
    ) + "\n",
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[smoke-mint]", err instanceof Error ? err.message : err);
    process.exit(1);
  });
