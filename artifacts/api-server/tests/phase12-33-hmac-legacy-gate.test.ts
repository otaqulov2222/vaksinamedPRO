/**
 * Phase 12.33 — HMAC legacy auth closure gate invariants.
 * Does not remove dual-accept. Does not claim legacy HMAC CLOSED.
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
const followup = path.join(repo, "docs/PHASE_3_3_P12_1_SECRETS_HMAC_FOLLOWUP.md");
const finalDoc = path.join(repo, "docs/FINAL_PRODUCTION_CLOSURE.md");

describe("Phase 12.33 — HMAC legacy auth gate", () => {
  it("gap matrix records 12.33; legacy HMAC not CLOSED; P1-3 remains OPEN/OPS", () => {
    assert.ok(existsSync(matrix));
    const doc = readFileSync(matrix, "utf8");
    assert.match(doc, /Phase 12\.33/);
    assert.match(doc, /HMAC legacy/);
    assert.match(doc, /s1\.\*/);
    assert.match(doc, /dual-accept/i);
    assert.match(doc, /P1-3[\s\S]{0,400}\*\*OPEN\*\*/);
    assert.match(doc, /OPS_REQUIRED/);
    assert.doesNotMatch(doc, /Legacy HMAC CLOSED\s*\|\s*\*\*Yes\*\*/i);
    assert.match(doc, /Safe to mark CLOSED now\?[\s\S]{0,80}NO/i);
    assert.match(doc, /\*\*PRODUCTION READINESS:\s*NOT READY\*\*/);
  });

  it("new logins issue s1 sessions; legacy sign deprecated; dual-accept gated", () => {
    const auth = readFileSync(path.join(apiRoot, "src/lib/auth.ts"), "utf8");
    assert.match(auth, /issueCustomerSession/);
    assert.match(auth, /issueAdminSession/);
    assert.match(auth, /@deprecated/);
    assert.match(auth, /signCustomerToken/);
    assert.match(auth, /Prefer issueCustomerSession/);
    assert.match(auth, /allowLegacyHmacTokens/);
    assert.match(auth, /createHmac\("sha256"/);

    const sessions = readFileSync(path.join(apiRoot, "src/lib/sessions.ts"), "utf8");
    assert.match(sessions, /s1\.\$\{publicId\}\.\$\{secret\}|SESSION_PREFIX/);
    assert.match(sessions, /revokeSessionFromToken|revokedAt/);

    const env = readFileSync(path.join(apiRoot, "src/lib/securityEnv.ts"), "utf8");
    assert.match(env, /ALLOW_LEGACY_HMAC_TOKENS/);
    assert.match(env, /LEGACY_HMAC_DEADLINE/);
    assert.match(env, /Default:\s*dual-accept on/i);
  });

  it("mobile stores opaque bearer; does not construct HMAC client-side", () => {
    const api = readFileSync(path.join(repo, "artifacts/soglom-apteka/lib/api.ts"), "utf8");
    assert.match(api, /TOKEN_KEY|getAuthToken|setAuthToken|authorization/);
    assert.doesNotMatch(api, /createHmac|signCustomerToken/);
    assert.doesNotMatch(api, /startsWith\(['"]s1\./);
  });

  it("follow-up + runbook + final keep HMAC_MOBILE_REFRESH_REQUIRED", () => {
    const fu = readFileSync(followup, "utf8");
    assert.match(fu, /Phase 12\.33/);
    assert.match(fu, /Safe to close now\?[\s\S]{0,40}\*\*No\*\*/i);
    assert.match(fu, /B deprecate|deprecate/i);

    const rb = readFileSync(runbook, "utf8");
    assert.match(rb, /Phase 12\.33/);
    assert.match(rb, /6\. Mobile HMAC migration/);
    assert.match(rb, /ALLOW_LEGACY_HMAC_TOKENS=0/);

    const fc = readFileSync(finalDoc, "utf8");
    assert.match(fc, /Phase 12\.33/);
    assert.match(fc, /HMAC_MOBILE_REFRESH_REQUIRED/);
    assert.match(fc, /Legacy HMAC CLOSED[\s\S]{0,40}\*\*No\*\*/);
  });

  it("other production gates preserved OPS/CONTRACT", () => {
    const doc = readFileSync(matrix, "utf8");
    assert.match(doc, /P0-1[\s\S]{0,300}\*\*OPS_REQUIRED\*\*/);
    assert.match(doc, /P0-3a[\s\S]{0,500}\*\*OPS_REQUIRED\*\*/);
    assert.match(doc, /P0-3b[\s\S]{0,500}\*\*OPS_REQUIRED\*\*/);
    assert.match(doc, /P0-4[\s\S]{0,400}\*\*OPS_REQUIRED\*\*/);
    assert.match(doc, /FOM[\s\S]{0,80}CONTRACT_PENDING|inventoryWriter.*OFF/i);
    assert.match(doc, /Phase 12\.30|Phase 12\.31|Phase 12\.32/);
  });
});
