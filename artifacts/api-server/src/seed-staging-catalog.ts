/**
 * One-off staging catalog seed entrypoint (dist/seed-staging-catalog.mjs).
 * Strict Guards:
 *   APP_ENV=staging
 *   STAGING_DEMO_CATALOG_SEED_ENABLED=true
 *
 * Exclusively populates branches, products, and product_stocks.
 * Never touches auth, customer, order, cashback, or payment tables.
 */
import { logger } from "./lib/logger";
import { loadEnvFile } from "./lib/envFile";

loadEnvFile();

async function main() {
  const { assertStagingCatalogSeedAllowed, runStagingCatalogSeed } = await import(
    "@workspace/db/staging-catalog"
  );
  assertStagingCatalogSeedAllowed();
  logger.info("Executing staging catalog seed...");
  const result = await runStagingCatalogSeed();
  logger.info(
    { stagingCatalogSeed: result },
    result.ok ? "Staging catalog seed completed successfully" : "Staging catalog seed encountered issues",
  );
  process.exit(result.ok ? 0 : 1);
}

main().catch((err) => {
  logger.error({ err }, "Staging catalog seed failed");
  process.exit(1);
});
