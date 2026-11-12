/**
 * FOM Phase 1 — shadow recon + mapping; writer stays OFF.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiRoot = path.join(root, "src");
const dbRoot = path.resolve(root, "../../lib/db");

describe("FOM Phase 1 — standard shadow + map (writer OFF)", () => {
  it("keeps inventory writer kill-switch OFF", () => {
    const adapter = readFileSync(path.join(apiRoot, "lib/fomAdapter.ts"), "utf8");
    assert.match(adapter, /FOM_INVENTORY_WRITER_ENABLED\s*=\s*false/);
  });

  it("exposes shadow endpoint without requiring writer ON", () => {
    const routes = readFileSync(path.join(apiRoot, "routes/fomInventory.ts"), "utf8");
    assert.match(routes, /\/integrations\/fom\/inventory-shadow/);
    assert.match(routes, /shadowReconcileBranchInventoryFromFom/);
    const shadowBlock = routes.slice(
      routes.indexOf("inventory-shadow"),
      routes.indexOf("inventory-sync"),
    );
    assert.doesNotMatch(shadowBlock, /assertFomInventoryWriterAllowed/);
  });

  it("shadow never claims stock writes; quarantine via fom_product_links", () => {
    const svc = readFileSync(path.join(apiRoot, "lib/fomInventoryService.ts"), "utf8");
    assert.match(svc, /export async function shadowReconcileBranchInventoryFromFom/);
    assert.match(svc, /writesApplied:\s*false/);
    assert.match(svc, /fomProductLinks/);
    assert.match(svc, /QUARANTINE/);
    assert.doesNotMatch(
      svc.slice(svc.indexOf("shadowReconcileBranchInventoryFromFom"), svc.indexOf("findAlternativeBranchesWithStock")),
      /assertFomInventoryWriterAllowed|inventoryMovements/,
    );
  });

  it("migration + schema for fom_product_links exist", () => {
    const migration = readFileSync(path.join(dbRoot, "migrations/0025_fom_product_links.sql"), "utf8");
    const schema = readFileSync(path.join(dbRoot, "src/schema/commerce.ts"), "utf8");
    assert.match(migration, /CREATE TABLE IF NOT EXISTS fom_product_links/);
    assert.match(schema, /fomProductLinks/);
  });

  it("status roadmap is honest and lists shadow before writer cutover", () => {
    const integrations = readFileSync(path.join(apiRoot, "routes/integrations.ts"), "utf8");
    assert.match(integrations, /inventoryShadow/);
    assert.match(integrations, /SHADOW_MAP/);
    assert.match(integrations, /CATALOG_SYNC/);
    assert.match(integrations, /catalogSync/);
    assert.match(integrations, /WRITER_CUTOVER/);
    assert.match(integrations, /fom_catalog_sync_upsert_by_sku_no_stock_write/);
  });

  it("catalog-sync upserts products without touching stock writer", () => {
    const routes = readFileSync(path.join(apiRoot, "routes/fomInventory.ts"), "utf8");
    const svc = readFileSync(path.join(apiRoot, "lib/fomCatalogService.ts"), "utf8");
    assert.match(routes, /\/integrations\/fom\/catalog-sync/);
    assert.match(routes, /syncCatalogFromFom/);
    assert.match(svc, /export async function syncCatalogFromFom/);
    assert.match(svc, /inventoryWrites:\s*false/);
    assert.doesNotMatch(svc, /productStocks|assertFomInventoryWriterAllowed/);
  });
});
