/**
 * Phase 12.27 — P0 production gate verification invariants.
 * Evidence-only: no invent infrastructure / credentials / enablement.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.resolve(apiRoot, "../..");
const matrix = path.join(repo, "docs/PRODUCTION_GAP_MATRIX.md");

describe("Phase 12.27 — P0 gate verification", () => {
  it("gap matrix records 12.27 P0 results without marking production READY", () => {
    assert.ok(existsSync(matrix));
    const doc = readFileSync(matrix, "utf8");
    assert.match(doc, /Phase 12\.27/);
    assert.match(doc, /\*\*PRODUCTION READINESS:\s*NOT READY\*\*/);
    assert.match(doc, /P0-1[\s\S]*?\*\*OPS_REQUIRED\*\*/);
    // Historical 12.27 closure left P0-2 BLOCKED; 12.28 may advance to OPS_REQUIRED.
    assert.match(doc, /Phase 12\.27[\s\S]*?P0-2[\s\S]*?\*\*BLOCKED\*\*/);
    assert.match(doc, /P0-3a[\s\S]*?\*\*OPS_REQUIRED\*\*/);
    assert.match(doc, /P0-3b[\s\S]*?\*\*OPS_REQUIRED\*\*/);
    assert.match(doc, /P0-4[\s\S]*?\*\*OPS_REQUIRED\*\*/);
    assert.doesNotMatch(doc, /P0-1[\s\S]{0,200}\|\s*\*\*DONE\*\*/);
  });

  it("merchant secret columns remain text; cloud KMS client not invented", () => {
    const merchant = readFileSync(path.join(apiRoot, "src/lib/branchPaymentMerchant.ts"), "utf8");
    assert.match(merchant, /WeakMap/);
    assert.doesNotMatch(merchant, /aws-kms|@aws-sdk\/client-kms|@google-cloud\/kms/i);

    const schema = readFileSync(path.join(repo, "lib/db/src/schema/branches.ts"), "utf8");
    assert.match(schema, /paymeKey:\s*text\("payme_key"\)/);
    assert.match(schema, /clickSecret:\s*text\("click_secret"\)/);
  });

  it("Redis fail-closed + FOM writer OFF remain closed", () => {
    const redis = readFileSync(path.join(apiRoot, "src/lib/redis.ts"), "utf8");
    assert.match(redis, /assertProductionRedisConfig/);
    assert.match(redis, /production\/staging requires REDIS_URL/);
    assert.match(redis, /PING/);

    const fom = readFileSync(path.join(apiRoot, "src/lib/fomAdapter.ts"), "utf8");
    assert.match(fom, /FOM_INVENTORY_WRITER_ENABLED\s*=\s*false/);
  });

  it("sandbox harness without credentials returns PENDING (not PASS)", () => {
    const r = spawnSync(
      "pnpm",
      ["--filter", "@workspace/api-server", "exec", "tsx", "src/scripts/sandbox-e2e-harness.ts"],
      {
        cwd: repo,
        encoding: "utf8",
        env: {
          ...process.env,
          SANDBOX_E2E_RUN: "",
          PAYME_SANDBOX_KEY: "",
          CLICK_SANDBOX_SECRET: "",
        },
        shell: true,
      },
    );
    assert.equal(r.status, 0, r.stderr || r.stdout);
    assert.match(r.stdout, /PAYME_SANDBOX_E2E":\s*"PENDING"/);
    assert.match(r.stdout, /CLICK_SANDBOX_E2E":\s*"PENDING"/);
    assert.doesNotMatch(r.stdout, /"PAYME_SANDBOX_E2E":\s*"PASS"/);
    assert.doesNotMatch(r.stdout, /"CLICK_SANDBOX_E2E":\s*"PASS"/);
  });
});
