/**
 * P8/P9/P10 API source contracts.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("P8–P10 API contracts", () => {
  it("P8 delivery module + adapter CONTRACT_PENDING", () => {
    const deliveries = readFileSync(path.join(root, "src/routes/deliveries.ts"), "utf8");
    assert.match(deliveries, /requirePermission\(admin,\s*"delivery:update"\)/);
    assert.match(deliveries, /assertBranchScope/);
    assert.match(deliveries, /COURIER_BRANCH_MISMATCH|assignCourier/);
    const adapters = readFileSync(path.join(root, "src/lib/deliveryAdapters.ts"), "utf8");
    assert.match(adapters, /CONTRACT_PENDING/);
    const payments = readFileSync(path.join(root, "src/routes/payments.ts"), "utf8");
    assert.doesNotMatch(payments, /\/deliveries\/:orderId\/status/);
  });

  it("P9 FOM inventory writer disabled; receipt required", () => {
    const adapter = readFileSync(path.join(root, "src/lib/fomAdapter.ts"), "utf8");
    assert.match(adapter, /FOM_INVENTORY_WRITER_ENABLED\s*=\s*false/);
    const bridge = readFileSync(path.join(root, "src/lib/fomBridge.ts"), "utf8");
    assert.match(bridge, /fomSaleEvents/);
    assert.doesNotMatch(bridge, /productStocks|adjustStock/);
    const integrations = readFileSync(path.join(root, "src/routes/integrations.ts"), "utf8");
    assert.doesNotMatch(integrations, /FOM-\$\{Date\.now/);
  });

  it("P10 workers use PG jobs; no invent queue client imports", () => {
    const workers = readFileSync(path.join(root, "src/lib/workers.ts"), "utf8");
    assert.match(workers, /workerJobs/);
    assert.match(workers, /expireUnpaidPayments|RESERVATION_EXPIRY/);
    assert.doesNotMatch(workers, /from ["']bullmq["']|from ["']ioredis["']|createQueue\(/);
    const routes = readFileSync(path.join(root, "src/routes/workers.ts"), "utf8");
    assert.match(routes, /\/workers\/run-due/);
    assert.match(routes, /requireAdmin/);
  });

  it("index mounts deliveries + workers routers", () => {
    const index = readFileSync(path.join(root, "src/routes/index.ts"), "utf8");
    assert.match(index, /deliveriesRouter/);
    assert.match(index, /workersRouter/);
  });
});
