import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildOfficialBranches } from "../src/stagingCatalogSeed";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const raw = JSON.parse(readFileSync(path.join(root, "src/data/branches.json"), "utf8")) as Array<{
  id: string;
  code: string;
  name: string;
  status: string;
}>;

describe("Official Vaksina Med branches catalog", () => {
  it("tracks the public network size from vaksinamed.uz (≥137 active)", () => {
    assert.ok(Array.isArray(raw));
    assert.ok(raw.length >= 137, `expected ≥137 official branches, got ${raw.length}`);
    assert.equal(raw.every((b) => b.status === "active"), true);
    const codes = raw.map((b) => String(b.code));
    assert.equal(new Set(codes).size, codes.length, "branch codes must be unique");
    const ids = raw.map((b) => b.id);
    assert.equal(new Set(ids).size, ids.length, "branch ids must be unique");
  });

  it("maps into seed rows with VM-### codes without dropping rows", () => {
    const mapped = buildOfficialBranches();
    assert.equal(mapped.length, raw.length);
    assert.ok(mapped.every((b) => /^VM-\d{3}$/.test(b.code)));
    assert.ok(mapped.some((b) => /ВОДИЛ|VODIL/i.test(b.name)));
  });
});
