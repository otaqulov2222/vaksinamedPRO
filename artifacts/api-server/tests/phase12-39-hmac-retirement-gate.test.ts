/**
 * Phase 12.39 — HMAC legacy auth retirement operational gate.
 * Does not disable dual-accept. Does not invent telemetry / quiet period / population.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.resolve(apiRoot, "../..");
const matrix = path.join(repo, "docs/PRODUCTION_GAP_MATRIX.md");
const runbook = path.join(repo, "docs/PRODUCTION_OPS_RUNBOOK.md");
const finalDoc = path.join(repo, "docs/FINAL_PRODUCTION_CLOSURE.md");
const followup = path.join(repo, "docs/PHASE_3_3_P12_1_SECRETS_HMAC_FOLLOWUP.md");

describe("Phase 12.39 — HMAC legacy retirement operational gate", () => {
  it("gap matrix records 12.39; retirement OPS_REQUIRED; telemetry/quiet/population NOT_PROVEN", () => {
    assert.ok(existsSync(matrix));
    const doc = readFileSync(matrix, "utf8");
    assert.match(doc, /Phase 12\.39/);
    assert.match(doc, /HMAC legacy auth retirement/);
    assert.match(doc, /LEGACY_HMAC_USAGE_TELEMETRY[\s\S]{0,40}NOT_PROVEN/);
    assert.match(doc, /MOBILE_S1_POPULATION_PROOF[\s\S]{0,40}NOT_PROVEN/);
    assert.match(doc, /HMAC_QUIET_PERIOD[\s\S]{0,40}NOT_PROVEN/);
    assert.match(doc, /UNUSED\s*\/\s*DEPRECATED|UNUSED \/ DEPRECATED/);
    assert.match(doc, /HMAC RETIREMENT GATE[\s\S]{0,80}OPS_REQUIRED/);
    assert.doesNotMatch(doc, /ALLOW_LEGACY_HMAC_TOKENS=0[\s\S]{0,40}\*\*DONE\*\*|Legacy HMAC CLOSED\s*\|\s*\*\*Yes\*\*/i);
    assert.match(doc, /P1-3[\s\S]{0,400}\*\*OPEN\*\*/);
    assert.match(doc, /\*\*PRODUCTION READINESS:\s*NOT READY\*\*/);
  });

  it("issuance is s1-only; legacy sign unused by login; dual-accept gated; no legacy-accept telemetry", () => {
    const auth = readFileSync(path.join(apiRoot, "src/lib/auth.ts"), "utf8");
    assert.match(auth, /issueCustomerSession/);
    assert.match(auth, /issueAdminSession/);
    assert.match(auth, /@deprecated/);
    assert.doesNotMatch(auth, /token:\s*signCustomerToken\(/);
    assert.doesNotMatch(auth, /token:\s*signAdminToken\(/);
    assert.match(auth, /allowLegacyHmacTokens/);
    assert.match(auth, /readCustomerToken|readAdminToken/);

    const env = readFileSync(path.join(apiRoot, "src/lib/securityEnv.ts"), "utf8");
    assert.match(env, /ALLOW_LEGACY_HMAC_TOKENS/);
    assert.match(env, /LEGACY_HMAC_DEADLINE/);
    assert.match(env, /return true/); // default dual-accept

    const events = readFileSync(path.join(apiRoot, "src/lib/authEvents.ts"), "utf8");
    assert.doesNotMatch(events, /legacy.?hmac.?accept|hmac_accepted|auth_scheme/i);

    // requireCustomer legacy path does not recordAuthEvent on accept
    const requireBlock = auth.slice(auth.indexOf("export async function requireCustomer"));
    const legacyBranch = requireBlock.slice(0, requireBlock.indexOf("export async function findCustomerByPhone"));
    assert.match(legacyBranch, /readCustomerToken/);
    assert.doesNotMatch(legacyBranch, /recordAuthEvent/);
  });

  it("mobile + admin clients store opaque Bearer; no client HMAC construction", () => {
    const mobileApi = readFileSync(path.join(repo, "artifacts/soglom-apteka/lib/api.ts"), "utf8");
    assert.match(mobileApi, /Bearer/);
    assert.match(mobileApi, /setAuthToken|AsyncStorage/);
    assert.doesNotMatch(mobileApi, /createHmac|CUSTOMER_SECRET|ADMIN_SECRET|id:exp:sig/);

    const adminApi = readFileSync(path.join(repo, "artifacts/admin-web/src/api.ts"), "utf8");
    assert.match(adminApi, /Bearer/);
    assert.doesNotMatch(adminApi, /createHmac|ADMIN_SECRET|signAdmin/);

    const adminApp = readFileSync(path.join(repo, "artifacts/admin-web/src/App.tsx"), "utf8");
    assert.match(adminApp, /vm-admin-token/);
    assert.match(adminApp, /\/api\/admin\/login/);
    assert.match(adminApp, /\/api\/admin\/logout/);
  });

  it("runbook + final + followup preserve dual-accept; other gates untouched", () => {
    const rb = readFileSync(runbook, "utf8");
    assert.match(rb, /Phase 12\.39/);
    assert.match(rb, /OPS_REQUIRED/);
    assert.match(rb, /NOT_PROVEN/);

    const fc = readFileSync(finalDoc, "utf8");
    assert.match(fc, /Phase 12\.39/);
    assert.match(fc, /OPS_REQUIRED/);

    const fu = readFileSync(followup, "utf8");
    assert.match(fu, /Phase 12\.39/);
    assert.match(fu, /NOT_PROVEN/);
    assert.match(fu, /Do not disable dual-accept/);

    const doc = readFileSync(matrix, "utf8");
    assert.match(doc, /P0-4[\s\S]{0,400}\*\*OPS_REQUIRED\*\*/);
    assert.match(doc, /Phase 12\.38/);
    assert.match(doc, /FOM[\s\S]{0,80}CONTRACT_PENDING|inventoryWriter.*OFF/i);
  });
});
