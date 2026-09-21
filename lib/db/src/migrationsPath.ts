import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Resolve versioned migrations folder across:
 * - source execution (tsx from lib/db)
 * - API esbuild bundle (cwd = artifacts/api-server)
 * - optional DB_MIGRATIONS_FOLDER override
 */
export function getMigrationsFolder(): string {
  if (process.env.DB_MIGRATIONS_FOLDER?.trim()) {
    const override = path.resolve(process.env.DB_MIGRATIONS_FOLDER.trim());
    assertJournal(override);
    return override;
  }

  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, "..", "migrations"),
    path.resolve(process.cwd(), "migrations"),
    path.resolve(process.cwd(), "lib", "db", "migrations"),
    path.resolve(process.cwd(), "..", "lib", "db", "migrations"),
    path.resolve(process.cwd(), "..", "..", "lib", "db", "migrations"),
  ];

  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, "meta", "_journal.json"))) {
      return candidate;
    }
  }

  throw new Error(
    `[db] Cannot find migrations/meta/_journal.json. Tried:\n${candidates.join("\n")}\n` +
      `Set DB_MIGRATIONS_FOLDER to the absolute migrations directory.`,
  );
}

function assertJournal(folder: string): void {
  if (!existsSync(path.join(folder, "meta", "_journal.json"))) {
    throw new Error(`[db] DB_MIGRATIONS_FOLDER missing meta/_journal.json: ${folder}`);
  }
}
