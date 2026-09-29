/**
 * Admin Phase 13.2 — Buyurtmalar operations console.
 * UI composition only: same /api/admin/orders + /api/orders/* contract, same request bodies,
 * server capabilities stay authoritative.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminWeb = path.resolve(root, "../admin-web/src");
const docs = path.resolve(root, "../../docs");
const page = readFileSync(path.join(adminWeb, "pages/OrdersPage.tsx"), "utf8");
const ordersRoute = readFileSync(path.join(root, "src/routes/orders.ts"), "utf8");
const adminRoute = readFileSync(path.join(root, "src/routes/admin.ts"), "utf8");
const transitions = readFileSync(path.join(root, "src/lib/orderTransitions.ts"), "utf8");
const css = readFileSync(path.join(adminWeb, "styles.css"), "utf8");
const ordersCss = css.slice(
  css.indexOf("/* ——— Orders — Phase 13.2"),
  css.indexOf("/* ——— CRM modules"),
);

function parseGraph(src: string, name: string): Record<string, string[]> {
  const start = src.indexOf(`const ${name}`);
  assert.ok(start >= 0, `${name} not found`);
  const body = src.slice(start, src.indexOf("};", start));
  const graph: Record<string, string[]> = {};
  for (const m of body.matchAll(/([A-Z_]+):\s*\[([^\]]*)\]/g)) {
    graph[m[1]] = [...m[2].matchAll(/"([A-Z_]+)"/g)].map((x) => x[1]);
  }
  return graph;
}

describe("Admin Phase 13.2 Orders — API contract unchanged", () => {
  it("calls only existing order endpoints", () => {
    const paths = [...page.matchAll(/`(\/api\/[^`]*)`/g)].map((m) => m[1]);
    assert.deepEqual([...new Set(paths)].sort(), [
      "/api/admin/orders/${id}",
      "/api/admin/orders?${qs}",
      "/api/orders/${id}/${STEP_ACTIONS.COMPLETED.path}",
      "/api/orders/${id}/${STEP_ACTIONS[to].path}",
      "/api/orders/${id}/confirm-pos",
      "/api/orders/${selected.id}/admin-cancel",
    ]);
  });

  it("every fulfillment step maps to an existing staff route", () => {
    const steps = [...page.matchAll(/path: "([a-z-]+)", label:/g)].map((m) => m[1]);
    assert.deepEqual(steps.sort(), ["complete", "confirm", "out-for-delivery", "prepare", "ready"]);
    for (const step of steps) {
      assert.match(ordersRoute, new RegExp(`router\\.post\\("/orders/:id/${step}"`), step);
    }
  });

  it("request bodies keep the existing shape", () => {
    assert.match(page, /body: JSON\.stringify\(body\)/);
    assert.match(page, /body: Record<string, unknown> = \{\}/);
    assert.match(page, /\{ receiptId: `ADMIN-\$\{Date\.now\(\)\}` \}/);
  });

  it("list filters are the server-supported query params only — no client-side filtering", () => {
    const params = [...page.matchAll(/qs\.set\("([a-zA-Z]+)"/g)].map((m) => m[1]);
    assert.deepEqual(params, [
      "limit", "offset", "q", "fulfillmentStatus", "paymentStatus", "reservationStatus",
      "branchId", "createdFrom", "createdTo",
    ]);
    for (const p of params.slice(2)) {
      assert.match(adminRoute, new RegExp(`req\\.query\\.${p}|query\\.${p}|"${p}"`), p);
    }
    assert.doesNotMatch(page, /orders\.filter\(/);
    assert.doesNotMatch(page, /\.sort\(\(/);
  });

  it("no invented actions (refund, mark-paid, export, sync, retry payment, edit)", () => {
    assert.doesNotMatch(page, /refund-cashback|mark-paid|\/export|\/sync/);
    assert.doesNotMatch(page, /\b(Eksport|Export|Sinxron|Sync|Tahrirlash|Edit)\b/);
    assert.doesNotMatch(page, /canRetryPayment|Pul qaytarildi/);
    assert.doesNotMatch(page, /window\.confirm|[^.\w]confirm\(/);
  });
});

describe("Admin Phase 13.2 Orders — three separate status axes", () => {
  it("fulfillment, payment and reservation render through one badge per axis", () => {
    assert.match(page, /function AxisBadge\(props: \{ domain: "fulfillment" \| "payment" \| "reservation"/);
    assert.match(page, /<AxisBadge domain="fulfillment"/);
    assert.match(page, /<AxisBadge domain="payment"/);
    assert.match(page, /<AxisBadge domain="reservation"/);
    assert.doesNotMatch(page, /status=\{`\$\{[^}]*fulfillmentStatus[^`]*paymentStatus/);
  });

  it("payment tones never reuse a colour for a different meaning", () => {
    const tone = (name: string, key: string) =>
      new RegExp(`${name}[\\s\\S]*?\\b${key}: "([a-z]+)"`).exec(page)?.[1];
    assert.equal(tone("PAYMENT_TONE", "PAID"), "ok");
    assert.equal(tone("PAYMENT_TONE", "PENDING"), "warn");
    assert.equal(tone("PAYMENT_TONE", "FAILED"), "danger");
    assert.equal(tone("PAYMENT_TONE", "REFUNDED"), "neutral");
    assert.equal(tone("PAYMENT_TONE", "PARTIALLY_REFUNDED"), "neutral");
    assert.equal(tone("RESERVATION_TONE", "ACTIVE"), "ok");
    assert.equal(tone("RESERVATION_TONE", "EXPIRED"), "warn");
    assert.equal(tone("RESERVATION_TONE", "CANCELLED"), "neutral");
  });

  it("filter options use Uzbek labels, not raw enums", () => {
    assert.match(page, /\{fulfillmentLabel\(s\)\}<\/option>/);
    assert.match(page, /\{paymentLabel\(s\)\}<\/option>/);
    assert.match(page, /\{reservationLabel\(s\)\}<\/option>/);
    assert.doesNotMatch(page, /<option[^>]*>\{s\}<\/option>/);
  });
});

describe("Admin Phase 13.2 Orders — actions follow the server graph and capabilities", () => {
  it("NEXT_STEPS mirrors FULFILLMENT_GRAPH (CANCELLED handled by admin-cancel)", () => {
    const server = parseGraph(transitions, "FULFILLMENT_GRAPH");
    const ui = parseGraph(page, "NEXT_STEPS");
    assert.deepEqual(Object.keys(ui).sort(), Object.keys(server).sort());
    for (const [from, to] of Object.entries(server)) {
      assert.deepEqual([...ui[from]].sort(), to.filter((s) => s !== "CANCELLED").sort(), from);
    }
  });

  it("channel rules match the transition service", () => {
    assert.match(transitions, /to === "READY_FOR_PICKUP" && channel !== "pickup"/);
    assert.match(transitions, /to === "OUT_FOR_DELIVERY" && channel !== "delivery"/);
    assert.match(page, /if \(to === "READY_FOR_PICKUP"\) return channel === "pickup";/);
    assert.match(page, /if \(to === "OUT_FOR_DELIVERY"\) return channel === "delivery";/);
  });

  it("each action is gated by its server capability", () => {
    assert.match(page, /capabilities\?\.canTransitionFulfillment\s*\?\s*nextSteps\(/);
    assert.match(page, /\{capabilities\?\.canCancel \? \(\s*<button\s+className="btn-tertiary orders-cancel-btn"/);
    assert.match(page, /\{capabilities\?\.canConfirmPos \? \(\s*<button className="ghost"/);
  });

  it("irreversible and destructive actions go through ConfirmDialog", () => {
    assert.match(page, /if \(to === "COMPLETED"\) \{\s*setConfirmFinish\("complete"\);/);
    assert.match(page, /onClick=\{\(\) => setConfirmFinish\("pos"\)\}/);
    assert.match(page, /onClick=\{\(\) => setConfirmCancel\(true\)\}/);
    assert.equal((page.match(/<ConfirmDialog\b/g) || []).length, 2);
    assert.match(page, /Bu amalni ortga qaytarib bo‘lmaydi\./);
  });

  it("one primary action; closed orders and missing permission explain themselves", () => {
    assert.equal((page.match(/className="btn-primary"/g) || []).length, 1);
    assert.match(page, /Buyurtma yopilgan — amallar mavjud emas\./);
    assert.match(page, /Bu buyurtma holatini o‘zgartirish uchun ruxsat yo‘q\./);
  });

  it("operator-facing errors are Uzbek copy, never raw server messages or enum notes", () => {
    assert.doesNotMatch(page, /err\.message|err instanceof Error \? err/);
    assert.doesNotMatch(page, /data\.note|data\?\.note/);
    assert.match(page, /Buyurtma holati o‘zgargan — bu amal endi mavjud emas\./);
  });
});

describe("Admin Phase 13.2 Orders — table, drawer and states", () => {
  it("row opens the drawer by click and keyboard", () => {
    assert.match(page, /className=\{`orders-row/);
    assert.match(page, /tabIndex=\{0\}/);
    assert.match(page, /e\.key === "Enter" \|\| e\.key === " "/);
    assert.match(page, /onClick=\{\(\) => void openOrder\(item\.id\)\}/);
  });

  it("drawer is a snapshot: Mijoz / Buyurtma / To‘lov / Bron / Yetkazish, then technical details", () => {
    const order = ["Mijoz", "Buyurtma", "To‘lov", "Bron", "Yetkazish"].map((t) =>
      page.indexOf(`<DrawerSection title="${t}">`),
    );
    order.forEach((i) => assert.ok(i > 0));
    assert.deepEqual([...order].sort((a, b) => a - b), order);
    const tech = page.indexOf("Texnik ma’lumotlar");
    assert.ok(tech > order[order.length - 1]);
    for (const label of ["Buyurtma ID", "Mijoz ID", "Bron ID"]) {
      assert.ok(page.indexOf(label) > tech, `${label} must stay inside technical details`);
    }
  });

  it("delivery details only render from the real delivery row", () => {
    assert.match(page, /const delivery = selected\?\.delivery \|\| null;/);
    assert.match(page, /delivery\.courierName/);
    assert.match(page, /delivery\.timeWindow/);
    assert.match(page, /\{delivery \? \(/);
  });

  it("customer phone comes from the detail response and is masked by default", () => {
    assert.match(page, /const \[phoneVisible, setPhoneVisible\] = useState\(false\)/);
    assert.match(page, /phoneVisible \? formatPhone\(phone\) : maskPhone\(phone\)/);
    assert.match(page, /selected\?\.customer\?\.phone/);
    assert.doesNotMatch(page, /item\.customer\?\.phone|item\.customer\.phone/);
  });

  it("loading is a table skeleton; LoadingBlock only for the drawer detail", () => {
    assert.match(page, /orders-skeleton-row/);
    assert.equal((page.match(/<LoadingBlock\b/g) || []).length, 1);
    assert.match(page, /<LoadingBlock rows=\{6\} label="Buyurtma yuklanmoqda…" \/>/);
  });

  it("empty and filtered-empty copy are distinct", () => {
    assert.match(page, /"Bu filtrlar bo‘yicha buyurtma topilmadi\."\s*:\s*"Buyurtmalar mavjud emas\."/);
  });

  it("stale responses cannot overwrite newer list or detail state", () => {
    assert.match(page, /if \(seq !== listSeq\.current\) return;/);
    assert.match(page, /if \(seq !== detailSeq\.current\) return;/);
  });

  it("drawer focus/Escape come from the shared DetailDrawer — no page-level workaround", () => {
    assert.match(page, /<DetailDrawer/);
    assert.doesNotMatch(page, /e\.key === "Escape"|role="dialog"|aria-modal|addEventListener\("keydown"/);
  });
});

describe("Admin Phase 13.2 Orders — CSS", () => {
  it("has its own slice using only tokens", () => {
    assert.ok(ordersCss.length > 500);
    assert.doesNotMatch(ordersCss, /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
    assert.doesNotMatch(ordersCss, /gradient|backdrop-filter/);
  });

  it("only the table scrolls horizontally", () => {
    assert.match(ordersCss, /\.orders-page \{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
    assert.match(ordersCss, /\.orders-surface \.table-wrap \{[^}]*position: relative/);
    assert.match(ordersCss, /\.orders-surface \.table \{ min-width: \d+px; \}/);
    assert.match(ordersCss, /@media \(max-width: 768px\)/);
    assert.match(ordersCss, /@media \(max-width: 480px\)/);
  });

  it("legacy 12.12 Orders rules are gone", () => {
    assert.doesNotMatch(css, /Orders \(Phase 12\.12/);
    assert.doesNotMatch(css, /\.orders-(controls-secondary|more|transitions|drawer-primary)\b/);
  });
});

describe("Admin Phase 13.2 Orders — docs", () => {
  it("implementation status documents Phase 13.2", () => {
    assert.match(readFileSync(path.join(docs, "ADMIN_IMPLEMENTATION_STATUS.md"), "utf8"), /Phase 13\.2 — Buyurtmalar/);
  });
});
