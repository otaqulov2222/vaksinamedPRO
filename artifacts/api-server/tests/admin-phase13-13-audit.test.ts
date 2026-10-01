/**
 * Admin Phase 13.13 — Audit investigation console over the real audit_log contract.
 *   GET /admin/audit (audit:read, HQ only) — limit (≤100, default 40), offset, action (ILIKE substring, `%_\` stripped),
 *   entity (exact). Rows: id, actor, action, entity, createdAt, metadata (sanitizeAuditPayload). No detail / export / delete.
 * Backend change: sanitizeAuditPayload drops sensitive keys at every depth (+ cookie / session / hmac). No DB schema / migration change.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sanitizeAuditPayload } from "../src/lib/adminOrderOps";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(root, "../..");
const adminWeb = path.resolve(root, "../admin-web/src");
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const page = read(path.join(adminWeb, "pages/AuditPage.tsx"));
const code = page.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const app = read(path.join(adminWeb, "App.tsx"));
const nav = read(path.join(adminWeb, "nav.ts"));
const adminRoute = read(path.join(root, "src/routes/admin.ts"));
const rbac = read(path.join(root, "src/lib/rbac.ts"));
const migration = read(path.join(repoRoot, "lib/db/migrations/0001_sessions_rbac.sql"));
const docs = read(path.join(repoRoot, "docs/ADMIN_IMPLEMENTATION_STATUS.md"));
const css = read(path.join(adminWeb, "styles.css"));
const auCss = css.slice(
  css.indexOf("/* ——— Audit (Phase 12.21)"),
  css.indexOf("/* ——— Settings (Phase 12.22)"),
);

function between(src: string, start: string, end: string) {
  const a = src.indexOf(start);
  assert.ok(a >= 0, start);
  const b = src.indexOf(end, a + start.length);
  assert.ok(b > a, end);
  return src.slice(a, b);
}

function srcFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? srcFiles(path.join(dir, e.name)) : e.name.endsWith(".ts") ? [path.join(dir, e.name)] : [],
  );
}
const serverSources = srcFiles(path.join(root, "src/routes")).concat(srcFiles(path.join(root, "src/lib")));

/** Every audit_log writer in the api-server: action + entity as written. */
const writers = serverSources.flatMap((file) => {
  const src = read(file);
  const out: Array<{ file: string; action: string; entity: string }> = [];
  for (const m of src.matchAll(/insert\(auditLog\)\.values\(\{\s*actor[^,]*,\s*action: ([`"][^`"]+[`"]),\s*entity: "([^"]+)"/g)) {
    out.push({ file: path.basename(file), action: m[1].slice(1, -1), entity: m[2] });
  }
  for (const m of src.matchAll(/INSERT INTO audit_log \(actor, action, entity, payload\)\s*VALUES \(\s*\$\{[^}]+\},\s*\$\{"([^"]+)"\},\s*\$\{"([^"]+)"\}/g)) {
    out.push({ file: path.basename(file), action: m[1], entity: m[2] });
  }
  return out;
});
const staticActions = new Set(writers.filter((w) => !w.action.includes("${")).map((w) => w.action));
const writerEntities = new Set(writers.map((w) => w.entity));
const auditRoute = between(adminRoute, 'router.get("/admin/audit", ', "\nrouter.");
const actionLabelKeys = [...between(page, "const ACTION_LABELS", "\n};").matchAll(/^ {2}"([^"]+)":/gm)].map((m) => m[1]);
const transitionTargets = [...between(page, "const TRANSITION_TARGETS", ";").matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]);
const actionFilters = [...between(page, "const ACTION_FILTERS", "\n];").matchAll(/value: "([^"]*)"/g)].map((m) => m[1]);
const entityKeys = [...between(page, "const ENTITY_LABELS", "\n};").matchAll(/^ {2}(\w+):/gm)].map((m) => m[1]);

