import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("P4.6–P4.9 API inventory contracts", () => {
  it("expiry service and admin expire-due endpoint exist", () => {
    const inv = readFileSync(path.join(root, "src/lib/inventory.ts"), "utf8");
    const admin = readFileSync(path.join(root, "src/routes/admin.ts"), "utf8");
    assert.match(inv, /export async function expireReservation/);
    assert.match(inv, /export async function expireDueReservations/);
    assert.match(inv, /toStatus:\s*"EXPIRED"/);
    assert.match(admin, /\/admin\/inventory\/expire-due/);
    assert.match(admin, /expireDueReservations/);
  });

  it("admin adjust is AuthZ gated and branch-scoped", () => {
    const admin = readFileSync(path.join(root, "src/routes/admin.ts"), "utf8");
    assert.match(admin, /\/admin\/inventory\/adjust/);
    assert.match(admin, /requirePermission\(user,\s*"inventory:adjust"\)/);
    assert.match(admin, /assertBranchScope\(user,\s*branchId\)/);
    assert.match(admin, /adjustStock/);
  });

  it("FOM sale endpoint does not write stock", () => {
    const fom = readFileSync(path.join(root, "src/lib/fom.ts"), "utf8");
    const bridge = readFileSync(path.join(root, "src/lib/fomBridge.ts"), "utf8");
    const route = readFileSync(path.join(root, "src/routes/integrations.ts"), "utf8");
    for (const src of [fom, bridge, route]) {
      assert.doesNotMatch(src, /productStocks|adjustStock|reserveStock|physicalQuantity/);
    }
  });

  it("payment paid does not consume; delivery delivered may consume", () => {
    const deliverySvc = readFileSync(path.join(root, "src/lib/deliveryService.ts"), "utf8");
    const lib = readFileSync(path.join(root, "src/lib/payments.ts"), "utf8");
    assert.doesNotMatch(lib, /consumeReservation/);
    assert.match(deliverySvc, /toStatus === \"delivered\"/);
    assert.match(deliverySvc, /inventory:\s*"consume"/);
  });

  it("cashier permission set excludes inventory:adjust (source + branch matrix)", () => {
    const rbac = readFileSync(path.join(root, "src/lib/rbac.ts"), "utf8");
    const sets = [...rbac.matchAll(/new Set\(\[([\s\S]*?)\]\)/g)].map((m) => m[1]);
    assert.ok(sets.length >= 2, "expected HQ and cashier fallback permission sets");
    assert.match(sets[0], /inventory:adjust/);
    assert.doesNotMatch(sets[1], /inventory:adjust/);
  });

  it("cutover gates document exists", () => {
    const docs = path.resolve(root, "../../docs/PHASE_3_3_P4_CUTOVER_GATES.md");
    const text = readFileSync(docs, "utf8");
    assert.match(text, /Backup/);
    assert.match(text, /Duplicate stock/);
    assert.match(text, /FOM inventory writers remain OFF/i);
  });
});
