/**
 * FOM SITE.exe / REPORT_188 parsers — catalog path, no stock writes.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  extractXmlPayload,
  fomSkuFromId,
  parseReport188ToCatalog,
  parseSiteXmlToCatalog,
} from "../src/lib/fomVendorFormats";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiRoot = path.join(root, "src");

describe("FOM vendor formats → catalog", () => {
  it("builds stable FOM-{id} sku without colliding with bare ids", () => {
    assert.equal(fomSkuFromId("2053"), "FOM-2053");
    assert.equal(fomSkuFromId("FOM-2053"), "FOM-2053");
    assert.equal(fomSkuFromId("  "), "");
  });

  it("parses SITE.exe <V/> XML into catalog + stock preview lines", () => {
    const xml = `
      <root>
        <V I="2053" N="НООФЕН КАПС 500 МГ № 24" R="ОЛАЙНФАРМ, ЛАТВИЯ" K="0.374999" P="226400.00" O="1" IK="03004133005001001" UP="1117203" UN="Qadoq"/>
        <V I="7752" N="ЭТАЦИЗИН 50 МГ ТАБ № 50" R="ОЛАЙНФАРМ, ЛАТВИЯ" K="0.400000" P="152400.00" O="1"/>
        <V I="2053" N="НООФЕН КАПС 500 МГ № 24" R="ОЛАЙНФАРМ, ЛАТВИЯ" K="2" P="230000.00" O="2"/>
      </root>
    `;
    const parsed = parseSiteXmlToCatalog(xml);
    assert.equal(parsed.source, "SITE_XML");
    assert.equal(parsed.catalogItems.length, 2);

    const noofen = parsed.catalogItems.find((i) => i.sku === "FOM-2053");
    assert.ok(noofen);
    assert.equal(noofen!.fomId, "2053");
    assert.equal(noofen!.nameUz, "НООФЕН КАПС 500 МГ № 24");
    assert.equal(noofen!.manufacturer, "ОЛАЙНФАРМ, ЛАТВИЯ");
    assert.equal(noofen!.price, 230000); // max across filials
    assert.equal(noofen!.mxikCode, "03004133005001001");
    assert.equal(noofen!.packageCode, "1117203");
    assert.equal(noofen!.unit, "Qadoq");

    assert.equal(parsed.stockLines.length, 3);
    assert.deepEqual(
      [...new Set(parsed.stockLines.map((l) => l.branchExternalId))].sort(),
      ["1", "2"],
    );
  });

  it("parses REPORT_ID=188 spravochnik rows", () => {
    const parsed = parseReport188ToCatalog([
      { I: "313900", N: "ПК-МЕРЦ ТАБ №30", P: "МЕРЦ ФАРМА, ГЕРМАНИЯ", E: "", C: "03004467001005001" },
      { I: "", N: "broken" },
      { name: "no-id" },
    ]);
    assert.equal(parsed.source, "REPORT_188");
    assert.equal(parsed.catalogItems.length, 1);
    assert.equal(parsed.skippedCount, 2);
    assert.equal(parsed.catalogItems[0].sku, "FOM-313900");
    assert.equal(parsed.catalogItems[0].mxikCode, "03004467001005001");
    assert.equal(parsed.catalogItems[0].price, undefined);
  });

  it("extracts XML from raw string or JSON wrapper", () => {
    assert.equal(extractXmlPayload("<V I=\"1\" N=\"A\"/>"), '<V I="1" N="A"/>');
    assert.equal(extractXmlPayload({ xml: "<V I=\"2\" N=\"B\"/>" }), '<V I="2" N="B"/>');
    assert.equal(extractXmlPayload({}), "");
  });

  it("routes expose site-xml and catalog-from-report without enabling writer", () => {
    const routes = readFileSync(path.join(apiRoot, "routes/fomInventory.ts"), "utf8");
    const formats = readFileSync(path.join(apiRoot, "lib/fomVendorFormats.ts"), "utf8");
    assert.match(routes, /\/integrations\/fom\/site-xml/);
    assert.match(routes, /\/integrations\/fom\/catalog-from-report/);
    assert.match(routes, /parseSiteXmlToCatalog/);
    assert.match(routes, /inventoryWrites:\s*false/);
    assert.match(formats, /product_stocks/);
    assert.doesNotMatch(routes.slice(routes.indexOf("site-xml"), routes.indexOf("catalog-from-report")), /assertFomInventoryWriterAllowed/);
  });
});
