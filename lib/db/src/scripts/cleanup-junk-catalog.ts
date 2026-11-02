/**
 * Remove operator-created junk SKUs from staging catalog.
 *
 * Guards:
 *   APP_ENV=staging
 *   STAGING_JUNK_CATALOG_CLEANUP_ENABLED=true
 *   DATABASE_URL=postgres://...
 *
 * Default is dry-run (prints matches, writes nothing).
 *
 *   APP_ENV=staging STAGING_JUNK_CATALOG_CLEANUP_ENABLED=true pnpm --filter @workspace/db run cleanup:junk-catalog
 *   APP_ENV=staging STAGING_JUNK_CATALOG_CLEANUP_ENABLED=true pnpm --filter @workspace/db run cleanup:junk-catalog -- --apply
 */
import { runJunkCatalogCleanup } from "../junkCatalogCleanup";

async function main() {
  const apply = process.argv.includes("--apply");
  const mode = apply ? "apply" : "dry-run";
  console.log(`[junk-catalog-cleanup] mode=${mode}`);
  const result = await runJunkCatalogCleanup(mode);
  console.log("[junk-catalog-cleanup] Summary:", JSON.stringify({
    ok: result.ok,
    mode: result.mode,
    scanned: result.scanned,
    matched: result.matched,
    deleted: result.deleted,
    skippedProtected: result.skippedProtected,
    skippedBlocked: result.skippedBlocked,
    candidates: result.candidates,
  }, null, 2));
  process.exit(result.ok ? 0 : 1);
}

main().catch((err) => {
  console.error("[junk-catalog-cleanup] Execution failed:", err);
  process.exit(1);
});
