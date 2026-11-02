/**
 * Rotate an admin password in the database.
 *
 * Guards:
 *   ADMIN_PASSWORD_ROTATE_ENABLED=true
 *   DATABASE_URL=postgres://...
 *
 * Required env:
 *   ADMIN_PASSWORD_ROTATE_EMAIL
 *   ADMIN_PASSWORD_ROTATE_NEW
 *
 *   ADMIN_PASSWORD_ROTATE_ENABLED=true ADMIN_PASSWORD_ROTATE_EMAIL=admin@vaksinamed.uz \
 *     ADMIN_PASSWORD_ROTATE_NEW='...' pnpm --filter @workspace/db run set-admin-password
 */
import { eq } from "drizzle-orm";
import { hashPassword } from "../password";
import { adminUsers } from "../schema/admin";

function flagEnabled(name: string): boolean {
  const v = (process.env[name] || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

async function main() {
  if (!flagEnabled("ADMIN_PASSWORD_ROTATE_ENABLED")) {
    throw new Error("[set-admin-password] Refusing: ADMIN_PASSWORD_ROTATE_ENABLED must be true.");
  }
  const email = String(process.env.ADMIN_PASSWORD_ROTATE_EMAIL || "").trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD_ROTATE_NEW || "");
  if (!email || !email.includes("@")) {
    throw new Error("[set-admin-password] ADMIN_PASSWORD_ROTATE_EMAIL is required.");
  }
  if (password.length < 6 || password.length > 128) {
    throw new Error("[set-admin-password] ADMIN_PASSWORD_ROTATE_NEW must be 6–128 characters.");
  }
  if (password === "vaksinamed" || password === "123456") {
    throw new Error("[set-admin-password] Refusing a known demo password.");
  }

  const { isPostgresUrl, resolveDatabaseUrl } = await import("../env");
  const url = resolveDatabaseUrl();
  if (!isPostgresUrl(url)) {
    throw new Error("[set-admin-password] DATABASE_URL=postgres://... is required.");
  }
  const pg = (await import("pg")).default;
  const { drizzle: drizzlePg } = await import("drizzle-orm/node-postgres");
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    const database = drizzlePg(pool);
    const rows = await database.select({ id: adminUsers.id, email: adminUsers.email }).from(adminUsers).where(eq(adminUsers.email, email)).limit(1);
    if (!rows[0]) {
      throw new Error("[set-admin-password] Admin user not found.");
    }
    await database.update(adminUsers).set({
      passwordHash: hashPassword(password),
      updatedAt: new Date(),
    }).where(eq(adminUsers.id, rows[0].id));
    console.log(`[set-admin-password] Password rotated for ${email} (id=${rows[0].id}).`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[set-admin-password] Failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
