/**
 * Admin Phase 2 — HIGH hardening contracts (POS UX, dashboard SoT, customers pagination/PII).
 * Does not change cashback engine math.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { maskAdminPhone, toAdminCustomerListItem } from "../src/lib/securityEnv.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminWeb = path.resolve(root, "../admin-web/src");

describe("Admin Phase 2 HIGH hardening", () => {
  it("1. POS UI maxSpend comes from preview — not min(balance, amount)", () => {
    const pos = readFileSync(path.join(adminWeb, "PosTerminal.tsx"), "utf8");
    assert.match(pos, /preview\.maxSpend|preview\?\.maxSpend/);
    assert.doesNotMatch(pos, /Math\.min\(customer\.balance,\s*Math\.floor\(Number\(amount\)/);
    assert.doesNotMatch(pos, />50%</);
    assert.match(pos, /Maks \$\{maxSpendPercent\}%|Maks \$\{maxSpendPercent\}|Server limiti \$\{maxSpendPercent\}%|spendLabel/);
  });

  it("2. server POS preview still exposes maxSpend + maxSpendRatio (authoritative)", () => {
    const pos = readFileSync(path.join(root, "src/lib/pos.ts"), "utf8");
    assert.match(pos, /maxSpend:\s*calc\.maxSpend/);
    assert.match(pos, /maxSpendRatio:\s*calc\.maxSpendRatio/);
    assert.match(pos, /getMaxSpendRatio/);
    assert.match(pos, /getAuthoritativeBalance/);
  });

  it("3. dashboard cashback uses cashback_accounts aggregate", () => {
    const admin = readFileSync(path.join(root, "src/routes/admin.ts"), "utf8");
    assert.match(admin, /cashbackAccounts/);
    assert.match(admin, /sum\(\$\{cashbackAccounts\.balance\}\)/);
    assert.match(admin, /cashbackSource:\s*"cashback_accounts"/);
    assert.doesNotMatch(
      admin,
      /cashback:\s*allCustomers\.reduce|customers\.reduce\(\(sum.*balance/,
    );
  });

  it("4. dashboard uses bounded aggregation — no full-table load into memory", () => {
    const admin = readFileSync(path.join(root, "src/routes/admin.ts"), "utf8");
    assert.match(admin, /\/admin\/dashboard/);
    assert.doesNotMatch(admin, /const allOrders = await db\.select\(\)\.from\(orders\)/);
    assert.doesNotMatch(admin, /const allCustomers = await db\.select\(\)\.from\(customers\)/);
    assert.match(admin, /\.limit\(8\)/);
    assert.match(admin, /count\(\)/);
  });

  it("5–7. customers API paginated with max limit + SoT cashback join", () => {
    const admin = readFileSync(path.join(root, "src/routes/admin.ts"), "utf8");
    assert.match(admin, /ADMIN_CUSTOMERS_MAX_LIMIT\s*=\s*50/);
    assert.match(admin, /ADMIN_CUSTOMERS_DEFAULT_LIMIT\s*=\s*25/);
    assert.match(admin, /leftJoin\(cashbackAccounts/);
    assert.match(admin, /toAdminCustomerListItem/);
    assert.match(admin, /\.limit\(limit\)/);
    assert.match(admin, /\.offset\(offset\)/);
  });

  it("8. customer list PII minimized — masked phone, no password, cashbackBalance field", () => {
    const item = toAdminCustomerListItem({
      id: 1,
      firstName: "A",
      lastName: "B",
      phone: "+998 90 123 45 67",
      tier: "Gold",
      purchasesCount: 3,
      cashbackBalance: 12500,
    });
    assert.equal(item.cashbackBalance, 12500);
    assert.equal("phone" in item, false);
    assert.match(item.phoneMasked, /\*\*\*/);
    assert.doesNotMatch(item.phoneMasked, /12345/);
    assert.equal(maskAdminPhone("+998901234567").includes("***"), true);
  });

  it("9. customers route still requires customers:read", () => {
    const admin = readFileSync(path.join(root, "src/routes/admin.ts"), "utf8");
    assert.match(admin, /\/admin\/customers[\s\S]*?requirePermission\(user,\s*"customers:read"\)/);
  });

  it("10. cashback engine writers unchanged (earn/use/reversal + 0.3)", () => {
    const finance = readFileSync(path.join(root, "src/lib/cashbackFinance.ts"), "utf8");
    assert.match(finance, /export async function earnCashback/);
    assert.match(finance, /export async function useCashback/);
    assert.match(finance, /export async function reverseCashbackEntry/);
    const cashback = readFileSync(path.join(root, "src/lib/cashback.ts"), "utf8");
    assert.match(cashback, /DEFAULT_MAX_SPEND_RATIO\s*=\s*0\.3/);
  });

  it("admin customers UI uses cashbackBalance + phoneMasked + pagination", () => {
    const customers = readFileSync(path.join(adminWeb, "pages/CustomersPage.tsx"), "utf8");
    assert.match(customers, /cashbackBalance/);
    assert.match(customers, /phoneMasked/);
    assert.match(customers, /CUSTOMER_PAGE|limit.*25|offset/);
    assert.doesNotMatch(customers, /money\(item\.balance\)/);
  });
});
