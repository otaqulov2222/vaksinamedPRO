/**
 * Admin Phase 12.6A — Enterprise shell + navigation contracts.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminWeb = path.resolve(root, "../admin-web/src");
const docs = path.resolve(root, "../../docs");

describe("Admin Phase 12.6A — enterprise shell + navigation", () => {
  it("App shell: quiet nav items, Sessiya refresh, breadcrumb without strong page title", () => {
    const app = readFileSync(path.join(adminWeb, "App.tsx"), "utf8");
    assert.match(app, /nav-item/);
    assert.match(app, /refreshSession|Sessiya/);
    assert.match(app, /crumb-page/);
    assert.doesNotMatch(app, /Server RBAC seedini|Frontend xavfsizlik/);
    assert.match(app, /aria-current=\{active \? "page"/);
    assert.match(app, /sidebarCollapsed/);
  });

  it("ui exports status labels + capability helpers without changing wire enums", () => {
    const ui = readFileSync(path.join(adminWeb, "ui.tsx"), "utf8");
    assert.match(ui, /export function fulfillmentLabel/);
    assert.match(ui, /export function paymentLabel/);
    assert.match(ui, /export function reservationLabel/);
    assert.match(ui, /export function StatusLabelBadge/);
    assert.match(ui, /operatorCapabilityLabel/);
    assert.match(ui, /Yakunlangan/);
    assert.match(ui, /To‘langan|To'langan/);
    assert.doesNotMatch(ui, /FOM POS \(CONTRACT_PENDING\)/);
  });

  it("CSS defines button hierarchy and quiet sidebar nav", () => {
    const css = readFileSync(path.join(adminWeb, "styles.css"), "utf8");
    assert.match(css, /\.btn-primary|\.primary/);
    assert.match(css, /\.btn-secondary|\.ghost/);
    assert.match(css, /\.btn-tertiary/);
    assert.match(css, /\.btn-danger|\.danger-btn/);
    assert.match(css, /\.nav-item\.active|\.nav-item\.active/);
    assert.match(css, /\.surface-page|\.surface-ops|\.surface-table/);
    assert.match(css, /inset 2px 0 0 var\(--vm-gold\)/);
  });

  it("docs record Phase 12.6A", () => {
    assert.match(
      readFileSync(path.join(docs, "ADMIN_IMPLEMENTATION_STATUS.md"), "utf8"),
      /Phase 12\.6A/,
    );
    assert.match(
      readFileSync(path.join(docs, "ADMIN_DESIGN_SYSTEM.md"), "utf8"),
      /Phase 12\.6A|fulfillmentLabel|btn-tertiary/,
    );
  });

  it("nav groups and RBAC helpers preserved", () => {
    const nav = readFileSync(path.join(adminWeb, "nav.ts"), "utf8");
    assert.match(nav, /NAV_GROUPS/);
    assert.match(nav, /navVisible/);
    assert.match(nav, /preferLandingTab/);
    assert.match(nav, /id:\s*"fom"/);
    assert.match(nav, /id:\s*"dashboard"/);
  });
});
