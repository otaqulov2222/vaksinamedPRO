/**
 * Admin Face ID / WebAuthn second factor — password does not issue a session until biometric completes.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createHash, createSign, generateKeyPairSync } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = mkdtempSync(path.join(tmpdir(), "vm-webauthn-api-"));
process.env.PGLITE_DIR = dataDir;
process.env.APP_ENV = "development";
process.env.DB_DRIVER = "pglite";
process.env.ALLOW_DEMO_SEED = "0";
process.env.LOG_LEVEL = "silent";
delete process.env.DATABASE_URL;
delete process.env.REDIS_URL;

const dbm = await import("@workspace/db");
const { default: app } = await import("../src/app");
const { toBase64Url, fromBase64Url, verifyEs256 } = await import("../src/lib/adminWebauthn");
const { db, adminUsers, branches, adminWebauthnCredentials, hashPassword } = dbm;

let server: Server;
let base = "";
let origin = "";
const PW = "face-id-1317";

type Res = { status: number; body: any; text: string };

async function call(method: string, url: string, body?: unknown, extra: Record<string, string> = {}): Promise<Res> {
  const headers: Record<string, string> = { origin, ...extra };
  if (body !== undefined) headers["content-type"] = "application/json";
  const r = await fetch(`${base}${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let parsed: any = null;
  try { parsed = JSON.parse(text); } catch { parsed = null; }
  return { status: r.status, body: parsed, text };
}

function clientData(type: string, challenge: string) {
  return toBase64Url(Buffer.from(JSON.stringify({ type, challenge, origin }), "utf8"));
}

function authData(signCount: number) {
  const data = Buffer.alloc(37);
  data[32] = 0x05;
  data.writeUInt32BE(signCount, 33);
  return toBase64Url(data);
}

function signAssertion(privateKey: ReturnType<typeof generateKeyPairSync>["privateKey"], authenticatorData: string, clientDataJSON: string) {
  const signed = Buffer.concat([
    fromBase64Url(authenticatorData),
    createHash("sha256").update(fromBase64Url(clientDataJSON)).digest(),
  ]);
  const signer = createSign("SHA256");
  signer.update(signed);
  signer.end();
  return toBase64Url(signer.sign(privateKey));
}

before(async () => {
  process.env.ADMIN_WEBAUTHN_FORCE = "1";
  await db.insert(branches).values({ code: "W1", name: "WebAuthn filial", address: "A", phone: "+998 71 000-00-00", lat: 41.3, lng: 69.2 });
  await db.insert(adminUsers).values({
    email: "hq@webauthn.local",
    name: "HQ Face",
    role: "super_admin",
    branchId: null,
    passwordHash: hashPassword(PW),
    status: "active",
  });
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;
  base = `http://127.0.0.1:${port}`;
  origin = base;
});

after(async () => {
  delete process.env.ADMIN_WEBAUTHN_FORCE;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(dataDir, { recursive: true, force: true });
});

describe("Admin WebAuthn / Face ID login", () => {
  it("password alone does not issue a session in the biometric path", async () => {
    const r = await call("POST", "/api/admin/login", { email: "hq@webauthn.local", password: PW });
    assert.equal(r.status, 200);
    assert.equal(r.body.status, "WEBAUTHN_ENROLL");
    assert.equal(typeof r.body.ticket, "string");
    assert.equal(r.body.token, undefined);
    assert.ok(r.body.webauthn.creation.challenge);
    const me = await call("GET", "/api/admin/me");
    assert.equal(me.status, 401);
  });

  it("wrong password still 401 without a ticket", async () => {
    const r = await call("POST", "/api/admin/login", { email: "hq@webauthn.local", password: "wrong" });
    assert.equal(r.status, 401);
    assert.equal(r.body.ticket, undefined);
    assert.equal(r.body.token, undefined);
  });

  it("enroll + assertion issue a session; face fallback is refused after a key exists", async () => {
    const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const spki = toBase64Url(publicKey.export({ type: "spki", format: "der" }) as Buffer);

    const login = await call("POST", "/api/admin/login", { email: "hq@webauthn.local", password: PW });
    assert.equal(login.body.status, "WEBAUTHN_ENROLL");
    const challenge = login.body.webauthn.creation.challenge;
    const cd = clientData("webauthn.create", challenge);
    const ad = authData(1);
    const credId = toBase64Url(Buffer.from("cred-1"));
    const enrolled = await call("POST", "/api/admin/login/biometric", {
      ticket: login.body.ticket,
      method: "webauthn",
      id: credId,
      clientDataJSON: cd,
      authenticatorData: ad,
      publicKey: spki,
      transports: ["internal"],
    });
    assert.equal(enrolled.status, 200, enrolled.text);
    assert.equal(enrolled.body.status, "OK");
    assert.match(String(enrolled.body.token), /^s1\./);

    const replay = await call("POST", "/api/admin/login/biometric", {
      ticket: login.body.ticket,
      method: "webauthn",
      id: credId,
      clientDataJSON: cd,
      authenticatorData: ad,
      publicKey: spki,
    });
    assert.equal(replay.status, 401);

    const second = await call("POST", "/api/admin/login", { email: "hq@webauthn.local", password: PW });
    assert.equal(second.body.status, "WEBAUTHN_REQUIRED");
    const face = await call("POST", "/api/admin/login/biometric", { ticket: second.body.ticket, method: "face" });
    assert.equal(face.status, 401);
    assert.equal(face.body.token, undefined);

    const login3 = await call("POST", "/api/admin/login", { email: "hq@webauthn.local", password: PW });
    const getCd = clientData("webauthn.get", login3.body.webauthn.request.challenge);
    const getAd = authData(2);
    const asserted = await call("POST", "/api/admin/login/biometric", {
      ticket: login3.body.ticket,
      method: "webauthn",
      id: credId,
      clientDataJSON: getCd,
      authenticatorData: getAd,
      signature: signAssertion(privateKey, getAd, getCd),
    });
    assert.equal(asserted.status, 200, asserted.text);
    const me = await fetch(`${base}/api/admin/me`, { headers: { authorization: `Bearer ${asserted.body.token}` } });
    assert.equal(me.status, 200);
    const stored = await db.select().from(adminWebauthnCredentials);
    assert.equal(stored.length, 1);
    assert.equal(stored[0].signCount, 2);
  });

  it("camera presence never issues a session, even before a Face ID key exists", async () => {
    await db.delete(adminWebauthnCredentials);
    const login = await call("POST", "/api/admin/login", { email: "hq@webauthn.local", password: PW });
    assert.equal(login.body.status, "WEBAUTHN_ENROLL");
    const done = await call("POST", "/api/admin/login/biometric", { ticket: login.body.ticket, method: "face" });
    assert.equal(done.status, 401, done.text);
    assert.equal(done.body.token, undefined);
    const me = await call("GET", "/api/admin/me");
    assert.equal(me.status, 401);
  });

  it("ES256 helper verifies a platform-style signature", () => {
    const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const data = Buffer.from("vaksinamed-face");
    const signer = createSign("SHA256");
    signer.update(data);
    signer.end();
    const der = signer.sign(privateKey);
    const spki = publicKey.export({ type: "spki", format: "der" }) as Buffer;
    assert.equal(verifyEs256(spki, data, der), true);
    assert.equal(verifyEs256(spki, data, Buffer.alloc(64)), false);
  });
});

describe("Admin Face ID source contracts", () => {
  it("login route withholds the session token until biometric", () => {
    const admin = readFileSync(path.join(root, "src/routes/admin.ts"), "utf8");
    const auth = readFileSync(path.join(root, "src/lib/auth.ts"), "utf8");
    const webauthn = readFileSync(path.join(root, "src/lib/adminWebauthn.ts"), "utf8");
    const ui = readFileSync(path.join(root, "../admin-web/src/LoginScreen.tsx"), "utf8");
    assert.match(admin, /\/admin\/login\/biometric/);
    assert.match(auth, /adminBiometricRequired/);
    assert.match(auth, /createPendingAdminLogin/);
    assert.match(webauthn, /authenticatorAttachment: "platform"/);
    assert.match(ui, /navigator\.credentials/);
    assert.doesNotMatch(ui, /admin@vaksinamed\.uz|kassa@vaksinamed/);
    assert.doesNotMatch(ui, /method:\s*"face"|presenceConfirmed|Kameradan yuzni|login-hero/);
    assert.doesNotMatch(auth, /confirmFacePresence/);
  });
});
