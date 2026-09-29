/**
 * Phase 12.43 — External delivery production contract & operational gate.
 * Does not invent a courier provider. Does not claim LIVE_PROVIDER_VERIFIED.
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

describe("Phase 12.43 — External delivery production contract gate", () => {
  it("gap matrix records 12.43; EXTERNAL_PROVIDER MISSING; gate CONTRACT_PENDING; no live verified claim", () => {
    assert.ok(existsSync(matrix));
    const doc = readFileSync(matrix, "utf8");
    assert.match(doc, /Phase 12\.43/);
    assert.match(doc, /External delivery production contract/);
    assert.match(doc, /EXTERNAL_PROVIDER[\s\S]{0,40}\*\*MISSING\*\*/);
    assert.match(doc, /PROVIDER_CONTRACT[\s\S]{0,40}CONTRACT_PENDING/);
    assert.match(doc, /EXTERNAL DELIVERY GATE[\s\S]{0,80}CONTRACT_PENDING/);
    assert.match(doc, /E-3[\s\S]{0,400}CONTRACT_PENDING/);
    assert.doesNotMatch(doc, /LIVE_PROVIDER_VERIFIED\s*\|\s*\*\*Yes\*\*|external delivery\s*=\s*\*\*DONE\*\*/i);
    assert.doesNotMatch(doc, /Express24 Connected|LIVE_PROVIDER_VERIFIED\s*=\s*\*\*Yes\*\*/i);
    assert.match(doc, /No fake DELIVERED|no fake success/i);
    assert.match(doc, /\*\*PRODUCTION READINESS:\s*NOT READY\*\*/);
  });

  it("external adapter is CONTRACT_PENDING stub; internal lifecycle present; no invented vendor API", () => {
    const adapters = readFileSync(path.join(apiRoot, "src/lib/deliveryAdapters.ts"), "utf8");
    assert.match(adapters, /class ExternalDeliveryAdapter/);
    assert.match(adapters, /CONTRACT_PENDING/);
    assert.match(adapters, /no fake success/i);
    assert.match(adapters, /class InternalDeliveryAdapter/);
    assert.doesNotMatch(adapters, /express24|yandex|uzum|fargo|bts\.uz|rejectUnauthorized\s*:\s*false/i);

    const life = readFileSync(path.join(apiRoot, "src/lib/deliveryLifecycle.ts"), "utf8");
    assert.match(life, /pending|assigned|picked_up|on_the_way|delivered/);
    assert.match(life, /Does not change orders\.payment_status/);

    const workers = readFileSync(path.join(apiRoot, "src/lib/workers.ts"), "utf8");
    assert.match(workers, /getDeliveryAdapter\("external"\)/);
    assert.match(workers, /CONTRACT_PENDING/);

    const envEx = readFileSync(path.join(repo, ".env.example"), "utf8");
    assert.match(envEx, /EXTERNAL_DELIVERY_ENABLED/);
    assert.match(envEx, /CONTRACT_PENDING/);
  });

  it("Admin delivery honesty + docs preserve other gates", () => {
    const deliveryUi = readFileSync(path.join(repo, "artifacts/admin-web/src/pages/DeliveryPage.tsx"), "utf8");
    const ui = readFileSync(path.join(repo, "artifacts/admin-web/src/ui.tsx"), "utf8");
    assert.match(ui, /Hali ulanmagan/);
    assert.match(ui, /CONTRACT_PENDING/);
    // Delivery page must not invent Connected/tracking provider health
    assert.doesNotMatch(deliveryUi, /fake tracking|Connected.*Express|ETA invent/i);

    const rb = readFileSync(runbook, "utf8");
    assert.match(rb, /Phase 12\.43/);
    assert.match(rb, /CONTRACT_PENDING/);

    const fc = readFileSync(finalDoc, "utf8");
    assert.match(fc, /Phase 12\.43/);
    assert.match(fc, /CONTRACT_PENDING/);

    const doc = readFileSync(matrix, "utf8");
    assert.match(doc, /P0-4[\s\S]{0,400}\*\*OPS_REQUIRED\*\*/);
    assert.match(doc, /FOM[\s\S]{0,80}CONTRACT_PENDING|inventoryWriter.*OFF/i);
    assert.match(doc, /Phase 12\.42/);
  });
});
