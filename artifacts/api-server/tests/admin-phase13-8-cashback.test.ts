/**
 * Admin Phase 13.8 — Cashback / Loyalty financial console.
 * Read-only UI composition over existing contracts:
 *   GET /admin/dashboard              kpis.cashback = sum(cashback_accounts.balance)  (dashboard:read)
 *   GET /cashback/rules               public rules + server max spend ratio
 *   GET /admin/customers[/:id]        SoT balance from cashback_accounts            (customers:read)
 *   GET /admin/customers/:id/cashback-history   cashback_ledger projection       (customers:read)
 * cashbackFinance remains the single writer; the page performs no cashback mutation.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminWeb = path.resolve(root, "../admin-web/src");
const docs = path.resolve(root, "../../docs");
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const page = read(path.join(adminWeb, "pages/CashbackPage.tsx"));
const ui = read(path.join(adminWeb, "ui.tsx"));
const nav = read(path.join(adminWeb, "nav.ts"));
const adminRoute = read(path.join(root, "src/routes/admin.ts"));
const integrations = read(path.join(root, "src/routes/integrations.ts"));
const ordersRoute = read(path.join(root, "src/routes/orders.ts"));
const loyaltyRoute = read(path.join(root, "src/routes/loyalty.ts"));
const history = read(path.join(root, "src/lib/cashbackHistory.ts"));
const finance = read(path.join(root, "src/lib/cashbackFinance.ts"));
const rbac = read(path.join(root, "src/lib/rbac.ts"));
const css = read(path.join(adminWeb, "styles.css"));
const cbCss = css.slice(
  css.indexOf("/* ——— Cashback / Loyalty — Phase 13.8"),
  css.indexOf("/* --- Payments - Phase 13.3"),
);

function between(src: string, start: string, end: string) {
  const a = src.indexOf(start);
  assert.ok(a >= 0, start);
  const b = src.indexOf(end, a + start.length);
  assert.ok(b > a, end);
  return src.slice(a, b);
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? sourceFiles(full) : /\.ts$/.test(name) ? [full] : [];
  });
}

const dashboardRoute = between(adminRoute, 'router.get("/admin/dashboard", ', "\nrouter.");
const historyRoute = between(adminRoute, 'router.get("/admin/customers/:id/cashback-history"', "\nrouter.");

describe("Admin Phase 13.8 Cashback — backend contract (unchanged)", () => {
  it("liability KPI is a server aggregate over cashback_accounts behind dashboard:read", () => {
    assert.match(dashboardRoute, /requirePermission\(user, "dashboard:read"\)/);
    assert.match(dashboardRoute, /coalesce\(sum\(\$\{cashbackAccounts\.balance\}\), 0\)/);
    assert.match(dashboardRoute, /cashbackSource: "cashback_accounts"/);
  });

  it("rules come from the server (max spend ratio from settings)", () => {
    const route = between(integrations, 'router.get("/cashback/rules"', "\n});");
    assert.match(route, /getMaxSpendRatio\(\)/);
    assert.match(route, /publicCashbackRules\(ratio\)/);
  });

  it("history is a read-only ledger projection scoped to the customer", () => {
    assert.match(historyRoute, /requirePermission\(user, "customers:read"\)/);
    assert.match(historyRoute, /cashbackSource: "cashback_ledger"/);
    assert.match(history, /where\(eq\(cashbackLedger\.customerId, customerId\)\)/);
    assert.match(history, /and\(eq\(orders\.customerId, customerId\), inArray\(orders\.id/);
    assert.doesNotMatch(history, /\.insert\(|\.update\(|\.delete\(/);
    const route = between(loyaltyRoute, 'router.get("/loyalty/cashback-history"', "\nrouter.");
    assert.match(route, /getCustomerCashbackHistory\(customer\.id,/);
    assert.doesNotMatch(route, /req\.(query|body|params)\.customerId/);
  });

  it("no admin cashback/loyalty write routes and no cashback permissions were added", () => {
    assert.doesNotMatch(adminRoute, /router\.(post|patch|put|delete)\("[^"]*(cashback|loyalty)/);
    assert.doesNotMatch(rbac, /"cashback:|"loyalty:/);
    assert.match(nav, /\{ id: "cashback", label: "Cashback \/ Loyalty", permission: "customers:read"/);
    const cashierFallback = rbac.slice(rbac.indexOf(": new Set(["), rbac.indexOf("]);", rbac.indexOf(": new Set([")));
    assert.doesNotMatch(cashierFallback, /customers:read|dashboard:read/);
    const refund = between(ordersRoute, 'router.post("/orders/:id/refund-cashback"', "\n});");
    assert.match(refund, /requirePermission\(admin, "orders:confirm_pos"\)/);
    assert.match(refund, /assertBranchScope\(admin, rows\[0\]\.branchId\)/);
  });

  it("cashbackFinance is the only writer of ledger, accounts and commercial transactions", () => {
    const writes = /\.(insert|update|delete)\((cashbackLedger|cashbackAccounts|commercialTransactions)\)/;
    const offenders = sourceFiles(path.join(root, "src"))
      .filter((f) => !f.endsWith(path.join("lib", "cashbackFinance.ts")))
      .filter((f) => writes.test(read(f)));
    assert.deepEqual(offenders, []);
    assert.doesNotMatch(finance, /\.delete\(cashbackLedger\)/);
    assert.match(finance, /reversesEntryId/);
  });
});

describe("Admin Phase 13.8 Cashback — page composition", () => {
  it("GET only; no mutation, confirm or refund wiring", () => {
    const calls = [...page.matchAll(/request\(\s*`?"?([^`",)]+)/g)].map((m) => m[1]);
    assert.ok(calls.length >= 4);
    assert.doesNotMatch(page, /method:\s*"(POST|PATCH|PUT|DELETE)"/);
    assert.doesNotMatch(page, /ConfirmDialog|confirm\(|refund-cashback|\/loyalty\/redeem/);
    assert.doesNotMatch(
      page,
      /Cashback qo‘shish|Balansni o‘zgartirish|Darajani o‘zgartirish|Bekor qilish|Eksport|Export|Muddatini uzaytirish|Tahrirlash|O‘chirish/,
    );
    assert.match(page, /Faqat ko‘rish — bu sahifada cashback o‘zgartirilmaydi/);
  });

  it("no client balance maths, no hardcoded rules or tiers", () => {
    assert.doesNotMatch(page, /reduce\(|(cashback|balance|sum|total)\w* \+= |\.balance\b|cashback_accounts/i);
    assert.doesNotMatch(page, /Number\([^)]*\) [-+] Number\(/);
    assert.match(page, /money\(Number\(item\.cashbackBalance \|\| 0\)\)/);
    assert.match(page, /money\(Number\(account\.cashbackBalance \|\| 0\)\)/);
    assert.match(page, /dash\?\.kpis\?\.cashback/);
    assert.match(page, /\$\{rules\.maxSpendPercent\}%/);
    assert.match(page, /rules\.ttlDays/);
    assert.doesNotMatch(page, /"(Gold|Silver|Platinum|Bronze|VIP)"|30%|90 kun/);
    assert.match(page, /Array\.isArray\(rules\?\.tiers\) \? rules\.tiers : \[\]/);
  });

  it("server search + pagination; ledger grows by server pages only", () => {
    assert.match(page, /qs\.set\("limit", String\(ACCOUNT_PAGE\)\)/);
    assert.match(page, /qs\.set\("offset", String\(nextOffset\)\)/);
    assert.match(page, /if \(q\) qs\.set\("q", q\)/);
    assert.match(page, /<PaginationBar/);
    assert.doesNotMatch(page, /rows\.filter\(|\.sort\(/);
    assert.match(page, /cashback-history\?limit=\$\{LEDGER_PAGE\}&offset=\$\{ledgerOffset\}/);
    assert.match(page, /setLedgerMore\(items\.length === LEDGER_PAGE\)/);
    assert.match(page, /Yana ko‘rsatish/);
    assert.match(page, /Tarixning umumiy sonini API qaytarmaydi/);
  });

  it("account detail + ledger load only when a row opens (no N+1)", () => {
    const listFn = between(page, "async function loadPage", "\n  }\n");
    assert.doesNotMatch(listFn, /cashback-history|\/api\/admin\/customers\/\$\{/);
    assert.doesNotMatch(page, /rows\.map\([^)]*request|Promise\.all\(/);
    const openFn = between(page, "async function openAccount", "\n  }\n");
    assert.match(openFn, /\/api\/admin\/customers\/\$\{id\}`/);
    assert.match(openFn, /loadLedger\(id, 0, seq\)/);
    assert.match(page, /seq !== listSeq\.current/);
    assert.match(page, /seq !== accountSeq\.current/);
  });

  it("entry types use the shared label + tone mapping (EARN ok, USE info, REVERSAL warn)", () => {
    assert.match(page, /StatusLabelBadge domain="entry"/);
    const tone = between(ui, "export function entryTone", "\n}\n");
    assert.match(tone, /"EARN"\) return "ok"/);
    assert.match(tone, /"USE"\) return "info"/);
    assert.match(tone, /"REVERSAL"\) return "warn"/);
    assert.doesNotMatch(tone, /danger/);
    assert.match(ui, /ADJUSTMENT: "Tuzatish"/);
  });

  it("dates in Asia/Tashkent; amounts use the server's signed value", () => {
    assert.match(page, /timeZone: "Asia\/Tashkent"/);
    assert.match(page, /fmtTashkent\(item\.createdAt\)/);
    assert.match(page, /signedMoney\(item\.cashback\)/);
    assert.match(page, /Yaratilgan \(UTC\)/);
  });

  it("entry drawer: yozuv → tijorat tranzaksiyasi → qaytarish (REVERSAL only) → texnik collapsed", () => {
    const entryView = between(page, "{entry ? (", ") : (\n          <>");
    const sections = [...entryView.matchAll(/<DrawerSection title="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(sections, ["Cashback yozuvi", "Tijorat tranzaksiyasi", "Qaytarish"]);
    assert.match(entryView, /toUpperCase\(\) === "REVERSAL" \? \(\s*<DrawerSection title="Qaytarish">/);
    assert.match(entryView, /<details className="cb-tech">/);
    assert.doesNotMatch(page, /<details className="cb-tech" open/);
    assert.match(entryView, /Admin API’da ko‘rsatilmaydi/);
    assert.match(entryView, /entry\.sourceType \|\| "Bog‘lanmagan"/);
    assert.match(entryView, /operatorCapabilityLabel\(String\(entry\.sourceContract\)\)/);
    const accountSections = [...page.slice(page.indexOf(") : (\n          <>")).matchAll(/<DrawerSection title="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(accountSections, ["Cashback hisobi", "Cashback tarixi"]);
  });

  it("states: empty / filtered empty / error / forbidden / loading", () => {
    assert.match(page, /"Mijozlar mavjud emas\."/);
    assert.match(page, /"Tanlangan shartlar bo‘yicha mijoz topilmadi\."/);
    assert.match(page, /Cashback hisoblarini yuklab bo‘lmadi\./);
    assert.match(page, /Cashback bo‘limiga kirish uchun ruxsat mavjud emas\./);
    assert.match(page, /Dashboard ruxsati kerak\./);
    assert.match(page, /Cashback operatsiyalari topilmadi\./);
    assert.match(page, /onRetry=\{error\.kind === "failed"/);
    assert.match(page, /cb-skeleton-row/);
    assert.doesNotMatch(page, /err\.message|error\.message \|\|/);
  });

  it("keyboard: rows operable, focus moves to back button and returns to the ledger row", () => {
    assert.match(page, /tabIndex=\{0\}/);
    assert.match(page, /e\.key === "Enter" \|\| e\.key === " "/);
    assert.match(page, /backRef\.current\?\.focus\(\)/);
    assert.match(page, /\[data-ledger-id="\$\{lastEntryId\.current\}"\]/);
    assert.match(page, /<DetailDrawer/);
    assert.doesNotMatch(page, /addEventListener\("keydown"|useModalFocus/);
  });

  it("no secrets, source keys or idempotency keys in the page", () => {
    assert.doesNotMatch(page, /sourceKey|idempotency|actor/);
    const stripped = page.replace(/props\.token/g, "").replace(/\{ token: string \}/, "");
    assert.doesNotMatch(stripped, /token|secret|password|hmac|otp\b|apiKey|localStorage|console\./i);
  });
});

describe("Admin Phase 13.8 Cashback — responsive + docs", () => {
  it("rules stack ≤1180px, account cards ≤560px, ledger cards ≤480px, tokens only", () => {
    assert.ok(cbCss.length > 1000);
    assert.match(cbCss, /\.cb-layout \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) 320px;/);
    assert.match(cbCss, /@media \(max-width: 1180px\) \{[\s\S]*?\.cb-layout \{ grid-template-columns: minmax\(0, 1fr\); \}/);
    assert.match(cbCss, /@media \(max-width: 560px\) \{[\s\S]*?grid-template-areas: "main balance" "main tier";/);
    assert.match(cbCss, /@media \(max-width: 480px\) \{[\s\S]*?grid-template-areas: "date sum" "entry entry" "source source";/);
    assert.doesNotMatch(cbCss, /#[0-9a-fA-F]{3,8}\b|rgba?\(|gradient/);
  });

  it("docs record Phase 13.8", () => {
    assert.match(read(path.join(docs, "ADMIN_IMPLEMENTATION_STATUS.md")), /Phase 13\.8/);
  });
});
