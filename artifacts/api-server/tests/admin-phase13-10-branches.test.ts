/**
 * Admin Phase 13.10 / 13.10.1 — Filiallar branch network console with full CRUD.
 *   GET    /admin/branches      (branches:read; full list in one response)
 *   POST   /admin/branches      (branches:manage + HQ; validated; seeds 0-stock rows; audit branch.create)
 *   PATCH  /admin/branches/:id  (branches:manage + assertBranchScope; validated; masked secrets never overwrite)
 *   DELETE /admin/branches/:id  (branches:manage + HQ; refused with 409 while any record references the branch)
 * No DB schema / migration change.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { branchInUseMessage, parseBranchInput } from "../src/lib/adminBranches";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(root, "../..");
const adminWeb = path.resolve(root, "../admin-web/src");
const docs = path.resolve(repoRoot, "docs");
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const page = read(path.join(adminWeb, "pages/BranchesPage.tsx"));
const code = page.replace(/^\s*\/\/.*$/gm, "");
const app = read(path.join(adminWeb, "App.tsx"));
const nav = read(path.join(adminWeb, "nav.ts"));
const adminRoute = read(path.join(root, "src/routes/admin.ts"));
const paymentDto = read(path.join(root, "src/lib/branchPaymentMerchant.ts"));
const rbac = read(path.join(root, "src/lib/rbac.ts"));
const schema = read(path.join(repoRoot, "lib/db/src/schema/branches.ts"));
const rbacMigration = read(path.join(repoRoot, "lib/db/migrations/0001_sessions_rbac.sql"));
const css = read(path.join(adminWeb, "styles.css"));
const bsCss = css.slice(
  css.indexOf("/* ——— Branches / Filiallar — Phase 13.10"),
  css.indexOf("/* ——— Delivery / Yetkazib berish (Phase 12.18)"),
);

function between(src: string, start: string, end: string) {
  const a = src.indexOf(start);
  assert.ok(a >= 0, start);
  const b = src.indexOf(end, a + start.length);
  assert.ok(b > a, end);
  return src.slice(a, b);
}

const listRoute = between(adminRoute, 'router.get("/admin/branches", ', "\nrouter.");
const createRoute = between(adminRoute, 'router.post("/admin/branches", ', "\nrouter.");
const patchRoute = between(adminRoute, 'router.patch("/admin/branches/:id", ', "\nrouter.");
const deleteRoute = between(adminRoute, 'router.delete("/admin/branches/:id", ', "\nrouter.");
const hqGuard = between(adminRoute, "async function requireHqBranchManager(", "\n}\n");
const schemaFields = new Set([...schema.matchAll(/^ {2}(\w+): \w+\(/gm)].map((m) => m[1]));

const validBranch = {
  code: "VM-900",
  name: "Vaksina Med · Test",
  region: "Samarqand",
  address: "Registon ko‘chasi 1",
  phone: "+998 66 123-45-67",
  lat: 39.65,
  lng: 66.97,
};

describe("Admin Phase 13.10 Branches — backend contract", () => {
  it("GET: branches:read before DB, full list, secrets via masked payment DTO", () => {
    const perm = listRoute.indexOf('requirePermission(user, "branches:read")');
    assert.ok(perm > 0);
    assert.ok(perm < listRoute.indexOf("db."), "permission check precedes DB access");
    assert.match(listRoute, /\.\.\.toAdminBranchPaymentDto\(item\)/);
    assert.match(paymentDto, /hasPayme/);
    assert.match(paymentDto, /hasClick/);
  });

  it("create/delete are HQ-only: branches:manage AND HQ role, denial audited", () => {
    assert.match(hqGuard, /await requirePermission\(user, "branches:manage"\);/);
    assert.match(hqGuard, /if \(!isHqAdminRole\(user\.role\)\) \{/);
    assert.match(hqGuard, /reason: "hq_required"/);
    assert.match(hqGuard, /status: 403/);
    assert.match(createRoute, /const user = await requireHqBranchManager\(req\);/);
    assert.match(deleteRoute, /const user = await requireHqBranchManager\(req\);/);
    assert.doesNotMatch(adminRoute, /router\.put\("\/admin\/branches/);
  });

  it("POST: validated input, unique code (409), encrypted secrets, 0-stock rows in one transaction, audit", () => {
    assert.match(createRoute, /parseBranchInput\(body, "create"\)/);
    assert.match(createRoute, /throw branchValidationError\(parsed\.message\)/);
    assert.ok(createRoute.indexOf("branchCodeTakenError()") < createRoute.indexOf("db.transaction"));
    assert.match(createRoute, /isUniqueViolation\(error\)\) throw branchCodeTakenError\(\)/);
    assert.match(createRoute, /body\.paymeKey !== "••••" && body\.paymeKey\.trim\(\)/);
    assert.match(createRoute, /prepareMerchantSecretForStorage\(/);
    assert.match(createRoute, /productId: p\.id, branchId: rows\[0\]\.id, quantity: 0/);
    assert.match(createRoute, /action: "branch\.create"/);
    assert.doesNotMatch(between(createRoute, "payload: JSON.stringify({", "}),"), /paymeKey,|clickSecret,|paymeKey:|clickSecret:/);
    assert.match(createRoute, /res\.status\(201\)/);
  });

  it("PATCH: scope before DB, 404, validated, code uniqueness, mask guard, audit field names only", () => {
    const perm = patchRoute.indexOf('requirePermission(user, "branches:manage")');
    const scope = patchRoute.indexOf("assertBranchScope(user, id)");
    assert.ok(perm > 0 && scope > perm && scope < patchRoute.indexOf("db."));
    assert.match(patchRoute, /status\(404\)\.json\(\{ message: "Filial topilmadi" \}\)/);
    assert.match(patchRoute, /parseBranchInput\(body, "update"\)/);
    assert.match(patchRoute, /and\(eq\(branches\.code, changes\.code\), ne\(branches\.id, id\)\)/);
    assert.match(patchRoute, /if \(typeof body\.paymeKey === "string" && body\.paymeKey !== "••••" && body\.paymeKey\.trim\(\)\)/);
    assert.match(patchRoute, /if \(typeof body\.clickSecret === "string" && body\.clickSecret !== "••••" && body\.clickSecret\.trim\(\)\)/);
    const audit = between(patchRoute, "payload: JSON.stringify({", "}),");
    assert.match(audit, /fields: changedFields/);
    assert.match(audit, /paymeCredentialUpdated: nextPaymeKey !== current\.paymeKey/);
    assert.doesNotMatch(audit, /body\.|paymeKey:|clickSecret:/);
  });

  it("DELETE: 404, refuses with 409 BRANCH_IN_USE while any linked record exists, then cleans up atomically", () => {
    assert.match(deleteRoute, /status\(404\)\.json\(\{ message: "Filial topilmadi" \}\)/);
    for (const table of ["orders", "posSales", "payments", "paymentIntents", "reservations", "inventoryMovements", "adminUsers", "staffRatings", "fomSaleEvents"]) {
      assert.match(deleteRoute, new RegExp(`eq\\(${table}\\.branchId, id\\)`), table);
    }
    assert.match(deleteRoute, /eq\(deliveries\.courierBranchId, id\)/);
    assert.match(deleteRoute, /gt\(productStocks\.quantity, 0\), gt\(productStocks\.physicalQuantity, 0\), gt\(productStocks\.reservedQuantity, 0\)/);
    assert.match(deleteRoute, /status: 409, code: "BRANCH_IN_USE"/);
    const tx = between(deleteRoute, "await db.transaction(", "});");
    assert.ok(deleteRoute.indexOf("BRANCH_IN_USE") < deleteRoute.indexOf("await db.transaction("));
    assert.match(tx, /tx\.delete\(productStocks\)\.where\(eq\(productStocks\.branchId, id\)\)/);
    assert.match(tx, /tx\.update\(carts\)\.set\(\{ branchId: null \}\)/);
    assert.match(tx, /tx\.delete\(branches\)\.where\(eq\(branches\.id, id\)\)/);
    assert.match(deleteRoute, /action: "branch\.delete"/);
  });

  it("permissions unchanged: both codes HQ-only in fallback and seeded grants; nav gated by branches:read", () => {
    const hqFallback = rbac.slice(rbac.indexOf("? new Set(["), rbac.indexOf(": new Set(["));
    assert.match(hqFallback, /"branches:read"/);
    assert.match(hqFallback, /"branches:manage"/);
    const cashierFallback = rbac.slice(rbac.indexOf(": new Set(["), rbac.indexOf("]);", rbac.indexOf(": new Set([")));
    assert.doesNotMatch(cashierFallback, /branches:/);
    const cashierGrant = between(rbacMigration, "JOIN auth_permissions p ON p.code IN (", "WHERE r.code = 'cashier'");
    assert.doesNotMatch(cashierGrant, /branches:/);
    assert.match(nav, /\{ id: "branches", label: "Filiallar", permission: "branches:read"/);
  });
});

describe("Admin Phase 13.10 Branches — server validation (parseBranchInput)", () => {
  it("create: accepts a complete branch and fills honest defaults", () => {
    const r = parseBranchInput(validBranch, "create");
    assert.ok(r.ok);
    assert.equal(r.values.city, "Samarqand");
    assert.equal(r.values.isOpen, true);
    assert.equal(r.values.is24h, false);
    assert.equal(r.values.hours, "08:00 — 22:00");
    const h24 = parseBranchInput({ ...validBranch, is24h: true }, "create");
    assert.ok(h24.ok && h24.values.hours === "24/7");
  });

  it("create: every required field is enforced", () => {
    for (const key of ["code", "name", "region", "address", "phone", "lat", "lng"] as const) {
      const body: Record<string, unknown> = { ...validBranch };
      delete body[key];
      const r = parseBranchInput(body, "create");
      assert.equal(r.ok, false, key);
    }
    const blank = parseBranchInput({ ...validBranch, name: "   " }, "create");
    assert.deepEqual(blank, { ok: false, message: "Nomi majburiy." });
  });

  it("rejects malformed code, phone, coordinates, booleans and over-long text", () => {
    assert.equal(parseBranchInput({ ...validBranch, code: "VM 900" }, "create").ok, false);
    assert.equal(parseBranchInput({ ...validBranch, code: "Ф-1" }, "create").ok, false);
    assert.equal(parseBranchInput({ ...validBranch, phone: "call me" }, "create").ok, false);
    assert.equal(parseBranchInput({ ...validBranch, lat: 91 }, "create").ok, false);
    assert.equal(parseBranchInput({ ...validBranch, lng: "66.9" }, "create").ok, false);
    assert.equal(parseBranchInput({ ...validBranch, lat: Number.NaN }, "create").ok, false);
    assert.equal(parseBranchInput({ ...validBranch, isOpen: "yes" }, "create").ok, false);
    assert.equal(parseBranchInput({ ...validBranch, name: "x".repeat(121) }, "create").ok, false);
    assert.equal(parseBranchInput({ name: 5 }, "update").ok, false);
  });

  it("update: only present keys are validated and returned; values are trimmed", () => {
    const r = parseBranchInput({ hours: "  09:00 — 21:00 ", isOpen: false }, "update");
    assert.deepEqual(r, { ok: true, values: { hours: "09:00 — 21:00", isOpen: false } });
    assert.deepEqual(parseBranchInput({}, "update"), { ok: true, values: {} });
    assert.equal(parseBranchInput({ code: "" }, "update").ok, false);
  });

  it("never touches secrets (route handles them) and ignores unknown keys", () => {
    const r = parseBranchInput({ ...validBranch, paymeKey: "s3cret", clickSecret: "x", id: 7, createdAt: "now" }, "create");
    assert.ok(r.ok);
    assert.equal("paymeKey" in r.values || "clickSecret" in r.values || "id" in r.values || "createdAt" in r.values, false);
  });

  it("in-use message lists only blocking references", () => {
    assert.equal(
      branchInUseMessage([{ label: "buyurtma", count: 3 }, { label: "xodim", count: 0 }, { label: "kassa sotuvi", count: 1 }]),
      "Filialni o‘chirib bo‘lmaydi: unga 3 ta buyurtma, 1 ta kassa sotuvi bog‘langan. Uning o‘rniga filialni yoping.",
    );
  });
});

describe("Admin Phase 13.10 Branches — page composition", () => {
  it("title, description and mode line follow real capabilities", () => {
    assert.match(page, /title="Filiallar"/);
    assert.match(page, /description=\{PAGE_DESCRIPTIONS\.branches\}/);
    assert.match(nav, /branches: "Filiallar tarmog‘ini boshqarish: yangi filial qo‘shish, ish holati, manzil va aloqa ma’lumotlarini tahrirlash\."/);
    assert.match(page, /"Qo‘shish, tahrirlash va o‘chirish mumkin"/);
    assert.match(page, /"Faqat o‘z filialingizni tahrirlash mumkin"/);
    assert.match(page, /"Faqat ko‘rish — tahrirlash uchun ruxsat yo‘q"/);
  });

  it("write UI follows server rules: edit = branches:manage; create/delete = branches:manage + HQ", () => {
    assert.match(page, /const canManage = props\.permissions\.includes\("branches:manage"\);/);
    assert.match(page, /const isHq = Boolean\(props\.user && isHqRole\(props\.user\.role\)\);/);
    assert.match(page, /const canCreateDelete = canManage && isHq;/);
    assert.match(page, /\{canCreateDelete \? \(\n\s*<button className="btn-primary bs-create"/);
    assert.match(page, /if \(!canCreateDelete\) return;/);
    assert.match(page, /if \(!canCreateDelete \|\| !branch\) return;/);
    assert.match(page, /if \(!branch \|\| !canManage\) return;/);
    assert.match(page, /\{canManage \? <th className="bs-col-actions">/);
  });

  it("requests: one list GET plus POST / PATCH / DELETE to the real routes only (no N+1)", () => {
    const calls = [...page.matchAll(/request\(\s*[`"]([^`"]+)[`"]/g)].map((m) => m[1]);
    assert.deepEqual(calls, ["/api/admin/branches", "/api/admin/branches", "/api/admin/branches/${editor.id}", "/api/admin/branches/${target.id}"]);
    assert.match(page, /method: "POST",\n\s*body: JSON\.stringify\(pending\.body\)/);
    assert.match(page, /method: "PATCH",\n\s*body: JSON\.stringify\(pending\.body\)/);
    assert.match(page, /\{ method: "DELETE" \}/);
    assert.match(page, /branches\.find\(\(b\) => Number\(b\.id\) === selectedId\)/);
    assert.doesNotMatch(page, /Promise\.all\(|\/api\/admin\/(orders|inventory|products|payments|pos)/);
  });

  it("edit sends changed fields only; secrets never seeded and MASK never sent", () => {
    assert.match(page, /const MASK = "••••";/);
    assert.match(page, /form\.paymeKey = "";\n\s*form\.clickSecret = "";/);
    assert.doesNotMatch(code, /(branch|selected|item|current|editing)\??\.(paymeKey|clickSecret)/);
    assert.match(page, /if \(!current \|\| next !== String\(current\?\.\[f\.key\] \?\? ""\)\) \{/);
    assert.match(page, /if \(paymeKey && paymeKey !== MASK\) \{/);
    assert.match(page, /if \(clickSecret && clickSecret !== MASK\) \{/);
    assert.match(page, /setFormMsg\("O‘zgarish yo‘q\."\)/);
    const editable = [...between(page, "const TEXT_FIELDS", "];").matchAll(/key: "(\w+)"/g)].map((m) => m[1]);
    assert.deepEqual(editable, ["code", "name", "region", "city", "district", "address", "phone", "hours", "paymeMerchantId", "clickMerchantId", "clickServiceId"]);
  });

  it("client validation mirrors the server rules", () => {
    const client = between(page, "function validateForm(", "\n}\n");
    assert.match(page, /const CODE_PATTERN = \/\^\[A-Za-z0-9\]\[A-Za-z0-9_-\]\{1,31\}\$\/;/);
    assert.match(page, /const PHONE_PATTERN = \/\^\\\+\?\[0-9\]\[0-9 \(\)-\]\{6,24\}\$\/;/);
    for (const msg of ["Kod majburiy.", "Nomi majburiy.", "Hudud majburiy.", "Manzil majburiy.", "Telefon majburiy."]) {
      assert.ok(client.includes(msg), msg);
    }
    assert.match(client, /Math\.abs\(lat\) > 90/);
    assert.match(client, /Math\.abs\(lng\) > 180/);
  });

  it("save: ConfirmDialog → API → feedback → reload → shell branch list refreshed", () => {
    const save = between(page, "async function saveConfirmed()", "\n  }\n");
    assert.ok(save.indexOf('method: "POST"') < save.indexOf('text: "Filial yaratildi."'));
    assert.ok(save.indexOf('text: "Filial yaratildi."') < save.indexOf("await load()"));
    assert.ok(save.indexOf('method: "PATCH"') < save.indexOf('text: "Filial yangilandi."'));
    assert.match(save, /props\.onBranchesChanged\?\.\(\);/);
    assert.match(save, /setFormMsg\(saveError\(err\)\)/);
    assert.match(page, /danger=\{Boolean\(pending\?\.openChanged && !form\.isOpen\)\}/);
    assert.match(page, /Filial yopiladi: ilovada savatga tanlab bo‘lmaydi va unda yangi buyurtma yaratilmaydi\./);
    assert.match(app, /onBranchesChanged=\{\(\) => \{\n\s*void softRequest\("\/api\/admin\/branches", token\)\.then\(\(b\) => setBranches\(b\?\.branches \|\| \[\]\)\);/);
    assert.doesNotMatch(page, /window\.confirm|\bconfirm\(/);
  });

  it("delete: danger ConfirmDialog, in-use refusal shown in the drawer with a close-branch path", () => {
    const del = between(page, "async function deleteConfirmed()", "\n  }\n");
    assert.match(page, /title="Filialni o‘chirish"\n\s*danger\n/);
    assert.match(page, /Bu amalni qaytarib bo‘lmaydi\./);
    assert.ok(del.indexOf('method: "DELETE"') < del.indexOf("o‘chirildi."));
    assert.match(del, /props\.onBranchesChanged\?\.\(\);/);
    assert.match(del, /setDrawerMsg\(text\)/);
    assert.match(page, /startEdit\(selected, \{ isOpen: false \}\)/);
    assert.match(page, /Filialni yopish/);
  });

  it("only server texts with known branch codes are shown; everything else is fixed copy", () => {
    assert.match(page, /const CURATED_CODES = new Set\(\["BRANCH_INVALID", "BRANCH_CODE_TAKEN", "BRANCH_IN_USE"\]\);/);
    assert.match(page, /return e && e\.code && CURATED_CODES\.has\(e\.code\) \? e\.message : null;/);
    const reads = [...code.matchAll(/\b(\w+)\.message\b/g)].map((m) => m[1]);
    assert.deepEqual(reads, ["e", "error"], "only curatedText and the fixed LoadError copy");
    assert.doesNotMatch(page, /err\.message|err instanceof Error|data\.message/);
  });

  it("search on Enter, client-side filters over real fields, disclosed; no pagination", () => {
    assert.match(page, /<form className="bs-search" role="search" onSubmit=\{applySearch\}>/);
    assert.match(page, /setAppliedQuery\(query\.trim\(\)\)/);
    assert.match(page, /statusFilter === "closed" && item\.isOpen/);
    assert.match(page, /modeFilter === "24h" && !item\.is24h/);
    assert.match(page, /Sahifalash yo‘q\./);
    assert.doesNotMatch(page, /PaginationBar|offset|limit=/);
  });

  it("KPIs are counts of the full loaded list only", () => {
    const strip = between(page, "<MetricStrip", "/>");
    const labels = [...strip.matchAll(/label: "([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(labels, ["Jami filiallar", "Ochiq", "Yopiq", "24/7", "Hududlar"]);
    assert.doesNotMatch(strip, /savdo|tushum|qoldiq|reyting|so‘m|money\(/i);
  });

  it("table: Filial → Holat → Manzil → Ish vaqti → Aloqa (+ actions for managers)", () => {
    const head = between(page, "<thead>", "</thead>");
    const order = ["Filial</th>", "Holat</th>", "Manzil</th>", "Ish vaqti</th>", "Aloqa</th>", "Amallar"].map((s) => head.indexOf(s));
    assert.ok(order.every((i, n) => i > 0 && (n === 0 || i > order[n - 1])));
    assert.match(page, /const columns = BASE_COLUMNS \+ \(canManage \? 1 : 0\);/);
    assert.match(page, /aria-label=\{`\$\{item\.name\} — tahrirlash`\}/);
    assert.match(page, /aria-label=\{`\$\{item\.name\} — o‘chirish`\}/);
    assert.match(page, /e\.stopPropagation\(\);/);
    assert.match(page, /if \(e\.target !== e\.currentTarget\) return;/);
  });

  it("no invented fields: every branch field read by the page exists in the schema or payment DTO", () => {
    const used = new Set([...code.matchAll(/(?<![.\w])(?:item|selected|branch|current|deleteTarget|target)\??\.(\w+)/g)].map((m) => m[1]));
    const allowed = new Set([...schemaFields, "hasPayme", "hasClick"]);
    assert.deepEqual([...used].filter((f) => !allowed.has(f)), []);
  });

  it("drawer view sections in order, technical collapsed", () => {
    const view = between(page, "{selected && !editor ? (", "{editor && (creating || editing) ? (");
    const sections = [...view.matchAll(/<DrawerSection title="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(sections, ["Filial", "Holat", "Manzil", "Ish vaqti", "Aloqa", "Koordinata", "Onlayn to‘lov", "Bog‘liq bo‘limlar"]);
    assert.doesNotMatch(page, /<details className="bs-tech" open/);
    assert.match(view, /target="_blank" rel="noopener noreferrer"/);
  });

  it("states: loading / empty / filtered empty / 401 / 403 / failed; retry only on failure", () => {
    assert.match(page, /bs-skeleton-row/);
    assert.match(page, /"Filiallar mavjud emas\."/);
    assert.match(page, /"Tanlangan shartlar bo‘yicha filial topilmadi\."/);
    assert.match(page, /Sessiya tugagan\. Qayta kiring\./);
    assert.match(page, /"Bu bo‘limni ko‘rish uchun ruxsat yo‘q\."/);
    assert.match(page, /onRetry=\{error\.kind === "failed" \? /);
  });

  it("race protection and keyboard/focus via shared primitives", () => {
    assert.match(page, /const seq = \+\+listSeq\.current;/);
    assert.equal((page.match(/seq !== listSeq\.current\) return;/g) || []).length, 2);
    assert.match(page, /tabIndex=\{0\}/);
    assert.match(page, /e\.key === "Enter" \|\| e\.key === " "/);
    assert.doesNotMatch(page, /addEventListener\("keydown"|useModalFocus|role="dialog"/);
  });

  it("no secrets, tokens or storage in the page; secret inputs are write-only", () => {
    const stripped = code.replace(/props\.token/g, "").replace(/token: string;/, "");
    assert.doesNotMatch(stripped, /token|hmac|otp\b|apiKey|localStorage|sessionStorage|console\./i);
    assert.equal((page.match(/type="password"/g) || []).length, 2);
    assert.equal((page.match(/autoComplete="new-password"/g) || []).length, 2);
  });
});

describe("Admin Phase 13.10 Branches — responsive + docs", () => {
  it("hours hidden ≤1100px, phone ≤900px, cards ≤560px (actions in card), tokens only", () => {
    assert.ok(bsCss.length > 1000);
    assert.match(bsCss, /@media \(max-width: 1100px\) \{[\s\S]*?\.bs-surface \.bs-col-hours \{ display: none; \}/);
    assert.match(bsCss, /@media \(max-width: 900px\) \{[\s\S]*?\.bs-surface \.bs-col-phone \{ display: none; \}/);
    assert.match(bsCss, /@media \(max-width: 560px\) \{[\s\S]*?grid-template-areas: "main status" "place place";/);
    assert.match(bsCss, /\.bs-surface\.has-actions tr\.bs-row \{ grid-template-areas: "main status" "place actions"; \}/);
    assert.match(bsCss, /\.bs-col-actions,\n\.bs-cell-actions \{/);
    assert.doesNotMatch(bsCss, /#[0-9a-fA-F]{3,8}\b|rgba?\(|gradient/);
  });

  it("docs record Phase 13.10.1 CRUD and the schema staying unchanged", () => {
    const status = read(path.join(docs, "ADMIN_IMPLEMENTATION_STATUS.md"));
    const section = between(status, "## Phase 13.10 — Filiallar", "## Phase 13.9");
    assert.match(section, /13\.10\.1/);
    assert.match(section, /POST \/admin\/branches/);
    assert.match(section, /DELETE \/admin\/branches\/:id/);
    assert.match(section, /DB sxemasi va migratsiyalar o‘zgartirilmadi/);
  });
});
