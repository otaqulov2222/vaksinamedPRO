/**
 * Phase 12.30 — Production Redis gate documentation / config invariants.
 * Does not provision Redis. Does not invent REDIS_URL.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.resolve(apiRoot, "../..");
const matrix = path.join(repo, "docs/PRODUCTION_GAP_MATRIX.md");
const runbook = path.join(repo, "docs/PRODUCTION_OPS_RUNBOOK.md");

describe("Phase 12.30 — Redis production gate", () => {
  it("gap matrix records 12.30 audit; P0-4 remains OPS_REQUIRED; no DONE claim", () => {
    assert.ok(existsSync(matrix));
    const doc = readFileSync(matrix, "utf8");
    assert.match(doc, /Phase 12\.30/);
    assert.match(doc, /IMPLEMENTED IN REPO/);
    assert.match(doc, /TEST VERIFIED/);
    assert.match(doc, /PRODUCTION INFRASTRUCTURE/);
    assert.match(doc, /P0-4[\s\S]{0,400}\*\*OPS_REQUIRED\*\*/);
    assert.doesNotMatch(doc, /P0-4[\s\S]{0,220}\|\s*\*\*DONE\*\*/);
    assert.match(doc, /REDIS_URL[\s\S]{0,40}\*\*MISSING\*\*/);
    assert.match(doc, /Live `?PING`?[\s\S]{0,40}NOT_PROVEN/i);
    assert.match(doc, /\*\*PRODUCTION READINESS:\s*NOT READY\*\*/);
  });

  it("redis client fail-closed + timeouts + no insecure TLS disable", () => {
    const redis = readFileSync(path.join(apiRoot, "src/lib/redis.ts"), "utf8");
    assert.match(redis, /ioredis/);
    assert.match(redis, /assertProductionRedisConfig/);
    assert.match(redis, /production\/staging requires REDIS_URL/);
    assert.match(redis, /connectTimeout:\s*5_000/);
    assert.match(redis, /commandTimeout:\s*2_000/);
    assert.match(redis, /warmRedisForBoot|client\.ping/);
    assert.doesNotMatch(redis, /rejectUnauthorized\s*:\s*false/);
    assert.match(redis, /NOT a source of truth|not a source of truth/i);
  });

  it("rate-limit: hashed keys, prod 503, no silent prod memory bypass", () => {
    const rl = readFileSync(path.join(apiRoot, "src/lib/rateLimit.ts"), "utf8");
    assert.match(rl, /toStorageKey|rl:v1:/);
    assert.match(rl, /createHash\("sha256"\)/);
    assert.match(rl, /redis\.incr|INCR/);
    assert.match(rl, /pexpire|PEXPIRE/);
    assert.match(rl, /pttl|PTTL/);
    assert.match(rl, /RATE_LIMIT_REDIS_UNAVAILABLE/);
    assert.match(rl, /status\(503\)/);
    assert.match(rl, /NEVER silently falls back|Fail closed/i);
    assert.match(rl, /FakeRedisCommandClient/);
  });

  it("boot wires Redis assert + warm; protected routes use rateLimit", () => {
    const index = readFileSync(path.join(apiRoot, "src/index.ts"), "utf8");
    assert.match(index, /assertProductionRedisConfig/);
    assert.match(index, /warmRedisForBoot/);

    const auth = readFileSync(path.join(apiRoot, "src/routes/auth.ts"), "utf8");
    assert.match(auth, /otpLimiter|authLimiter/);
    const admin = readFileSync(path.join(apiRoot, "src/routes/admin.ts"), "utf8");
    assert.match(admin, /adminLoginLimiter/);
    const orders = readFileSync(path.join(apiRoot, "src/routes/orders.ts"), "utf8");
    assert.match(orders, /orderCreateLimiter/);
    const loyalty = readFileSync(path.join(apiRoot, "src/routes/loyalty.ts"), "utf8");
    assert.match(loyalty, /cashbackHistoryLimiter|redeemLimiter/);
    const pos = readFileSync(path.join(apiRoot, "src/routes/pos.ts"), "utf8");
    assert.match(pos, /scanLimiter|saleLimiter|cardLimiter/);
  });

  it("ops runbook §1.8 keeps Redis OPS_REQUIRED; other P0 gates untouched as OPS/CONTRACT", () => {
    const rb = readFileSync(runbook, "utf8");
    assert.match(rb, /1\.8 Production Redis/);
    assert.match(rb, /OPS_REQUIRED/);
    assert.match(rb, /READY_IN_REPO/);

    const doc = readFileSync(matrix, "utf8");
    assert.match(doc, /P0-1[\s\S]{0,300}\*\*OPS_REQUIRED\*\*/);
    assert.match(doc, /CONTRACT_PENDING/);
    assert.match(doc, /FOM_INVENTORY_WRITER|inventoryWriter.*OFF|writer.*OFF/i);
  });

  it("package pins ioredis; workers do not invent BullMQ Redis SoT", () => {
    const pkg = readFileSync(path.join(apiRoot, "package.json"), "utf8");
    assert.match(pkg, /"ioredis"\s*:\s*"5\.6\.1"/);
    const workers = readFileSync(path.join(apiRoot, "src/lib/workers.ts"), "utf8");
    assert.doesNotMatch(workers, /from ["']bullmq["']|from ["']ioredis["']/);
  });
});
