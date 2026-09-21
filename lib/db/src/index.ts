import path from "node:path";
import { mkdirSync } from "node:fs";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import * as schema from "./schema";
import { bootstrapSchema } from "./bootstrap";
import { seedDatabase } from "./seed";

const { Pool } = pg;

function isPostgresUrl(url: string | undefined) {
  return Boolean(url && /^postgres(ql)?:\/\//i.test(url));
}

async function createDatabase() {
  if (isPostgresUrl(process.env.DATABASE_URL)) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const database = drizzlePg(pool, { schema });
    await bootstrapSchema(database);
    await seedDatabase(database);
    return { db: database, pool };
  }

  const dataDir = process.env.PGLITE_DIR || path.resolve(process.cwd(), ".data", "pglite");
  mkdirSync(dataDir, { recursive: true });
  const client = new PGlite(dataDir);
  await client.waitReady;
  const database = drizzlePglite(client, { schema });
  await bootstrapSchema(database);
  await seedDatabase(database);
  return { db: database, pool: null };
}

const instance = await createDatabase();

export const db = instance.db;
export const pool = instance.pool;
export const ready = Promise.resolve();

export * from "./schema";
export * from "./password";
