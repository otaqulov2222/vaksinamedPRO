/**
 * Admin Phase 13.5 — Katalog product catalog console.
 * UI composition only: reads the existing paginated GET /api/catalog/products and
 * GET /api/catalog/categories; writes stay on POST / PATCH /api/admin/products (products:manage).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminWeb = path.resolve(root, "../admin-web/src");
const docs = path.resolve(root, "../../docs");
const page = readFileSync(path.join(adminWeb, "pages/CatalogPage.tsx"), "utf8");
const nav = readFileSync(path.join(adminWeb, "nav.ts"), "utf8");
const adminRoute = readFileSync(path.join(root, "src/routes/admin.ts"), "utf8");
const catalogRoute = readFileSync(path.join(root, "src/routes/catalog.ts"), "utf8");
const schema = readFileSync(path.resolve(root, "../../lib/db/src/schema/catalog.ts"), "utf8");
const css = readFileSync(path.join(adminWeb, "styles.css"), "utf8");
const catCss = css.slice(
  css.indexOf("/* ——— Catalog / Mahsulotlar — Phase 13.5"),
  css.indexOf("/* ——— Branches / Filiallar"),
);

function between(src: string, start: string, end: string) {
  const a = src.indexOf(start);
  assert.ok(a >= 0, start);
  const b = src.indexOf(end, a + start.length);
  assert.ok(b > a, end);
  return src.slice(a, b);
}

function adminBody(signature: string) {
  return between(adminRoute, signature, "\nrouter.");
}

function catalogBody(signature: string) {
  return between(catalogRoute, signature, "\nrouter.");
}

describe("Admin Phase 13.5 Catalog — backend contract (unchanged)", () => {
  it("public list: server-side q / category / sort / limit ≤ 50 / total", () => {
    const body = catalogBody('router.get("/catalog/products"');
    assert.match(catalogRoute, /const MAX_LIMIT = 50;/);
    assert.match(catalogRoute, /const MAX_QUERY_LEN = 80;/);
    for (const col of ["nameUz", "nameRu", "manufacturer", "sku"]) {
      assert.match(body, new RegExp(`ilike\\(products\\.${col}, pattern\\)`), col);
    }
    assert.match(body, /eq\(products\.category, category\)/);
    assert.match(body, /select\(\{ value: count\(\) \}\)/);
    assert.match(body, /pagination: \{/);
    assert.match(catalogBody('router.get("/catalog/categories"'), /selectDistinct\(\{ category: products\.category \}\)/);
  });

  it("admin writes: POST + PATCH gated by products:manage; no delete / category / media routes", () => {
    assert.match(adminBody('router.post("/admin/products"'), /requirePermission\(user, "products:manage"\)/);
    assert.match(adminBody('router.patch("/admin/products/:id"'), /requirePermission\(user, "products:manage"\)/);
    assert.match(adminBody('router.get("/admin/products"'), /requirePermission\(user, "products:read"\)/);
    assert.doesNotMatch(adminRoute, /router\.delete\("\/admin\/products/);
    assert.doesNotMatch(adminRoute + catalogRoute, /router\.(post|patch|put|delete)\("\/(admin|catalog)\/categor/);
    assert.doesNotMatch(adminRoute + catalogRoute, /upload|multer|barcode/i);
  });

  it("schema has no status / image / barcode columns — the UI must not invent them", () => {
    const products = between(schema, 'pgTable("products"', "});");
    assert.doesNotMatch(products, /status|active|image|barcode|archived/i);
    for (const col of ["sku", "nameUz", "nameRu", "category", "manufacturer", "description", "unit", "price", "icon", "analogGroup", "requiresPrescription", "createdAt"]) {
      assert.match(products, new RegExp(`\\b${col}:`), col);
    }
  });
});

describe("Admin Phase 13.5 Catalog — list, search, filters, pagination", () => {
  it("list is server-paginated; no unbounded admin list load in Catalog", () => {
    assert.match(page, /request\(`\/api\/catalog\/products\?\$\{qs\}`, props\.token\)/);
    assert.doesNotMatch(page, /request\("\/api\/admin\/products",\s*props\.token\)/);
    assert.match(page, /const PAGE_SIZE = 50;/);
    assert.match(page, /qs\.set\("limit", String\(PAGE_SIZE\)\)/);
    assert.match(page, /qs\.set\("offset", String\(nextOffset\)\)/);
    assert.match(page, /if \(seq !== listSeq\.current\) return;/);
    assert.doesNotMatch(page, /rows\.filter\(|products\.filter\(|\.includes\(q\)/);
  });

  it("search is server-side, bounded to 80 chars, Enter submits, clearing reloads", () => {
    assert.match(page, /const MAX_QUERY = 80;/);
    assert.match(page, /qs\.set\("q", f\.q\.trim\(\)\.slice\(0, MAX_QUERY\)\)/);
    assert.match(page, /<form className="cat-search" role="search" onSubmit=\{applySearch\}>/);
    assert.match(page, /maxLength=\{MAX_QUERY\}/);
    assert.match(page, /placeholder="Nomi, SKU yoki ishlab chiqaruvchi"/);
    assert.match(page, /if \(!value && applied\.q\) applyFilter\(\{ q: "" \}\);/);
  });

  it("filters: category from /catalog/categories, sort values match the server switch", () => {
    assert.match(page, /softRequest\("\/api\/catalog\/categories", props\.token\)/);
    assert.match(page, /if \(f\.category\) qs\.set\("category", f\.category\);/);
    for (const s of ["name", "price_asc", "price_desc"]) {
      assert.match(page, new RegExp(`value: "${s}"`), s);
      assert.match(catalogRoute, new RegExp(`case "${s}":`), s);
    }
    assert.doesNotMatch(page, /rxOnly|value="yes"|Mavjudlik|Faol|Nofaol/);
  });

  it("pagination uses the server total / hasMore", () => {
    assert.match(page, /<PaginationBar[\s\S]*?total=\{total\}[\s\S]*?hasMore=\{hasMore\}/);
    assert.match(page, /data\?\.pagination\?\.total/);
    assert.match(page, /data\?\.pagination\?\.hasMore/);
  });
});

describe("Admin Phase 13.5 Catalog — table, status, price, inventory", () => {
  it("columns: product identity first, then category, price, prescription", () => {
    const head = between(page, "<thead>", "</thead>");
    const order = ["<th>Mahsulot</th>", "<th>Kategoriya</th>", '<th className="num">Narx</th>', "<th>Retsept</th>"];
    const idx = order.map((t) => head.indexOf(t));
    assert.ok(idx.every((i, n) => i >= 0 && (n === 0 || i > idx[n - 1])), idx.join(","));
    assert.match(page, /className="cat-name"/);
    assert.match(page, /className="cat-sku"/);
    assert.match(page, /onKeyDown=\{\(e\) => \{\s*if \(e\.key === "Enter" \|\| e\.key === " "\)/);
    assert.match(page, /tabIndex=\{0\}/);
  });

  it("no invented status, KPI, media, barcode, import/export or delete", () => {
    assert.doesNotMatch(page, /ACTIVE|INACTIVE|ARCHIVED|StatCard|MetricStrip|<img|type="file"|barcode|shtrix|Import|Eksport|method:\s*"DELETE"|O‘chirish|Arxiv/);
    assert.doesNotMatch(page, /oldPrice|discount|chegirma|margin|purchase/i);
    assert.match(page, /<StatusBadge tone="warn">Retsept<\/StatusBadge>/);
  });

  it("price is integer money via money(); no float math", () => {
    assert.match(page, /money\(Number\(item\.price \|\| 0\)\)/);
    assert.doesNotMatch(page, /parseFloat|toFixed|\* 100|\/ 100/);
    assert.match(page, /if \(!\/\^\\d\+\$\/\.test\(v\)\) return null;/);
    assert.match(page, /const PRICE_MAX = 2_147_483_647;/);
  });

  it("inventory is a read-only indicator for branch staff only; stock is managed in Ombor", () => {
    assert.match(page, /const scopeBranchId = !isHq && props\.user\?\.branchId/);
    assert.match(page, /if \(scopeBranchId\) qs\.set\("branchId", String\(scopeBranchId\)\);/);
    assert.doesNotMatch(page, /<th[^>]*>(Fizik|Rezerv|Band|Mavjud)<\/th>/);
    assert.doesNotMatch(page, /inventory\/adjust|physicalDelta|quantity:/);
    assert.match(page, /Ombor holatini ko‘rish/);
  });
});

describe("Admin Phase 13.5 Catalog — states, drawer, writes", () => {
  it("empty, filtered-empty, error and loading are distinct", () => {
    assert.match(page, /"Mahsulotlar topilmadi\."/);
    assert.match(page, /"Tanlangan shartlar bo‘yicha mahsulot topilmadi\."/);
    assert.match(page, /Katalogni yuklab bo‘lmadi\./);
    assert.match(page, /<ErrorState message=\{error\} onRetry=/);
    assert.match(page, /className="cat-skeleton-row" aria-hidden="true"/);
    assert.match(page, /<div className="cat-empty" role="status">/);
  });

  it("drawer: Mahsulot → Narx va tasnif → Ombor → collapsed technical details", () => {
    const order = ['<DrawerSection title="Mahsulot">', '<DrawerSection title="Narx va tasnif">', '<DrawerSection title="Ombor">', '<details className="cat-tech">'];
    const idx = order.map((t) => page.indexOf(t));
    assert.ok(idx.every((i, n) => i > 0 && (n === 0 || i > idx[n - 1])), idx.join(","));
    assert.doesNotMatch(page, /role="dialog"|aria-modal/);
  });

  it("create / edit only with products:manage, confirmed, and limited to accepted fields", () => {
    assert.match(page, /const canManage = props\.permissions\.includes\("products:manage"\);/);
    assert.match(page, /\{canManage \? \(\s*<button className="btn-primary cat-create"/);
    assert.match(page, /title="Mahsulotni qo‘shish"/);
    assert.match(page, /title="O‘zgarishlarni saqlash"/);
    assert.match(page, /for \(const c of pending\.changes\) payload\[c\.key\] = c\.value;/);

    const patchRoute = adminBody('router.patch("/admin/products/:id"');
    const diff = between(page, "function diffDraft", "\nexport function CatalogPage");
    const keys = [...diff.matchAll(/key: "([a-zA-Z]+)"/g)].map((m) => m[1]);
    assert.ok(keys.length >= 5);
    for (const k of keys) assert.match(patchRoute, new RegExp(`typeof body\\.${k} ===`), k);

    const postRoute = adminBody('router.post("/admin/products"');
    const postBody = between(page, 'request("/api/admin/products", props.token, {', "});");
    for (const k of [...postBody.matchAll(/^\s+([a-zA-Z]+)(?::|,)/gm)].map((m) => m[1]).filter((k) => !["method", "body"].includes(k))) {
      assert.match(postRoute, new RegExp(`body\\.${k}\\b`), k);
    }
  });

  it("create copy matches the real backend stock side effect; raw server errors are not shown", () => {
    assert.match(adminBody('router.post("/admin/products"'), /quantity: Number\(body\.quantity\) \|\| 10/);
    assert.match(page, /boshlang‘ich 10 dona fizik qoldiq/);
    const errFn = between(page, "function mutationError", "\nfunction parsePrice");
    assert.doesNotMatch(errFn, /\.message/);
  });

  it("no secrets or credentials in the page", () => {
    const stripped = page.replace(/props\.token/g, "").replace(/^\s+token: string;$/m, "");
    assert.doesNotMatch(stripped, /token|secret|password|apiKey|paymeKey|clickSecret|localStorage|console\./i);
  });
});

describe("Admin Phase 13.5 Catalog — navigation, responsive, docs", () => {
  it("nav: Katalog stays behind products:read", () => {
    assert.match(nav, /\{ id: "products", label: "Katalog", permission: "products:read"/);
    assert.match(page, /title="Katalog"/);
  });

  it("responsive CSS: secondary column hidden ≤900px, cards ≤560px, tokens only", () => {
    assert.ok(catCss.length > 1000);
    assert.match(catCss, /@media \(max-width: 900px\) \{[\s\S]*?td\.cat-cell-category \{ display: none; \}/);
    assert.match(catCss, /@media \(max-width: 560px\) \{[\s\S]*?grid-template-areas: "product price" "product rx" "product stock";/);
    assert.doesNotMatch(catCss, /#[0-9a-fA-F]{3,8}\b|rgba?\(|gradient/);
  });

  it("docs record Phase 13.5", () => {
    assert.match(readFileSync(path.join(docs, "ADMIN_IMPLEMENTATION_STATUS.md"), "utf8"), /Phase 13\.5/);
  });
});
