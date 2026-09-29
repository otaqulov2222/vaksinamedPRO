/**
 * Admin Phase 13.5 — final visual QA.
 * Supporting evidence only — visual acceptance is done in the browser.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminWeb = path.resolve(root, "../admin-web/src");
const dash = readFileSync(path.join(adminWeb, "pages/DashboardPage.tsx"), "utf8");
const css = readFileSync(path.join(adminWeb, "styles.css"), "utf8");

describe("Admin Phase 13.5 — final visual QA", () => {
  it("network copy uses one term (hudud) and is not repeated in the page header", () => {
    assert.doesNotMatch(dash, /\} viloyat|`\$\{network\.regions\.length\} viloyat`|Viloyatlar bo‘yicha/);
    assert.match(dash, /`\$\{network\.regions\.length\} hudud`/);
    assert.doesNotMatch(dash, /network\.total\} filial · \{network\.regions\.length\}/);
  });

  it("decorative edge ticks and redundant empty-state chips are gone", () => {
    assert.doesNotMatch(css, /\.dash-hero-stage::before|\.dash-kpi--feature::before|\.dash-empty-kinds/);
    assert.doesNotMatch(dash, /dash-empty-kinds/);
  });

  it("status card sits beside activity with a shared heading row; stacks on narrow screens", () => {
    assert.match(css, /\.dash-signals \{[^}]*align-items: start;/);
    assert.match(css, /@media \(max-width: 768px\) \{[\s\S]*?\.dash-signals \{ grid-template-columns: 1fr; \}/);
  });
});
