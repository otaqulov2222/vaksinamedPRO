#!/usr/bin/env node
/**
 * Production must not use drizzle-kit push --force.
 * Dev-only escape hatch: ALLOW_DRIZZLE_PUSH_FORCE=1
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const force = process.argv.includes("--force");
const env = (process.env.NODE_ENV || "").toLowerCase();
const appEnv = (process.env.APP_ENV || "").toLowerCase();

if (force) {
  if (env === "production" || appEnv === "production" || appEnv === "staging") {
    console.error("[db] Refusing drizzle-kit push --force in production/staging.");
    process.exit(1);
  }
  if ((process.env.ALLOW_DRIZZLE_PUSH_FORCE || "").toLowerCase() !== "1") {
    console.error(
      "[db] push --force is forbidden by default (Phase 3.1 §H / P1).\n" +
        "Use: pnpm db:migrate\n" +
        "Emergency local only: ALLOW_DRIZZLE_PUSH_FORCE=1 pnpm --filter @workspace/db push:force",
    );
    process.exit(1);
  }
}

const here = path.dirname(fileURLToPath(import.meta.url));
const config = path.resolve(here, "..", "drizzle.config.ts");
const args = ["drizzle-kit", "push", "--config", config, ...process.argv.slice(2)];
const result = spawnSync("pnpm", ["exec", ...args], { stdio: "inherit", shell: true });
process.exit(result.status ?? 1);
