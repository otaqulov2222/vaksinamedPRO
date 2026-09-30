/**
 * Admin Phase 13.7 — Mijozlar customers console.
 * UI composition only over the existing read-only contract:
 *   GET /admin/customers (server q + limit/offset, masked phone, SoT cashback balance)
 *   GET /admin/customers/:id
 *   GET /admin/customers/:id/cashback-history (cashback_ledger projection)
 * All three require customers:read. No customer write endpoints exist.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { maskAdminPhone, toAdminCustomerListItem } from "../src/lib/securityEnv.ts";
import { sanitizeAdminOrderSearch } from "../src/lib/adminOrderOps.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminWeb = path.resolve(root, "../admin-web/src");
const docs = path.resolve(root, "../../docs");
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const page = read(path.join(adminWeb, "pages/CustomersPage.tsx"));
const nav = read(path.join(adminWeb, "nav.ts"));
const adminRoute = read(path.join(root, "src/routes/admin.ts"));
const loyaltyRoute = read(path.join(root, "src/routes/loyalty.ts"));
const history = read(path.join(root, "src/lib/cashbackHistory.ts"));
const rbac = read(path.join(root, "src/lib/rbac.ts"));
const css = read(path.join(adminWeb, "styles.css"));
const cuCss = css.slice(
  css.indexOf("/* ——— Customers / Mijozlar — Phase 13.7"),
  css.indexOf("/* --- Payments - Phase 13.3"),
);

function between(src: string, start: string, end: string) {
  const a = src.indexOf(start);
  assert.ok(a >= 0, start);
  const b = src.indexOf(end, a + start.length);
  assert.ok(b > a, end);
  return src.slice(a, b);
}

const listRoute = between(adminRoute, 'router.get("/admin/customers", ', "\nrouter.");
const detailRoute = between(adminRoute, 'router.get("/admin/customers/:id", ', "\nrouter.");
const historyRoute = between(adminRoute, 'router.get("/admin/customers/:id/cashback-history"', "\nrouter.");

describe("Admin Phase 13.7 Customers — backend contract (unchanged)", () => {
  it("three GET routes, each gated by customers:read before any DB read", () => {
    for (const body of [listRoute, detailRoute, historyRoute]) {
      const perm = body.indexOf('requirePermission(user, "customers:read")');
      assert.ok(perm > 0);
      assert.ok(perm < body.indexOf("db."), "permission check precedes DB access");
    }
    assert.doesNotMatch(adminRoute, /router\.(post|patch|put|delete)\("\/admin\/customers/);
  });

  it("customers:read is HQ-only; no customers:manage; cashier fallback lacks it", () => {
    assert.doesNotMatch(rbac, /customers:manage/);
    const cashierFallback = rbac.slice(rbac.indexOf(": new Set(["), rbac.indexOf("]);", rbac.indexOf(": new Set([")));
    assert.doesNotMatch(cashierFallback, /customers:read/);
    assert.match(nav, /\{ id: "customers", label: "Mijozlar", permission: "customers:read"/);
  });

  it("list is a bounded server page with server search over name + phone", () => {
    assert.match(adminRoute, /ADMIN_CUSTOMERS_DEFAULT_LIMIT = 25/);
    assert.match(adminRoute, /ADMIN_CUSTOMERS_MAX_LIMIT = 50/);
    assert.match(listRoute, /Math\.min\(ADMIN_CUSTOMERS_MAX_LIMIT/);
    assert.match(listRoute, /sanitizeAdminOrderSearch/);
    assert.match(listRoute, /ilike\(customers\.firstName[\s\S]*ilike\(customers\.phone/);
    assert.match(listRoute, /pagination: \{ limit, offset, total, hasMore \}/);
    assert.match(listRoute, /orderBy\(desc\(customers\.id\)\)/);
    assert.equal(sanitizeAdminOrderSearch("%_\\abc"), "abc");
    assert.equal(sanitizeAdminOrderSearch("x".repeat(200)).length, 64);
  });

  it("list and detail return the masked DTO; balance from cashback_accounts; no hash / telegram id", () => {
    assert.match(listRoute, /leftJoin\(cashbackAccounts/);
    assert.match(listRoute, /toAdminCustomerListItem/);
    assert.match(detailRoute, /toAdminCustomerListItem/);
    assert.match(detailRoute, /cashbackSource: "cashback_accounts"/);
    const detailResponse = detailRoute.slice(detailRoute.indexOf("return res.json"));
    assert.doesNotMatch(detailResponse, /passwordHash|telegramId|row\.phone|redeemedRewards|row\.balance/);
    const item = toAdminCustomerListItem({
      id: 7, firstName: "A", lastName: "B", phone: "+998901234567", tier: "Gold", purchasesCount: 3, cashbackBalance: -5,
    });
    assert.deepEqual(Object.keys(item).sort(), ["cashbackBalance", "firstName", "id", "lastName", "phoneMasked", "purchasesCount", "tier"]);
    assert.equal(item.phoneMasked, "+998 90 *** ** 67");
    assert.equal(item.cashbackBalance, 0);
    assert.doesNotMatch(JSON.stringify(item), /1234567|901234/);
    assert.equal(maskAdminPhone("12"), "***");
  });

  it("history is read-only over the ledger and scoped to the customer on every join", () => {
    assert.match(historyRoute, /getCustomerCashbackHistory\(id,/);
    assert.match(historyRoute, /cashbackSource: "cashback_ledger"/);
    assert.match(history, /where\(eq\(cashbackLedger\.customerId, customerId\)\)/);
    assert.match(history, /and\(eq\(orders\.customerId, customerId\), inArray\(orders\.id/);
    assert.match(history, /and\(eq\(posSales\.customerId, customerId\), inArray\(posSales\.receiptId/);
    assert.match(history, /MAX_LIMIT = 100/);
    assert.doesNotMatch(history, /\.insert\(|\.update\(|\.delete\(/);
  });

  it("customer-facing history uses the session customer, never a client id", () => {
    const route = between(loyaltyRoute, 'router.get("/loyalty/cashback-history"', "\nrouter.");
    assert.match(route, /const customer = await requireCustomer\(req\)/);
    assert.match(route, /getCustomerCashbackHistory\(customer\.id,/);
    assert.doesNotMatch(route, /req\.(query|body|params)\.customerId/);
  });
});

describe("Admin Phase 13.7 Customers — page composition", () => {
  it("GET only; no invented customer or cashback actions", () => {
    const calls = [...page.matchAll(/request\(([^)]*)/g)].map((m) => m[1]);
    assert.ok(calls.length >= 3);
    assert.doesNotMatch(page, /method:\s*"(POST|PATCH|PUT|DELETE)"/);
    assert.doesNotMatch(page, /ConfirmDialog|confirm\(/);
    assert.doesNotMatch(
      page,
      /O‘chirish|Bloklash|Blokdan|Tahrirlash|Parolni|OTP|Eksport|Export|Segment|Izoh qo‘shish|Cashback qo‘shish|Balansni o‘zgartirish|Darajani o‘zgartirish|Sotuv|Qaytarish|Bekor qilish/,
    );
    assert.match(page, /Faqat ko‘rish — cashback va daraja bu yerda o‘zgarmaydi/);
  });

  it("server search + server pagination; no client filtering of the page", () => {
    assert.match(page, /qs\.set\("limit", String\(CUSTOMER_PAGE\)\)/);
    assert.match(page, /qs\.set\("offset", String\(nextOffset\)\)/);
    assert.match(page, /if \(q\) qs\.set\("q", q\)/);
    assert.match(page, /role="search" onSubmit=\{applySearch\}/);
    assert.match(page, /<PaginationBar/);
    assert.match(page, /total=\{total\}/);
    assert.doesNotMatch(page, /rows\.filter\(|\.sort\(/);
    assert.match(page, /Qidiruv serverda, butun mijozlar bazasi bo‘yicha\. Filtr va saralash API’da yo‘q/);
  });

  it("no invented fields, KPIs or tier values", () => {
    assert.doesNotMatch(page, /StatCard|MetricStrip|stat-grid/);
    assert.doesNotMatch(page, /telegramId|item\.phone\b|detail\.phone\b|\.balance\b|redeemedRewards|lastActivity|lastSeen|segment|branchId/);
    assert.doesNotMatch(page, /"(Gold|Silver|Platinum|Bronze|VIP)"/);
    assert.doesNotMatch(page, /cashback_accounts/);
    assert.doesNotMatch(page, /reduce\(/);
    assert.match(page, /\|\| "Mijoz"/);
  });

  it("table: identity (name + masked phone) → Loyalty → Cashback balansi → Xaridlar", () => {
    const head = between(page, "<thead>", "</thead>");
    const order = ["<th>Mijoz</th>", "<th>Loyalty</th>", 'Cashback balansi</th>', "Xaridlar</th>"].map((s) => head.indexOf(s));
    assert.ok(order.every((i, n) => i > 0 && (n === 0 || i > order[n - 1])));
    assert.match(page, /\{item\.phoneMasked \|\| "—"\}/);
    assert.match(page, /money\(Number\(item\.cashbackBalance \|\| 0\)\)/);
  });

  it("detail loads only when a row opens (no per-row fan-out)", () => {
    const listFn = between(page, "async function loadPage", "\n  }\n");
    assert.doesNotMatch(listFn, /cashback-history|\/api\/admin\/customers\/\$\{/);
    assert.doesNotMatch(page, /rows\.map\([^)]*request|Promise\.all\(rows/);
    const openFn = between(page, "async function openCustomer", "\n  }\n");
    assert.match(openFn, /\/api\/admin\/customers\/\$\{id\}`/);
    assert.match(openFn, /loadHistory\(id, 0, seq\)/);
    assert.match(page, /seq !== listSeq\.current/);
    assert.match(page, /seq !== detailSeq\.current/);
  });

  it("drawer: Mijoz → Loyalty → Cashback → Cashback tarixi, technical collapsed", () => {
    const sections = [...page.matchAll(/<DrawerSection title="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(sections, ["Mijoz", "Loyalty", "Cashback", "Cashback tarixi"]);
    assert.match(page, /<details className="cu-tech">/);
    assert.doesNotMatch(page, /<details className="cu-tech" open/);
    assert.match(page, /To‘liq raqam admin API’da berilmaydi/);
    assert.match(page, /Qo‘lda qo‘shish, ayirish yoki tuzatish API’si yo‘q/);
    assert.match(page, /Mijoz bo‘yicha buyurtmalar ro‘yxati admin API’da yo‘q/);
  });

  it("history shows server source labels and entry types; no source keys", () => {
    assert.match(page, /StatusLabelBadge domain="entry"/);
    assert.match(page, /item\.sourceLabel/);
    assert.match(page, /item\.sourceContract/);
    assert.doesNotMatch(page, /sourceKey|idempotency|actor/);
    assert.match(page, /setHistoryMore\(items\.length === HISTORY_PAGE\)/);
  });

  it("states: empty / filtered empty / error / forbidden / loading", () => {
    assert.match(page, /"Mijozlar mavjud emas\."/);
    assert.match(page, /"Tanlangan shartlar bo‘yicha mijoz topilmadi\."/);
    assert.match(page, /Mijozlarni yuklab bo‘lmadi\./);
    assert.match(page, /Mijozlar bo‘limiga kirish uchun ruxsat mavjud emas\./);
    assert.match(page, /onRetry=\{error\.kind === "failed"/);
    assert.match(page, /cu-skeleton-row/);
    assert.doesNotMatch(page, /err\.message|error\.message \|\|/);
  });

  it("rows are keyboard operable; drawer focus handled by the shared primitive", () => {
    assert.match(page, /tabIndex=\{0\}/);
    assert.match(page, /e\.key === "Enter" \|\| e\.key === " "/);
    assert.match(page, /<DetailDrawer/);
    assert.doesNotMatch(page, /addEventListener\("keydown"|useModalFocus/);
  });

  it("no secrets in the page", () => {
    const stripped = page.replace(/props\.token/g, "").replace(/\{ token: string \}/, "");
    assert.doesNotMatch(stripped, /token|secret|password|hmac|otp\b|apiKey|localStorage|console\./i);
  });
});

describe("Admin Phase 13.7 Customers — responsive + docs", () => {
  it("cards ≤560px, history cards ≤480px, tokens only", () => {
    assert.ok(cuCss.length > 1000);
    assert.match(cuCss, /@media \(max-width: 560px\) \{[\s\S]*?grid-template-areas: "main balance" "main tier";/);
    assert.match(cuCss, /\.cu-surface \.table td\.cu-cell-purchases \{ display: none; \}/);
    assert.match(cuCss, /@media \(max-width: 480px\) \{[\s\S]*?grid-template-areas: "date sum" "entry entry" "source source";/);
    assert.doesNotMatch(cuCss, /#[0-9a-fA-F]{3,8}\b|rgba?\(|gradient/);
  });

  it("docs record Phase 13.7", () => {
    assert.match(read(path.join(docs, "ADMIN_IMPLEMENTATION_STATUS.md")), /Phase 13\.7/);
  });
});
