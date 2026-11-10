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
  lat: number;
  lng: number;
  is24?: boolean;
}>;

describe("Official Vaksina Med branches catalog", () => {
  it("tracks the public network size from vaksinamed.uz (≥150 active)", () => {
    assert.ok(Array.isArray(raw));
    assert.ok(raw.length >= 150, `expected ≥150 official branches, got ${raw.length}`);
    assert.equal(raw.every((b) => b.status === "active"), true);
    const codes = raw.map((b) => String(b.code));
    assert.equal(new Set(codes).size, codes.length, "branch codes must be unique");
    const ids = raw.map((b) => b.id);
    assert.equal(new Set(ids).size, ids.length, "branch ids must be unique");
  });

  it("maps into seed rows with VM-### codes, coordinates, without dropping rows", () => {
    const mapped = buildOfficialBranches();
    assert.equal(mapped.length, raw.length);
    assert.ok(mapped.every((b) => /^VM-\d{3}$/.test(b.code)));
    assert.ok(mapped.every((b) => Number.isFinite(b.lat) && Number.isFinite(b.lng)));
    assert.ok(mapped.some((b) => /ВОДИЛ|VODIL|ФАРГОНА|ЮНУСОБОД/i.test(b.name)));
  });

  it("marks the 7 official 24/7 pharmacies from vaksinamed.uz UI", () => {
    const marked = raw.filter((b) => Boolean(b.is24));
    assert.equal(marked.length, 7);
    assert.deepEqual(
      marked.map((b) => String(b.code)).sort((a, b) => Number(a) - Number(b)),
      ["9", "10", "14", "27", "51", "96", "103"],
    );
    const mapped = buildOfficialBranches().filter((b) => b.is24h);
    assert.equal(mapped.length, 7);
    assert.ok(mapped.every((b) => /24\s*\/\s*7/i.test(b.hours)));
  });

  it("keeps Yangiobod Korzinka on Katta Yangiobod (not Olmazor coords)", () => {
    const yangiobod = raw.find((b) => String(b.code) === "123");
    const olmazor = raw.find((b) => String(b.code) === "124");
    assert.ok(yangiobod, "branch 123 must exist");
    assert.ok(olmazor, "branch 124 must exist");
    assert.match(String(yangiobod?.name || ""), /ЯНГИОБОД КОРЗИНКА/i);
    assert.ok(Math.abs(Number(yangiobod?.lat) - 41.265035) < 1e-5);
    assert.ok(Math.abs(Number(yangiobod?.lng) - 69.35351) < 1e-5);
    assert.ok(
      Math.abs(Number(yangiobod?.lat) - Number(olmazor?.lat)) > 0.01 ||
        Math.abs(Number(yangiobod?.lng) - Number(olmazor?.lng)) > 0.01,
      "Yangiobod must not share Olmazor coordinates",
    );
  });

  it("exports syncOfficialBranchGeo helper for DB heal", async () => {
    const src = readFileSync(path.join(root, "src/syncOfficialBranchGeo.ts"), "utf8");
    assert.match(src, /export async function syncOfficialBranchGeo/);
    assert.match(src, /NEVER deletes rows/);
  });
});

