/**
 * Admin Phase 13.6 — Aksiyalar promotions console.
 * UI composition only: same read-only GET /api/admin/promos (promos + rewards, promos:read).
 * Promos are marketing banners; rewards are redeemed from the cashback balance by the loyalty engine.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminWeb = path.resolve(root, "../admin-web/src");
const docs = path.resolve(root, "../../docs");
const dbSrc = path.resolve(root, "../../lib/db");
const page = readFileSync(path.join(adminWeb, "pages/PromosPage.tsx"), "utf8");
const nav = readFileSync(path.join(adminWeb, "nav.ts"), "utf8");
const adminRoute = readFileSync(path.join(root, "src/routes/admin.ts"), "utf8");
const catalogRoute = readFileSync(path.join(root, "src/routes/catalog.ts"), "utf8");
const loyaltyRoute = readFileSync(path.join(root, "src/routes/loyalty.ts"), "utf8");
const rbac = readFileSync(path.join(root, "src/lib/rbac.ts"), "utf8");
const schema = readFileSync(path.join(dbSrc, "src/schema/catalog.ts"), "utf8");
const css = readFileSync(path.join(adminWeb, "styles.css"), "utf8");
const prCss = css.slice(
  css.indexOf("/* ——— Promos / Aksiyalar — Phase 13.6"),
  css.indexOf("/* ——— Reports / Hisobotlar"),
);

function between(src: string, start: string, end: string) {
  const a = src.indexOf(start);
  assert.ok(a >= 0, start);
  const b = src.indexOf(end, a + start.length);
  assert.ok(b > a, end);
  return src.slice(a, b);
}

describe("Admin Phase 13.6 Promos — backend contract (unchanged)", () => {
  it("one read endpoint: GET /admin/promos (promos:read) returns promos + rewards; no writes", () => {
    const body = between(adminRoute, 'router.get("/admin/promos"', "\nrouter.");
    assert.match(body, /requirePermission\(user, "promos:read"\)/);
    assert.match(body, /promos: await db\.select\(\)\.from\(promos\), rewards: await db\.select\(\)\.from\(rewards\)/);
    assert.doesNotMatch(adminRoute, /router\.(post|patch|put|delete)\("\/admin\/(promos|rewards)/);
    assert.match(catalogRoute, /from\(promos\)\.where\(eq\(promos\.active, true\)\)/);
  });

  it("promos schema is a banner: no period, benefit, scope, limit or usage columns", () => {
    const table = between(schema, 'pgTable("promos"', "});");
    for (const col of ["title", "subtitle", "tag", "icon", "background", "active"]) {
      assert.match(table, new RegExp(`\\b${col}:`), col);
    }
    assert.doesNotMatch(table, /start|end|discount|percent|amount|limit|branch|product|category|code|usage|redemption/i);
  });

  it("permissions: promos:read only — no promos:manage anywhere", () => {
    assert.match(rbac, /"promos:read"/);
    const migrations = readdirSync(path.join(dbSrc, "migrations")).filter((f) => f.endsWith(".sql"))
      .map((f) => readFileSync(path.join(dbSrc, "migrations", f), "utf8")).join("\n");
    assert.doesNotMatch(rbac + migrations + nav, /promos:manage/);
    assert.match(nav, /\{ id: "promos", label: "Aksiyalar", permission: "promos:read"/);
  });

  it("no order / POS / cashback / FOM / payment code reads promos", () => {
    const libDir = path.join(root, "src/lib");
    for (const f of readdirSync(libDir).filter((n) => n.endsWith(".ts") && n !== "rbac.ts")) {
      assert.doesNotMatch(readFileSync(path.join(libDir, f), "utf8"), /promos|promoId|applyPromo/, f);
    }
    const orders = readFileSync(path.join(root, "src/routes/orders.ts"), "utf8");
    assert.doesNotMatch(orders, /promos|promoId|applyPromo/);
    assert.match(orders, /void req\.body\.discount/);
  });

  it("rewards are redeemed from the cashback balance (loyalty engine), once per customer", () => {
    const redeem = between(loyaltyRoute, 'router.post("/loyalty/redeem"', "\nexport default");
    assert.match(redeem, /useCashback\(\{/);
    assert.match(redeem, /reason: "loyalty_redeem"/);
    assert.match(redeem, /redeemed\.includes\(reward\.code\)/);
  });
});

describe("Admin Phase 13.6 Promos — page composition", () => {
  it("read-only: GET only, no invented actions", () => {
    assert.match(page, /request\("\/api\/admin\/promos", props\.token\)/);
    assert.doesNotMatch(page, /method:\s*"(POST|PATCH|PUT|DELETE)"/);
    assert.doesNotMatch(page, /Aksiya qo‘shish|Yangi aksiya|Faollashtirish|O‘chirish|Arxivlash|ConfirmDialog/);
    assert.match(page, /Faqat ko‘rish — yozish API mavjud emas/);
    assert.match(page, /if \(seq !== loadSeq\.current\) return;/);
  });

  it("no invented fields, statuses, KPIs or pagination", () => {
    assert.doesNotMatch(page, /startDate|endDate|startsAt|endsAt|discountPercent|discountAmount|usageLimit|promoCode|coupon|branchId|productId/i);
    assert.doesNotMatch(page, /SCHEDULED|EXPIRED|Kutilmoqda|Tugagan|StatCard|MetricStrip|PaginationBar/);
    assert.doesNotMatch(page, /new Date\(|Date\.parse/);
    assert.match(page, /<StatusBadge tone=\{on \? "ok" : "neutral"\}>\{on \? "Faol" : "Nofaol"\}<\/StatusBadge>/);
  });

  it("promo vs cashback kept separate; marketing contract stated", () => {
    assert.match(page, /const PROMO_CONTRACT = "PROMO_MARKETING_ONLY";/);
    assert.match(page, /Narx, buyurtma, POS va cashback hisobiga ta’sir qilmaydi/);
    assert.match(page, /Cashback sovg‘alari/);
    assert.match(page, /cashback balansidan bir marta almashtiradi/);
    assert.match(page, /Bu aksiya emas\./);
  });

  it("free-text promises are flagged, never interpreted", () => {
    assert.match(page, /const CLAIM_RE = /);
    assert.match(page, /Matnda va’da — tizim qo‘llamaydi/);
    assert.match(page, /Tizimda aksiya engine yo‘q/);
    assert.match(page, /Erkin matn — muddat sifatida tekshirilmaydi/);
  });

  it("search + status filter run over the complete list and say so", () => {
    assert.match(page, /<form className="pr-search" role="search" onSubmit=\{applySearch\}>/);
    assert.match(page, /To‘liq ro‘yxat yuklanadi · qidiruv shu ro‘yxat bo‘yicha/);
    assert.match(page, /<option value="active">Faol<\/option>/);
    assert.match(page, /<option value="inactive">Nofaol<\/option>/);
    assert.match(page, /if \(!value\) setAppliedQuery\(""\);/);
  });

  it("tables: promo identity first; rewards priced in cashback so‘m", () => {
    const promoHead = between(page, "<th>Aksiya</th>", "</tr>");
    const tag = promoHead.indexOf('<th className="pr-col-tag">Teg</th>');
    assert.ok(promoHead.indexOf("<th>Holat</th>") > 0 && tag > promoHead.indexOf("<th>Holat</th>"));
    assert.ok(promoHead.indexOf("<th>Banner matni</th>") > tag);
    assert.match(page, /<th className="num">Cashback narxi<\/th>/);
    assert.match(page, /money\(Number\(item\.points \|\| 0\)\)/);
    assert.match(page, /onKeyDown=\{rowKeys\(open\)\}/);
    assert.match(page, /if \(e\.key === "Enter" \|\| e\.key === " "\)/);
    assert.match(page, /tabIndex=\{0\}/);
  });

  it("states: empty, filtered empty, error (retry only when retryable), loading", () => {
    assert.match(page, /"Aksiyalar mavjud emas\."/);
    assert.match(page, /"Tanlangan shartlar bo‘yicha aksiya topilmadi\."/);
    assert.match(page, /Aksiyalarni yuklab bo‘lmadi\./);
    assert.match(page, /onRetry=\{error\.kind === "failed" \? \(\) => void load\(\) : undefined\}/);
    assert.match(page, /className="pr-skeleton-row" aria-hidden="true"/);
    assert.match(page, /<div className="pr-empty" role="status">/);
  });

  it("drawer sections: promo Aksiya → Holat → Ta’sir → tech; reward Sovg‘a → Almashtirish → tech", () => {
    const promoOrder = ['<DrawerSection title="Aksiya">', '<DrawerSection title="Holat">', '<DrawerSection title="Ta’sir">', '<details className="pr-tech">'];
    const idx = promoOrder.map((t) => page.indexOf(t));
    assert.ok(idx.every((i, n) => i > 0 && (n === 0 || i > idx[n - 1])), idx.join(","));
    const rewardStart = page.indexOf('<DrawerSection title="Sovg‘a">');
    assert.ok(rewardStart > idx[3]);
    assert.ok(page.indexOf('<DrawerSection title="Almashtirish">', rewardStart) > rewardStart);
    assert.match(page, /Almashtirishlar soni<\/dt>\s*<dd className="pr-muted">Admin API’da yo‘q/);
    assert.doesNotMatch(page, /role="dialog"|aria-modal/);
  });

  it("no secrets in the page", () => {
    const stripped = page.replace(/props\.token/g, "").replace(/\{ token: string \}/, "");
    assert.doesNotMatch(stripped, /token|secret|password|apiKey|localStorage|console\./i);
  });
});

describe("Admin Phase 13.6 Promos — responsive + docs", () => {
  it("tag column hidden ≤1100px, cards ≤560px, tokens only", () => {
    assert.ok(prCss.length > 1000);
    assert.doesNotMatch(prCss, /th:nth-child/);
    assert.match(prCss, /@media \(max-width: 1100px\) \{\s*\.pr-summary-note \{[^}]*\}\s*\.pr-surface \.table th\.pr-col-tag,\s*\.pr-surface \.table td\.pr-cell-tag \{ display: none; \}/);
    assert.match(prCss, /@media \(max-width: 560px\) \{[\s\S]*?grid-template-areas: "main side" "text text";/);
    assert.doesNotMatch(prCss, /#[0-9a-fA-F]{3,8}\b|rgba?\(|gradient/);
  });

  it("docs record Phase 13.6", () => {
    assert.match(readFileSync(path.join(docs, "ADMIN_IMPLEMENTATION_STATUS.md"), "utf8"), /Phase 13\.6/);
  });
});
