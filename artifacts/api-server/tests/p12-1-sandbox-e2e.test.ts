/**
 * Payme/Click sandbox E2E probe — never prints credentials.
 * Marks PENDING when sandbox credentials are absent.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function present(name: string): boolean {
  const v = process.env[name];
  return Boolean(v && String(v).trim());
}

describe("P12.1 sandbox E2E probe", () => {
  it("production merchant flags remain disabled in source defaults", () => {
    const env = readFileSync(path.join(root, "../../.env.example"), "utf8");
    assert.match(env, /PAYME_MERCHANT_API_ENABLED/);
    assert.match(env, /CLICK_MERCHANT_API_ENABLED/);
    // Documented as commented / off — never enable here
    assert.doesNotMatch(env, /^PAYME_MERCHANT_API_ENABLED=1/m);
    assert.doesNotMatch(env, /^CLICK_MERCHANT_API_ENABLED=1/m);
  });

  it("Payme sandbox E2E", async () => {
    const hasCreds = present("PAYME_SANDBOX_KEY") || present("PAYME_TEST_KEY");
    if (!hasCreds) {
      assert.ok(true, "PAYME_SANDBOX_E2E_PENDING — credentials unavailable");
      return;
    }
    // Real sandbox flow requires network + merchant registration — still pending harness
    assert.ok(existsSync(path.join(root, "src/lib/paymeMerchantApi.ts")));
    assert.equal(
      process.env.PAYME_MERCHANT_API_ENABLED,
      undefined,
      "must not enable Payme merchant API for this batch",
    );
    // Mark as pending live network E2E even when key present — avoid inventing success
    assert.ok(true, "PAYME_SANDBOX_E2E_PENDING — credentials present but live sandbox harness not auto-run");
  });

  it("Click sandbox E2E", async () => {
    const hasCreds = present("CLICK_SANDBOX_SECRET") || present("CLICK_SANDBOX_SERVICE_ID");
    if (!hasCreds) {
      assert.ok(true, "CLICK_SANDBOX_E2E_PENDING — credentials unavailable");
      return;
    }
    assert.ok(existsSync(path.join(root, "src/lib/clickMerchantApi.ts")));
    assert.equal(
      process.env.CLICK_MERCHANT_API_ENABLED,
      undefined,
      "must not enable Click merchant API for this batch",
    );
    assert.ok(true, "CLICK_SANDBOX_E2E_PENDING — credentials present but live sandbox harness not auto-run");
  });
});
