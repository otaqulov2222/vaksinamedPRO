/**
 * Admin Phase 13.15 — Admin users / RBAC console over the real contract.
 * 13.15 shipped a read-only page over GET /api/admin/me. Phase 13.16 added the admin management API
 * (routes/adminUsers.ts, rbac:manage), migration 0011 (status/updated_at) and wired the page to it.
 * Assertions that described the 13.15 absence of that API were converted into the equivalent 13.16
 * positive checks (documented in docs/ADMIN_IMPLEMENTATION_STATUS.md, Phase 13.16 → Tests).
 * Phase 13.17 likewise turned "no sessions / auth-events route" and the page URL list into exact checks of
 * routes/adminSecurity.ts (Phase 13.17 → Tests).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(root, "../..");
const adminWeb = path.resolve(root, "../admin-web/src");
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const page = read(path.join(adminWeb, "pages/AdminAccessPage.tsx"));
const code = page.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const app = read(path.join(adminWeb, "App.tsx"));
const nav = read(path.join(adminWeb, "nav.ts"));
const adminRoute = read(path.join(root, "src/routes/admin.ts"));
const usersRoute = read(path.join(root, "src/routes/adminUsers.ts"));
const rbac = read(path.join(root, "src/lib/rbac.ts"));
const auth = read(path.join(root, "src/lib/auth.ts"));
const securityEnv = read(path.join(root, "src/lib/securityEnv.ts"));
const adminSchema = read(path.join(repoRoot, "lib/db/src/schema/admin.ts"));
const m0001 = read(path.join(repoRoot, "lib/db/migrations/0001_sessions_rbac.sql"));
const m0004 = read(path.join(repoRoot, "lib/db/migrations/0004_inventory_adjust_permission.sql"));
const docs = read(path.join(repoRoot, "docs/ADMIN_IMPLEMENTATION_STATUS.md"));
const css = read(path.join(adminWeb, "styles.css"));
const acCss = css.slice(
  css.indexOf("/* ——— Admins / RBAC console — Phase 13.16"),
  css.indexOf("/* ——— Dashboard — Phase 13.0"),
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
const routeSources = srcFiles(path.join(root, "src/routes")).map((f) => ({ f: path.basename(f), src: read(f) }));
const serverSources = routeSources.concat(srcFiles(path.join(root, "src/lib")).map((f) => ({ f: path.basename(f), src: read(f) })));

const quoted = (src: string) => [...src.matchAll(/'([a-z_]+:[a-z_:]+)'/g)].map((m) => m[1]);
const seedAll = [...quoted(between(m0001, "INSERT INTO auth_permissions", "ON CONFLICT")), ...quoted(m0004).slice(0, 1)];
const seedCashier = quoted(between(m0001, "JOIN auth_permissions p ON p.code IN (", "WHERE r.code = 'cashier'"));
const fallbackHq = [...between(rbac, "isHqAdminRole(role)", ": new Set([").matchAll(/"([a-z_]+:[a-z_:]+)"/g)].map((m) => m[1]);
const fallbackCashier = [...between(rbac, ": new Set([", "]);").matchAll(/"([a-z_]+:[a-z_:]+)"/g)].map((m) => m[1]);
const labelCodes = [...between(code, "const PERMISSION_LABELS", "const GROUP_LABELS").matchAll(/"([a-z_]+:[a-z_:]+)":/g)].map((m) => m[1]);
const sorted = (xs: string[]) => [...xs].sort();

describe("Admin Phase 13.15 Admin users / RBAC — real server contract", () => {
  it("admin.ts keeps only me/login/logout; admin management lives only in adminUsers.ts; no role/permission/session write API", () => {
    const adminRoutes = [...adminRoute.matchAll(/router\.(get|post|patch|put|delete)\("(\/admin\/(?:me|login|logout))"/g)].map((m) => `${m[1]} ${m[2]}`);
    assert.deepEqual(sorted(adminRoutes), ["get /admin/me", "post /admin/login", "post /admin/logout"]);
    for (const { f, src } of routeSources) {
      if (f !== "adminUsers.ts" && f !== "adminSecurity.ts") {
        assert.doesNotMatch(src, /router\.(get|post|patch|put|delete)\("\/(admin\/)?(users|admins|roles|permissions|rbac)\b/, f);
      }
      assert.doesNotMatch(src, /router\.(post|patch|put|delete)\("\/(admin\/)?(roles|permissions|rbac)\b/, f);
      assert.doesNotMatch(src, /router\.(get|post|patch|put|delete)\("\/admin\/sessions\b/, f);
      if (f !== "adminSecurity.ts") assert.doesNotMatch(src, /router\.(get|post|patch|put|delete)\("\/admin\/(auth-events|users\/:id\/sessions)/, f);
    }
    const securityRoute = routeSources.find((s) => s.f === "adminSecurity.ts")!.src;
    const security = [...securityRoute.matchAll(/router\.(get|post|patch|put|delete)\("([^"]+)"/g)].map((m) => `${m[1]} ${m[2]}`);
    assert.deepEqual(sorted(security), ["get /admin/auth-events", "get /admin/users/:id/sessions", "post /admin/users/:id/sessions/:sessionId/revoke"]);
    const managed = [...usersRoute.matchAll(/router\.(get|post|patch|put|delete)\("([^"]+)"/g)].map((m) => `${m[1]} ${m[2]}`);
    assert.equal(managed.length, 7);
    assert.ok(managed.every((r) => /^(get|post|patch) \/admin\/(users|rbac)/.test(r)), managed.join());
  });

  it("GET /admin/me returns only id/email/name/role/branchId + sorted permissions (no hash, no token)", () => {
    const me = between(adminRoute, 'router.get("/admin/me"', 'router.get("/admin/dashboard"');
    assert.match(me, /await requireAdmin\(req\)/);
    assert.match(me, /user: \{ id: user\.id, email: user\.email, name: user\.name, role: user\.role, branchId: user\.branchId \}/);
    assert.match(me, /permissions: Array\.from\(perms\)\.sort\(\)/);
    assert.doesNotMatch(me, /passwordHash|tokenHash|token:/);
  });

  it("admin users are written only by login normalisation and the rbac:manage router; roles and grants are never written", () => {
    const writes = new Set(serverSources.flatMap(({ f, src }) =>
      [...src.matchAll(/\.(insert|update|delete)\((adminUsers|authRoles|authRolePermissions|authPermissions)\)/g)].map((m) => `${f}:${m[1]}:${m[2]}`),
    ));
    assert.deepEqual(sorted([...writes]), ["adminUsers.ts:insert:adminUsers", "adminUsers.ts:update:adminUsers", "auth.ts:update:adminUsers"]);
    assert.match(auth, /db\.update\(adminUsers\)\.set\(\{ role: normalized \}\)/);
    const actions = [...usersRoute.matchAll(/"(admin\.[a-z_]+)"/g)].map((m) => m[1]);
    assert.deepEqual(sorted([...new Set(actions)]), ["admin.create", "admin.password_change", "admin.role_change", "admin.status_change", "admin.update"]);
    assert.doesNotMatch(serverSources.map((s) => s.src).join("\n"), /action: "admin\.(delete|disable|remove)/);
  });

  it("admin_users gains status + updatedAt only through migration 0011; no lastActivity / lastLogin column is invented", () => {
    const table = between(adminSchema, 'export const adminUsers = pgTable("admin_users"', "});");
    for (const col of ["email", "name", "passwordHash", "role", "branchId", "createdAt", "status", "updatedAt"]) assert.match(table, new RegExp(`${col}:`));
    assert.match(table, /0011_admin_management/);
    assert.doesNotMatch(table, /isActive|lastActivity|lastLogin|deletedAt/);
    assert.doesNotMatch(code, /lastLogin|lastActivity|isActive|disabledAt/);
  });

  it("roles are the seeded super_admin and cashier only; legacy admin/hq map to super_admin; the page lists roles from the API", () => {
    const roles = [...between(m0001, "INSERT INTO auth_roles", "ON CONFLICT").matchAll(/\('([a-z_]+)'/g)].map((m) => m[1]);
    assert.deepEqual(roles, ["super_admin", "cashier"]);
    assert.match(securityEnv, /"super_admin"/);
    assert.doesNotMatch(code, /const ROLES = \[/);
    assert.match(code, /const roles = rbac\?\.roles \|\| \[\];/);
    const labelRoles = [...between(code, "const ROLE_LABELS", ";").matchAll(/([a-z_]+): "/g)].map((m) => m[1]);
    assert.deepEqual(labelRoles, roles);
    assert.doesNotMatch(code, /"(manager|operator|owner|viewer|editor|branch_admin|accountant)"/);
  });

  it("the page label map covers the migration seed exactly; the rbac.ts fallbacks equal the seed; codes shown come from the API", () => {
    assert.equal(seedAll.length, 22);
    assert.equal(new Set(labelCodes).size, labelCodes.length);
    assert.deepEqual(sorted(labelCodes), sorted(seedAll));
    assert.deepEqual(sorted(fallbackHq), sorted(seedAll));
    assert.deepEqual(sorted(fallbackCashier), sorted(seedCashier));
    assert.equal(seedCashier.length, 9);
    assert.match(m0004, /'inventory:adjust'/);
    assert.match(between(m0004, "INSERT INTO auth_role_permissions", "ON CONFLICT"), /r\.code = 'super_admin'/);
    assert.doesNotMatch(code, /CASHIER_SEED|PERMISSION_GROUPS|ALL_CODES/);
    assert.match(code, /for \(const p of rbac\?\.permissions \|\| \[\]\)/);
  });

  it("every one of the 22 permission codes is now enforced by a real route (rbac:manage by the admin management router)", () => {
    const enforced = new Set(
      routeSources.flatMap(({ src }) => [...src.matchAll(/(?:requirePermission|adminHasPermission)\([^,]+,\s*"([a-z_]+:[a-z_:]+)"\)/g)].map((m) => m[1])),
    );
    assert.match(usersRoute, /RBAC_MANAGE_PERMISSION = "rbac:manage"/);
    assert.match(usersRoute, /await requirePermission\(actor, RBAC_MANAGE_PERMISSION\)/);
    enforced.add("rbac:manage");
    assert.deepEqual(seedAll.filter((c) => !enforced.has(c)), []);
    assert.doesNotMatch(code, /Hech qaysi endpoint bu kodni talab qilmaydi|uni talab qiladigan endpoint yo‘q/);
  });

  it("server enforces 401 / 403 and branch scope; denials are recorded", () => {
    assert.match(rbac, /eventType: "authz\.denied"/);
    assert.match(rbac, /Bu amal uchun ruxsat yo‘q"\), \{ status: 403 \}/);
    assert.match(rbac, /Bu filial uchun ruxsat yo‘q"\), \{ status: 403 \}/);
    assert.match(nav, /\{ id: "admins", label: "Adminlar", permission: null, hqOnly: true, weight: "system" \}/);
    assert.match(nav, /if \(item\.hqOnly\) return isHqRole\(role\);/);
  });
});

describe("Admin Phase 13.15 AdminAccessPage — honest console (wired to the 13.16 API)", () => {
  it("reads only real admin endpoints with the session token; no DELETE, no ad-hoc fetch", () => {
    const urls = [...code.matchAll(/request\(\s*[`"]([^`"]+)[`"]/g)].map((m) => m[1].replace(/\$\{[^}]+\}/g, ":x"));
    assert.deepEqual(sorted([...new Set(urls)]), sorted([
      "/api/admin/me", "/api/admin/rbac", "/api/admin/users?:x", "/api/admin/users/:x", "/api/admin/users",
      "/api/admin/users/:x/password", "/api/admin/users/:x/status",
      "/api/admin/users/:x/sessions?:x", "/api/admin/users/:x/sessions/:x/revoke", "/api/admin/auth-events?:x",
    ]));
    assert.match(code, /const token = props\.token \|\| "";/);
    assert.doesNotMatch(code, /method: "(DELETE|PUT)"|softRequest|fetch\(|\/api\/admin\/roles|\/api\/admin\/permissions|\/api\/rbac/);
    assert.match(app, /<AdminAccessPage token=\{token\} branches=\{branches\} \/>/);
  });

  it("mutation controls exist only for real endpoints; no hard delete / invite / checkbox; no secret field names", () => {
    assert.doesNotMatch(page, /O‘chirish<|Deactivate|Invite|type="checkbox"/);
    assert.doesNotMatch(page, /passwordHash|tokenHash|accessToken|refreshToken|secret|apiKey|hmac/i);
    assert.doesNotMatch(code, /localStorage|sessionStorage|console\./);
    const buttons = [...code.matchAll(/<button[\s\S]*?<\/button>/g)].map((m) => m[0]);
    for (const label of ["Yangilash", "Admin qo‘shish", "Tahrirlash", "Parolni almashtirish", "Faolsizlantirish", "Faollashtirish", "Qo‘shish", "Saqlash"]) {
      assert.ok(buttons.some((b) => b.includes(label)), label);
    }
  });

  it("only real /admin/me fields are picked from the response", () => {
    const parse = between(code, "function parseMe(", "function roleLabel(");
    const picked = [...parse.matchAll(/u\.([a-zA-Z]+)/g)].map((m) => m[1]);
    assert.deepEqual([...new Set(picked)].sort(), ["branchId", "email", "id", "name", "role"]);
    const row = between(code, "function parseRow(", "function parseDetail(");
    const rowPicked = [...row.matchAll(/u\.([a-zA-Z]+)/g)].map((m) => m[1]);
    assert.deepEqual([...new Set(rowPicked)].sort(), ["branchId", "branchName", "createdAt", "email", "id", "name", "role", "status", "updatedAt"]);
  });

  it("header, chips and section copy follow the spec", () => {
    assert.match(code, /title="Adminlar"/);
    assert.match(code, /description="Tizim operatorlari, rollar va ruxsatlarni boshqarish\."/);
    for (const chip of ["Faqat HQ", "RBAC: serverda", "Adminlar API: ulangan"]) {
      assert.ok(code.includes(`>${chip}</span>`), chip);
    }
    assert.doesNotMatch(code, /Adminlarni boshqarish API mavjud emas|Adminlar API: mavjud emas|Faqat ko‘rish</);
    assert.match(code, /<StatusBadge tone="info">Joriy hisob<\/StatusBadge>/);
    assert.match(code, /<StatusBadge tone="warn">\{operatorCapabilityLabel\("API_REQUIRED"\)\}<\/StatusBadge>/);
    assert.match(code, /Joriy sessiya: /);
    assert.match(code, /title="Hozir ishlayotgan"/);
    assert.match(code, /<th scope="col">Rol<\/th>\s*<th scope="col">Ruxsatlar<\/th>\s*<th scope="col">Doira<\/th>/);
  });

  it("error copy is fixed per status/code and never shows the raw server message", () => {
    const copy = between(code, "const ERROR_COPY", "};");
    assert.match(copy, /session: "Seans tugagan\. Qayta kiring\."/);
    assert.match(copy, /forbidden: "Bu bo‘lim uchun ruxsatingiz yo‘q\."/);
    assert.match(copy, /notfound: "Ma'lumot topilmadi\."/);
    assert.match(copy, /failed: "Serverda xatolik yuz berdi\."/);
    assert.match(copy, /network: "Server bilan aloqa o‘rnatilmadi\."/);
    const le = between(code, "function loadError(", "function mutationError(");
    assert.match(le, /status === 401 \? "session" : status === 403 \? "forbidden" : status === 404 \? "notfound" : status \? "failed" : "network"/);
    assert.match(le, /message: ERROR_COPY\[kind\]/);
    assert.match(code, /return MUTATION_COPY\[codeOf\(err\)\] \|\| loadError\(err\)\.message;/);
    assert.doesNotMatch(code, /err(or)?\.message\b(?!\})|\.message \|\|/);
    assert.match(code, /<ErrorState message=\{error\.message\} onRetry=\{retryable \? \(\) => void load\(\) : undefined\} \/>/);
  });

  it("access is decided by the server: a 403 from the admin API renders the forbidden state", () => {
    assert.match(code, /failure = loadError\(err\);/);
    assert.doesNotMatch(code, /if \(!isHqRole\(next\.user\.role\)\)/);
    assert.match(code, /const canManage = Boolean\(me && rbac && me\.permissions\.includes\(rbac\.managePermission\)\);/);
  });

  it("stale responses are dropped and refresh keeps the race guard", () => {
    const load = between(code, "async function load()", "async function loadDetail(");
    assert.match(load, /const seq = \+\+loadSeq\.current;/);
    assert.match(load, /if \(seq !== loadSeq\.current\) return;/);
    assert.ok(load.indexOf("await Promise.all(") >= 0);
    assert.ok(load.indexOf("await Promise.all(") < load.indexOf("if (seq !== loadSeq.current) return;"));
    const detail = between(code, "async function loadDetail(", "useEffect(");
    assert.match(detail, /const seq = \+\+detailSeq\.current;/);
    assert.match(code, /\}, \[token, offset, filters\]\);/);
  });

  it("rows open the drawer by click, Enter and Space; DetailDrawer owns Escape + focus return", () => {
    assert.match(code, /tabIndex=\{0\}/);
    assert.match(code, /onClick=\{\(\) => openView\(row\.id\)\}/);
    assert.match(code, /onKeyDown=\{rowKeys\(row\.id\)\}/);
    assert.match(code, /e\.key === "Enter" \|\| e\.key === " "/);
    assert.match(code, /<DetailDrawer\s+open=\{Boolean\(panel\)\}/);
    assert.match(code, /onClose=\{closePanel\}/);
    const ui = read(path.join(adminWeb, "ui.tsx"));
    const focus = between(ui, "function useModalFocus(", "export function DetailDrawer(");
    assert.match(focus, /e\.key === "Escape"/);
    assert.match(focus, /trigger\?\.isConnected\) trigger\.focus/);
  });

  it("branch scope comes from the server branchId/branchName and the loaded branch list", () => {
    assert.match(code, /row\.branchId == null \? "Barcha filiallar \(HQ\)" : row\.branchName \|\| `Filial #\$\{row\.branchId\}`/);
    assert.match(code, /const branches = props\.branches \|\| \[\];/);
    assert.match(code, /branchId: isHqRole\(form\.role\) \? null : Number\(form\.branchId\)/);
  });

  it("unknown server permission codes are shown raw, never dropped", () => {
    assert.match(code, /return PERMISSION_LABELS\[code\] \|\| "Boshqa ruxsat";/);
    assert.match(code, /const matrixUnknown = useMemo/);
    assert.match(code, /Boshqa ruxsatlar/);
    assert.match(code, /<code className="ac-code">\{code\}<\/code>/);
  });
});

describe("Admin Phase 13.15 styles + docs", () => {
  it("ac-* block uses tokens only and collapses tables to cards at 768px", () => {
    assert.ok(acCss.length > 1000);
    assert.doesNotMatch(acCss, /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|gradient\(/);
    const cards = between(acCss, "@media (max-width: 768px)", "@media (max-width: 560px)");
    assert.match(cards, /\.ac-table \.table thead \{\s*position: absolute;/);
    assert.match(cards, /content: attr\(data-label\);/);
    assert.match(acCss, /\.ac-table \.table \{ min-width: 0; \}/);
    assert.match(acCss, /\.ac-row:focus-visible \{ outline: 2px solid var\(--vm-brand\)/);
    for (const label of ["Admin", "Rol", "Filial", "Holat", "Yangilangan", "Ruxsatlar", "Doira", "Ruxsat"]) {
      assert.ok(code.includes(`data-label="${label}"`), label);
    }
  });

  it("legacy nav description and old phase contracts are kept", () => {
    assert.match(nav, /admins:\s*"Joriy sessiya/);
    assert.match(code, /operatorCapabilityLabel\("API_REQUIRED"\)/);
  });

  it("Phase 13.15 is documented", () => {
    const section = between(docs, "## Phase 13.15 — Admin Users / RBAC", "## Phase 13.14");
    for (const item of ["Status", "Real APIs", "Admin model", "Roles", "Permissions", "Branch scope", "Create", "Edit", "Delete/disable", "Audit", "Sensitive data", "DB changes", "Fake data", "Browser QA", "Responsive QA", "Remaining gaps", "Next phase"]) {
      assert.ok(section.includes(item), item);
    }
    assert.match(section, /GET \/api\/admin\/me/);
    assert.match(section, /rbac:manage/);
  });
});
