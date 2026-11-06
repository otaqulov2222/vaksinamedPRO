/**
 * Admin Phase 13.11 — Yetkazib berish DISABLED (pickup-only business rule).
 * Routes remain for auth compatibility but return DELIVERY_DISABLED.
 * Admin DeliveryPage shows a static disabled notice; nav item removed.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertDeliveryTransition, DELIVERY_STATUSES, isTerminalDeliveryStatus } from "../src/lib/deliveryLifecycle";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(root, "../..");
const adminWeb = path.resolve(root, "../admin-web/src");
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const page = read(path.join(adminWeb, "pages/DeliveryPage.tsx"));
const app = read(path.join(adminWeb, "App.tsx"));
const nav = read(path.join(adminWeb, "nav.ts"));
const route = read(path.join(root, "src/routes/deliveries.ts"));
const ordersRoute = read(path.join(root, "src/routes/orders.ts"));
const docs = read(path.join(repoRoot, "docs/ADMIN_IMPLEMENTATION_STATUS.md"));
const lifecycle = read(path.join(root, "src/lib/deliveryLifecycle.ts"));

function between(src: string, start: string, end: string) {
  const a = src.indexOf(start);
  assert.ok(a >= 0, start);
  const b = src.indexOf(end, a + start.length);
  assert.ok(b > a, end);
  return src.slice(a, b);
}

function graphOf(block: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const m of block.matchAll(/^\s+(\w+): \[([^\]]*)\],?$/gm)) {
    out[m[1]] = [...m[2].matchAll(/"(\w+)"/g)].map((x) => x[1]);
  }
  return out;
}

const listRoute = between(route, 'router.get("/admin/deliveries", ', "\nrouter.");
const assignRoute = between(route, 'router.post("/deliveries/:orderId/assign", ', "\nrouter.");
const statusRoute = between(route, 'router.post("/deliveries/:orderId/status", ', "\nrouter.");
const syncRoute = between(route, 'router.post("/deliveries/:orderId/external/sync", ', "\nexport default");
const backendGraph = graphOf(between(lifecycle, "const GRAPH", "\n};"));

describe("Admin Phase 13.11 Delivery — disabled contract", () => {
  it("all delivery admin mutations require permission then return DELIVERY_DISABLED", () => {
    for (const r of [listRoute, assignRoute, statusRoute, syncRoute]) {
      assert.match(r, /await requirePermission\(admin, "delivery:update"\);/);
      assert.match(r, /deliveryDisabled\(res\)|DELIVERY_DISABLED/);
      assert.doesNotMatch(r, /await db|\.from\(deliveries\)|assignCourier|transitionDelivery/);
    }
  });

  it("order create rejects fulfillment=delivery; out-for-delivery is disabled", () => {
    assert.match(ordersRoute, /code: "DELIVERY_DISABLED"/);
    assert.match(ordersRoute, /req\.body\?\.fulfillment === "delivery"/);
    assert.match(
      between(ordersRoute, 'router.post("/orders/:id/out-for-delivery"', "\n});"),
      /DELIVERY_DISABLED/,
    );
  });

  it("lifecycle library still guards transitions (legacy rows)", () => {
    for (const from of DELIVERY_STATUSES) {
      for (const to of DELIVERY_STATUSES) {
        const allowed = from === to || (backendGraph[from] || []).includes(to);
        if (allowed) assert.doesNotThrow(() => assertDeliveryTransition(from, to), `${from}→${to}`);
        else assert.throws(() => assertDeliveryTransition(from, to), (e: any) => e.status === 409 && e.code === "INVALID_DELIVERY_TRANSITION");
      }
      assert.equal(isTerminalDeliveryStatus(from), (backendGraph[from] || []).length === 0, from);
    }
  });
});

describe("Admin Phase 13.11 Delivery — UI removed from ops nav", () => {
  it("DeliveryPage is a disabled notice; App still mounts it for deep links", () => {
    assert.match(page, /Yetkazib berish o‘chirilgan/);
    assert.match(page, /delivery-disabled/);
    assert.doesNotMatch(page, /\/api\/admin\/deliveries|ConfirmDialog|DetailDrawer/);
    assert.match(app, /<DeliveryPage[\s\S]*?permissions=\{permissions\}/);
    assert.match(app, /tab === "delivery"/);
  });

  it("nav no longer lists Yetkazib berish as an operator destination", () => {
    assert.doesNotMatch(nav, /\{ id: "delivery", label: "Yetkazib berish"/);
    assert.match(nav, /delivery: "Yetkazib berish o‘chirilgan/);
  });
});

describe("Admin Phase 13.11 Delivery — docs", () => {
  it("Phase 13.11 documents delivery disabled / pickup-only", () => {
    const section = between(docs, "## Phase 13.11 — Yetkazib berish", "## Phase 13.10 — Filiallar");
    assert.match(section, /DELIVERY_DISABLED|o‘chirilgan|pickup/i);
  });
});
