/**
 * P13 — Real PostgreSQL load / concurrency entry (staging-only).
 *
 * Gate: REAL_POSTGRES_LOAD_TEST=1
 * DB: TEST_DATABASE_URL | DATABASE_URL | embedded-postgres (local real PG binaries)
 *
 * Never enables production Payme/Click or FOM inventory writer.
 * Never targets production databases.
 *
 * Usage:
 *   REAL_POSTGRES_LOAD_TEST=1 pnpm p13:load
 *   REAL_POSTGRES_LOAD_TEST=1 TEST_DATABASE_URL=postgresql://... pnpm p13:load
 */

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { assertSafeTestDatabaseUrl } from "../../../../lib/db/src/env";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const outDir = path.join(root, ".data", "p13-load");

type Bootstrap = {
  connectionString: string;
  source: "TEST_DATABASE_URL" | "DATABASE_URL" | "EMBEDDED_POSTGRES";
  stop?: () => Promise<void>;
};

function flagOn(name: string): boolean {
  const v = (process.env[name] || "").toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function refuseProduction() {
  const app = (process.env.APP_ENV || "").toLowerCase();
  if (app === "production") {
    throw new Error("Refuse: APP_ENV=production — P13 is staging/load only");
  }
  if (flagOn("PAYME_MERCHANT_API_ENABLED") || flagOn("CLICK_MERCHANT_API_ENABLED")) {
    throw new Error("Refuse: production PSP merchant flags must stay off for P13");
  }
  if (flagOn("FOM_INVENTORY_WRITER_ENABLED")) {
    throw new Error("Refuse: FOM inventory writer must stay OFF");
  }
}

function writePending(reason: string) {
  mkdirSync(outDir, { recursive: true });
  const report = {
    at: new Date().toISOString(),
    REAL_PG_LOAD: "PENDING",
    REAL_PG_LOAD_PENDING: true,
    reason,
    note: "PASS requires real PostgreSQL multi-connection proof. Do not claim PASS without evidence.",
  };
  const reportPath = path.join(outDir, "last-report.json");
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, reportPath }, null, 2));
}

async function bootstrapPostgres(): Promise<Bootstrap | null> {
  const testUrl = process.env.TEST_DATABASE_URL?.trim();
  const dbUrl = process.env.DATABASE_URL?.trim();
  if (testUrl && /^postgres(ql)?:\/\//i.test(testUrl)) {
    assertSafeTestDatabaseUrl(testUrl);
    return { connectionString: testUrl, source: "TEST_DATABASE_URL" };
  }
  if (dbUrl && /^postgres(ql)?:\/\//i.test(dbUrl)) {
    assertSafeTestDatabaseUrl(dbUrl);
    return { connectionString: dbUrl, source: "DATABASE_URL" };
  }

  // Local real PostgreSQL binaries via embedded-postgres (not PGlite).
  try {
    const require = createRequire(import.meta.url);
    // Prefer package from api-server node_modules
    let EmbeddedPostgres: new (opts: Record<string, unknown>) => {
      initialise: () => Promise<void>;
      start: () => Promise<void>;
      stop: () => Promise<void>;
      createDatabase: (name: string) => Promise<void>;
    };
    try {
      EmbeddedPostgres = require("embedded-postgres").default || require("embedded-postgres");
    } catch {
      const alt = path.join(root, "node_modules", "embedded-postgres");
      if (!existsSync(alt)) throw new Error("embedded-postgres not installed");
      EmbeddedPostgres = require(alt).default || require(alt);
    }

    const dataDir = path.join(outDir, "embedded-pg");
    mkdirSync(dataDir, { recursive: true });
    const port = Number(process.env.P13_EMBEDDED_PG_PORT || 55433);
    const password = "p13_load_only";
    const user = "postgres";
    const dbName = "vaksinamed_p13_test";

    const pg = new EmbeddedPostgres({
      databaseDir: dataDir,
      user,
      password,
      port,
      persistent: false,
      initdbFlags: ["--encoding=UTF8", "--locale=C"],
    });
    await pg.initialise();
    await pg.start();
    try {
      await pg.createDatabase(dbName);
    } catch {
      // may already exist on rare restart
    }
    const connectionString = `postgresql://${user}:${password}@127.0.0.1:${port}/${dbName}`;
    return {
      connectionString,
      source: "EMBEDDED_POSTGRES",
      stop: async () => {
        try {
          await pg.stop();
        } catch {
          /* ignore */
        }
      },
    };
  } catch (err) {
    console.error(
      JSON.stringify({
        embeddedPostgresError: err instanceof Error ? err.message : String(err),
      }),
    );
    return null;
  }
}

async function main() {
  refuseProduction();

  if (!flagOn("REAL_POSTGRES_LOAD_TEST")) {
    writePending("REAL_PG_LOAD_PENDING — set REAL_POSTGRES_LOAD_TEST=1 and provide TEST_DATABASE_URL or allow embedded-postgres");
    process.exit(0);
  }

  process.env.PAYME_MERCHANT_API_ENABLED = "0";
  process.env.CLICK_MERCHANT_API_ENABLED = "0";
  // Capture path uses provider "simulate" against real PG — not live PSP network.
  process.env.ALLOW_PAYMENT_SIMULATE = "1";

  const boot = await bootstrapPostgres();
  if (!boot) {
    writePending(
      "REAL_PG_LOAD_PENDING — no TEST_DATABASE_URL/DATABASE_URL and embedded-postgres failed to start (install Docker postgres profile or embedded-postgres)",
    );
    process.exit(0);
  }

  process.env.APP_ENV = process.env.APP_ENV || "test";
  process.env.NODE_ENV = process.env.NODE_ENV || "test";
  process.env.DB_DRIVER = "postgres";
  process.env.ALLOW_TEST_DB = "1";
  process.env.TEST_DATABASE_URL = boot.connectionString;
  process.env.DATABASE_URL = boot.connectionString;
  process.env.PG_POOL_MAX = process.env.PG_POOL_MAX || "40";
  process.env.ADMIN_SECRET = process.env.ADMIN_SECRET || "p13-admin-secret-not-prod";
  process.env.CUSTOMER_SECRET = process.env.CUSTOMER_SECRET || "p13-customer-secret-not-prod";
  process.env.POS_SECRET = process.env.POS_SECRET || "p13-pos-secret-not-prod";

  try {
    const { runP13Load } = await import("./p13-real-pg-runner.ts");
    const report = await runP13Load({
      connectionString: boot.connectionString,
      source: boot.source,
      outDir,
    });
    const reportPath = path.join(outDir, "last-report.json");
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ...report, reportPath }, null, 2));
    // Drain pool before stopping embedded PG to avoid ECONNRESET crash on exit
    try {
      const { pool } = await import("@workspace/db");
      if (pool) await pool.end();
    } catch {
      /* ignore */
    }
    if (report.REAL_PG_LOAD === "FAIL") process.exitCode = 1;
  } finally {
    if (boot.stop) {
      try {
        await boot.stop();
      } catch {
        /* ignore stop races */
      }
    }
  }
}

main().catch((err) => {
  console.error(
    JSON.stringify({
      REAL_PG_LOAD: "FAIL",
      error: err instanceof Error ? err.message : String(err),
    }),
  );
  process.exit(1);
});
