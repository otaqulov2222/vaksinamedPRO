/**
 * Admin Phase 13.9 — Baholar ratings console.
 * Read-only UI composition over the single existing admin contract:
 *   GET /admin/ratings  (ratings:read; branchId filter via resolveStaffBranchFilter; limit/offset/total/hasMore)
 * Ratings are created only by customers (POST /ratings, integer 1–5, one per completed owned order).
 * Moderation: PATCH /admin/ratings/:id (ratings:moderate) hide/unhide; list joins order code and tags.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(root, "../..");
const adminWeb = path.resolve(root, "../admin-web/src");
const docs = path.resolve(repoRoot, "docs");
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const page = read(path.join(adminWeb, "pages/RatingsPage.tsx"));
const nav = read(path.join(adminWeb, "nav.ts"));
const adminRoute = read(path.join(root, "src/routes/admin.ts"));
const integrations = read(path.join(root, "src/routes/integrations.ts"));
const rbac = read(path.join(root, "src/lib/rbac.ts"));
const schema = read(path.join(repoRoot, "lib/db/src/schema/commerce.ts"));
const rbacMigration = read(path.join(repoRoot, "lib/db/migrations/0001_sessions_rbac.sql"));
const css = read(path.join(adminWeb, "styles.css"));
const rtCss = css.slice(
  css.indexOf("/* ——— Ratings / Baholar — Phase 13.9"),
  css.indexOf("/* --- Payments - Phase 13.3"),
);

function between(src: string, start: string, end: string) {
  const a = src.indexOf(start);
  assert.ok(a >= 0, start);
  const b = src.indexOf(end, a + start.length);
  assert.ok(b > a, end);
  return src.slice(a, b);
}

const listRoute = between(adminRoute, 'router.get("/admin/ratings", ', "\nrouter.");
const moderateRoute = between(adminRoute, 'router.patch("/admin/ratings/:id", ', "\nrouter.");
const createRoute = between(integrations, 'router.post("/ratings", ', "\n});");
const table = between(schema, 'export const staffRatings = pgTable("staff_ratings", {', "\n});");

describe("Admin Phase 13.9 Ratings — backend contract (unchanged)", () => {
  it("one admin route: GET /admin/ratings gated by ratings:read before any DB read", () => {
    const perm = listRoute.indexOf('requirePermission(user, "ratings:read")');
    assert.ok(perm > 0);
    assert.ok(perm < listRoute.indexOf("db."), "permission check precedes DB access");
    assert.match(adminRoute, /router\.patch\("\/admin\/ratings\/:id"/);
    assert.doesNotMatch(adminRoute, /router\.(post|put|delete)\("\/admin\/ratings/);
    assert.doesNotMatch(adminRoute, /router\.get\("\/admin\/ratings\/:id/);
  });

  it("PATCH moderation gated by ratings:moderate before DB; branch scope; audit hide/unhide", () => {
    const perm = moderateRoute.indexOf('requirePermission(user, "ratings:moderate")');
    assert.ok(perm > 0 && perm < moderateRoute.indexOf("db."));
    assert.match(moderateRoute, /assertBranchScope\(user, existing\.branchId\)/);
    assert.match(moderateRoute, /action: body\.hidden \? "rating\.hide" : "rating\.unhide"/);
    assert.match(moderateRoute, /entity: "staff_rating"/);
  });

  it("branch scope is server-side; cashiers cannot widen it via branchId", () => {
    assert.match(listRoute, /resolveStaffBranchFilter\(/);
    assert.match(listRoute, /eq\(staffRatings\.branchId, branchFilter\)/);
  });

  it("bounded pagination with total + hasMore; fixed newest-first order; no search param", () => {
    assert.match(listRoute, /Math\.min\(100, Math\.floor\(limitRaw\)\)/);
    assert.match(listRoute, /: 50;/);
    assert.match(listRoute, /count\(\)/);
    assert.match(listRoute, /hasMore: offset \+ rows\.length < total/);
    assert.match(listRoute, /pagination: \{ limit, offset, total \}/);
    assert.match(listRoute, /orderBy\(desc\(staffRatings\.createdAt\), desc\(staffRatings\.id\)\)/);
    assert.doesNotMatch(listRoute, /req\.query\.(q|search|rating|sort|orderId|customerId)/);
  });

  it("list joins orders; parses tags; excludes hidden unless includeHidden; DTO has orderCode (no customerId)", () => {
    assert.match(listRoute, /leftJoin\(orders, eq\(staffRatings\.orderId, orders\.id\)\)/);
    assert.match(listRoute, /parseStaffRatingTags/);
    assert.match(listRoute, /isNull\(staffRatings\.hiddenAt\)/);
    assert.match(listRoute, /includeHidden/);
    assert.match(listRoute, /orderCode: row\.orderCode/);
    assert.match(listRoute, /tags: parseStaffRatingTags/);
    assert.doesNotMatch(between(listRoute, ".select({", "return res.json"), /customerId/);
  });

  it("record has moderation columns; no status, reply, product or updatedAt", () => {
    assert.match(table, /hiddenAt: timestamp\("hidden_at"/);
    assert.match(table, /hiddenBy: text\("hidden_by"\)/);
    assert.match(table, /moderationNote: text\("moderation_note"\)/);
    assert.doesNotMatch(table, /status|reply|productId|updatedAt|approved/i);
    assert.match(table, /rating: integer\("rating"\)\.notNull\(\)/);
  });

  it("ratings are created only by customers: integer 1–5, owned completed order, one per order, branch from order", () => {
    assert.match(createRoute, /const customer = await requireCustomer\(req\)/);
    assert.match(createRoute, /!Number\.isInteger\(rating\) \|\| rating < 1 \|\| rating > 5/);
    assert.match(createRoute, /order\.customerId !== customer\.id/);
    assert.match(createRoute, /Faqat yakunlangan buyurtmani baholash mumkin/);
    assert.match(createRoute, /status\(409\)/);
    assert.match(createRoute, /const branchId = order\.branchId;/);
  });

  it("ratings:read + ratings:moderate; HQ-only read; cashier has neither fallback nor seeded grant", () => {
    assert.match(rbac, /ratings:moderate/);
    assert.doesNotMatch(rbac + rbacMigration, /ratings:manage|reviews:/);
    const cashierFallback = rbac.slice(rbac.indexOf(": new Set(["), rbac.indexOf("]);", rbac.indexOf(": new Set([")));
    assert.doesNotMatch(cashierFallback, /ratings:read/);
    const cashierGrant = between(rbacMigration, "JOIN auth_permissions p ON p.code IN (", "WHERE r.code = 'cashier'");
    assert.doesNotMatch(cashierGrant, /ratings:read/);
    assert.match(nav, /\{ id: "ratings", label: "Baholar", permission: "ratings:read"/);
  });
});

describe("Admin Phase 13.9 Ratings — page composition", () => {
  it("list GET + optional PATCH moderation via ConfirmDialog for ratings:moderate", () => {
    const calls = [...page.matchAll(/request\(\s*`([^`]+)`/g)].map((m) => m[1]);
    assert.deepEqual(calls, ["/api/admin/ratings?${qs}", "/api/admin/ratings/${moderateTarget.item.id}"]);
    assert.match(page, /ConfirmDialog/);
    assert.match(page, /method: "PATCH"/);
    assert.match(page, /ratings:moderate/);
    assert.match(page, /includeHidden/);
    assert.match(page, /orderLabel\(item\)/);
    assert.match(page, /ratingTags\(item\)/);
    assert.doesNotMatch(page, /Faqat ko‘rish — baholarni o‘zgartirish API mavjud emas/);
  });

  it("no fake KPI, average or search field", () => {
    assert.doesNotMatch(page, /MetricStrip|StatCard|metric-strip|o‘rtacha|average|reduce\(/i);
    assert.doesNotMatch(page, /type="search"|role="search"/);
  });

  it("server branch filter + server pagination; no client filtering or sorting", () => {
    assert.match(page, /qs\.set\("limit", String\(RATINGS_PAGE\)\)/);
    assert.match(page, /qs\.set\("offset", String\(nextOffset\)\)/);
    assert.match(page, /if \(bid\) qs\.set\("branchId", bid\)/);
    assert.match(page, /\{isHq \? \(/);
    assert.match(page, /<PaginationBar/);
    assert.match(page, /total=\{total\}/);
    assert.match(page, /hasMore=\{hasMore\}/);
    assert.doesNotMatch(page, /rows\.filter\(|\.sort\(/);
    assert.match(page, /Filial filtri serverda · qidiruv va saralash API’da yo‘q/);
    assert.match(page, /seq !== listSeq\.current/);
  });

  it("table: Baho → Buyurtma → Filial → Izoh → Sana; no customer / product / status columns", () => {
    const head = between(page, "<thead>", "</thead>");
    const order = ["Baho</th>", "Buyurtma</th>", "Filial</th>", "Izoh</th>", "Sana</th>"].map((s) => head.indexOf(s));
    assert.ok(order.every((i, n) => i > 0 && (n === 0 || i > order[n - 1])));
    assert.doesNotMatch(head, /Mijoz|Mahsulot|Holat|Status/);
    assert.match(page, /const RATING_COLUMNS = 5;/);
    assert.doesNotMatch(page, /customerId|\.phone|productName|(item|selected)\.status|reply/);
    assert.match(page, /ratingTags/);
  });

  it("scale is the server's 1–5 integer; values outside it render raw, never rescaled", () => {
    assert.match(page, /const SCALE_MAX = 5;/);
    assert.match(page, /Number\.isInteger\(n\) && n >= 1 && n <= SCALE_MAX \? n : null/);
    assert.match(page, /Qiymat 1–5 shkalasidan tashqarida/);
    assert.match(page, /if \(n >= 4\) return "pos";/);
    assert.match(page, /if \(n === 3\) return "neutral";/);
    assert.match(page, /if \(n === 2\) return "warn";/);
    assert.match(page, /return "neg";/);
    assert.match(page, /aria-label=\{`Baho: \$\{n\} \/ \$\{SCALE_MAX\}`\}/);
    assert.match(page, /<span className="rt-stars" aria-hidden="true">/);
  });

  it("comment preview in table, full text in drawer, neutral 'Izohsiz' when empty", () => {
    assert.match(page, /<span className="rt-comment">\{comment\}<\/span>/);
    assert.match(page, /rt-muted">Izohsiz<\/span>/);
    assert.match(page, /<p className="rt-comment-full">\{selectedComment\}<\/p>/);
    assert.match(page, /rt-comment-none">Izohsiz/);
  });

  it("drawer: Baho → Buyurtma → Filial → Izoh, technical collapsed; relation honesty", () => {
    const sections = [...page.matchAll(/<DrawerSection title="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(sections.slice(0, 4).join(",") === "Baho,Buyurtma,Filial,Izoh");
    assert.match(page, /DrawerSection title="Moderatsiya"/);
    assert.match(page, /<details className="rt-tech">/);
    assert.doesNotMatch(page, /<details className="rt-tech" open/);
    assert.match(page, /Bog‘lanmagan \(eski yozuv\)/);
    assert.match(page, /mahsulot yoki xodimga bog‘lanmagan/);
    assert.match(page, /Mijoz ma’lumoti bu API’da berilmaydi/);
  });

  it("no N+1: branch names from the already-loaded branch list, drawer uses the list row", () => {
    assert.match(page, /props\.branches\.find\(/);
    assert.match(page, /onClick=\{\(\) => setSelected\(item\)\}/);
    assert.doesNotMatch(page, /rows\.map\([^)]*request|Promise\.all\(|\/api\/admin\/orders|\/api\/admin\/customers/);
  });

  it("dates in Asia/Tashkent; raw UTC only in the technical section", () => {
    assert.match(page, /timeZone: "Asia\/Tashkent"/);
    assert.match(page, /fmtTashkent\(item\.createdAt\)/);
    assert.match(page, /Yaratilgan \(UTC\)/);
  });

  it("states: loading / empty / filtered empty / 401 / 403 / failed; no raw server errors", () => {
    assert.match(page, /rt-skeleton-row/);
    assert.match(page, /"Baholar topilmadi\."/);
    assert.match(page, /"Tanlangan filial bo‘yicha baholar topilmadi\."/);
    assert.match(page, /Sessiya tugagan\. Qayta kiring\./);
    assert.match(page, /Baholarni ko‘rish uchun ruxsat mavjud emas\./);
    assert.match(page, /Baholarni yuklab bo‘lmadi\./);
    assert.match(page, /onRetry=\{error\.kind === "failed"/);
    assert.doesNotMatch(page, /err\.message|error\.message \|\||err instanceof Error/);
  });

  it("rows keyboard operable; drawer focus trap / Escape / restore via the shared primitive", () => {
    assert.match(page, /tabIndex=\{0\}/);
    assert.match(page, /e\.key === "Enter" \|\| e\.key === " "/);
    assert.match(page, /<DetailDrawer/);
    assert.doesNotMatch(page, /addEventListener\("keydown"|useModalFocus/);
  });

  it("no secrets or customer PII in the page", () => {
    const stripped = page.replace(/props\.token/g, "").replace(/\btoken:\s*string;?/g, "");
    assert.doesNotMatch(stripped, /token|secret|password|hmac|otp\b|apiKey|telegram|localStorage|console\./i);
  });
});

describe("Admin Phase 13.9 Ratings — responsive + docs", () => {
  it("order column hidden ≤900px, cards ≤560px, tokens only", () => {
    assert.ok(rtCss.length > 1000);
    assert.match(rtCss, /@media \(max-width: 900px\) \{[\s\S]*?\.rt-surface \.rt-col-order \{ display: none; \}/);
    assert.match(rtCss, /@media \(max-width: 560px\) \{[\s\S]*?grid-template-areas: "score date" "branch branch" "comment comment";/);
    assert.match(rtCss, /\.rt-cell-comment \{ width: 100%; max-width: 0; \}/);
    assert.doesNotMatch(rtCss, /#[0-9a-fA-F]{3,8}\b|rgba?\(|gradient/);
  });

  it("docs record Phase 13.9", () => {
    assert.match(read(path.join(docs, "ADMIN_IMPLEMENTATION_STATUS.md")), /Phase 13\.9/);
  });
});
