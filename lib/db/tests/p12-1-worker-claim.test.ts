/**
 * P12.1 — worker claim concurrency (FOR UPDATE SKIP LOCKED).
 */
import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { applyMigrations } from "../src/migrate";
import { getMigrationsFolder } from "../src/migrationsPath";
import * as schema from "../src/schema";

describe("P12.1 worker claim concurrency", () => {
  let client: PGlite;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  let workers: typeof import("../../../artifacts/api-server/src/lib/workers");

  before(async () => {
    client = new PGlite();
    await client.waitReady;
    database = drizzle(client, { schema });
    await applyMigrations(database, "pglite", getMigrationsFolder());
    workers = await import("../../../artifacts/api-server/src/lib/workers.ts");
  });

  after(async () => {
    await client.close();
  });

  it("two concurrent runDueWorkerJobs claim the same job at most once", async () => {
    const { job } = await workers.enqueueJob({
      jobType: workers.JOB_TYPES.NOTIFICATION,
      entityKey: "conc-1",
      idempotencyKey: `p121-conc-${Date.now()}`,
      payload: { channel: "noop" },
    }, database as any);

    const [a, b] = await Promise.all([
      workers.runDueWorkerJobs({ limit: 10, workerId: "worker-A" }, database as any),
      workers.runDueWorkerJobs({ limit: 10, workerId: "worker-B" }, database as any),
    ]);

    const processedIds = [...a.results, ...b.results].map((r) => r.jobId);
    const hits = processedIds.filter((id) => id === job.id);
    assert.equal(hits.length, 1, `expected single claim, got ${hits.length}`);

    const row = (await database.select().from(schema.workerJobs).where(eq(schema.workerJobs.id, job.id)))[0];
    assert.equal(row.status, "SUCCEEDED");
    assert.ok(row.attempts >= 1);
  });
});
