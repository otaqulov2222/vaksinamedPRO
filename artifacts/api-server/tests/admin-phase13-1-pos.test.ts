/**
 * Admin Phase 13.1 — Kassa POS transaction workspace.
 * UI composition only: same /api/pos/* contract, same request bodies, server stays authoritative.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminWeb = path.resolve(root, "../admin-web/src");
const docs = path.resolve(root, "../../docs");
const pos = readFileSync(path.join(adminWeb, "PosTerminal.tsx"), "utf8");
const app = readFileSync(path.join(adminWeb, "App.tsx"), "utf8");
const css = readFileSync(path.join(adminWeb, "styles.css"), "utf8");
const posCss = css.slice(css.indexOf("/* ——— POS — Phase 13.1"), css.indexOf("/* ——— Orders — Phase 13.2"));

describe("Admin Phase 13.1 POS — API contract unchanged", () => {
  it("uses only the existing /api/pos endpoints", () => {
    const paths = [...pos.matchAll(/["`](\/api\/[a-z/-]+)/g)].map((m) => m[1]);
    assert.deepEqual(
      [...new Set(paths)].sort(),
      ["/api/pos/lookup", "/api/pos/preview", "/api/pos/sale", "/api/pos/sales", "/api/pos/void"],
    );
  });

  it("request bodies keep the existing shape", () => {
    assert.match(pos, /JSON\.stringify\(\{ qr: code \}\)/);
    assert.match(pos, /JSON\.stringify\(\{ qr: scannedQr, amount: Number\(amount\), cashbackToUse \}\)/);
    assert.match(pos, /qr: scannedQr,\s*amount: Number\(amount\),\s*cashbackToUse,\s*branchId,/);
    assert.match(pos, /JSON\.stringify\(\{ receiptId \}\)/);
    assert.doesNotMatch(pos, /receiptId: crypto|randomUUID/);
  });

  it("preview/sale use the scanned code, not whatever is typed in the scan field afterwards", () => {
    assert.match(pos, /setScannedQr\(code\)/);
    assert.doesNotMatch(pos, /body: JSON\.stringify\(\{ qr, amount/);
  });

  it("confirm is gated on a settled server preview", () => {
    assert.match(pos, /const canConfirm = Boolean\(customer\) && previewReady && !busy;/);
    assert.match(pos, /disabled=\{!canConfirm\}/);
  });
});

describe("Admin Phase 13.1 POS — no invented capabilities or data", () => {
  it("no product search, cart or payment-method UI (API has none)", () => {
    assert.doesNotMatch(pos, /\b(Payme|Click|Naqd|Uzcard|Humo|savat|cart|products?)\b/i);
  });

  it("no fake data or dashboard status copy", () => {
    assert.doesNotMatch(pos, /Math\.random|faker|lorem|mock|sample/i);
    assert.doesNotMatch(pos, /Muammo yo‘q/);
  });

  it("void keeps the server rule and uses the shared ConfirmDialog, not window.confirm", () => {
    assert.doesNotMatch(pos, /\bconfirm\(`/);
    assert.match(pos, /<ConfirmDialog/);
    assert.match(pos, /danger/);
    assert.match(pos, /15 daqiqa/);
  });
});

describe("Admin Phase 13.1 POS — operator UX", () => {
  it("technical errors never reach the operator verbatim", () => {
    assert.match(pos, /function operatorMessage\(/);
    assert.match(pos, /if \(status >= 500\) return fallback;/);
    assert.match(pos, /Server bilan aloqa yo‘q/);
    assert.doesNotMatch(pos, /err instanceof Error \? err\.message/);
  });

  it("keyboard: scan autofocus, F2 to scan, focus to amount after lookup, Enter to pay button, Escape clears scan", () => {
    assert.match(pos, /scanRef\.current\?\.focus\(\);\s*void loadSales\(\);/);
    assert.match(pos, /e\.key !== "F2"/);
    assert.match(pos, /requestAnimationFrame\(\(\) => amountRef\.current\?\.focus\(\)\)/);
    assert.match(pos, /if \(canConfirm\) payRef\.current\?\.focus\(\);/);
    assert.match(pos, /e\.key === "Escape" && qr/);
  });

  it("button hierarchy: one primary pay action, secondary scan, tertiary support, danger void", () => {
    assert.match(pos, /className="btn-primary pos-pay"/);
    assert.match(pos, /className="btn-secondary pos-scan-go"/);
    assert.match(pos, /className="btn-tertiary pos-customer-reset"/);
    assert.match(pos, /className="pos-void"/);
    assert.match(posCss, /\.pos-void \{[^}]*color: var\(--vm-danger\);/);
  });

  it("layout: numbered flow + current check + history; operator name wired from the shell", () => {
    assert.match(pos, /className="pos-steps surface-ops"/);
    assert.match(pos, /className="pos-check surface-ops"/);
    assert.match(pos, /className="pos-history surface-ops"/);
    assert.match(app, /operatorName=\{user\.name\}/);
  });
});

describe("Admin Phase 13.1 POS — design tokens", () => {
  it("POS styles carry no hardcoded colors or gradients", () => {
    assert.ok(posCss.length > 1000);
    assert.doesNotMatch(posCss, /#[0-9a-fA-F]{3,8}\b|rgba?\(|gradient/);
  });

  it("legacy POS classes are re-expressed on tokens", () => {
    for (const cls of ["pos-banner-ok", "pos-banner-err", "pos-customer", "pos-stats", "pos-spend", "pos-receipt", "pos-step"]) {
      assert.match(posCss, new RegExp(`\\.${cls}[\\s{.,]`), cls);
    }
  });

  it("workspace composes by container width with no page overflow hooks", () => {
    assert.match(posCss, /\.pos-page \{ container: pos \/ inline-size; display: grid; grid-template-columns: minmax\(0, 1fr\);/);
    assert.match(posCss, /@container pos \(min-width: 700px\)/);
    assert.match(posCss, /\.pos-history-table \{ position: relative;/);
  });

  it("docs record Phase 13.1", () => {
    assert.match(readFileSync(path.join(docs, "ADMIN_IMPLEMENTATION_STATUS.md"), "utf8"), /Phase 13\.1/);
  });
});
