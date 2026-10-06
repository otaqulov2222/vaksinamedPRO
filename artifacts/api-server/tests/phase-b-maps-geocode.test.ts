import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("Phase B Delivery Map & Geocode API Contracts", () => {
  it("maps router exposes /maps/geocode endpoint", () => {
    const maps = readFileSync(path.join(root, "src/routes/maps.ts"), "utf8");
    assert.match(maps, /router\.get\("\/maps\/geocode"/);
    assert.match(maps, /const lat = Number\(req\.query\.lat\)/);
    assert.match(maps, /const lng = Number\(req\.query\.lng\)/);
    assert.match(maps, /geocode-maps\.yandex\.ru/);
  });

  it("handles missing API key gracefully without throwing 500", () => {
    const maps = readFileSync(path.join(root, "src/routes/maps.ts"), "utf8");
    assert.match(maps, /provider:\s*"none"/);
    assert.match(maps, /configured:\s*false/);
  });

  it("extracts structured address components correctly", () => {
    const maps = readFileSync(path.join(root, "src/routes/maps.ts"), "utf8");
    assert.match(maps, /getKind\("locality"\)/);
    assert.match(maps, /getKind\("street"\)/);
    assert.match(maps, /getKind\("house"\)/);
  });
});
