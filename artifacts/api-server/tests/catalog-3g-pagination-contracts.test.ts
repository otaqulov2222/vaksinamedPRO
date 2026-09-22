import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalog = () => readFileSync(path.join(root, "src/routes/catalog.ts"), "utf8");

describe("Batch 3G catalog pagination contracts", () => {
  it("does not load full product table then filter in memory", () => {
    const src = catalog();
    assert.doesNotMatch(src, /const rows = await db\.select\(\)\.from\(products\);\s*const filtered = rows\.filter/);
    assert.match(src, /\.limit\(limit\)/);
    assert.match(src, /\.offset\(offset\)/);
    assert.match(src, /MAX_LIMIT\s*=\s*50/);
  });

  it("search and category filter in SQL with deterministic order", () => {
    const src = catalog();
    assert.match(src, /ilike/);
    assert.match(src, /eq\(products\.category/);
    assert.match(src, /asc\(products\.id\)/);
    assert.match(src, /hasMore/);
    assert.match(src, /pagination/);
  });

  it("branch-aware availability uses stock join; no branch omits stock claim", () => {
    const src = catalog();
    assert.match(src, /leftJoin/);
    assert.match(src, /productStocks/);
    assert.match(src, /BRANCH_NOT_FOUND/);
    assert.match(src, /availabilityKnown:\s*true/);
  });

  it("categories use distinct SQL", () => {
    const src = catalog();
    assert.match(src, /selectDistinct/);
  });

  it("migration 0010 adds catalog indexes", () => {
    const mig = readFileSync(
      path.join(root, "../../lib/db/migrations/0010_catalog_pagination_indexes.sql"),
      "utf8",
    );
    assert.match(mig, /products_category_idx/);
    assert.match(mig, /products_name_uz_idx/);
    const journal = readFileSync(
      path.join(root, "../../lib/db/migrations/meta/_journal.json"),
      "utf8",
    );
    assert.match(journal, /0010_catalog_pagination_indexes/);
  });
});
