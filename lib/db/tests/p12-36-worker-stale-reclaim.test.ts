/**
 * Phase 12.36 — stale RUNNING reclaim + crash recovery (PostgreSQL worker_jobs).
 * Local PGlite simulation — not production HA evidence.
 */
import assert from "node:assert/strict";
import { describe, it, before, after, beforeEach } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { applyMigrations } from "../src/migrate";
import { getMigrationsFolder } from "../src/migrationsPath";
import * as schema from "../src/schema";

describe("P12.36 worker stale RUNNING reclaim", () => {
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

  beforeEach(async () => {
    await database.delete(schema.workerJobs);
  });

  it("1–3. normal claim → SUCCEEDED; retry FAILED → reclaimable by status", async () => {
    const { job } = await workers.enqueueJob(
      {
        jobType: workers.JOB_TYPES.NOTIFICATION,
        entityKey: "ok-1",
        idempotencyKey: `p1236-ok-${Date.now()}`,
        payload: { channel: "noop" },
      },
      database as any,
    );
    const run = await workers.runDueWorkerJobs(
      { limit: 5, workerId: "w-ok", skipReclaim: true },
      database as any,
    );
    assert.equal(run.results.filter((r) => r.jobId === job.id && r.status === "SUCCEEDED").length, 1);
    const row = (await database.select().from(schema.workerJobs).where(eq(schema.workerJobs.id, job.id)))[0];
    assert.equal(row.status, "SUCCEEDED");
    assert.ok(row.attempts >= 1);
  });

  it("5–6. stale RUNNING reclaimed; fresh RUNNING not reclaimed", async () => {
    const now = new Date();
    const staleInserted = await database
      .insert(schema.workerJobs)
      .values({
        jobType: workers.JOB_TYPES.NOTIFICATION,
        entityKey: "stale",
        status: "RUNNING",
        attempts: 1,
        maxAttempts: 5,
        lockedAt: new Date(now.getTime() - 60 * 60 * 1000),
        lockedBy: "dead-worker",
        payload: JSON.stringify({ channel: "noop" }),
        runAfter: now,
      })
      .returning();
    const freshInserted = await database
      .insert(schema.workerJobs)
      .values({
        jobType: workers.JOB_TYPES.NOTIFICATION,
        entityKey: "fresh",
        status: "RUNNING",
        attempts: 1,
        maxAttempts: 5,
        lockedAt: now,
        lockedBy: "alive-worker",
        payload: JSON.stringify({ channel: "noop" }),
        runAfter: now,
      })
      .returning();

    const reclaim = await workers.reclaimStaleRunningJobs(
      { now, staleMs: 15 * 60 * 1000, limit: 20 },
      database as any,
    );
    assert.equal(reclaim.reclaimed, 1);
    assert.equal(reclaim.jobs[0]?.id, staleInserted[0].id);
    assert.equal(reclaim.jobs[0]?.status, "FAILED");

    const stale = (await database.select().from(schema.workerJobs).where(eq(schema.workerJobs.id, staleInserted[0].id)))[0];
    const fresh = (await database.select().from(schema.workerJobs).where(eq(schema.workerJobs.id, freshInserted[0].id)))[0];
    assert.equal(stale.status, "FAILED");
    assert.equal(stale.lastError, "stale_running_reclaimed");
    assert.equal(stale.lockedBy, "");
    assert.equal(stale.attempts, 1, "reclaim must not bump attempts");
    assert.equal(fresh.status, "RUNNING");
    assert.equal(fresh.lockedBy, "alive-worker");
  });

  it("7–8. reclaim respects max attempts → DEAD; attempts unchanged", async () => {
    const now = new Date();
    const inserted = await database
      .insert(schema.workerJobs)
      .values({
        jobType: workers.JOB_TYPES.NOTIFICATION,
        entityKey: "dead",
        status: "RUNNING",
        attempts: 5,
        maxAttempts: 5,
        lockedAt: new Date(now.getTime() - 60 * 60 * 1000),
        lockedBy: "dead-worker",
        payload: JSON.stringify({ channel: "noop" }),
        runAfter: now,
      })
      .returning();

    const reclaim = await workers.reclaimStaleRunningJobs(
      { now, staleMs: 1000, limit: 10 },
      database as any,
    );
    assert.equal(reclaim.reclaimed, 1);
    assert.equal(reclaim.dead, 1);
    const row = (await database.select().from(schema.workerJobs).where(eq(schema.workerJobs.id, inserted[0].id)))[0];
    assert.equal(row.status, "DEAD");
    assert.equal(row.attempts, 5);
  });

  it("9–11. reclaim then another worker can claim; concurrent claim still single", async () => {
    const now = new Date();
    const inserted = await database
      .insert(schema.workerJobs)
      .values({
        jobType: workers.JOB_TYPES.NOTIFICATION,
        entityKey: "reclaim-claim",
        status: "RUNNING",
        attempts: 1,
        maxAttempts: 5,
        lockedAt: new Date(now.getTime() - 60 * 60 * 1000),
        lockedBy: "crashed",
        payload: JSON.stringify({ channel: "noop" }),
        runAfter: now,
        idempotencyKey: `p1236-rc-${Date.now()}`,
      })
      .returning();

    // Make FAILED immediately eligible (run_after = now)
    await workers.reclaimStaleRunningJobs({ now, staleMs: 1000 }, database as any);
    const after = (await database.select().from(schema.workerJobs).where(eq(schema.workerJobs.id, inserted[0].id)))[0];
    assert.equal(after.status, "FAILED");
    await database
      .update(schema.workerJobs)
      .set({ runAfter: now })
      .where(eq(schema.workerJobs.id, inserted[0].id));

    const [a, b] = await Promise.all([
      workers.runDueWorkerJobs({ limit: 10, workerId: "w-a", skipReclaim: true }, database as any),
      workers.runDueWorkerJobs({ limit: 10, workerId: "w-b", skipReclaim: true }, database as any),
    ]);
    const hits = [...a.results, ...b.results].filter((r) => r.jobId === inserted[0].id && r.status === "SUCCEEDED");
    assert.equal(hits.length, 1);
    const final = (await database.select().from(schema.workerJobs).where(eq(schema.workerJobs.id, inserted[0].id)))[0];
    assert.equal(final.status, "SUCCEEDED");
    assert.equal(final.attempts, 2, "second claim increments attempts once");
  });

  it("12. crash simulation: claim without complete → stale reclaim → single success", async () => {
    const { job } = await workers.enqueueJob(
      {
        jobType: workers.JOB_TYPES.NOTIFICATION,
        entityKey: "crash",
        idempotencyKey: `p1236-crash-${Date.now()}`,
        payload: { channel: "noop" },
      },
      database as any,
    );

    // Force claim into RUNNING without processing (simulates crash after claim).
    const now = new Date();
    await database
      .update(schema.workerJobs)
      .set({
        status: "RUNNING",
        attempts: 1,
        lockedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
        lockedBy: "crashed-pid",
        updatedAt: now,
      })
      .where(eq(schema.workerJobs.id, job.id));

    const run = await workers.runDueWorkerJobs(
      { limit: 10, workerId: "survivor", staleMs: 60_000 },
      database as any,
    );
    assert.ok(run.reclaim && run.reclaim.reclaimed >= 1);
    const successes = run.results.filter((r) => r.jobId === job.id && r.status === "SUCCEEDED");
    assert.equal(successes.length, 1);
    const final = (await database.select().from(schema.workerJobs).where(eq(schema.workerJobs.id, job.id)))[0];
    assert.equal(final.status, "SUCCEEDED");
  });

  it("race: reclaim loses to legitimate SUCCEEDED completion", async () => {
    const now = new Date();
    const inserted = await database
      .insert(schema.workerJobs)
      .values({
        jobType: workers.JOB_TYPES.NOTIFICATION,
        entityKey: "race",
        status: "RUNNING",
        attempts: 1,
        maxAttempts: 5,
        lockedAt: new Date(now.getTime() - 60 * 60 * 1000),
        lockedBy: "w-race",
        payload: JSON.stringify({ channel: "noop" }),
        runAfter: now,
      })
      .returning();

    // Completion wins first (still RUNNING + matching lockedBy).
    const done = await database
      .update(schema.workerJobs)
      .set({
        status: "SUCCEEDED",
        result: JSON.stringify({ ok: true }),
        lockedAt: null,
        lockedBy: "",
        updatedAt: now,
      })
      .where(eq(schema.workerJobs.id, inserted[0].id))
      .returning();
    assert.equal(done[0].status, "SUCCEEDED");

    const reclaim = await workers.reclaimStaleRunningJobs({ now, staleMs: 1000 }, database as any);
    assert.equal(reclaim.reclaimed, 0);
    const final = (await database.select().from(schema.workerJobs).where(eq(schema.workerJobs.id, inserted[0].id)))[0];
    assert.equal(final.status, "SUCCEEDED");
  });

  it("workerStaleRunningMs validates floor/cap and default", () => {
    const prev = process.env.WORKER_STALE_RUNNING_MS;
    try {
      delete process.env.WORKER_STALE_RUNNING_MS;
      assert.equal(workers.workerStaleRunningMs(), 30 * 60 * 1000);
      process.env.WORKER_STALE_RUNNING_MS = "5000";
      assert.equal(workers.workerStaleRunningMs(), 30 * 60 * 1000, "below floor → default");
      process.env.WORKER_STALE_RUNNING_MS = "120000";
      assert.equal(workers.workerStaleRunningMs(), 120000);
    } finally {
      if (prev === undefined) delete process.env.WORKER_STALE_RUNNING_MS;
      else process.env.WORKER_STALE_RUNNING_MS = prev;
    }
  });
});
