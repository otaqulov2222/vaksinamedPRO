import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHmac } from "node:crypto";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("QR / POS loyalty identity contracts", () => {
  it("GET /pos/card requires authenticated customer and issues signed QR", () => {
    const routes = readFileSync(path.join(root, "src/routes/pos.ts"), "utf8");
    assert.match(routes, /router\.get\("\/pos\/card"/);
    assert.match(routes, /requireCustomer/);
    assert.match(routes, /issueCustomerPosCard/);
  });

  it("issueCustomerPosCard uses getAuthoritativeBalance not customers.balance alone", () => {
    const pos = readFileSync(path.join(root, "src/lib/pos.ts"), "utf8");
    const issue = pos.slice(pos.indexOf("export async function issueCustomerPosCard"));
    assert.match(issue, /getAuthoritativeBalance/);
    assert.match(issue, /issuePosToken/);
    assert.match(issue, /scanMode:\s*"signed_qr"/);
    assert.match(issue, /legacyStaticCode/);
  });

  it("signed QR format VM1.customerId.exp.sig with HMAC verify + expiry", () => {
    const pos = readFileSync(path.join(root, "src/lib/pos.ts"), "utf8");
    assert.match(pos, /VM1\.\$\{customerId\}\.\$\{exp\}/);
    assert.match(pos, /export function verifyPosToken/);
    assert.match(pos, /exp < Date\.now\(\)/);
    assert.match(pos, /timingSafeEqual/);
    assert.match(pos, /QR_TTL_MS\s*=\s*90_000/);
  });

  it("POS lookup accepts signed QR first; static codes marked LEGACY", () => {
    const pos = readFileSync(path.join(root, "src/lib/pos.ts"), "utf8");
    assert.match(pos, /verifyPosToken\(raw\)/);
    assert.match(pos, /findCustomerByStaticCode/);
    assert.match(pos, /LEGACY_STATIC_CODE/);
    assert.match(pos, /source:\s*"signed_qr"/);
    assert.match(pos, /source:\s*"card"/);
  });

  it("lookup/preview/sale prefer authoritative cashback balance", () => {
    const pos = readFileSync(path.join(root, "src/lib/pos.ts"), "utf8");
    assert.match(pos, /export async function lookupPosCustomer/);
    assert.match(pos, /export async function previewPosSale/);
    const lookup = pos.slice(pos.indexOf("export async function lookupPosCustomer"));
    assert.match(lookup, /getAuthoritativeBalance/);
    const preview = pos.slice(pos.indexOf("export async function previewPosSale"));
    assert.match(preview, /getAuthoritativeBalance/);
    const sale = pos.slice(pos.indexOf("export async function confirmPosSale"));
    assert.match(sale, /getAuthoritativeBalance/);
  });

  it("does not invent one-time jti/nonce consume on lookup or preview", () => {
    const pos = readFileSync(path.join(root, "src/lib/pos.ts"), "utf8");
    assert.doesNotMatch(pos, /jti|oneTime|consumeToken|markQrUsed/i);
  });

  it("HMAC signature round-trip matches issuePosToken body layout", () => {
    const secret = "vaksinamed-pos-secret";
    const customerId = 2;
    const exp = Date.now() + 90_000;
    const body = `VM1.${customerId}.${exp}`;
    const sig = createHmac("sha256", secret).update(body).digest("base64url");
    const payload = `${body}.${sig}`;
    const parts = payload.split(".");
    assert.equal(parts.length, 4);
    assert.equal(parts[0], "VM1");
    assert.equal(Number(parts[1]), 2);
    assert.equal(Number(parts[2]), exp);
    const expected = createHmac("sha256", secret).update(`VM1.${parts[1]}.${parts[2]}`).digest("base64url");
    assert.equal(parts[3], expected);
  });

  it("mobile QR screen avoids focus refresh loop and bir martalik claim", () => {
    const qr = readFileSync(
      path.join(root, "../soglom-apteka/app/qr.tsx"),
      "utf8",
    );
    assert.match(qr, /useFocusEffect/);
    assert.match(qr, /identityKey/);
    assert.match(qr, /QRExpiryTimer/);
    assert.match(qr, /api\.posCard/);
    assert.doesNotMatch(qr, /bir martalik|one-time|offline/i);
    assert.match(qr, /QR amal qiladi/);
    // Must not call global AppContext refresh inside focus effect (loop cause).
    const focusBlock = qr.slice(qr.indexOf("useFocusEffect"));
    const focusCb = focusBlock.slice(0, focusBlock.indexOf("}, [instanceId]"));
    assert.doesNotMatch(focusCb, /refresh\(\)/);
    assert.doesNotMatch(focusCb, /clearCard\(\)/);
  });
});
