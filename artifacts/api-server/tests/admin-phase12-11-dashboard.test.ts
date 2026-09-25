/**
 * Admin Phase 12.11 — Final Dashboard product reconstruction (sparse-data).
 * Supporting evidence only — not visual PASS.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminWeb = path.resolve(root, "../admin-web/src");
const docs = path.resolve(root, "../../docs");

describe("Admin Phase 12.11 — Dashboard product reconstruction", () => {
  it("composition: biz-hero → ops-rail → attn → act (no QA matrix)", () => {
    const dash = readFileSync(path.join(adminWeb, "pages/DashboardPage.tsx"), "utf8");
    assert.match(dash, /className="biz-hero"/);
    assert.match(dash, /className="ops-rail"/);
    assert.match(dash, /attn-calm|attn--gate|className=\{`attn/);
    assert.match(dash, /className=\{`act/);
    assert.doesNotMatch(dash, /qa-matrix|Tezkor amallar|QuickAction/);
    assert.doesNotMatch(dash, /business-snapshot-subs|biz-snapshot-metrics/);
  });

  it("hero is compact: Savdo + period + order count; no fake trends", () => {
    const dash = readFileSync(path.join(adminWeb, "pages/DashboardPage.tsx"), "utf8");
    assert.match(dash, /biz-hero-value/);
    assert.match(dash, /biz-hero-period|presetLabel/);
    assert.match(dash, /biz-hero-orders-value/);
    assert.match(dash, /completedCount/);
    assert.match(dash, /deliveringCount/);
    assert.doesNotMatch(dash, /\+\s*12%|trend|yesterday vs|↑/);
    const css = readFileSync(path.join(adminWeb, "styles.css"), "utf8");
    assert.match(css, /\.biz-hero-value[\s\S]*?font-size:\s*34px/);
    assert.match(css, /Phase 12\.11/);
    assert.doesNotMatch(css, /Phase 12\.11[\s\S]{0,1200}linear-gradient/);
  });

  it("attention: calm strip OR compact rows; HQ Ombor nazorati gate", () => {
    const dash = readFileSync(path.join(adminWeb, "pages/DashboardPage.tsx"), "utf8");
    assert.match(dash, /Hammasi joyida/);
    assert.match(dash, /Hozircha e’tibor talab qiladigan ish yo‘q|Hozircha e'tibor/);
    assert.match(dash, /Ombor nazorati/);
    assert.match(dash, /onlyBranchGate|attn--gate/);
    assert.match(dash, /Ko‘rish →|Ko'rish →/);
    assert.doesNotMatch(dash, /Available\s*<=\s*0|product_stocks|cashback_accounts/);
  });

  it("activity empty is content-height (act--empty)", () => {
    const dash = readFileSync(path.join(adminWeb, "pages/DashboardPage.tsx"), "utf8");
    assert.match(dash, /act--empty/);
    assert.match(dash, /Buyurtmalar topilmadi/);
    assert.match(dash, /activityEmpty/);
  });

  it("CSS: ops-rail + attn-calm + act--empty; dashboard fills main width", () => {
    const css = readFileSync(path.join(adminWeb, "styles.css"), "utf8");
    assert.match(css, /\.ops-rail/);
    assert.match(css, /\.attn-calm/);
    assert.match(css, /\.act--empty/);
    assert.match(css, /\.dashboard[\s\S]*?width:\s*100%/);
    assert.match(css, /\.dashboard[\s\S]*?max-width:\s*none/);
    assert.doesNotMatch(css, /\.dashboard\s*\{[^}]*max-width:\s*1100px/);
  });

  it("docs record Phase 12.11", () => {
    assert.match(
      readFileSync(path.join(docs, "ADMIN_IMPLEMENTATION_STATUS.md"), "utf8"),
      /Phase 12\.11/,
    );
  });
});
