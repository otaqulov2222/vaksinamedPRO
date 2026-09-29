/**
 * Phase 12.38 — Production Redis staging provisioning & live resilience gate.
 * Does not provision Redis. Does not invent REDIS_URL / TLS / failover evidence.
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
const finalDoc = path.join(repo, "docs/FINAL_PRODUCTION_CLOSURE.md");

describe("Phase 12.38 — Production Redis staging gate", () => {
  it("gap matrix records 12.38; P0-4 OPS_REQUIRED; live layers NOT_PROVEN", () => {
    assert.ok(existsSync(matrix));
    const doc = readFileSync(matrix, "utf8");
    assert.match(doc, /Phase 12\.38/);
    assert.match(doc, /Production Redis staging/);
    assert.match(doc, /P0-4[\s\S]{0,500}\*\*OPS_REQUIRED\*\*/);
    assert.match(doc, /REDIS_URL[\s\S]{0,40}\*\*MISSING\*\*/);
    assert.match(doc, /LIVE PING[\s\S]{0,40}NOT_PROVEN/i);
    assert.match(doc, /FAILOVER[\s\S]{0,60}NOT_PROVEN/i);
    assert.match(doc, /LIVE MULTI-INSTANCE[\s\S]{0,60}NOT_PROVEN/i);
    assert.doesNotMatch(doc, /P0-4[\s\S]{0,220}\|\s*\*\*DONE\*\*/);
    assert.doesNotMatch(doc, /LIVE STAGING VERIFIED[\s\S]{0,40}\*\*DONE\*\*|live PING\s*=\s*\*\*PASS\*\*/i);
    assert.match(doc, /\*\*PRODUCTION READINESS:\s*NOT READY\*\*/);
  });

  it("in-repo Redis fail-closed + no insecure TLS; readiness remains PG-only", () => {
    const redis = readFileSync(path.join(apiRoot, "src/lib/redis.ts"), "utf8");
    assert.match(redis, /ioredis/);
    assert.match(redis, /assertProductionRedisConfig/);
    assert.match(redis, /warmRedisForBoot|client\.ping/);
    assert.match(redis, /lazyConnect:\s*true/);
    assert.doesNotMatch(redis, /rejectUnauthorized\s*:\s*false/);
    assert.match(redis, /NOT a source of truth|not a source of truth/i);

    const rl = readFileSync(path.join(apiRoot, "src/lib/rateLimit.ts"), "utf8");
    assert.match(rl, /RATE_LIMIT_REDIS_UNAVAILABLE/);
    assert.match(rl, /status\(503\)/);

    const health = readFileSync(path.join(apiRoot, "src/routes/health.ts"), "utf8");
    assert.match(health, /\/health\/ready/);
    assert.match(health, /checkDatabaseHealth/);
    assert.doesNotMatch(health, /ensureRedisConnected|warmRedisForBoot|getRedisClient/);

    assert.equal(existsSync(path.join(repo, "terraform")), false);
    assert.equal(existsSync(path.join(repo, "pulumi")), false);
  });

  it("compose has no managed Redis service; workers not Redis SoT", () => {
    const compose = readFileSync(path.join(repo, "docker-compose.yml"), "utf8");
    assert.doesNotMatch(compose, /^\s*redis\s*:/m);
    assert.doesNotMatch(compose, /image:\s*redis/i);

    const workers = readFileSync(path.join(apiRoot, "src/lib/workers.ts"), "utf8");
    assert.doesNotMatch(workers, /from ["']bullmq["']|from ["']ioredis["']/);

    const pkg = readFileSync(path.join(apiRoot, "package.json"), "utf8");
    assert.match(pkg, /"ioredis"\s*:\s*"5\.6\.1"/);
  });

  it("runbook + final + other gates preserved", () => {
    const rb = readFileSync(runbook, "utf8");
    assert.match(rb, /Phase 12\.38/);
    assert.match(rb, /1\.8 Production Redis/);
    assert.match(rb, /OPS_REQUIRED/);
    assert.match(rb, /PostgreSQL-only|PostgreSQL only/i);

    const fc = readFileSync(finalDoc, "utf8");
    assert.match(fc, /Phase 12\.38/);
    assert.match(fc, /OPS_REQUIRED/);

    const doc = readFileSync(matrix, "utf8");
    assert.match(doc, /P0-1[\s\S]{0,300}\*\*OPS_REQUIRED\*\*/);
    assert.match(doc, /Phase 12\.37/);
    assert.match(doc, /Phase 12\.30/);
    assert.match(doc, /FOM[\s\S]{0,80}CONTRACT_PENDING|inventoryWriter.*OFF/i);
  });
});
