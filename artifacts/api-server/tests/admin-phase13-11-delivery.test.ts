/**
 * Admin Phase 13.11 — Yetkazib berish operator console (internal courier, real lifecycle).
 *   GET  /admin/deliveries                      (delivery:update + resolveStaffBranchFilter; server q/status/branch; one joined query)
 *   GET  /admin/orders/:id                      (orders:read + assertBranchScope; loaded only when the drawer opens)
 *   POST /deliveries/:orderId/assign            (delivery:update + assertBranchScope)
 *   POST /deliveries/:orderId/status            (delivery:update + assertBranchScope; GRAPH guard)
 *   POST /deliveries/:orderId/external/sync     (CONTRACT_PENDING → 501)
 * Backend change: list search `q` + customer name / orderCreatedAt / updatedAt on list rows. No DB schema / migration change.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertDeliveryTransition, DELIVERY_STATUSES, isTerminalDeliveryStatus } from "../src/lib/deliveryLifecycle";
import { adminCustomerIdentity, sanitizeAdminOrderSearch } from "../src/lib/adminOrderOps";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(root, "../..");
const adminWeb = path.resolve(root, "../admin-web/src");
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const page = read(path.join(adminWeb, "pages/DeliveryPage.tsx"));
const code = page.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const app = read(path.join(adminWeb, "App.tsx"));
const nav = read(path.join(adminWeb, "nav.ts"));
const ui = read(path.join(adminWeb, "ui.tsx"));
const route = read(path.join(root, "src/routes/deliveries.ts"));
const service = read(path.join(root, "src/lib/deliveryService.ts"));
const lifecycle = read(path.join(root, "src/lib/deliveryLifecycle.ts"));
const orderTransitions = read(path.join(root, "src/lib/orderTransitions.ts"));
const ordersRoute = read(path.join(root, "src/routes/orders.ts"));
const adminRoute = read(path.join(root, "src/routes/admin.ts"));
const docs = read(path.join(repoRoot, "docs/ADMIN_IMPLEMENTATION_STATUS.md"));
const css = read(path.join(adminWeb, "styles.css"));
const dvCss = css.slice(
  css.indexOf("/* ——— Delivery / Yetkazib berish (Phase 12.18)"),
  css.indexOf("/* ——— Promos / Aksiyalar — Phase 13.6"),
);

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
const orderDetailRoute = between(adminRoute, 'router.get("/admin/orders/:id", ', "\nrouter.");
const rowMapping = between(listRoute, "deliveries: rows.map((row) => ({", "})),");
const serializePublic = between(service, "export function serializeDeliveryPublic(", "\n}\n");
const serializeOrderBlock = between(ordersRoute, "export async function serializeOrder(", "\n}\n");

const listRowKeys = new Set([
  ...[...serializePublic.matchAll(/^ {4}(\w+):/gm)].map((m) => m[1]),
  ...[...rowMapping.matchAll(/^ {8}(\w+):/gm)].map((m) => m[1]),
]);
const pageGraph = graphOf(between(page, "const NEXT_STATUS", "\n};"));
const backendGraph = graphOf(between(lifecycle, "const GRAPH", "\n};"));
const fulfillmentGraph = graphOf(between(orderTransitions, "const FULFILLMENT_GRAPH", "\n};"));
const pageStatuses = [...between(page, "const DELIVERY_STATUSES = [", "] as const").matchAll(/"(\w+)"/g)].map((m) => m[1]);

describe("Admin Phase 13.11 Delivery — backend contract", () => {
  it("list: delivery:update before DB, server branch scope, sanitized server search", () => {
    const perm = listRoute.indexOf('requirePermission(admin, "delivery:update")');
    assert.ok(perm > 0);
    assert.ok(perm < listRoute.indexOf("await db"), "permission check precedes DB access");
    assert.match(listRoute, /resolveStaffBranchFilter\(\s*admin,/);
    assert.match(listRoute, /if \(branchFilter != null\) filters\.push\(eq\(orders\.branchId, branchFilter\)\)/);
    assert.match(listRoute, /const q = sanitizeAdminOrderSearch\(typeof req\.query\.q === "string" \? req\.query\.q : ""\)/);
    for (const col of ["orders.code", "customers.phone", "customers.firstName", "customers.lastName", "deliveries.address"]) {
      assert.ok(listRoute.includes(`ilike(${col}, pattern)`), col);
    }
    assert.match(listRoute, /Math\.min\(100, Math\.floor\(limitRaw\)\) : 40/);
    assert.match(listRoute, /externalProvider: "CONTRACT_PENDING"/);
  });

  it("list: one count + one joined rows query (no N+1), customer name only — no phone on rows", () => {
    assert.equal(listRoute.match(/\.from\(deliveries\)/g)?.length, 2);
    assert.equal(listRoute.match(/\.leftJoin\(customers, eq\(orders\.customerId, customers\.id\)\)/g)?.length, 2);
    assert.doesNotMatch(listRoute, /for \(const|await Promise\.all\(|rows\.map\(async/);
    assert.match(rowMapping, /adminCustomerIdentity\(\{ id: row\.customerRowId, firstName: row\.firstName, lastName: row\.lastName \}, \{ includePhone: false \}\)/);
    assert.doesNotMatch(rowMapping, /\bphone:/);
    assert.doesNotMatch(listRoute, /phone: customers\.phone/);
    assert.doesNotMatch(listRoute, /passwordHash|otp|token|secret/i);
    for (const key of ["updatedAt", "orderCreatedAt", "customer", "orderCode", "fulfillmentStatus", "branchId"]) {
      assert.ok(listRowKeys.has(key), key);
    }
  });

  it("search sanitizer strips LIKE wildcards and caps length; list identity omits phone", () => {
    assert.equal(sanitizeAdminOrderSearch("  VM-%_\\12  "), "VM-12");
    assert.equal(sanitizeAdminOrderSearch("x".repeat(100)).length, 64);
    const identity = adminCustomerIdentity({ id: 7, firstName: "Ali", lastName: "Valiyev", phone: "+998 90 123 45 67" }, { includePhone: false });
    assert.equal("phone" in identity, false);
    assert.equal(identity.firstName, "Ali");
  });

  it("mutations unchanged: delivery:update + assertBranchScope; external sync stays CONTRACT_PENDING (501)", () => {
    for (const r of [assignRoute, statusRoute, syncRoute]) {
      assert.match(r, /await requirePermission\(admin, "delivery:update"\);/);
      assert.match(r, /await assertBranchScope\(admin, order\.branchId\);/);
      assert.ok(r.indexOf("requirePermission") < r.indexOf("assertBranchScope"));
    }
    assert.match(assignRoute, /if \(!courierName\) return res\.status\(400\)/);
    assert.match(statusRoute, /DELIVERY_STATUSES\.includes\(status/);
    assert.match(syncRoute, /res\.status\(result\.ok \? 200 : 501\)/);
    assert.match(orderDetailRoute, /requirePermission\(user, "orders:read"\)/);
    assert.match(orderDetailRoute, /assertBranchScope\(user, rows\[0\]\.branchId\)/);
  });

  it("lifecycle runtime: GRAPH transitions, same-state allowed, terminal states", () => {
    assert.deepEqual([...DELIVERY_STATUSES], pageStatuses);
    for (const from of DELIVERY_STATUSES) {
      for (const to of DELIVERY_STATUSES) {
        const allowed = from === to || (pageGraph[from] || []).includes(to);
        if (allowed) assert.doesNotThrow(() => assertDeliveryTransition(from, to), `${from}→${to}`);
        else assert.throws(() => assertDeliveryTransition(from, to), (e: any) => e.status === 409 && e.code === "INVALID_DELIVERY_TRANSITION");
      }
      assert.equal(isTerminalDeliveryStatus(from), (pageGraph[from] || []).length === 0, from);
    }
  });
});

describe("Admin Phase 13.11 Delivery — page uses the real contract only", () => {
  it("NEXT_STATUS mirrors backend GRAPH; labels/tones cover every real status", () => {
    assert.deepEqual(pageGraph, backendGraph);
    const meta = between(page, "const STATUS_META", "\n};");
    for (const s of DELIVERY_STATUSES) assert.match(meta, new RegExp(`\\b${s}: \\{ label: "[^"]+", tone: "(ok|warn|danger|neutral|info)" \\}`), s);
    assert.match(meta, /delivered: \{ label: "Yetkazildi", tone: "ok" \}/);
    assert.match(meta, /failed: \{ label: "Yetkazilmadi", tone: "danger" \}/);
    assert.match(code, /Holati noma’lum/);
  });

  it("«Yetkazildi» is only offered from order states that can reach COMPLETED", () => {
    const completable = new Set([...between(page, "const ORDER_COMPLETABLE = new Set([", "])").matchAll(/"(\w+)"/g)].map((m) => m[1]));
    for (const [state, next] of Object.entries(fulfillmentGraph)) {
      const reaches = state === "COMPLETED" || next.includes("COMPLETED");
      assert.equal(completable.has(state), reaches, state);
    }
    assert.match(code, /disabled=\{busy \|\| \(primaryStep === "delivered" && Boolean\(deliveredBlock\)\)\}/);
    assert.match(code, /if \(to === "delivered" && deliveredBlock\) return;/);
  });

  it("no invented API: only the five real endpoints are requested", () => {
    const urls = [...code.matchAll(/request\(\s*`([^`]+)`/g)].map((m) => m[1].replace(/\$\{[^}]+\}/g, ":p"));
    const allowed = new Set([
      "/api/admin/deliveries?:p",
      "/api/admin/orders/:p",
      "/api/deliveries/:p/assign",
      "/api/deliveries/:p/status",
      "/api/deliveries/:p/external/sync",
    ]);
    assert.ok(urls.length >= 5);
    for (const u of urls) assert.ok(allowed.has(u), u);
    assert.match(code, /JSON\.stringify\(\{ courierName: action\.courierName \}\)/);
    assert.match(code, /const body: Record<string, unknown> = \{ status: action\.to \};/);
  });

  it("no invented fields: delivery fields read by the page exist on list rows; order fields exist on order detail", () => {
    const deliveryKeys = new Set([...code.matchAll(/\b(?:item|row|delivery|current|live)\??\.(\w+)/g)].map((m) => m[1]));
    for (const key of deliveryKeys) assert.ok(listRowKeys.has(key), `delivery field ${key}`);
    const liveFields = [...between(page, "const LIVE_FIELDS = [", "] as const").matchAll(/"(\w+)"/g)].map((m) => m[1]);
    for (const key of liveFields) assert.ok(listRowKeys.has(key), `live field ${key}`);
    const orderKeys = new Set([...code.matchAll(/\border\??\.(\w+)/g)].map((m) => m[1]));
    for (const key of orderKeys) {
      assert.ok(key === "customer" || new RegExp(`\\b${key}\\b`).test(serializeOrderBlock), `order field ${key}`);
    }
    assert.match(orderDetailRoute, /adminCustomerIdentity\(customerRow, \{ includePhone: true \}\)/);
  });

  it("no fake courier / ETA / tracking / KPI; external provider shown as contract pending", () => {
    assert.doesNotMatch(code, /<select[^>]*courier|couriers\.map|COURIERS|Courier #|Haydovchi/i);
    assert.doesNotMatch(code, /\bETA:|tracking.?url|google.?map|daqiqada yetkaziladi|StatCard|KpiCard/i);
    assert.match(code, /Kuryerlar reyestri API’da mavjud emas/);
    assert.match(code, /Jonli kuzatuv mavjud emas/);
    assert.match(code, /Holat o‘zgarishlari tarixi API’da mavjud emas/);
    assert.match(code, /\(shartnoma kutilmoqda\)/);
    assert.match(code, /operatorCapabilityLabel\(externalCode \|\| "CONTRACT_PENDING"\)/);
    assert.match(code, /statusOf\(err\) === 501/);
    assert.match(code, /isExternal\(delivery\) \? \(/);
  });
});

describe("Admin Phase 13.11 Delivery — permissions, branch scope, security", () => {
  it("capabilities come from real permissions; branch filter HQ-only; App passes permissions", () => {
    assert.match(code, /const canUpdate = props\.permissions\.includes\("delivery:update"\);/);
    assert.match(code, /const canReadOrder = props\.permissions\.includes\("orders:read"\);/);
    assert.match(code, /\{isHq \? \(\s*<FilterField label="Filial">/);
    assert.match(code, /if \(f\.branchId\) qs\.set\("branchId", f\.branchId\);/);
    assert.match(code, /if \(!canReadOrder \|\| !Number\.isFinite\(orderId\) \|\| orderId <= 0\) return;/);
    assert.match(app, /<DeliveryPage[\s\S]*?permissions=\{permissions\}/);
    assert.match(nav, /delivery: "Ichki kuryer yetkazishlarini kuzatish/);
  });

  it("no secrets, tokens or raw server messages reach the DOM; phone masked by default", () => {
    assert.doesNotMatch(code, /err\.message|\.stack\b/);
    assert.doesNotMatch(code, /Bearer|passwordHash|apiKey|merchant|secretKey|localStorage/);
    assert.doesNotMatch(code, /window\.confirm|confirm\(/);
    assert.match(code, /phoneVisible \? formatPhone\(phone\) : maskPhone\(phone\)/);
    assert.match(code, /aria-pressed=\{phoneVisible\}/);
    assert.match(code, /const phone = String\(order\?\.customer\?\.phone \|\| ""\);/);
  });

  it("every mutation goes through ConfirmDialog with busy guard and fixed Uzbek error copy", () => {
    assert.match(code, /<ConfirmDialog[\s\S]*?open=\{pendingAction != null\}[\s\S]*?busy=\{busy\}/);
    assert.match(code, /onConfirm=\{\(\) => \{\s*if \(pendingAction\) void runAction\(pendingAction\);/);
    assert.match(code, /if \(busy \|\| !current\) return;/);
    assert.equal(code.match(/method: "POST"/g)?.length, 3);
    assert.match(code, /setPendingAction\(\{ kind: "assign", courierName: name \}\)/);
    assert.match(code, /setPendingAction\(\{ kind: "status", to \}\)/);
    assert.match(code, /setFeedback\(\{ tone: "danger", text: actionError\(err\) \}\)/);
    assert.match(code, /await Promise\.all\(\[load\(\{ offset \}\), loadOrder\(orderId, true\)\]\)/);
    assert.match(code, /REFRESH_CODES\.has\(codeOf\(err\)\)/);
    assert.match(code, /Buyurtmaning\s+o‘zi bekor qilinmaydi/);
    assert.match(code, /maxLength=\{200\}/);
  });
});

describe("Admin Phase 13.11 Delivery — states, performance, keyboard", () => {
  it("separate loading / empty / filter-empty / 401 / 403 / 404 / 500 / network states", () => {
    assert.match(code, /status === 401\) return \{ kind: "session"/);
    assert.match(code, /status === 403\) \{\s*return \{ kind: "forbidden"/);
    assert.match(code, /status === 404\) return \{ kind: "notfound"/);
    assert.match(code, /if \(!status\) return \{ kind: "network"/);
    assert.match(code, /kind: "failed", message: "Yetkazib berishlarni yuklab bo‘lmadi/);
    assert.match(code, /className="dv-skeleton-row"/);
    assert.match(code, /Yetkazib berishlar hozircha yo‘q\./);
    assert.match(code, /Tanlangan shartlar bo‘yicha yetkazib berish topilmadi\./);
    assert.match(code, /Ma’lumot mavjud emas/);
    assert.match(code, /error\.kind === "failed" \|\| error\.kind === "network" \? \(\) => void load/);
  });

  it("race protection on list and detail; detail loaded only when a row opens", () => {
    assert.equal(code.match(/if \(seq !== listSeq\.current\) return;/g)?.length, 2);
    assert.equal(code.match(/if \(seq !== detailSeq\.current\) return;/g)?.length, 2);
    assert.match(code, /detailSeq\.current \+= 1;/);
    const loadOrderCalls = code.match(/loadOrder\(/g)?.length ?? 0;
    assert.ok(loadOrderCalls <= 5, "loadOrder only from openRow / retry / post-mutation refresh");
    assert.match(between(code, "function openRow(", "\n  }\n"), /void loadOrder\(Number\(row\.orderId\)\);/);
    assert.doesNotMatch(between(code, "async function load(", "\n  }\n"), /loadOrder|\/api\/admin\/orders/);
  });

  it("rows open with click, Enter and Space; drawer uses global modal focus handling", () => {
    assert.match(code, /tabIndex=\{0\}/);
    assert.match(code, /onClick=\{\(\) => openRow\(item\)\}/);
    assert.match(code, /onKeyDown=\{rowKeys\(item\)\}/);
    assert.match(code, /if \(e\.key === "Enter" \|\| e\.key === " "\) \{\s*e\.preventDefault\(\);/);
    assert.match(code, /if \(e\.target !== e\.currentTarget\) return;/);
    assert.match(ui, /useModalFocus/);
    assert.match(code, /<DetailDrawer[\s\S]*?onClose=\{closeDrawer\}/);
    assert.match(code, /<details className="dv-tech">/);
    assert.doesNotMatch(code, /<details className="dv-tech" open/);
  });

  it("drawer sections in operator order", () => {
    const titles = [...code.matchAll(/<DrawerSection title="([^"]+)">/g)].map((m) => m[1]);
    assert.deepEqual(titles, ["Yetkazib berish", "Buyurtma", "Mijoz", "Manzil", "Kuryer", "Vaqt oynasi", "Filial", "Tashqi xizmat"]);
  });
});

describe("Admin Phase 13.11 Delivery — design system and docs", () => {
  it("responsive: columns collapse by priority, cards on mobile, no page overflow", () => {
    assert.ok(dvCss.length > 2000);
    assert.match(dvCss, /@media \(max-width: 1480px\) \{\s*\.dv-surface \.dv-col-updated \{ display: none; \}/);
    assert.match(dvCss, /@media \(max-width: 1380px\) \{\s*\.dv-surface \.dv-col-window \{ display: none; \}/);
    assert.match(dvCss, /@media \(max-width: 1200px\) \{\s*\.dv-surface \.dv-col-order \{ display: none; \}/);
    assert.match(dvCss, /@media \(max-width: 1100px\) \{\s*\.dv-surface \.dv-col-courier \{ display: none; \}/);
    assert.match(dvCss, /@media \(max-width: 560px\) \{[\s\S]*?grid-template-areas: "main status" "customer customer" "address address";/);
    assert.match(dvCss, /\.dv-surface thead \{ display: none; \}/);
    assert.match(dvCss, /\.dv-kv dd \{[^}]*overflow-wrap: anywhere;/);
  });

  it("no hardcoded colours, gradients or inline styles", () => {
    assert.doesNotMatch(dvCss, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    assert.doesNotMatch(dvCss, /gradient/i);
    assert.doesNotMatch(dvCss, /var\(--vm-radius-md\)/);
    assert.doesNotMatch(code, /style=\{\{|#[0-9a-f]{6}\b|gradient/i);
  });

  it("Phase 13.11 documented", () => {
    const section = between(docs, "## Phase 13.11 — Yetkazib berish", "## Phase 13.10 — Filiallar");
    assert.match(section, /GET \/api\/admin\/deliveries/);
    assert.match(section, /delivery:update/);
    assert.match(section, /CONTRACT_PENDING/);
    assert.match(section, /DB sxemasi va migratsiyalar o‘zgartirilmadi/);
  });
});
