/**
 * Standalone runner for staging catalog seed.
 * Strict Guards:
 *   APP_ENV=staging
 *   STAGING_DEMO_CATALOG_SEED_ENABLED=true
 *
 * Usage:
 *   APP_ENV=staging STAGING_DEMO_CATALOG_SEED_ENABLED=true pnpm --filter @workspace/db run seed:staging-catalog
 */
import { assertStagingCatalogSeedAllowed, runStagingCatalogSeed } from "../stagingCatalogSeed";

async function main() {
  assertStagingCatalogSeedAllowed();
  console.log("[seed-staging-catalog] Starting staging catalog seed...");
  const result = await runStagingCatalogSeed();
  console.log("[seed-staging-catalog] Summary:", JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

main().catch((err) => {
  console.error("[seed-staging-catalog] Execution failed:", err);
  process.exit(1);
});
