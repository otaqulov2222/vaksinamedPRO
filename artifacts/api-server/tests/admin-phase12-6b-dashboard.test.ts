/**
 * Admin Phase 12.6B — Dashboard operations center (compat with 12.11).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminWeb = path.resolve(root, "../admin-web/src");
const docs = path.resolve(root, "../../docs");

describe("Admin Phase 12.6B — Dashboard operations center", () => {
  it("uses biz-snapshot ops-center composition", () => {
    const dash = readFileSync(path.join(adminWeb, "pages/DashboardPage.tsx"), "utf8");
    assert.match(dash, /dashboard|dash-ops-center/);
    assert.match(dash, /biz-hero|biz-snapshot|business-snapshot/);
    assert.match(dash, /Bugungi savdo|Biznes holati/);
    assert.match(dash, /E’tibor|E'tibor|Hammasi joyida|attn/);
    assert.match(dash, /StatusLabelBadge/);
    assert.match(dash, /empty-inline/);
  });

  it("activity columns match operator fields; no raw enum badges", () => {
    const dash = readFileSync(path.join(adminWeb, "pages/DashboardPage.tsx"), "utf8");
    assert.match(dash, /Buyurtma/);
    assert.match(dash, /Holat/);
    assert.match(dash, /StatusLabelBadge/);
    assert.doesNotMatch(dash, /fulfillmentTone\(/);
    assert.doesNotMatch(dash, /cashback_accounts|scoped|server agregat/i);
  });

  it("does not duplicate sidebar via quick-action matrix", () => {
    const dash = readFileSync(path.join(adminWeb, "pages/DashboardPage.tsx"), "utf8");
    assert.doesNotMatch(dash, /qa-matrix/);
    assert.match(dash, /Filial tanlash|Ko‘rish|Buyurtmalarga o‘tish|Kassaga o‘tish|Omborga/);
  });

  it("CSS defines biz-snapshot and attention list", () => {
    const css = readFileSync(path.join(adminWeb, "styles.css"), "utf8");
    assert.match(css, /\.biz-hero|\.biz-snapshot|\.business-snapshot/);
    assert.match(css, /\.biz-hero-value|\.biz-metric--hero|\.business-snapshot-hero|\.biz-hero-value/);
    assert.match(css, /\.attn|\.dash-attention|\.attention/);
  });

  it("docs record Phase 12.6B", () => {
    assert.match(
      readFileSync(path.join(docs, "ADMIN_IMPLEMENTATION_STATUS.md"), "utf8"),
      /Phase 12\.6B/,
    );
  });
});
