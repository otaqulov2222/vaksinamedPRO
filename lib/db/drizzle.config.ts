import path from "path";
import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit config — versioned migrations live in ./migrations.
 * Production schema evolution: `pnpm db:migrate` (NOT push --force).
 */
export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  out: path.join(__dirname, "./migrations"),
  dialect: "postgresql",
  dbCredentials: {
    // Placeholder only — never commit real credentials. Scripts read process.env.
    url: process.env.DATABASE_URL || "postgres://127.0.0.1:5432/vaksinamed",
  },
});
