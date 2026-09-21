/**
 * P12.2 sandbox harness contracts + honest PENDING without credentials.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.resolve(root, "../..");

describe("P12.2 pilot gate contracts", () => {
  it("sandbox harness script exists and refuses production enable", () => {
    const harness = path.join(root, "src/scripts/sandbox-e2e-harness.ts");
    assert.ok(existsSync(harness));
    const src = readFileSync(harness, "utf8");
    assert.match(src, /PAYME_SANDBOX_E2E_PENDING|PENDING/);
    assert.match(src, /CLICK_SANDBOX_E2E_PENDING|PENDING/);
    assert.match(src, /Refuse: PAYME_MERCHANT_API_ENABLED/);
    assert.match(src, /PASS requires real network proof/);
  });

  it("harness run without credentials returns PENDING (not PASS)", () => {
    const r = spawnSync(
      "pnpm",
      ["--filter", "@workspace/api-server", "exec", "tsx", "src/scripts/sandbox-e2e-harness.ts"],
      {
        cwd: repo,
        encoding: "utf8",
        env: {
          ...process.env,
          PAYME_MERCHANT_API_ENABLED: "0",
          CLICK_MERCHANT_API_ENABLED: "0",
          PAYME_SANDBOX_KEY: "",
          CLICK_SANDBOX_SECRET: "",
        },
        shell: true,
      },
    );
    assert.equal(r.status, 0, r.stderr || r.stdout);
    assert.match(r.stdout, /PAYME_SANDBOX_E2E": "PENDING"/);
    assert.match(r.stdout, /CLICK_SANDBOX_E2E": "PENDING"/);
    assert.doesNotMatch(r.stdout, /PAYME_SANDBOX_E2E": "PASS"/);
  });

  it("pilot gates doc + Dockerfile + CI docker job present", () => {
    assert.ok(existsSync(path.join(repo, "docs/PHASE_3_3_P12_2_PILOT_GATES.md")));
    assert.ok(existsSync(path.join(repo, "Dockerfile")));
    const ci = readFileSync(path.join(repo, ".github/workflows/ci.yml"), "utf8");
    assert.match(ci, /docker-image/);
    assert.match(ci, /docker build/);
    assert.match(ci, /sandbox-e2e-harness/);
  });

  it("FOM inventory writer remains disabled; external delivery CONTRACT_PENDING", () => {
    const fom = readFileSync(path.join(root, "src/lib/fomAdapter.ts"), "utf8");
    assert.match(fom, /FOM_INVENTORY_WRITER_ENABLED\s*=\s*false/);
    const delivery = readFileSync(path.join(root, "src/lib/deliveryAdapters.ts"), "utf8");
    assert.match(delivery, /CONTRACT_PENDING/);
  });

  it("HMAC dual-accept still gated by allowLegacyHmacTokens", () => {
    const env = readFileSync(path.join(root, "src/lib/securityEnv.ts"), "utf8");
    assert.match(env, /allowLegacyHmacTokens/);
    assert.match(env, /LEGACY_HMAC_DEADLINE/);
    const auth = readFileSync(path.join(root, "src/lib/auth.ts"), "utf8");
    assert.match(auth, /allowLegacyHmacTokens/);
  });
});
