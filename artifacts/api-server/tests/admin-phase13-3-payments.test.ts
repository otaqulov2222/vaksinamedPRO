/**
 * Admin Phase 13.3 — To‘lovlar operations console.
 * UI composition only: same GET /api/admin/payments, GET /api/admin/payments/intents/:id and
 * POST …/refund contract; refund amount is bounded by the server's refundableAmount.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminWeb = path.resolve(root, "../admin-web/src");
const docs = path.resolve(root, "../../docs");
const page = readFileSync(path.join(adminWeb, "pages/PaymentsPage.tsx"), "utf8");
const adminRoute = readFileSync(path.join(root, "src/routes/admin.ts"), "utf8");
const paymentsRoute = readFileSync(path.join(root, "src/routes/payments.ts"), "utf8");
const adapters = readFileSync(path.join(root, "src/lib/paymentAdapters.ts"), "utf8");
const css = readFileSync(path.join(adminWeb, "styles.css"), "utf8");
const paymentsCss = css.slice(
  css.indexOf("/* ——— Payments — Phase 13.3"),
  css.indexOf("/* ——— Inventory / Ombor"),
);

async function loadUi() {
  return import(pathToFileURL(path.join(adminWeb, "ui.tsx")).href) as Promise<{
    paymentTone: (s: string) => string;
    paymentLabel: (s: string) => string;
  }>;
}

describe("Admin Phase 13.3 Payments — status tone mapping (shared ui.tsx)", () => {
  it("PAID success, PENDING family warning, FAILED danger", async () => {
    const { paymentTone } = await loadUi();
    assert.equal(paymentTone("PAID"), "ok");
    assert.equal(paymentTone("paid"), "ok");
    for (const s of ["PENDING", "pending", "CREATED", "REQUIRES_PAYMENT", "PROCESSING", "awaiting_pos", "pending_keys"]) {
      assert.equal(paymentTone(s), "warn", s);
    }
    assert.equal(paymentTone("FAILED"), "danger");
  });

  it("REFUNDED is neutral (no longer amber) and PARTIALLY_REFUNDED is info", async () => {
    const { paymentTone } = await loadUi();
    assert.equal(paymentTone("REFUNDED"), "neutral");
    assert.equal(paymentTone("refunded"), "neutral");
    assert.equal(paymentTone("PARTIALLY_REFUNDED"), "info");
    assert.equal(paymentTone("partially_refunded"), "info");
    assert.notEqual(paymentTone("REFUNDED"), paymentTone("PENDING"));
  });

  it("every real legacy / intent status has an Uzbek label", async () => {
    const { paymentLabel } = await loadUi();
    const statuses = [
      "pending", "awaiting_pos", "pending_keys", "paid", "refunded", "partially_refunded",
      "CREATED", "REQUIRES_PAYMENT", "PROCESSING", "PAID", "FAILED", "CANCELLED", "EXPIRED",
      "REFUNDED", "PARTIALLY_REFUNDED", "STARTED", "SUCCEEDED",
    ];
    for (const s of statuses) assert.notEqual(paymentLabel(s), s, s);
    assert.equal(paymentLabel("FAILED"), "Amal bajarilmadi");
  });
});

describe("Admin Phase 13.3 Payments — API contract unchanged", () => {
  it("calls only the existing payment endpoints", () => {
    const paths = [...page.matchAll(/[`"](\/api\/[^`"]*)[`"]/g)].map((m) => m[1]);
    assert.deepEqual([...new Set(paths)].sort(), [
      "/api/admin/payments",
      "/api/admin/payments/intents/${intentId}",
      "/api/admin/payments/intents/${intentId}/refund",
    ]);
    assert.match(adminRoute, /router\.get\("\/admin\/payments"/);
    assert.match(paymentsRoute, /router\.get\("\/admin\/payments\/intents\/:id"/);
    assert.match(paymentsRoute, /router\.post\("\/admin\/payments\/intents\/:id\/refund"/);
  });

  it("refund body keeps reason and only adds amount for a partial refund", () => {
    assert.match(page, /const body: \{ reason: string; amount\?: number \} = \{ reason: "admin_refund" \};/);
    assert.match(page, /if \(amount !== refundableAmount\) body\.amount = amount;/);
    assert.match(page, /body: JSON\.stringify\(body\)/);
    assert.match(paymentsRoute, /amount: req\.body\?\.amount != null \? Number\(req\.body\.amount\) : null/);
  });

  it("method labels cover only real provider values", () => {
    const providers = /PaymentProviderName = ([^;]+);/.exec(adapters)?.[1] ?? "";
    const real = [...providers.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]).sort();
    const block = page.slice(page.indexOf("const METHOD_LABELS"), page.indexOf("};", page.indexOf("const METHOD_LABELS")));
    const ui = [...block.matchAll(/^\s+([a-z_]+):/gm)].map((m) => m[1]).sort();
    assert.deepEqual(ui, real);
    assert.doesNotMatch(page, /\b(CASH|CARD|POS): "/);
  });
});

describe("Admin Phase 13.3 Payments — filters are honest", () => {
  it("API has no filters, so status/method/branch refine the loaded list and say so", () => {
    const list = adminRoute.slice(adminRoute.indexOf('router.get("/admin/payments"'));
    assert.doesNotMatch(list.slice(0, list.indexOf("});")), /req\.query/);
    assert.match(page, /"\/api\/admin\/payments"/);
    assert.doesNotMatch(page, /URLSearchParams|qs\.set\(/);
    assert.match(page, /Filtrlar serverdan yuklangan so‘nggi yozuvlarga qo‘llanadi/);
    assert.match(page, /const SERVER_ROW_CAP = 200;/);
    assert.match(adminRoute, /orderBy\(desc\(payments\.id\)\)\.limit\(200\)/);
  });

  it("no invented search or date filters", () => {
    assert.doesNotMatch(page, /type="search"|type="date"|createdFrom|createdTo/);
  });

  it("filter options come from loaded rows and use Uzbek labels", () => {
    assert.match(page, /for \(const r of rows\) if \(r\.status\) set\.add/);
    assert.match(page, /for \(const r of rows\) if \(r\.provider\) set\.add/);
    assert.match(page, /\{paymentLabel\(s\)\}<\/option>/);
    assert.match(page, /\{methodLabel\(p\)\}<\/option>/);
    assert.doesNotMatch(page, /<option[^>]*>\{s\}<\/option>/);
  });

  it("status strip counts only a complete loaded set; capped responses are not totalled", () => {
    assert.match(page, /const healthComplete = rows\.length < SERVER_ROW_CAP;/);
    assert.match(page, /\{healthComplete \? \(/);
    assert.match(page, /umumiy holat bo‘yicha jami hisoblanmaydi/);
    assert.match(page, /!listError && rows\.length > 0 \? \(/);
    const fn = page.slice(page.indexOf("function paymentHealth"), page.indexOf("function Row("));
    assert.match(fn, /paymentTone\(status\) === "ok"/);
    assert.match(fn, /paymentTone\(status\) === "warn"/);
    assert.doesNotMatch(fn, /refunded\.amount|refundedAmount/);
    assert.match(page, /health\.currency \? formatAmount\(amount, health\.currency\) : null/);
  });

  it("empty and filtered-empty copy are distinct", () => {
    assert.match(page, /"Bu filtrlar bo‘yicha to‘lov topilmadi\."\s*:\s*"To‘lovlar mavjud emas\."/);
  });
});

describe("Admin Phase 13.3 Payments — refund capability", () => {
  it("refund is gated by permission, refundable amount and intent status", () => {
    assert.match(page, /const canManage = props\.permissions\.includes\("payments:manage"\);/);
    assert.match(
      page,
      /const canRefund = Boolean\(intent\) && canManage && refundableAmount > 0 && refundStateOk;/,
    );
    assert.match(page, /intentStatus === "PAID" \|\| intentStatus === "PARTIALLY_REFUNDED"/);
    assert.match(page, /Qaytarish uchun ruxsat yo‘q\./);
  });

  it("refund is danger-styled, goes through ConfirmDialog and never uses browser confirm", () => {
    assert.match(page, /<button className="btn-danger" type="button" disabled=\{refundBusy\} onClick=\{openRefundDialog\}>/);
    assert.equal((page.match(/<ConfirmDialog\b/g) || []).length, 1);
    assert.match(page, /onConfirm=\{\(\) => void submitRefund\(\)\}/);
    assert.doesNotMatch(page, /window\.confirm|[^.\w]confirm\(/);
    assert.doesNotMatch(page, /className="btn-primary"/);
  });

  it("amount cannot exceed refundableAmount and must be a positive integer", () => {
    assert.match(page, /if \(amount > refundable\) \{/);
    assert.match(page, /!Number\.isSafeInteger\(amount\) \|\| amount <= 0/);
    assert.match(page, /const \{ amount, error \} = parseRefundAmount\(refundInput, refundableAmount\);\s*if \(error\) \{/);
    assert.match(page, /setRefundInput\(String\(refundableAmount\)\)/);
  });

  it("provider refund is described as not connected — never CONTRACT_PENDING text to operators", () => {
    assert.match(page, /Provayder orqali qaytarish hozircha ulanmagan/);
    assert.match(page, /Cashback avtomatik teskari yozilmaydi\./);
    assert.doesNotMatch(page, />[^<{]*CONTRACT_PENDING/);
    assert.doesNotMatch(page, /provider refund|Provider refund/i);
    assert.doesNotMatch(page, /Pul qaytarildi/);
  });

  it("idempotent replay is reported as such, not as a new refund", () => {
    assert.match(page, /if \(data\?\.idempotent\) \{/);
    assert.match(page, /avval yozilgan — yangi yozuv yaratilmadi/);
  });

  it("refund errors map to Uzbek copy — no raw server messages", () => {
    for (const code of ["NOTHING_TO_REFUND", "REFUND_EXCEEDS_CAPTURE", "CAPTURE_REQUIRED", "INVALID_PAYMENT_TRANSITION", "INVALID_AMOUNT"]) {
      assert.match(page, new RegExp(`code === "${code}"`), code);
    }
    assert.doesNotMatch(page, /err\.message|err instanceof Error \? err/);
  });
});

describe("Admin Phase 13.3 Payments — table and drawer", () => {
  it("table columns come from list fields: identity → money → status → method → branch", () => {
    const head = page.slice(page.indexOf("<thead>"), page.indexOf("</thead>"));
    const cols = [...head.matchAll(/<th[^>]*>([^<]+)<\/th>/g)].map((m) => m[1]);
    assert.deepEqual(cols, ["Buyurtma", "Summa", "Holat", "Usul", "Filial"]);
    assert.match(head, /<th className="num">Summa<\/th>/);
    assert.match(page, /className="num payments-amount"/);
    assert.doesNotMatch(head, /Mijoz|Sana|Yaratilgan/);
  });

  it("order code is the primary identifier; payment row id is secondary", () => {
    assert.match(page, /<div className="payments-code">\s*\{item\.orderId != null \? `Buyurtma #\$\{item\.orderId\}` : "—"\}/);
    assert.match(page, /<div className="payments-sub">\s*To‘lov #\{item\.id\}/);
  });

  it("row opens the drawer by click and keyboard", () => {
    assert.match(page, /className=\{`payments-row/);
    assert.match(page, /tabIndex=\{0\}/);
    assert.match(page, /e\.key === "Enter" \|\| e\.key === " "/);
    assert.match(page, /onClick=\{\(\) => openRow\(item\)\}/);
  });

  it("drawer sections: Buyurtma → To‘lov → Urinishlar → Qabul qilish → Qaytarish → technical", () => {
    const body = page.slice(page.indexOf("{intent ? ("));
    const order = ["Buyurtma", "To‘lov", "Urinishlar", "Qabul qilish", "Qaytarish"].map((t) =>
      body.indexOf(`<DrawerSection title="${t}">`),
    );
    order.forEach((i) => assert.ok(i > 0));
    assert.deepEqual([...order].sort((a, b) => a - b), order);
    assert.ok(body.indexOf("Texnik ma’lumotlar") > order[order.length - 1]);
  });

  it("technical metadata is collapsed and holds the technical ids", () => {
    assert.match(page, /<details className="payments-tech">\s*<summary>Texnik ma’lumotlar<\/summary>/);
    assert.doesNotMatch(page, /<details className="payments-tech" open/);
    const body = page.slice(page.indexOf("{intent ? ("));
    const tech = body.indexOf("Texnik ma’lumotlar");
    assert.ok(tech > 0);
    for (const label of ["To‘lov niyati", "Merchant", "Tashqi havola", "Qabul qilish yozuvi"]) {
      assert.ok(body.indexOf(`label="${label}"`) > tech, `${label} must stay inside technical details`);
    }
    const head = page.slice(page.indexOf("<thead>"), page.indexOf("</thead>"));
    assert.doesNotMatch(head, /Merchant|externalId|Intent/);
  });

  it("attempts are a compact list — no raw JSON", () => {
    assert.match(page, /<ol className="payments-attempts">/);
    assert.doesNotMatch(page, /JSON\.stringify\((a|r|snapshot|intent|data)\b/);
    assert.doesNotMatch(page, /<pre\b/);
  });

  it("fulfillment is not mixed into payment status", () => {
    assert.doesNotMatch(page, /fulfillmentStatus|fulfillmentLabel/);
    assert.match(page, /bu yerda faqat to‘lov holati/);
  });

  it("no secret fields and no invented metrics", () => {
    assert.doesNotMatch(page, /secret|password|apiKey|api_key|merchantKey|merchant_key|credential/i);
    assert.doesNotMatch(page, /StatCard|MetricStrip|success rate|revenue|Daromad/i);
  });

  it("stale responses cannot overwrite newer list or detail state", () => {
    assert.match(page, /if \(seq !== listSeq\.current\) return;/);
    assert.match(page, /if \(seq !== detailSeq\.current\) return;/);
  });

  it("focus / Escape come from shared DetailDrawer + ConfirmDialog", () => {
    assert.match(page, /<DetailDrawer/);
    assert.doesNotMatch(page, /e\.key === "Escape"|role="dialog"|aria-modal|addEventListener\("keydown"/);
  });
});

describe("Admin Phase 13.3 Payments — CSS", () => {
  it("has its own token-only slice", () => {
    assert.ok(paymentsCss.length > 500);
    assert.doesNotMatch(paymentsCss, /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
    assert.doesNotMatch(paymentsCss, /gradient|backdrop-filter/);
  });

  it("only the table scrolls horizontally; mobile rules exist", () => {
    assert.match(paymentsCss, /\.payments-page \{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
    assert.match(paymentsCss, /\.payments-surface \.table-wrap \{[^}]*position: relative/);
    assert.match(paymentsCss, /\.payments-surface \.table \{ min-width: \d+px; \}/);
    assert.match(paymentsCss, /\.payments-surface\.is-empty \.table \{ min-width: 0; \}/);
    assert.match(paymentsCss, /@media \(max-width: 768px\)/);
    assert.match(paymentsCss, /@media \(max-width: 480px\)/);
  });

  it("narrow screens drop the branch column into the identity cell; phones get stacked rows", () => {
    assert.match(paymentsCss, /@media \(max-width: 1100px\) \{[^}]*\.payments-cell-branch \{ display: none; \}/);
    assert.match(paymentsCss, /grid-template-areas: "id amount" "method status" "branch branch";/);
    assert.match(paymentsCss, /\.payments-surface thead \{ display: none; \}/);
  });

  it("legacy 12.14 Payments rules are gone, shared crm note stays", () => {
    assert.doesNotMatch(css, /Payments \(Phase 12\.14/);
    assert.match(css, /\.crm-controls-note \{/);
    assert.doesNotMatch(page, /crm-/);
  });
});

describe("Admin Phase 13.3 Payments — docs", () => {
  it("implementation status documents Phase 13.3", () => {
    assert.match(readFileSync(path.join(docs, "ADMIN_IMPLEMENTATION_STATUS.md"), "utf8"), /Phase 13\.3 — To‘lovlar/);
  });
});
