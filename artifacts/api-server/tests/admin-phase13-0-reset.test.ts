/**
 * Admin Phase 13.0 reset — Enterprise Operations Console design system, shell and Dashboard.
 * Supporting evidence only — visual acceptance is done in the browser.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminWeb = path.resolve(root, "../admin-web/src");
const docs = path.resolve(root, "../../docs");
const dash = readFileSync(path.join(adminWeb, "pages/DashboardPage.tsx"), "utf8");
const app = readFileSync(path.join(adminWeb, "App.tsx"), "utf8");
const css = readFileSync(path.join(adminWeb, "styles.css"), "utf8");
const rootBlock = css.slice(0, css.indexOf("\n}"));
const dashBlock = css.slice(css.indexOf("Dashboard — Phase 13.0 reset"), css.indexOf("Responsive — shell"));

describe("Admin Phase 13.0 reset — design system", () => {
  it("palette: deep purple brand, warm yellow accent, cool gray canvas, deep navy text", () => {
    assert.match(rootBlock, /--vm-brand: #3D1C73;/);
    assert.match(rootBlock, /--vm-accent: #F5C518;/);
    assert.match(rootBlock, /--vm-bg: #F2F3F7;/);
    assert.match(rootBlock, /--vm-text: #17162C;/);
    assert.match(rootBlock, /--vm-surface-brand: #F4F1FB;/);
  });

  it("radius roles and type scale stay inside the spec ranges", () => {
    assert.match(rootBlock, /--vm-radius-control: 6px;/);
    assert.match(rootBlock, /--vm-radius-card: 8px;/);
    assert.match(rootBlock, /--vm-radius-hero: 12px;/);
    const px = (t: string) => Number(rootBlock.match(new RegExp(`--vm-${t}: (\\d+)px;`))?.[1]);
    assert.ok(px("fs-page") >= 20 && px("fs-page") <= 28);
    assert.ok(px("fs-section") >= 14 && px("fs-section") <= 18);
    assert.ok(px("fs-metric") >= 28 && px("fs-metric") <= 48);
    assert.ok(px("fs-display") >= 28 && px("fs-display") <= 48);
    assert.ok(px("fs-label") >= 10 && px("fs-label") <= 11);
  });

  it("flat surfaces and calm motion: no gradients, 120–200ms durations, reduced-motion honoured", () => {
    assert.doesNotMatch(css, /linear-gradient|radial-gradient|backdrop-filter/);
    assert.match(rootBlock, /--vm-dur-fast: 120ms;/);
    assert.match(rootBlock, /--vm-dur-slow: 200ms;/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  });

  it("button hierarchy: primary, secondary, tertiary, danger", () => {
    for (const cls of ["btn-primary", "btn-secondary", "btn-tertiary", "btn-danger"]) {
      assert.match(css, new RegExp(`\\.${cls}[\\s,{:]`), cls);
    }
  });
});

describe("Admin Phase 13.0 reset — shell", () => {
  it("login form starts empty with visible labels; auth request unchanged", () => {
    assert.doesNotMatch(app, /useState\("admin@vaksinamed\.uz"\)|useState\("vaksinamed"\)/);
    assert.match(app, /const \[email, setEmail\] = useState\(""\);/);
    assert.match(app, /const \[password, setPassword\] = useState\(""\);/);
    assert.match(app, /className="login-field"/);
    assert.match(app, /className="login-error" role="alert"/);
  });

  it("sidebar head carries brand + operator identity; logout is a separate footer action", () => {
    const head = app.indexOf('className="side-head"');
    const operator = app.indexOf('className="side-operator"');
    const nav = app.indexOf('className="side-nav"');
    const footer = app.indexOf('className="side-footer"');
    assert.ok(head > 0 && head < operator && operator < nav && nav < footer);
    assert.match(app, /className="side-logout"/);
    assert.match(app, />Chiqish<\/span>/);
  });

  it("topbar is breadcrumb + quiet date only", () => {
    const start = app.indexOf('<header className="topbar"');
    assert.ok(start > 0);
    const topbar = app.slice(start, app.indexOf("</header>", start));
    assert.match(topbar, /crumb-group/);
    assert.match(topbar, /<ChevronRight /);
    assert.match(topbar, /topbar-date/);
    assert.doesNotMatch(topbar, /HQ|Sessiya/);
  });
});

describe("Admin Phase 13.0 reset — Dashboard", () => {
  it("header uses a segmented period control with pressed state", () => {
    assert.match(dash, /className="dash-period" role="group"/);
    assert.match(dash, /aria-pressed=\{preset === value\}/);
    assert.match(dash, /id="dash-branch-filter"/);
  });

  it("business overview: sales on brand surface with 7-day bars; orders as stacked status bar", () => {
    assert.match(dash, /className="sales-bars"/);
    assert.match(dash, /function OrdersStack/);
    assert.match(dash, /className=\{`orders-stack-seg is-\$\{s\.tone\}`\}/);
    assert.doesNotMatch(dash, /OrdersRing|smoothPath|linearGradient/);
  });

  it("accent stays reserved for selection, never paints a panel", () => {
    assert.doesNotMatch(dashBlock, /\.dash-(hero|orders|metrics|kpi|signals|network) \{[^}]*--vm-accent/);
    assert.match(dashBlock, /\.sales-chart-zero\.is-focus \.sales-bar-fill \{ background: var\(--vm-accent\); \}/);
  });

  it("zero data stays compact and truthful", () => {
    assert.match(dash, /\.sales-chart\.is-empty|is-empty/);
    assert.match(dashBlock, /\.sales-chart\.is-empty \.sales-bars \{ height: 28px; \}/);
    assert.match(dash, /Faol bron yo‘q/);
  });

  it("only existing endpoints; no fake data", () => {
    const paths = [...dash.matchAll(/["`](\/api\/[a-z/:-]+)/g)].map((m) => m[1]);
    for (const p of paths) {
      assert.ok(
        p.startsWith("/api/admin/dashboard") || p.startsWith("/api/pos/sales") || p.startsWith("/api/admin/audit"),
        `unexpected endpoint ${p}`,
      );
    }
    assert.doesNotMatch(dash, /Math\.random|faker|lorem|mockData|sampleData|trend/i);
    assert.doesNotMatch(app, /Math\.random|faker|lorem/i);
  });

  it("docs record Phase 13.0 reset", () => {
    assert.match(readFileSync(path.join(docs, "ADMIN_IMPLEMENTATION_STATUS.md"), "utf8"), /Phase 13\.0 reset/);
  });
});
