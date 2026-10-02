/**
 * Phase 12.34 — Mobile s1.* migration readiness invariants.
 * Does NOT disable legacy HMAC. Does NOT set ALLOW_LEGACY_HMAC_TOKENS=0.
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
const mobileApi = path.join(repo, "artifacts/soglom-apteka/lib/api.ts");
const auth = path.join(apiRoot, "src/lib/auth.ts");
const sessions = path.join(apiRoot, "src/lib/sessions.ts");
const securityEnv = path.join(apiRoot, "src/lib/securityEnv.ts");

describe("Phase 12.34 — Mobile s1 migration readiness", () => {
  it("gap matrix records 12.34; s1-only proof NOT_PROVEN; dual-accept not closed", () => {
    assert.ok(existsSync(matrix));
    const doc = readFileSync(matrix, "utf8");
    assert.match(doc, /Phase 12\.34/);
    assert.match(doc, /MOBILE s1-ONLY PROOF\s*=\s*NOT_PROVEN/);
    assert.match(doc, /Legacy HMAC retirement[\s\S]{0,80}OPS_REQUIRED/i);
    assert.match(doc, /Legacy HMAC NOT disabled|dual-accept left ON|not disabled/i);
    assert.match(doc, /REFRESH[\s\S]{0,40}NOT_PRESENT|Refresh endpoint[\s\S]{0,40}NOT_PRESENT/i);
    assert.match(doc, /P1-3[\s\S]{0,400}\*\*OPS_REQUIRED\*\*/);
    assert.doesNotMatch(doc, /ALLOW_LEGACY_HMAC_TOKENS=0[\s\S]{0,40}DONE|legacy HMAC CLOSED\s*\|\s*\*\*Yes\*\*/i);
    assert.match(doc, /\*\*PRODUCTION READINESS:\s*NOT READY\*\*/);
  });

  it("1–3. login paths issue sessions only; sign* unused by issuance returns", () => {
    const src = readFileSync(auth, "utf8");
    assert.match(src, /return \{ user[\s\S]{0,120}issueCustomerSession/);
    assert.match(src, /return \{ user[\s\S]{0,80}issueAdminSession/);
    // Issuance helpers must not return signCustomerToken / signAdminToken
    assert.doesNotMatch(src, /token:\s*signCustomerToken\(/);
    assert.doesNotMatch(src, /token:\s*signAdminToken\(/);
    assert.match(src, /issueCustomerSession/);
    assert.match(src, /@deprecated/);
  });

  it("4–6. s1 validate rejects expired/revoked; logout revokes; format s1.publicId.secret", () => {
    const sess = readFileSync(sessions, "utf8");
    assert.match(sess, /s1\.\$\{publicId\}\.\$\{secret\}|SESSION_PREFIX/);
    assert.match(sess, /revokedAt/);
    assert.match(sess, /expiresAt[\s\S]{0,80}Date\.now\(\)|expiresAt\)\.getTime\(\)\s*<=\s*Date\.now/);
    assert.match(sess, /secretsEqualHex|timingSafeEqual/);
    assert.match(sess, /revokeSessionFromToken/);

    const authRoutes = readFileSync(path.join(apiRoot, "src/routes/auth.ts"), "utf8");
    assert.match(authRoutes, /logout[\s\S]{0,200}revokeSessionFromToken|revokeSessionFromToken/);
  });

  it("7–9. dual-accept remains ON by default; mobile does not construct HMAC; no mobile secrets", () => {
    const env = readFileSync(securityEnv, "utf8");
    assert.match(env, /Default:\s*dual-accept on/i);
    assert.match(env, /ALLOW_LEGACY_HMAC_TOKENS/);

    const api = readFileSync(mobileApi, "utf8");
    assert.match(api, /TOKEN_KEY|setAuthToken|getAuthToken/);
    assert.match(api, /authorization.*Bearer|Bearer.*token/i);
    assert.match(api, /setAuthToken\(data\.token\)/);
    assert.match(api, /revokeSession: \(\) => request<[^>]+>\('\/api\/auth\/logout', \{ method: 'POST' \}\)/);
    const ctx = readFileSync(path.join(repo, "artifacts/soglom-apteka/context/AppContext.tsx"), "utf8");
    assert.match(ctx, /revoke: \(\) => api\.revokeSession\(\)/);
    assert.match(ctx, /clearToken: \(\) => setAuthToken\(null\)/);
    assert.doesNotMatch(api, /createHmac|signCustomerToken|CUSTOMER_SECRET|ADMIN_SECRET/);
    assert.doesNotMatch(api, /id:exp:sig|startsWith\(['"]s1\./);
  });

  it("10–12. admin/telegram/POS remain separate; docs keep retirement OPS", () => {
    const authSrc = readFileSync(auth, "utf8");
    assert.match(authSrc, /requireAdmin/);
    assert.match(authSrc, /allowTelegramHeaderAuth/);

    const pos = readFileSync(path.join(apiRoot, "src/lib/pos.ts"), "utf8");
    assert.match(pos, /VM1|issuePosToken|verifyPosToken/);
    assert.match(pos, /createHmac/); // POS QR HMAC — separate from session legacy

    const fu = readFileSync(followup, "utf8");
    assert.match(fu, /Phase 12\.34/);
    assert.match(fu, /MOBILE s1-ONLY PROOF[\s\S]{0,40}NOT_PROVEN/);
    assert.match(fu, /LEGACY HMAC RETIREMENT[\s\S]{0,40}OPS_REQUIRED/);

    const rb = readFileSync(runbook, "utf8");
    assert.match(rb, /Phase 12\.34/);
    assert.match(rb, /Dual-accept remains \*\*ON\*\*|dual-accept remains/i);

    const fc = readFileSync(finalDoc, "utf8");
    assert.match(fc, /Phase 12\.34/);
    assert.match(fc, /NOT_PROVEN/);
    assert.match(fc, /OPS_REQUIRED/);
  });

  it("other P0 gates preserved; FOM writer OFF", () => {
    const doc = readFileSync(matrix, "utf8");
    assert.match(doc, /P0-1[\s\S]{0,300}\*\*OPS_REQUIRED\*\*/);
    assert.match(doc, /P0-3a[\s\S]{0,500}\*\*OPS_REQUIRED\*\*/);
    assert.match(doc, /P0-3b[\s\S]{0,500}\*\*OPS_REQUIRED\*\*/);
    assert.match(doc, /P0-4[\s\S]{0,400}\*\*OPS_REQUIRED\*\*/);
    assert.match(doc, /Phase 12\.33/);
    assert.match(doc, /FOM[\s\S]{0,80}CONTRACT_PENDING|inventoryWriter.*OFF/i);
  });
});
