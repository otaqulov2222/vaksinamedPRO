/**
 * Final production closure contracts — honest EXTERNAL / NOT_PROVEN gates.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.resolve(apiRoot, "../..");

describe("Final production closure", () => {
  it("closure doc and HTTP harness exist; production flags stay off", () => {
    assert.ok(existsSync(path.join(repo, "docs/FINAL_PRODUCTION_CLOSURE.md")));
    assert.ok(existsSync(path.join(apiRoot, "src/scripts/p13-http-load.ts")));
    const doc = readFileSync(path.join(repo, "docs/FINAL_PRODUCTION_CLOSURE.md"), "utf8");
    assert.match(doc, /PRODUCTION[\s\S]*NOT READY/);
    assert.match(doc, /HTTP_LOAD_LOCAL_P13_1_PASS|INFRA_METRICS_EXTERNAL_REQUIRED/);
    assert.match(doc, /Migrations\s+\*\*0000–0010\*\*|0000–0010/);
    assert.match(doc, /NO PRODUCTION PROVIDER ENABLED/);
    const fom = readFileSync(path.join(apiRoot, "src/lib/fomAdapter.ts"), "utf8");
    assert.match(fom, /FOM_INVENTORY_WRITER_ENABLED\s*=\s*false/);
  });

  it("HTTP harness without P13_API_BASE_URL returns PENDING / EXTERNAL", () => {
    const r = spawnSync(
      "pnpm",
      ["--filter", "@workspace/api-server", "exec", "tsx", "src/scripts/p13-http-load.ts"],
      {
        cwd: repo,
        encoding: "utf8",
        env: { ...process.env, P13_API_BASE_URL: "" },
        shell: true,
      },
    );
    assert.equal(r.status, 0, r.stderr || r.stdout);
    assert.match(r.stdout, /HTTP_LOAD_EXTERNAL_STAGING_REQUIRED|HTTP_LOAD": "PENDING"/);
    assert.doesNotMatch(r.stdout, /"HTTP_LOAD": "PASS"/);
  });

  it("HMAC dual-accept remains until mobile refresh; delivery CONTRACT_PENDING", () => {
    const env = readFileSync(path.join(apiRoot, "src/lib/securityEnv.ts"), "utf8");
    assert.match(env, /allowLegacyHmacTokens/);
    const delivery = readFileSync(path.join(apiRoot, "src/lib/deliveryAdapters.ts"), "utf8");
    assert.match(delivery, /CONTRACT_PENDING/);
  });
});
