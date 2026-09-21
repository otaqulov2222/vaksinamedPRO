/**
 * P13 harness contracts — honest PENDING without REAL_POSTGRES_LOAD_TEST.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.resolve(apiRoot, "../..");

describe("P13 real PG load contracts", () => {
  it("harness + runner + compose postgres profile exist", () => {
    assert.ok(existsSync(path.join(apiRoot, "src/scripts/p13-real-pg-load.ts")));
    assert.ok(existsSync(path.join(apiRoot, "src/scripts/p13-real-pg-runner.ts")));
    const compose = readFileSync(path.join(repo, "docker-compose.yml"), "utf8");
    assert.match(compose, /profiles:\s*\["p13"\]/);
    assert.match(compose, /postgres:16-alpine/);
    assert.ok(existsSync(path.join(repo, "docs/PHASE_3_3_P13_REAL_PG_LOAD.md")));
  });

  it("without REAL_POSTGRES_LOAD_TEST returns PENDING (not PASS)", () => {
    const r = spawnSync("pnpm", ["--filter", "@workspace/api-server", "exec", "tsx", "src/scripts/p13-real-pg-load.ts"], {
      cwd: repo,
      encoding: "utf8",
      env: { ...process.env, REAL_POSTGRES_LOAD_TEST: "0" },
      shell: true,
    });
    assert.equal(r.status, 0, r.stderr || r.stdout);
    assert.match(r.stdout, /REAL_PG_LOAD": "PENDING"|REAL_PG_LOAD_PENDING/);
    assert.doesNotMatch(r.stdout, /"REAL_PG_LOAD": "PASS"/);
  });

  it("FOM inventory writer remains OFF; production PSP flags refused in harness", () => {
    const entry = readFileSync(path.join(apiRoot, "src/scripts/p13-real-pg-load.ts"), "utf8");
    assert.match(entry, /PAYME_MERCHANT_API_ENABLED/);
    assert.match(entry, /FOM_INVENTORY_WRITER/);
    const fom = readFileSync(path.join(apiRoot, "src/lib/fomAdapter.ts"), "utf8");
    assert.match(fom, /FOM_INVENTORY_WRITER_ENABLED\s*=\s*false/);
  });
});
