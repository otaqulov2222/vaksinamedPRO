/**
 * Migration release entrypoint (dist/migrate.mjs). One-off job per release, before API / worker replicas.
 * Same image as the API: `node dist/migrate.mjs --status` (read-only) or `node dist/migrate.mjs` (apply).
 * No HTTP server, no seed. Exits non-zero unless every journal migration is applied and critical tables exist.
 */
import { logger } from "./lib/logger";
import { loadEnvFile } from "./lib/envFile";

loadEnvFile();

async function main() {
  const apply = !process.argv.includes("--status");
  const { runMigrationRelease } = await import("@workspace/db/release");
  const report = await runMigrationRelease({ apply });
  logger.info({ migrationRelease: report }, report.ok ? "Migration release OK" : "Migration release NOT OK");
  process.exit(report.ok ? 0 : 1);
}

main().catch((err) => {
  logger.error({ err }, "Migration release failed");
  process.exit(1);
});
