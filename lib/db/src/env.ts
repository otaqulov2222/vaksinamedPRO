/**
 * P1 — Database environment resolution.
 * Production target = PostgreSQL. PGlite = local demo only.
 */

export type AppEnvironment = "development" | "test" | "staging" | "production";
export type DbDriver = "postgres" | "pglite";

export function resolveAppEnvironment(): AppEnvironment {
  const explicit = (process.env.APP_ENV || "").toLowerCase();
  if (explicit === "production" || explicit === "staging" || explicit === "test" || explicit === "development") {
    return explicit;
  }
  const nodeEnv = (process.env.NODE_ENV || "").toLowerCase();
  if (nodeEnv === "production") return "production";
  if (nodeEnv === "test") return "test";
  return "development";
}

export function isPostgresUrl(url: string | undefined): boolean {
  return Boolean(url && /^postgres(ql)?:\/\//i.test(url));
}

export function isProductionLike(env: AppEnvironment = resolveAppEnvironment()): boolean {
  return env === "production" || env === "staging";
}

export function resolveDatabaseUrl(): string | undefined {
  if (resolveAppEnvironment() === "test") {
    return process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
  }
  return process.env.DATABASE_URL;
}

/** Decide driver without connecting. */
export function resolveDbDriver(env: AppEnvironment = resolveAppEnvironment()): DbDriver {
  const forced = (process.env.DB_DRIVER || "").toLowerCase();
  if (forced === "postgres" || forced === "pglite") return forced;

  if (env === "production" || env === "staging") return "postgres";

  const url = resolveDatabaseUrl();
  if (isPostgresUrl(url)) return "postgres";
  return "pglite";
}

/**
 * Demo seed is never automatic in production/staging/test.
 * Local PGlite demo seeds by default; Postgres development requires ALLOW_DEMO_SEED=1.
 */
export function shouldAutoSeed(env: AppEnvironment = resolveAppEnvironment(), driver: DbDriver = resolveDbDriver(env)): boolean {
  const flag = (process.env.ALLOW_DEMO_SEED || "").toLowerCase();
  if (flag === "0" || flag === "false" || flag === "no") return false;
  if (env === "production" || env === "staging" || env === "test") return false;
  if (flag === "1" || flag === "true" || flag === "yes") return true;
  return driver === "pglite";
}

export function assertProductionDatabaseConfig(env: AppEnvironment = resolveAppEnvironment()): void {
  if (env !== "production" && env !== "staging") return;

  if (!isPostgresUrl(process.env.DATABASE_URL)) {
    throw new Error(
      `[db] ${env} requires DATABASE_URL=postgres://... (PGlite is not a production database).`,
    );
  }

  if ((process.env.DB_DRIVER || "").toLowerCase() === "pglite") {
    throw new Error(`[db] DB_DRIVER=pglite is forbidden in ${env}.`);
  }

  if (!process.env.ADMIN_SECRET?.trim() || !process.env.CUSTOMER_SECRET?.trim()) {
    throw new Error(
      `[db] ${env} requires ADMIN_SECRET and CUSTOMER_SECRET (no hardcoded defaults).`,
    );
  }
}

/**
 * Prevent destructive test/reset operations from targeting production.
 * TEST_DATABASE_URL should contain "test" (e.g. vaksinamed_test) unless ALLOW_TEST_DB=1.
 */
export function assertSafeTestDatabaseUrl(url: string): void {
  if ((process.env.ALLOW_TEST_DB || "").toLowerCase() === "1") return;

  const lower = url.toLowerCase();
  const looksTest = lower.includes("test") || lower.includes("_test") || lower.includes("/test");
  const looksProd =
    lower.includes("prod") ||
    lower.includes("production") ||
    Boolean(process.env.PRODUCTION_DATABASE_URL && url === process.env.PRODUCTION_DATABASE_URL);

  if (looksProd && !looksTest) {
    throw new Error(
      "[db] Refusing test/reset against a production-looking DATABASE_URL. Use TEST_DATABASE_URL with 'test' in the name, or set ALLOW_TEST_DB=1 deliberately.",
    );
  }

  if (!looksTest && resolveAppEnvironment() === "test") {
    throw new Error(
      '[db] TEST_DATABASE_URL/DATABASE_URL for tests must include "test" in the database name (e.g. vaksinamed_test), or set ALLOW_TEST_DB=1.',
    );
  }
}

export function assertDestructiveOperationAllowed(operation: string): void {
  const env = resolveAppEnvironment();
  if (env === "production" || env === "staging") {
    throw new Error(`[db] Refusing destructive operation "${operation}" in ${env}.`);
  }
  if ((process.env.ALLOW_DESTRUCTIVE_DB || "").toLowerCase() !== "1") {
    throw new Error(
      `[db] Refusing destructive operation "${operation}". Set ALLOW_DESTRUCTIVE_DB=1 only on disposable local/test databases.`,
    );
  }
}
