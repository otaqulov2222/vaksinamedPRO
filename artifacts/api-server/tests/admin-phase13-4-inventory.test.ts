/**
 * Admin Phase 13.4 — Ombor operations console.
 * UI composition only: same GET /api/admin/products?branchId (product_stocks axes),
 * POST /api/admin/inventory/adjust and POST /api/admin/inventory/expire-due contracts.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminWeb = path.resolve(root, "../admin-web/src");
const docs = path.resolve(root, "../../docs");
const page = readFileSync(path.join(adminWeb, "pages/InventoryPage.tsx"), "utf8");
const adminRoute = readFileSync(path.join(root, "src/routes/admin.ts"), "utf8");
const integrations = readFileSync(path.join(root, "src/routes/integrations.ts"), "utf8");
const fomAdapter = readFileSync(path.join(root, "src/lib/fomAdapter.ts"), "utf8");
const css = readFileSync(path.join(adminWeb, "styles.css"), "utf8");
const invCss = css.slice(
  css.indexOf("/* ——— Inventory / Ombor — Phase 13.4"),
  css.indexOf("/* ——— Catalog / Mahsulotlar"),
);

function routeBody(signature: string) {
  const start = adminRoute.indexOf(signature);
  assert.ok(start > 0, signature);
  return adminRoute.slice(start, adminRoute.indexOf("\nrouter.", start + 10));
}

async function loadUi() {
  return import(pathToFileURL(path.join(adminWeb, "ui.tsx")).href) as Promise<{
    stockAxisLabel: (a: "physical" | "reserved" | "available") => string;
    stockAxisShort: (a: "physical" | "reserved" | "available") => string;
  }>;
}

describe("Admin Phase 13.4 Inventory — backend contract (unchanged)", () => {
  it("stock read is products:read + server-resolved branch scope", () => {
    const body = routeBody('router.get("/admin/products"');
    assert.match(body, /requirePermission\(user, "products:read"\)/);
    assert.match(body, /resolveStaffBranchFilter\(/);
    assert.match(body, /stock: null/);
    assert.match(body, /physical,\s*reserved,\s*available/);
  });

  it("adjust requires inventory:adjust + assertBranchScope; expire-due requires inventory:adjust", () => {
    const adjust = routeBody('router.post("/admin/inventory/adjust"');
    assert.match(adjust, /requirePermission\(user, "inventory:adjust"\)/);
    assert.match(adjust, /assertBranchScope\(user, branchId\)/);
    assert.match(adjust, /idempotencyKey/);
    const expire = routeBody('router.post("/admin/inventory/expire-due"');
    assert.match(expire, /requirePermission\(user, "inventory:adjust"\)/);
  });

  it("FOM inventory writer stays OFF in code and in the status endpoint", () => {
    assert.match(fomAdapter, /FOM_INVENTORY_WRITER_ENABLED = false/);
    assert.match(integrations, /inventoryWriter: "OFF"/);
    assert.match(integrations, /fomInventoryWriterEnabled: false/);
  });
});

describe("Admin Phase 13.4 Inventory — data and scope", () => {
  it("reads only the existing endpoints; no invented inventory APIs", () => {
    const urls = [...page.matchAll(/request\(\s*[`"]([^`"]+)[`"]/g)].map((m) => m[1].replace(/\$\{[^}]+\}/g, ":x"));
    for (const url of urls) {
      assert.ok(
        [
          "/api/admin/products:x",
          "/api/integrations/fom/status",
          "/api/admin/inventory/adjust",
          "/api/admin/inventory/expire-due",
        ].includes(url),
        url,
      );
    }
    assert.doesNotMatch(page, /movements|\/reservations|\/transfers|\/suppliers|\/purchase/i);
  });

  it("branch select only for HQ; branch users get the server-resolved branch", () => {
    assert.match(page, /\{isHq \? \(\s*<FilterField label="Filial">/);
    assert.match(page, /if \(isHq && !bid\)/);
    assert.match(page, /setStockBranchId\(data\?\.stockBranchId != null/);
    assert.match(page, /doirani server belgilaydi/);
    assert.doesNotMatch(page, /URLSearchParams|location\.search|useSearchParams/);
  });

  it("no network aggregate is claimed", () => {
    assert.match(page, /tarmoq bo‘yicha yig‘ma qoldiq API’da yo‘q/);
    assert.doesNotMatch(page, /Tarmoq bo‘yicha jami|Barcha filiallar qoldig/);
  });

  it("stale branch responses are dropped", () => {
    assert.match(page, /const seq = \+\+loadSeq\.current/);
    assert.match(page, /if \(seq !== loadSeq\.current\) return;/);
  });
});

describe("Admin Phase 13.4 Inventory — axes and status", () => {
  it("axis labels: Fizik qoldiq / Rezerv / Mavjud", async () => {
    const { stockAxisLabel, stockAxisShort } = await loadUi();
    assert.equal(stockAxisLabel("physical"), "Fizik qoldiq");
    assert.equal(stockAxisLabel("reserved"), "Rezerv");
    assert.equal(stockAxisLabel("available"), "Mavjud");
    assert.equal(stockAxisShort("reserved"), "Rezerv");
  });

  it("table columns: Mahsulot, Fizik, Rezerv, Mavjud, Holat — available shown from the server", () => {
    const head = page.slice(page.indexOf("<thead>"), page.indexOf("</thead>"));
    const order = ['<th>Mahsulot</th>', 'stockAxisShort("physical")', 'stockAxisShort("reserved")', 'stockAxisShort("available")', "<th>Holat</th>"];
    let last = -1;
    for (const token of order) {
      const at = head.indexOf(token);
      assert.ok(at > last, token);
      last = at;
    }
    assert.match(page, /const available = Number\(item\.stock\?\.available \|\| 0\)/);
    assert.match(page, /Qiymatlar serverdan olinadi/);
  });

  it("status is presentation-only; no invented threshold; negative surfaced, not corrected", () => {
    assert.match(page, /Available ≤ 0 is the only availability signal/);
    assert.match(page, /available < 0 \|\| reserved > physical\) return \{ key: "anomaly", label: "Nomuvofiq", tone: "danger" \}/);
    assert.match(page, /label: "Mavjud emas", tone: "warn"/);
    assert.doesNotMatch(page, /Math\.max\(0, ?(available|physical|reserved)|Math\.abs\(available|critical|Kritik|Kam qoldiq|lowStock|threshold\s*[=<:]/i);
  });

  it("summary uses the complete branch list only; no StatCard", () => {
    assert.match(page, /aria-label=\{`Filial qoldig‘i: \$\{branchName\}`\}/);
    assert.match(page, /const summary = useMemo\(\(\) => \{[\s\S]*?withStock/);
    assert.doesNotMatch(page, /StatCard/);
  });
});

describe("Admin Phase 13.4 Inventory — states", () => {
  it("separate idle, empty, filtered-empty, error, forbidden and loading states", () => {
    assert.match(page, /Avval filialni tanlang/);
    assert.match(page, /Bu filialda ombor ma’lumoti topilmadi\./);
    assert.match(page, /Tanlangan shartlar bo‘yicha qoldiq topilmadi\./);
    assert.match(page, /Ombor ma’lumotlarini yuklab bo‘lmadi\./);
    assert.match(page, /error\.kind === "forbidden"/);
    assert.match(page, /onRetry=\{error\.kind === "failed" \?/);
    assert.match(page, /className="inv-skeleton-row" aria-hidden="true"/);
    assert.match(page, /inv-summary is-loading/);
  });

  it("no-branch state: compact guide, neutral placeholders only, action focuses the existing selector", () => {
    const idle = page.slice(page.indexOf("{needsBranch ? ("), page.indexOf("{showSurface && initialLoading"));
    assert.match(idle, /className="inv-summary is-idle" aria-hidden="true"/);
    assert.match(idle, /<span className="inv-summary-v">—<\/span>/);
    assert.match(idle, /Filial tanlanmagan/);
    assert.doesNotMatch(idle, /\{summary\.|withStock|products\.length|filtered\./);
    assert.equal((idle.match(/className="inv-summary-v"/g) || []).length, 1);
    assert.match(idle, /<section className="inv-idle" role="status" aria-labelledby="inv-idle-title">/);
    assert.match(idle, /filial kesimida ko‘riladi/);
    assert.match(idle, /\{isHq \? \(\s*<button className="btn-secondary inv-idle-action" type="button" onClick=\{focusBranchSelect\}>/);
    assert.match(page, /ref=\{branchSelectRef\}/);
    assert.match(page, /el\.focus\(\);/);
  });

  it("branch selector is the first, emphasised step; secondary filters wait for it", () => {
    const scope = page.indexOf('className="inv-controls-scope"');
    const refine = page.indexOf('className="inv-controls-primary"');
    assert.ok(scope > 0 && refine > scope);
    assert.ok(page.indexOf('<FilterField label="Filial">') > scope && page.indexOf('<FilterField label="Filial">') < refine);
    assert.match(page, /is-branch-pending/);
    assert.match(page, /Qidiruv va filtrlar filial tanlangach faollashadi\./);
    assert.match(invCss, /\.inv-controls\.is-branch-pending \.inv-branch-select/);
  });

  it("rendering is bounded by client pagination over the branch list", () => {
    assert.match(page, /const PAGE_SIZE = 50/);
    assert.match(page, /filtered\.slice\(offset, offset \+ PAGE_SIZE\)/);
    assert.match(page, /<PaginationBar/);
  });
});

describe("Admin Phase 13.4 Inventory — drawer and adjustment", () => {
  it("drawer: Qoldiq → Mahsulot → Filial → Rezerv → Korreksiya, technical collapsed", () => {
    const order = ['<DrawerSection title="Qoldiq">', '<DrawerSection title="Mahsulot">', '<DrawerSection title="Filial">', '<DrawerSection title="Rezerv">', '<DrawerSection title="Korreksiya">', '<details className="inv-tech">'];
    let last = -1;
    for (const token of order) {
      const at = page.indexOf(token);
      assert.ok(at > last, token);
      last = at;
    }
    assert.doesNotMatch(page, /<details className="inv-tech" open/);
  });

  it("reservations stay the authority; orders.reserved_until is not presented as truth", () => {
    assert.match(page, /manbai bronlar \(reservations\) jadvali/);
    assert.doesNotMatch(page, /reservedUntil|reserved_until/);
  });

  it("adjust: permission gate, explicit branch/product/delta/reason, ConfirmDialog, idempotency key", () => {
    assert.match(page, /const canAdjust = props\.permissions\.includes\("inventory:adjust"\)/);
    assert.match(page, /\{canAdjust \? \(\s*<DrawerSection title="Korreksiya">/);
    assert.match(page, /branchId: stockBranchId,\s*productId: Number\(selected\.id\),\s*physicalDelta: delta,\s*reason: adjReason\.trim\(\),\s*idempotencyKey: adjustKey\.current\.key/);
    assert.match(page, /setConfirmAdj\(true\)/);
    assert.match(page, /title="Fizik qoldiqni o‘zgartirish"/);
    assert.match(page, /Sabab majburiy\./);
    assert.match(page, /await load\(\);/);
    assert.doesNotMatch(page, /window\.confirm|confirm\(/);
  });

  it("client guards mirror server rules (never below 0, never below reserved); server stays authoritative", () => {
    assert.match(page, /preview\.physical < 0/);
    assert.match(page, /preview\.physical < selectedAxes\.reserved/);
    assert.match(page, /Yakuniy natijani server hisoblaydi/);
  });

  it("operator-friendly adjust errors (403 / 404 / 409 / network)", () => {
    assert.match(page, /if \(status === 403\) return "Bu filial yoki amal uchun ruxsat yo‘q\."/);
    assert.match(page, /if \(status === 404\) return "Bu filialda mahsulot uchun ombor qatori yo‘q/);
    assert.match(page, /if \(status === 409\)/);
    assert.match(page, /if \(statusOf\(err\) === 409\) await load\(\)/);
  });

  it("expire-due is described as network-wide and not an order cancel", () => {
    assert.match(page, /barcha filiallar bo‘yicha bo‘shatiladi/);
    assert.match(page, /Buyurtma avtomatik bekor qilinmaydi/);
  });
});

describe("Admin Phase 13.4 Inventory — FOM, security, a11y", () => {
  it("FOM notice comes from the status endpoint; no sync/import/push actions", () => {
    assert.match(page, /request\("\/api\/integrations\/fom\/status"/);
    assert.match(page, /FOM inventar yozuvchisi faol emas/);
    assert.doesNotMatch(page, /Sync with FOM|FOM bilan sinx|Import stock|Push stock|Qoldiqni import|Eksport|>\s*Export/i);
  });

  it("no secrets or FOM auth fields rendered", () => {
    assert.doesNotMatch(page, /secret|apiKey|password|credential|data\?\.auth|\.endpoints/i);
  });

  it("rows open with Enter/Space; focus handled by shared modal primitives", () => {
    assert.match(page, /e\.key === "Enter" \|\| e\.key === " "/);
    assert.match(page, /tabIndex=\{0\}/);
    assert.doesNotMatch(page, /role="dialog"|aria-modal/);
  });
});

describe("Admin Phase 13.4 Inventory — responsive CSS", () => {
  it("own CSS slice; tokens only", () => {
    assert.ok(invCss.length > 1000);
    assert.doesNotMatch(invCss, /#[0-9a-fA-F]{3,8}\b|rgba?\(|gradient/);
  });

  it("mobile turns rows into cards with product, available and status visible", () => {
    const mobile = invCss.slice(invCss.indexOf("@media (max-width: 560px)"));
    assert.match(mobile, /\.inv-surface thead \{ display: none; \}/);
    assert.match(mobile, /grid-template-areas: "product product product avail" "physical reserved \. status"/);
    assert.match(mobile, /td\[data-label\]::before/);
    assert.match(mobile, /\.inv-idle-axes \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  });
});

describe("Admin Phase 13.4 docs", () => {
  it("implementation status documents Phase 13.4", () => {
    assert.match(readFileSync(path.join(docs, "ADMIN_IMPLEMENTATION_STATUS.md"), "utf8"), /Phase 13\.4 — Ombor/);
  });
});