describe("Admin Phase 13.13 Audit — backend contract", () => {
  it("audit:read before DB; bounded pagination; server filters; newest first; sanitized rows; read-only", () => {
    const perm = auditRoute.indexOf('requirePermission(user, "audit:read")');
    assert.ok(perm > 0 && perm < auditRoute.indexOf("await db"));
    assert.match(adminRoute, /const ADMIN_AUDIT_DEFAULT_LIMIT = 40;/);
    assert.match(adminRoute, /const ADMIN_AUDIT_MAX_LIMIT = 100;/);
    assert.match(auditRoute, /Math\.min\(ADMIN_AUDIT_MAX_LIMIT, Math\.floor\(limitRaw\)\)/);
    assert.match(auditRoute, /ilike\(auditLog\.action, `%\$\{action\.replace\(\/\[%_\\\\\]\/g, ""\)\}%`\)/);
    assert.match(auditRoute, /eq\(auditLog\.entity, entity\)/);
    assert.match(auditRoute, /\.orderBy\(desc\(auditLog\.createdAt\), desc\(auditLog\.id\)\)/);
    const rowShape = between(auditRoute, "rows.map((row) => ({", "}));");
    assert.deepEqual([...rowShape.matchAll(/^\s+(\w+):/gm)].map((m) => m[1]), ["id", "actor", "action", "entity", "createdAt", "metadata"]);
    assert.match(rowShape, /metadata: sanitizeAuditPayload\(row\.payload\)/);
    assert.match(auditRoute, /pagination: \{ limit, offset, total, hasMore, nextOffset: hasMore \? offset \+ rows\.length : null \}/);
    assert.match(auditRoute, /readOnly: true/);
    for (const file of serverSources) {
      assert.doesNotMatch(read(file), /router\.(post|put|patch|delete)\("\/admin\/audit/, path.basename(file));
      assert.doesNotMatch(read(file), /router\.get\("\/admin\/audit\/:/, path.basename(file));
    }
  });

  it("permission: audit:read is HQ only (fallback + seed); no RBAC mutation endpoint can grant it", () => {
    const fallback = between(rbac, "function fallbackPermissionsForRole", "\n}\n");
    assert.match(between(fallback, "? new Set([", "])"), /"audit:read"/);
    assert.doesNotMatch(between(fallback, ": new Set([", "])"), /"audit:read"/);
    const cashierSeed = between(migration, "JOIN auth_permissions p ON p.code IN (", "WHERE r.code = 'cashier'");
    assert.doesNotMatch(cashierSeed, /audit:read/);
    assert.match(nav, /\{ id: "audit", label: "Audit", permission: "audit:read"/);
    for (const file of serverSources) assert.doesNotMatch(read(file), /router\.(post|put|patch|delete)\("\/admin\/(rbac|roles)/);
  });

  it("sanitizeAuditPayload drops sensitive keys at every depth and keeps operator fields", () => {
    const out = sanitizeAuditPayload(JSON.stringify({
      orderId: 7,
      branchId: 3,
      paymeCredentialUpdated: true,
      password: "x",
      passwordHash: "x",
      sessionToken: "x",
      cookie: "x",
      hmacSignature: "x",
      clickSecret: "x",
      nested: { apiKey: "x", otpCode: "x", keep: 1, deeper: { authorization: "x", ok: true } },
      list: [{ token: "x", sku: "A-1" }],
      fields: ["name", "address"],
      long: "a".repeat(600),
    }));
    assert.equal(out.orderId, 7);
    assert.equal(out.branchId, 3);
    assert.equal(out.paymeCredentialUpdated, true);
    assert.deepEqual(out.nested, { keep: 1, deeper: { ok: true } });
    assert.deepEqual(out.list, [{ sku: "A-1" }]);
    assert.deepEqual(out.fields, ["name", "address"]);
    assert.equal(String(out.long).length, 501);
    for (const k of ["password", "passwordHash", "sessionToken", "cookie", "hmacSignature", "clickSecret"]) assert.equal(k in out, false, k);
    assert.deepEqual(sanitizeAuditPayload("not json"), {});
    assert.deepEqual(sanitizeAuditPayload("[1,2]"), {});
  });

  it("writers: audit rows never carry merchant secrets, passwords or phones", () => {
    assert.ok(writers.length >= 16, String(writers.length));
    for (const file of serverSources) {
      const src = read(file);
      for (const m of src.matchAll(/(?:insert\(auditLog\)\.values\(\{|INSERT INTO audit_log)[\s\S]{0,700}?(?:\}\);|\n\s+\)\n)/g)) {
        assert.doesNotMatch(m[0], /paymeKey:|clickSecret:|password|phone|body\.(paymeKey|clickSecret)|token:/, path.basename(file));
      }
    }
  });
});

describe("Admin Phase 13.13 Audit — action / entity mapping stays inside the real catalogue", () => {
  it("every static action written by the server has a label, and every label is a real action", () => {
    for (const action of staticActions) assert.ok(actionLabelKeys.includes(action) , `unlabelled ${action}`);
    for (const key of actionLabelKeys) {
      const real = staticActions.has(key) || (key.startsWith("order.refund_cashback.") && ["full", "partial"].includes(key.split(".").pop()!));
      assert.ok(real, `invented action ${key}`);
    }
    const orders = read(path.join(root, "src/routes/orders.ts"));
    assert.match(orders, /String\(req\.body\?\.mode \|\| "full"\) === "partial" \? "partial" : "full"/);
    const union = between(orders, "async function staffTransition(", "reason: string");
    assert.deepEqual([...union.matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]).sort(), [...transitionTargets].sort());
    assert.match(code, /return `Amal: \$\{raw\}`;/);
    assert.match(code, /if \(!raw\) return "Noma'lum amal";/);
  });

  it("entity labels = entity codes written by the server", () => {
    assert.deepEqual([...entityKeys].sort(), [...writerEntities].sort());
    assert.match(code, /return ENTITY_LABELS\[e\] \|\| \(e \? `Obyekt: \$\{e\}` : "—"\);/);
  });

  it("action filters are server substrings without stripped characters and each matches real actions", () => {
    const codes = [...staticActions, ...transitionTargets.map((t) => `order.transition.${t}`), "order.refund_cashback.full", "order.refund_cashback.partial"];
    for (const value of actionFilters.filter(Boolean)) {
      assert.doesNotMatch(value, /[%_\\]/, value);
      assert.ok(codes.some((c) => c.toLowerCase().includes(value.toLowerCase())), value);
    }
    assert.deepEqual(codes.filter((c) => c.includes("order.confirm")), ["order.confirm_pos"]);
    assert.deepEqual(codes.filter((c) => c.includes("pos.")).sort(), ["pos.sale", "pos.void"]);
  });

  it("actor shown as returned; only known server prefixes are described; role only from admin.login metadata", () => {
    assert.match(code, /if \(raw\.startsWith\("staff:"\)\)/);
    assert.match(code, /if \(raw === "fom" \|\| raw === "fom-webhook"\)/);
    assert.match(code, /if \(!raw\) return \{ name: "Noma'lum operator", kind: "" \};/);
    assert.match(code, /return \{ name: raw, kind: "" \};/);
    assert.match(code, /selected\.action === "admin\.login" && selectedMeta\.role/);
    const pos = read(path.join(root, "src/routes/pos.ts"));
    assert.match(pos, /actor: `staff:\$\{staff\.email\}`/);
    assert.match(read(path.join(root, "src/routes/integrations.ts")), /actor: "fom-webhook"/);
  });
});

describe("Admin Phase 13.13 Audit — page uses the real contract only", () => {
  it("one list request with only supported params; no invented filters", () => {
    const urls = [...code.matchAll(/request\(\s*`([^`]+)`/g)].map((m) => m[1]);
    assert.deepEqual(urls, ["/api/admin/audit?${qs}"]);
    const params = [...code.matchAll(/qs\.set\("(\w+)"/g)].map((m) => m[1]);
    assert.deepEqual(params, ["limit", "offset", "action", "entity"]);
    assert.doesNotMatch(code, /createdFrom|createdTo|actorId|dateFrom|branchFilter|actorFilter|qs\.set\("(q|search|branchId|actor|status)"/);
    assert.equal(code.match(/await request\(/g)?.length, 1);
    assert.doesNotMatch(code, /Promise\.all|\.map\(\s*async|softRequest/);
    assert.match(code, /Matnli qidiruv, operator, filial va sana bo‘yicha filtr API’da\s+mavjud emas\./);
  });

  it("pagination from server fields; stale responses dropped", () => {
    assert.match(code, /setTotal\(Number\(data\?\.pagination\?\.total\) \|\| 0\)/);
    assert.match(code, /setHasMore\(Boolean\(data\?\.pagination\?\.hasMore\)\)/);
    assert.match(code, /<PaginationBar\s+offset=\{offset\}\s+limit=\{PAGE_SIZE\}\s+total=\{total\}\s+hasMore=\{hasMore\}/);
    assert.equal(code.match(/if \(seq !== loadSeq\.current\) return;/g)?.length, 2);
    assert.match(code, /if \(seq === loadSeq\.current\) setLoading\(false\);/);
  });

  it("timestamps formatted from the server value in Asia/Tashkent; no browser-timezone fmtDate", () => {
    assert.match(code, /const BUSINESS_TZ = "Asia\/Tashkent";/);
    assert.match(code, /new Intl\.DateTimeFormat\("en-GB", \{\s+timeZone: BUSINESS_TZ,/);
    assert.match(code, /const d = new Date\(String\(value\)\);/);
    assert.doesNotMatch(code, /fmtDate|toLocaleString|getHours|Date\.now/);
  });

  it("no statistics, risk scores, charts or invented status", () => {
    assert.doesNotMatch(code, /StatCard|MetricStrip|stat-grid|security.?score|risk|xavfli|<canvas|recharts|Chart/i);
    assert.doesNotMatch(code, /status:\s*"(success|failed)"|row\.status|\.result\b/);
    assert.match(code, /if \(meta\.paymentRefundRequired === true\)/);
    assert.match(code, /if \(meta\.idempotent === true\)/);
  });

  it("read-only: no mutation, no export, no local file generation", () => {
    assert.doesNotMatch(code, /method:\s*"(POST|PUT|PATCH|DELETE)"|ConfirmDialog|confirm\(/);
    assert.doesNotMatch(code, /Blob\(|download=|text\/csv|\.xlsx|window\.print|>\s*(CSV|Excel|PDF|Eksport)\s*</);
    assert.match(code, /Audit eksporti API mavjud emas/);
    assert.match(code, /Faqat o‘qish/);
  });

  it("drawer built from row data; technical data collapsed; order link reuses the Orders detail flow", () => {
    assert.match(code, /<DetailDrawer\s+open=\{Boolean\(selected\)\}/);
    assert.match(code, /<details className="au-tech">/);
    assert.doesNotMatch(code, /<details[^>]*\sopen/);
    assert.match(code, /IP \/ qurilma \/ so‘rov ID/);
    assert.match(code, /props\.onOpenOrder\?\.\(id\)/);
    assert.match(app, /<AuditPage\s+token=\{token\}\s+branches=\{branches\}\s+onOpenOrder=\{\(orderId\) => \{\s+setFocusOrderId\(orderId\);\s+setTab\("orders"\);/);
  });
});

describe("Admin Phase 13.13 Audit — security, states, coverage honesty", () => {
  it("sensitive keys scrubbed client-side too; no raw metadata dump, server message or phone", () => {
    const sensitive = between(page, "const SENSITIVE_KEY =", ";");
    for (const k of ["password", "otp", "token", "secret", "authorization", "cookie", "session", "hmac", "api.?key"]) assert.ok(sensitive.includes(k), k);
    assert.doesNotMatch(code, /JSON\.stringify\((row|selected)\.metadata|JSON\.stringify\(selectedMeta/);
    assert.doesNotMatch(code, /err\.message|error\.message\s*\|\||\.stack\b/);
    assert.doesNotMatch(code, /phone|Bearer|localStorage/i);
  });

  it("separate 401 / 403 / 404 / 500 / network / loading / empty / filter-empty states", () => {
    assert.match(code, /status === 401\) return \{ kind: "session"/);
    assert.match(code, /status === 403\) return \{ kind: "forbidden"/);
    assert.match(code, /status === 404\) return \{ kind: "notfound"/);
    assert.match(code, /if \(!status\) return \{ kind: "network"/);
    assert.match(code, /kind: "failed", message: "Audit ma'lumotlarini yuklab bo‘lmadi/);
    assert.match(code, /error\.kind === "failed" \|\| error\.kind === "network" \? \(\) => void load\(\{ offset \}\)/);
    assert.match(code, /className="au-skeleton-row"/);
    assert.match(code, /"Tanlangan filtrlar bo‘yicha audit yozuvi topilmadi" : "Audit yozuvlari mavjud emas"/);
  });

  it("coverage disclosure matches the code: listed gaps really have no audit_log writer", () => {
    assert.match(code, /Jurnal to‘liq tizim auditi emas/);
    for (const file of ["routes/deliveries.ts", "routes/payments.ts", "routes/workers.ts", "routes/loyalty.ts", "routes/auth.ts"]) {
      assert.doesNotMatch(read(path.join(root, "src", file)), /auditLog|audit_log/, file);
    }
    const customerCancel = between(read(path.join(root, "src/routes/orders.ts")), 'router.post("/orders/:id/cancel"', 'router.post("/orders/:id/admin-cancel"');
    assert.doesNotMatch(customerCancel, /auditLog/);
    assert.doesNotMatch(between(adminRoute, 'router.post("/admin/logout"', "\nrouter."), /auditLog/);
    assert.doesNotMatch(adminRoute, /authEvents\)|from\(authEvents/);
    assert.match(code, /alohida xavfsizlik jurnaliga yoziladi, uni o‘qish API’si yo‘q/);
  });

  it("keyboard: rows focusable, Enter / Space open the drawer", () => {
    assert.match(code, /tabIndex=\{0\}/);
    assert.match(code, /if \(e\.key === "Enter" \|\| e\.key === " "\)/);
    assert.match(auCss, /\.au-row:focus-visible \{\s+outline: 2px solid var\(--vm-brand\);/);
  });
});

describe("Admin Phase 13.13 Audit — design system and docs", () => {
  it("responsive: secondary columns hidden on tablet, cards on mobile, coverage stacks", () => {
    assert.ok(auCss.length > 4000);
    assert.match(auCss, /@media \(max-width: 1200px\) \{\s+\.au-surface \.au-col-note \{ display: none; \}/);
    assert.match(auCss, /@media \(max-width: 1024px\) \{\s+\.au-surface \.au-col-branch \{ display: none; \}\s+\.au-surface \.table \{ min-width: 0; \}/);
    assert.match(auCss, /@media \(max-width: 560px\) \{[\s\S]*?\.au-surface thead \{ display: none; \}/);
    assert.match(auCss, /\.au-coverage-grid \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  });

  it("no hardcoded colours, gradients or inline styles", () => {
    assert.doesNotMatch(auCss, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    assert.doesNotMatch(auCss, /gradient/i);
    assert.doesNotMatch(code, /style=\{\{|#[0-9a-f]{6}\b|gradient/i);
  });

  it("Phase 13.13 documented", () => {
    const section = between(docs, "## Phase 13.13 — Audit", "## Phase 13.12 — Hisobotlar");
    assert.match(section, /GET \/api\/admin\/audit/);
    assert.match(section, /audit:read/);
    assert.match(section, /sanitizeAuditPayload/);
    assert.match(section, /DB sxemasi va migratsiyalar o‘zgartirilmadi/);
    assert.match(section, /Audit eksporti API mavjud emas/);
  });
});
