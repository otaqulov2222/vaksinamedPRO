/**
 * Admin Phase 13.12 — Hisobotlar period report console over the real dashboard aggregates.
 *   GET /admin/dashboard  (dashboard:read; resolveStaffBranchFilter; createdFrom/createdTo = Asia/Tashkent business days)
 *     kpis: revenue, orders, completed, delivering, reserved, pendingPayment, cancelled (order KPIs, filtered)
 *           customers, branches, cashback (global snapshots); inventory snapshot only with a branch scope.
 * Backend change: `pendingPayment` + `cancelled` FILTER counts in the existing order KPI query. No DB schema / migration change.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deriveLegacyStatus } from "../src/lib/orderTransitions";
import { tashkentBusinessDayUtcRange } from "../src/lib/adminOrderOps";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(root, "../..");
const adminWeb = path.resolve(root, "../admin-web/src");
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const page = read(path.join(adminWeb, "pages/ReportsPage.tsx"));
const code = page.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const nav = read(path.join(adminWeb, "nav.ts"));
const adminRoute = read(path.join(root, "src/routes/admin.ts"));
const rbac = read(path.join(root, "src/lib/rbac.ts"));
const docs = read(path.join(repoRoot, "docs/ADMIN_IMPLEMENTATION_STATUS.md"));
const css = read(path.join(adminWeb, "styles.css"));
const rpCss = css.slice(
  css.indexOf("/* ——— Reports / Hisobotlar (Phase 12.20)"),
  css.indexOf("/* ——— Audit (Phase 12.21)"),
);

function between(src: string, start: string, end: string) {
  const a = src.indexOf(start);
  assert.ok(a >= 0, start);
  const b = src.indexOf(end, a + start.length);
  assert.ok(b > a, end);
  return src.slice(a, b);
}

const dashboardRoute = between(adminRoute, 'router.get("/admin/dashboard", ', "\nrouter.");
const orderKpiQuery = between(dashboardRoute, "const [orderKpis] = await db", ".where(orderWhere);");
const kpisPayload = between(dashboardRoute, "kpis: {", "\n      },");
const serverKpiKeys = new Set([...kpisPayload.matchAll(/^ {8}(\w+):/gm)].map((m) => m[1]));
const breakdownKeys = [...between(page, "const BREAKDOWN", "\n];").matchAll(/key: "(\w+)"/g)].map((m) => m[1]);

describe("Admin Phase 13.12 Reports — backend contract", () => {
  it("dashboard:read before DB; branch scope via resolveStaffBranchFilter; Tashkent day filters validated", () => {
    const perm = dashboardRoute.indexOf('requirePermission(user, "dashboard:read")');
    assert.ok(perm > 0);
    assert.ok(perm < dashboardRoute.indexOf("await db"), "permission check precedes DB access");
    assert.match(dashboardRoute, /branchFilter = resolveStaffBranchFilter\(\s*user,/);
    assert.match(dashboardRoute, /tashkentBusinessDayUtcRange\(req\.query\.createdFrom\)/);
    assert.match(dashboardRoute, /tashkentBusinessDayUtcRange\(req\.query\.createdTo\)/);
    assert.match(dashboardRoute, /code: "INVALID_DATE_FILTER"/);
    assert.match(dashboardRoute, /gte\(orders\.createdAt, fromRange\.start\)/);
    assert.match(dashboardRoute, /lt\(orders\.createdAt, toRange\.endExclusive\)/);
    assert.match(dashboardRoute, /timezone: "Asia\/Tashkent"/);
  });

  it("order KPIs: one bounded aggregate query; new pendingPayment / cancelled counts use the same filter", () => {
    assert.match(orderKpiQuery, /orders: count\(\)/);
    for (const [key, status] of [["completed", "'completed'"], ["reserved", "'reserved'"], ["pendingPayment", "'pending_payment'"], ["cancelled", "'cancelled'"]]) {
      assert.ok(orderKpiQuery.includes(`${key}: sql<number>\`count(*) filter (where \${orders.status} = ${status})\``), key);
    }
    assert.match(orderKpiQuery, /delivering: sql<number>`count\(\*\) filter \(where \$\{orders\.status\} in \('awaiting_delivery', 'paid'\)\)`/);
    assert.match(orderKpiQuery, /revenue: sql<number>`coalesce\(sum\(\$\{orders\.total\}\) filter \(where \$\{orders\.status\} = 'completed'\), 0\)`/);
    assert.equal(dashboardRoute.match(/\.from\(orders\)/g)?.length, 2, "order KPIs + recent orders only");
    for (const key of ["revenue", "orders", "completed", "reserved", "delivering", "pendingPayment", "cancelled", "customers", "branches", "cashback"]) {
      assert.ok(serverKpiKeys.has(key), key);
    }
    assert.match(kpisPayload, /cashbackSource: "cashback_accounts"/);
    assert.match(dashboardRoute, /sum\(\$\{cashbackAccounts\.balance\}\)/);
  });

  it("legacy status partition: every derived orders.status lands in exactly one breakdown bucket", () => {
    const bucket: Record<string, string> = {
      completed: "completed",
      cancelled: "cancelled",
      pending_payment: "pendingPayment",
      paid: "delivering",
      awaiting_delivery: "delivering",
      reserved: "reserved",
    };
    const fulfillments = ["CREATED", "CONFIRMED", "PREPARING", "READY_FOR_PICKUP", "OUT_FOR_DELIVERY", "COMPLETED", "CANCELLED"] as const;
    const payments = ["PENDING", "PAID", "FAILED", "REFUNDED", "PARTIALLY_REFUNDED"] as const;
    for (const channel of ["delivery", "pickup"] as const) {
      for (const method of ["cod", "pay_at_branch", "payme", "click"]) {
        for (const fulfillmentStatus of fulfillments) {
          for (const paymentStatus of payments) {
            const legacy = deriveLegacyStatus({ fulfillment: channel, fulfillmentStatus, paymentStatus, paymentMethod: method } as any);
            assert.ok(legacy in bucket, `${channel}/${method}/${fulfillmentStatus}/${paymentStatus} → ${legacy}`);
          }
        }
      }
    }
    assert.deepEqual(new Set(Object.values(bucket)), new Set(breakdownKeys));
  });

  it("business-day range: Asia/Tashkent midnight in UTC; malformed input rejected", () => {
    const r = tashkentBusinessDayUtcRange("2026-10-01");
    assert.ok(r);
    assert.equal(r!.start.toISOString(), "2026-09-30T19:00:00.000Z");
    assert.equal(r!.endExclusive.toISOString(), "2026-10-01T19:00:00.000Z");
    assert.equal(tashkentBusinessDayUtcRange("2026-13-40"), null);
    assert.equal(tashkentBusinessDayUtcRange("abc"), null);
  });

  it("permissions unchanged: dashboard:read is HQ-only; nav gates Hisobotlar on it", () => {
    const fallback = between(rbac, "function fallbackPermissionsForRole", "\n}\n");
    assert.match(between(fallback, "? new Set([", "])"), /"dashboard:read"/);
    assert.doesNotMatch(between(fallback, ": new Set([", "])"), /"dashboard:read"/);
    assert.match(nav, /\{ id: "reports", label: "Hisobotlar", permission: "dashboard:read"/);
  });
});

describe("Admin Phase 13.12 Reports — page uses real server values only", () => {
  it("single real endpoint; date + branch filters sent to the server", () => {
    const urls = [...code.matchAll(/request\(\s*`([^`]+)`/g)].map((m) => m[1]);
    assert.equal(urls.length, 1);
    assert.match(urls[0], /^\/api\/admin\/dashboard\$\{/);
    assert.match(code, /if \(branchId\) qs\.set\("branchId", branchId\);/);
    assert.match(code, /if \(range\.from\) qs\.set\("createdFrom", range\.from\);/);
    assert.match(code, /if \(range\.to\) qs\.set\("createdTo", range\.to\);/);
    assert.doesNotMatch(code, /softRequest|\/api\/pos\/sales|\/api\/admin\/orders|\/api\/admin\/payments/);
  });

  it("every KPI key the page reads is returned by the server; breakdown keys are server KPIs", () => {
    const read = new Set([
      ...[...code.matchAll(/kpis\.(\w+)/g)].map((m) => m[1]),
      ...[...code.matchAll(/kpi\("(\w+)"\)/g)].map((m) => m[1]),
      ...breakdownKeys,
    ]);
    for (const key of read) assert.ok(serverKpiKeys.has(key), `kpis.${key}`);
    const stockRows = between(code, "inventory.items.map((item: any) => (", "</tr>");
    const inventoryRead = new Set([
      ...[...code.matchAll(/\binventory\.(\w+)/g)].map((m) => m[1]),
      ...[...stockRows.matchAll(/\bitem\.(\w+)/g)].map((m) => m[1]),
    ]);
    const inventoryShape = between(dashboardRoute, "let inventory: {", "} | null = null;");
    for (const key of inventoryRead) assert.ok(new RegExp(`\\b${key}\\b`).test(inventoryShape), `inventory.${key}`);
  });

  it("no client-side financial math or invented KPI / comparison / chart / export", () => {
    assert.doesNotMatch(code, /reduce\(|Math\.max\(0,|kpis\.\w+\s*[-+/*]\s*|\)\s*[-+]\s*Number\(kpis/);
    assert.doesNotMatch(code, /avgTicket|completionRate|O‘rtacha chek|Yakunlanish foizi|%\s*\{|toFixed|percent/i);
    assert.doesNotMatch(code, /↑|↓|oldingi (oy|davr)ga nisbatan|prevRevenue|delta/i);
    assert.doesNotMatch(code, /recharts|Chart\.js|<canvas|<svg|new Chart|bar-chart|sales-chart/i);
    assert.doesNotMatch(code, /Blob\(|download=|text\/csv|\.xlsx|window\.print/);
    assert.match(code, /Export API mavjud emas/);
    assert.match(code, /time-series/);
    assert.match(code, /Qaytarishlar ayirilmaydi/);
    assert.match(code, /money\(Number\(kpis\.revenue\)\)/);
    assert.match(code, /money\(Number\(kpis\.cashback\)\)/);
  });

  it("global KPIs labelled as not period/branch filtered; inventory only with a branch", () => {
    assert.match(code, /davr va filial filtriga bog‘liq emas/);
    assert.match(code, /Ombor holati filial tanlanganda ko‘rsatiladi\./);
    assert.match(code, /joriy qoldiq, davrga bog‘liq emas/);
    assert.match(code, /Past qoldiq chegarasi API’da yo‘q/);
  });

  it("presets resolve on Asia/Tashkent business days; custom range validated before sending", () => {
    assert.match(code, /const BUSINESS_TZ = "Asia\/Tashkent";/);
    assert.match(code, /new Intl\.DateTimeFormat\("en-CA", \{ timeZone: BUSINESS_TZ/);
    assert.match(code, /if \(preset === "7d"\) return \{ from: shiftYmd\(today, -6\), to: today \};/);
    assert.match(code, /if \(preset === "30d"\) return \{ from: shiftYmd\(today, -29\), to: today \};/);
    assert.match(code, /if \(draft\.from > draft\.to\) \{/);
    assert.match(code, /if \(customPending\) return;/);
    assert.doesNotMatch(code, /getDate\(\)|setDate\(/);
  });

  it("HQ gets a branch filter; there is no client-side branch filtering", () => {
    assert.match(code, /\{isHq \? \(\s*<FilterField label="Filial">/);
    assert.doesNotMatch(code, /\.filter\(\([a-z]+\) => [^)]*branchId/);
  });
});

describe("Admin Phase 13.12 Reports — states, security, performance", () => {
  it("separate loading / empty / filter-empty / 401 / 403 / 404 / 500 / network states with fixed copy", () => {
    assert.match(code, /status === 401\) return \{ kind: "session"/);
    assert.match(code, /status === 403\) return \{ kind: "forbidden"/);
    assert.match(code, /status === 404\) return \{ kind: "notfound"/);
    assert.match(code, /codeOf\(err\) === "INVALID_DATE_FILTER"/);
    assert.match(code, /if \(!status\) return \{ kind: "network"/);
    assert.match(code, /kind: "failed", message: "Hisobotni yuklab bo‘lmadi/);
    assert.match(code, /<LoadingBlock rows=\{4\} label="Hisobot yuklanmoqda…" \/>/);
    assert.match(code, /Hozircha buyurtmalar yo‘q\./);
    assert.match(code, /Bu davr uchun ma’lumot yo‘q\./);
    assert.match(code, /error\.kind === "failed" \|\| error\.kind === "network" \? \(\) => void load\(\)/);
  });

  it("no raw server messages, secrets or phones in the page", () => {
    assert.doesNotMatch(code, /err\.message|error\.message\s*\|\||\.stack\b/);
    assert.doesNotMatch(code, /Bearer|passwordHash|paymeKey|clickSecret|localStorage|phone/i);
    assert.doesNotMatch(code, /recentOrders/);
  });

  it("one request per filter change with a stale-response guard", () => {
    assert.equal(code.match(/if \(seq !== loadSeq\.current\) return;/g)?.length, 2);
    assert.equal(code.match(/await request\(/g)?.length, 1);
    assert.doesNotMatch(code, /Promise\.all|\.map\(\s*async/);
  });

  it("keyboard: preset buttons are real buttons with aria-pressed in a labelled group", () => {
    assert.match(code, /role="group" aria-labelledby="rp-period-label"/);
    assert.match(code, /aria-pressed=\{preset === p\.id\}/);
    assert.match(code, /type="button"\s+className=\{`rp-preset/);
    assert.match(rpCss, /\.rp-preset:focus-visible \{ outline: 2px solid var\(--vm-brand\);/);
  });
});

describe("Admin Phase 13.12 Reports — design system and docs", () => {
  it("responsive: KPI grid collapses, secondary columns hidden on tablet, cards on mobile", () => {
    assert.ok(rpCss.length > 3000);
    assert.match(rpCss, /@media \(max-width: 1280px\) \{\s*\.rp-kpis \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/);
    assert.match(rpCss, /@media \(max-width: 900px\) \{\s*\.rp-surface \.rp-col-note \{ display: none; \}\s*\.rp-surface \.rp-col-axis \{ display: none; \}/);
    assert.match(rpCss, /@media \(max-width: 560px\) \{[\s\S]*?\.rp-stock thead \{ display: none; \}/);
    assert.match(rpCss, /\.rp-kpis,\s*\.rp-kpis-stock \{ grid-template-columns: minmax\(0, 1fr\); max-width: none; \}/);
  });

  it("no hardcoded colours, gradients or inline styles", () => {
    assert.doesNotMatch(rpCss, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    assert.doesNotMatch(rpCss, /gradient/i);
    assert.doesNotMatch(code, /style=\{\{|#[0-9a-f]{6}\b|gradient/i);
    assert.doesNotMatch(code, /MetricStrip|stat-grid|capability-grid/);
  });

  it("Phase 13.12 documented", () => {
    const section = between(docs, "## Phase 13.12 — Hisobotlar", "## Phase 13.11 — Yetkazib berish");
    assert.match(section, /GET \/api\/admin\/dashboard/);
    assert.match(section, /dashboard:read/);
    assert.match(section, /pendingPayment/);
    assert.match(section, /DB sxemasi va migratsiyalar o‘zgartirilmadi/);
    assert.match(section, /Export API mavjud emas/);
  });
});
