/**
 * Admin Phase 13.14 — Settings console over the real read sources (no settings API, no write API).
 *   GET /api/cashback/rules (public)        — maxSpendPercent (system_settings), minPurchase / ttlDays / deliveryFee / tiers (code constants)
 *   GET /api/admin/branches (branches:read) — isOpen / is24h / hasPayme / hasClick; merchant secrets masked
 *   GET /api/admin/deliveries (delivery:update) — externalProvider CONTRACT_PENDING
 *   GET /api/integrations/fom/status (admin) — CONTRACT_PENDING, inventory writer OFF
 *   GET /api/healthz (public)               — database up/down + driver
 * No backend, DB schema or migration change.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { publicCashbackRules, cashbackRateBps, rateLabel, nextTier } from "../src/lib/cashback";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(root, "../..");
const adminWeb = path.resolve(root, "../admin-web/src");
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const page = read(path.join(adminWeb, "pages/SettingsPage.tsx"));
const code = page.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const app = read(path.join(adminWeb, "App.tsx"));
const nav = read(path.join(adminWeb, "nav.ts"));
const adminRoute = read(path.join(root, "src/routes/admin.ts"));
const integrations = read(path.join(root, "src/routes/integrations.ts"));
const deliveriesRoute = read(path.join(root, "src/routes/deliveries.ts"));
const health = read(path.join(root, "src/routes/health.ts"));
const merchant = read(path.join(root, "src/lib/branchPaymentMerchant.ts"));
const finance = read(path.join(root, "src/lib/cashbackFinance.ts"));
const rbac = read(path.join(root, "src/lib/rbac.ts"));
const docs = read(path.join(repoRoot, "docs/ADMIN_IMPLEMENTATION_STATUS.md"));
const css = read(path.join(adminWeb, "styles.css"));
const stCss = css.slice(
  css.indexOf("/* ——— Settings console — Phase 13.14"),
  css.indexOf("/* ——— FOM integration console"),
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
const migrations = readdirSync(path.join(repoRoot, "lib/db/migrations"))
  .filter((f) => f.endsWith(".sql"))
  .map((f) => read(path.join(repoRoot, "lib/db/migrations", f)))
  .join("\n");

describe("Admin Phase 13.14 Settings — real server contract", () => {
  it("there is no settings / config API and no write path for system_settings", () => {
    for (const { f, src } of routeSources) {
      assert.doesNotMatch(src, /router\.\w+\("\/(admin\/)?(settings|config)\b/, f);
      assert.doesNotMatch(src, /router\.(post|put|patch|delete)\("\/cashback\/rules/, f);
    }
    for (const { f, src } of serverSources) {
      assert.doesNotMatch(src, /(insert|update|delete)\(systemSettings\)|(INSERT INTO|UPDATE|DELETE FROM) system_settings/, f);
    }
    assert.match(migrations, /INSERT INTO system_settings \(key, value, description\)\s+VALUES \(\s+'cashback\.max_spend_ratio',\s+'0\.30'/);
  });

  it("cashback rules: GET only, spend ratio from system_settings with the documented default", () => {
    const route = between(integrations, 'router.get("/cashback/rules"', "\n});");
    assert.match(route, /const ratio = await getMaxSpendRatio\(\);\s+res\.json\(publicCashbackRules\(ratio\)\);/);
    const getter = between(finance, "export async function getMaxSpendRatio", "\n}\n");
    assert.match(getter, /eq\(systemSettings\.key, "cashback\.max_spend_ratio"\)/);
    assert.match(getter, /return DEFAULT_MAX_SPEND_RATIO;/);
  });

  it("publicCashbackRules runtime: percent comes from the ratio; tiers match the engine rates and thresholds", () => {
    const rules = publicCashbackRules(0.3);
    assert.equal(rules.maxSpendPercent, 30);
    assert.equal(publicCashbackRules(1.7).maxSpendPercent, 100);
    assert.equal(publicCashbackRules(-1).maxSpendPercent, 30);
    assert.equal(rules.minPurchase, 1000);
    assert.equal(rules.deliveryFee, 15000);
    for (const t of rules.tiers) {
      assert.equal(t.rate, rateLabel(cashbackRateBps(t.tier)), t.tier);
      assert.equal(nextTier(t.fromTotal, ""), t.tier, t.tier);
    }
    for (const k of ["password", "secret", "token", "key"]) {
      assert.doesNotMatch(JSON.stringify(Object.keys(rules)), new RegExp(k, "i"), k);
    }
  });

  it("ttlDays is declared but not enforced by any server code — the page must say so", () => {
    for (const { f, src } of serverSources) {
      if (f === "cashback.ts") continue;
      assert.doesNotMatch(src, /CASHBACK_TTL_DAYS|ttlDays/, f);
    }
    assert.match(code, /Serverda qo‘llanmaydi/);
    assert.match(code, /Muddati o‘tgan cashbackni hisobdan chiqaradigan server jarayoni hozircha yo‘q\./);
  });

  it("branches: branches:read before DB; merchant secrets are masked to booleans / •••• in the DTO", () => {
    const list = between(adminRoute, 'router.get("/admin/branches"', "\n});");
    assert.ok(list.indexOf('requirePermission(user, "branches:read")') < list.indexOf("await db"));
    assert.match(list, /\.\.\.item,\s+\.\.\.toAdminBranchPaymentDto\(item\),/);
    const dto = between(merchant, "export function toAdminBranchPaymentDto", "\n}\n");
    assert.match(dto, /paymeKey: flags\.hasPayme \? "••••" : ""/);
    assert.match(dto, /clickSecret: flags\.hasClick \? "••••" : ""/);
    assert.match(dto, /hasPayme: flags\.hasPayme,\s+hasClick: flags\.hasClick,/);
  });

  it("delivery: external provider is CONTRACT_PENDING in the admin list contract", () => {
    const list = between(deliveriesRoute, 'router.get("/admin/deliveries"', "\n});");
    assert.match(list, /requirePermission\(admin, "delivery:update"\)/);
    assert.match(list, /externalProvider: "CONTRACT_PENDING"/);
    assert.match(list, /Math\.min\(100, Math\.floor\(limitRaw\)\)/);
  });

  it("FOM status and health: admin-only topology, no env values, no DB error text", () => {
    const fom = between(integrations, 'router.get("/integrations/fom/status"', "\n});");
    assert.match(fom, /await requireAdmin\(req\);/);
    assert.match(fom, /status: "CONTRACT_PENDING"/);
    assert.match(fom, /inventoryWriter: "OFF"/);
    assert.doesNotMatch(fom, /process\.env/);
    assert.doesNotMatch(health, /process\.env|health\.error|connectionString/);
  });

  it("permissions: no settings permission exists or is invented; settings nav is HQ-only", () => {
    assert.doesNotMatch(rbac, /settings:/);
    assert.doesNotMatch(migrations, /'settings:(read|manage)'/);
    assert.doesNotMatch(code, /settings:(read|manage)|cashback:manage|payments:manage/);
    assert.match(nav, /\{ id: "settings", label: "Sozlamalar", permission: null, hqOnly: true, weight: "system" \}/);
    assert.match(nav, /if \(item\.hqOnly\) return isHqRole\(role\);/);
  });
});

describe("Admin Phase 13.14 Settings — page reads only real sources", () => {
  it("five GET sources in one parallel batch; no other endpoint", () => {
    const urls = [...code.matchAll(/request\("([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(urls, [
      "/api/cashback/rules",
      "/api/admin/branches",
      "/api/admin/deliveries?limit=1",
      "/api/integrations/fom/status",
      "/api/healthz",
    ]);
    assert.equal(code.match(/Promise\.allSettled\(/g)?.length, 1);
    assert.doesNotMatch(code, /\/api\/(admin\/)?(settings|config)|softRequest|\.map\(\s*async/);
  });

  it("read-only: no mutation, no form controls, no ConfirmDialog", () => {
    assert.doesNotMatch(code, /method:|ConfirmDialog|confirm\(|<input|<select|<textarea|<form|onSubmit|Saqlash|Tahrirlash/);
    assert.match(code, /const READ_ONLY = "Faqat ko‘rish — o‘zgartirish API mavjud emas";/);
    assert.match(code, /<span className="st-readonly" title=\{READ_ONLY\}>Faqat ko‘rish<\/span>/);
    assert.match(code, /Alohida sozlamalar API’si yo‘q/);
  });

  it("values shown as the server returns them — no recomputation of the spend cap or money", () => {
    assert.match(code, /value=\{maxSpendPercent != null \? `\$\{maxSpendPercent\}%` : null\}/);
    assert.doesNotMatch(code, /maxSpendRatio|\* 100|\/ 100/);
    assert.match(code, /money\(minPurchase\)/);
    assert.match(code, /money\(Number\(rules\.data\?\.deliveryFee\)\)/);
    assert.match(code, /money\(Number\(t\.fromTotal\)\)/);
  });

  it("settings and balances stay separate", () => {
    assert.doesNotMatch(code, /\bbalance\b|\/api\/admin\/customers|cashback-history|\/api\/loyalty/);
    assert.match(code, /Mijozlar balansi va ledger bu yerda emas/);
  });

  it("payments: only configured booleans; secret fields never read or rendered", () => {
    assert.doesNotMatch(code, /paymeKey|MerchantId|merchantId|clickServiceId|••••/);
    assert.match(code, /b\.hasPayme === true/);
    assert.match(code, /b\.hasClick === true/);
    assert.match(code, /Kalit qiymatlari hech qachon ko‘rsatilmaydi\./);
  });

  it("delivery / FOM / health only from API fields; no invented online status", () => {
    assert.match(code, /delivery\.data\?\.externalProvider === "CONTRACT_PENDING"/);
    assert.match(code, /Hali ulanmagan — tashqi provider contract mavjud emas\./);
    assert.match(code, /health\.data\.database === "up"/);
    assert.match(code, /health\.data\.database === "down"/);
    assert.match(code, /if \(statusOf\(err\) === 503\) return \{ status: "not_ready", database: "down" \};/);
    assert.doesNotMatch(code, /Online|Healthy|Connected|Onlayn|Ishlayapti/);
  });

  it("environment-only settings are disclosed as not visible, never given a status or value", () => {
    const list = between(code, "const NOT_EXPOSED = [", "];");
    for (const item of ["SMS va xabarnomalar", "Fon jarayonlari", "Payme / Click rejimi", "Sessiya muddati, OTP"]) {
      assert.ok(list.includes(item), item);
    }
    assert.match(code, /Admin API orqali ko‘rinmaydi/);
    assert.doesNotMatch(code, /process\.env|import\.meta\.env|ESKIZ_|REDIS_URL|DATABASE_URL|KEK/);
  });

  it("no invented settings", () => {
    assert.doesNotMatch(
      code,
      /Valyuta|Currency|Mamlakat|Country|Soliq|VAT|QQS|Asosiy filial|Default branch|Bepul yetkazib|Free delivery|Promo engine|Telegram|Email|downgrade|Vaqt zonasi/i,
    );
  });

  it("errors: 401 / 403 / 404 / 500 / network copy; session and full outage are page-level; stale batches dropped", () => {
    assert.match(code, /status === 401\) return \{ kind: "session"/);
    assert.match(code, /status === 403\) return \{ kind: "forbidden", message: `\$\{label\}: ko‘rish uchun ruxsat yo‘q\.` \}/);
    assert.match(code, /status === 404\) return \{ kind: "notfound"/);
    assert.match(code, /if \(!status\) return \{ kind: "network"/);
    assert.match(code, /kind: "failed", message: `\$\{label\}: ma'lumotni yuklab bo‘lmadi/);
    assert.match(code, /const sessionExpired = sources\.some\(\(s\) => s\.error\?\.kind === "session"\);/);
    assert.match(code, /const allNetwork = loaded && sources\.every\(\(s\) => s\.error\?\.kind === "network"\);/);
    assert.match(code, /\(props\.error\.kind === "failed" \|\| props\.error\.kind === "network"\) \? props\.onRetry : undefined/);
    assert.doesNotMatch(code, /err\.message|\.reason\.message|\.stack\b/);
    assert.equal(code.match(/if \(seq !== loadSeq\.current\) return;/g)?.length, 1);
    assert.match(code, /<LoadingBlock rows=\{4\} label="Sozlamalar o‘qilmoqda…" \/>/);
  });

  it("time in Asia/Tashkent; links only to tabs the operator can open", () => {
    assert.match(code, /const BUSINESS_TZ = "Asia\/Tashkent";/);
    assert.match(code, /new Intl\.DateTimeFormat\("en-GB", \{\s+timeZone: BUSINESS_TZ,/);
    assert.doesNotMatch(code, /fmtDate|toLocaleString/);
    assert.match(code, /props\.openableTabs\?\.includes\(tab\)/);
    assert.match(app, /<SettingsPage\s+token=\{token\}\s+user=\{user\}\s+permissions=\{permissions\}\s+openableTabs=\{visibleNav\.map\(\(item\) => item\.id\)\}\s+onOpenTab=\{setTab\}/);
    assert.match(nav, /settings: "Admin tizimi konfiguratsiyasi va mavjud qoidalarni ko‘rish\."/);
  });
});

describe("Admin Phase 13.14 Settings — design system and docs", () => {
  it("responsive: two columns on wide screens, one column ≤1280px, stacked rows ≤560px", () => {
    assert.ok(stCss.length > 3000);
    assert.match(stCss, /\.st-sections \{\s+display: grid;\s+grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
    assert.match(stCss, /@media \(max-width: 1280px\) \{\s+\.st-sections \{ grid-template-columns: minmax\(0, 1fr\); \}/);
    assert.match(stCss, /@media \(max-width: 560px\) \{[\s\S]*?\.st-row \{ grid-template-columns: minmax\(0, 1fr\);/);
    assert.match(stCss, /\.st-link:focus-visible \{ outline: 2px solid var\(--vm-brand\);/);
  });

  it("no hardcoded colours, gradients or inline styles", () => {
    assert.doesNotMatch(stCss, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    assert.doesNotMatch(stCss, /gradient/i);
    assert.doesNotMatch(code, /style=\{\{|#[0-9a-f]{6}\b|gradient/i);
  });

  it("Phase 13.14 documented", () => {
    const section = between(docs, "## Phase 13.14 — Sozlamalar", "## Phase 13.13 — Audit");
    assert.match(section, /GET \/api\/cashback\/rules/);
    assert.match(section, /system_settings/);
    assert.match(section, /O‘zgartirish mumkin bo‘lgan sozlama yo‘q/);
    assert.match(section, /DB sxemasi va migratsiyalar o‘zgartirilmadi/);
    assert.match(section, /Backend o‘zgarmadi/);
  });
});
