/**
 * P11/P12 production readiness contracts (flags remain OFF).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const docs = path.resolve(root, "../../docs");

describe("P11–P12 production readiness contracts", () => {
  it("readiness doc exists", () => {
    assert.ok(existsSync(path.join(docs, "PHASE_3_3_P11_P12_PRODUCTION_READINESS.md")));
  });

  it("health live vs ready are separated", () => {
    const health = readFileSync(path.join(root, "src/routes/health.ts"), "utf8");
    assert.match(health, /\/health\/live/);
    assert.match(health, /\/health\/ready/);
    assert.match(health, /checkDatabaseHealth/);
    const liveBlock = health.slice(health.indexOf("/health/live"), health.indexOf("/health/ready"));
    assert.doesNotMatch(liveBlock, /checkDatabaseHealth/);
  });

  it("workers do not auto-start; production queue gated", () => {
    const index = readFileSync(path.join(root, "src/index.ts"), "utf8");
    assert.match(index, /workersAutoStart:\s*false/);
    assert.match(index, /SIGTERM/);
    assert.doesNotMatch(index, /runDueWorkerJobs\(|setInterval\([^\)]*worker/i);
    const workers = readFileSync(path.join(root, "src/routes/workers.ts"), "utf8");
    assert.match(workers, /isBackgroundWorkersEnabled|WORKERS_DISABLED/);
    assert.match(workers, /ENABLE_BACKGROUND_WORKERS/);
  });

  it("Payme/Click production remain fail-closed; FOM inventory OFF", () => {
    const payme = readFileSync(path.join(root, "src/lib/paymeContract.ts"), "utf8");
    const click = readFileSync(path.join(root, "src/lib/clickContract.ts"), "utf8");
    assert.match(payme, /PAYME_MERCHANT_API_ENABLED/);
    assert.match(click, /CLICK_MERCHANT_API_ENABLED/);
    const fom = readFileSync(path.join(root, "src/lib/fomAdapter.ts"), "utf8");
    assert.match(fom, /FOM_INVENTORY_WRITER_ENABLED\s*=\s*false/);
    const delivery = readFileSync(path.join(root, "src/lib/deliveryAdapters.ts"), "utf8");
    assert.match(delivery, /CONTRACT_PENDING/);
  });

  it("backup drill documented; CI workflow present", () => {
    const backup = readFileSync(path.join(root, "../../scripts/backup/README.md"), "utf8");
    assert.match(backup, /backup:drill|BACKUP_GAP|operator-owned/);
    assert.ok(existsSync(path.join(root, "../../.github/workflows/ci.yml")));
    assert.ok(existsSync(path.join(root, "../../Dockerfile")));
  });
});
