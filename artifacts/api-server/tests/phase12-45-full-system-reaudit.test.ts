/**
 * Phase 12.45 — Final full-system gap re-audit invariants.
 * Does not invent infrastructure. Does not claim production READY.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.resolve(apiRoot, "../..");
const matrix = path.join(repo, "docs/PRODUCTION_GAP_MATRIX.md");
const runbook = path.join(repo, "docs/PRODUCTION_OPS_RUNBOOK.md");
const finalDoc = path.join(repo, "docs/FINAL_PRODUCTION_CLOSURE.md");

describe("Phase 12.45 — Final full-system gap re-audit", () => {
  it("gap matrix records 12.45; PRODUCTION NOT READY — OPERATIONAL EVIDENCE MISSING; all P0 OPS", () => {
    assert.ok(existsSync(matrix));
    const doc = readFileSync(matrix, "utf8");
    assert.match(doc, /Phase 12\.45/);
    assert.match(doc, /Final full-system gap re-audit/);
    assert.match(doc, /OPERATIONAL EVIDENCE MISSING/);
    assert.match(doc, /\*\*PRODUCTION READINESS:\s*NOT READY\*\*/);
    assert.match(doc, /P0-1[\s\S]{0,400}\*\*OPS_REQUIRED\*\*/);
    assert.match(doc, /P0-2[\s\S]{0,400}\*\*OPS_REQUIRED\*\*/);
    assert.match(doc, /P0-3a[\s\S]{0,400}\*\*OPS_REQUIRED\*\*/);
    assert.match(doc, /P0-3b[\s\S]{0,400}\*\*OPS_REQUIRED\*\*/);
    assert.match(doc, /P0-4[\s\S]{0,400}\*\*OPS_REQUIRED\*\*/);
    assert.doesNotMatch(doc, /PRODUCTION\s*\|\s*\*\*READY\*\*|PRODUCTION READY(?! —)/);
  });

  it("non-enablement + FOM honesty + migrations 0000–0010 preserved", () => {
    const integ = readFileSync(path.join(apiRoot, "src/routes/integrations.ts"), "utf8");
    assert.match(integ, /ready:\s*false/);
    assert.match(integ, /inventoryWriter:\s*"OFF"/);
    assert.match(integ, /fomPosContract:\s*"CONTRACT_PENDING"/);

    const delivery = readFileSync(path.join(apiRoot, "src/lib/deliveryAdapters.ts"), "utf8");
    assert.match(delivery, /CONTRACT_PENDING/);
    assert.match(delivery, /no fake success/i);

    const mig = readdirSync(path.join(repo, "lib/db/migrations")).filter((f) => f.endsWith(".sql"));
    assert.ok(mig.some((f) => f.startsWith("0000_")));
    assert.ok(mig.some((f) => f.startsWith("0010_")));

    const env = readFileSync(path.join(apiRoot, "src/lib/securityEnv.ts"), "utf8");
    assert.match(env, /ALLOW_LEGACY_HMAC_TOKENS/);
    assert.match(env, /return true/); // default dual-accept
  });

  it("runbook + final record 12.45; prior phases 12.37–12.44 remain referenced", () => {
    const rb = readFileSync(runbook, "utf8");
    assert.match(rb, /Phase 12\.45/);
    assert.match(rb, /OPERATIONAL EVIDENCE MISSING|OPS_REQUIRED/);

    const fc = readFileSync(finalDoc, "utf8");
    assert.match(fc, /Phase 12\.45/);
    assert.match(fc, /OPERATIONAL EVIDENCE MISSING/);

    const doc = readFileSync(matrix, "utf8");
    assert.match(doc, /Phase 12\.37/);
    assert.match(doc, /Phase 12\.38/);
    assert.match(doc, /Phase 12\.39/);
    assert.match(doc, /Phase 12\.40/);
    assert.match(doc, /Phase 12\.41/);
    assert.match(doc, /Phase 12\.42/);
    assert.match(doc, /Phase 12\.43/);
    assert.match(doc, /Phase 12\.44/);
  });
});
