/**
 * CASHBACK.exe adapter — protocol + branch map; does not invent FOM_POS.
 */
import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseFomBranchMap, resolveAppBranchId } from "../src/lib/fomBranchMap";
import {
  authenticateCashbackExe,
  cashbackOk,
  issueCashbackExeToken,
  verifyCashbackExeToken,
} from "../src/lib/fomCashbackExeAuth";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiRoot = path.join(root, "src");

describe("FOM branch map", () => {
  it("parses JSON map and resolves with default fallback", () => {
    assert.deepEqual(parseFomBranchMap('{"1":5,"2":7}'), { "1": 5, "2": 7 });
    assert.deepEqual(resolveAppBranchId("1", { mapJson: '{"1":5}' }), {
      branchId: 5,
      via: "map",
      fomKey: "1",
    });
    assert.deepEqual(resolveAppBranchId("9", { mapJson: '{"1":5}', defaultBranchId: 2 }), {
      branchId: 2,
      via: "default",
      fomKey: "9",
    });
    assert.deepEqual(resolveAppBranchId("9", { mapJson: "{}" }), {
      branchId: null,
      via: "none",
      fomKey: "9",
    });
  });
});

describe("CASHBACK.exe auth + token", () => {
  const prev = {
    login: process.env.FOM_CASHBACK_LOGIN,
    pass: process.env.FOM_CASHBACK_PASSWORD,
    secret: process.env.FOM_CASHBACK_SECRET,
    app: process.env.APP_ENV,
    node: process.env.NODE_ENV,
  };

  before(() => {
    process.env.APP_ENV = "development";
    process.env.NODE_ENV = "development";
    process.env.FOM_CASHBACK_LOGIN = "fom";
    process.env.FOM_CASHBACK_PASSWORD = "secret-pass";
    process.env.FOM_CASHBACK_SECRET = "token-signing-secret-32chars!!";
  });

  after(() => {
    for (const [k, v] of Object.entries({
      FOM_CASHBACK_LOGIN: prev.login,
      FOM_CASHBACK_PASSWORD: prev.pass,
      FOM_CASHBACK_SECRET: prev.secret,
      APP_ENV: prev.app,
      NODE_ENV: prev.node,
    })) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("authPOS accepts configured login/password and rejects bad ones", () => {
    const ok = authenticateCashbackExe("fom", "secret-pass");
    assert.equal(ok.code, 0);
    assert.ok(ok.data && typeof (ok.data as { token: string }).token === "string");

    const bad = authenticateCashbackExe("fom", "wrong");
    assert.equal(bad.code, 1);
    assert.match(bad.message, /Login or Password incorrect/);
  });

  it("issues and verifies bearer tokens", () => {
    const token = issueCashbackExeToken("fom");
    assert.ok(verifyCashbackExeToken(token));
    assert.equal(verifyCashbackExeToken("cb1.bad.sig"), null);
    assert.equal(verifyCashbackExeToken(undefined), null);
  });

  it("cashbackOk envelope matches vendor shape", () => {
    assert.deepEqual(cashbackOk({ token: "x" }), { code: 0, message: "OK", data: { token: "x" } });
  });

  it("routes mount under /fom-cashback and alias without touching fom/sale", () => {
    const app = readFileSync(path.join(apiRoot, "app.ts"), "utf8");
    const index = readFileSync(path.join(apiRoot, "routes/index.ts"), "utf8");
    const exe = readFileSync(path.join(apiRoot, "lib/fomCashbackExe.ts"), "utf8");
    const bridge = readFileSync(path.join(apiRoot, "lib/fomBridge.ts"), "utf8");

    assert.match(app, /\/fom-cashback/);
    assert.match(index, /\/integrations\/fom\/cashback/);
    assert.match(exe, /confirmPosSale/);
    assert.match(exe, /FOMCB-/);
    assert.doesNotMatch(exe, /sourceType:\s*["']FOM_POS["']/);
    assert.doesNotMatch(bridge, /fomCashbackExe|authPOS|CreateReceipt/);
  });
});
