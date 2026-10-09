import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, isAbsolute } from "node:path";
import { logger } from "./logger";

/** Lokal .env ni yuklash (ESKIZ_EMAIL, ESKIZ_PASSWORD, ...). Platform-injected env always wins. */
export function loadEnvFile() {
  const candidates = [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "../../.env"),
    resolve(process.cwd(), "../.env"),
  ];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    const text = readFileSync(file, "utf8");
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const i = line.indexOf("=");
      if (i <= 0) continue;
      const key = line.slice(0, i).trim();
      let val = line.slice(i + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) {
        if (key === "PGLITE_DIR" && !isAbsolute(val)) {
          process.env[key] = resolve(dirname(file), val);
        } else {
          process.env[key] = val;
        }
      }
    }
    logger.info({ file, pgliteDir: process.env.PGLITE_DIR }, "Loaded env file");
    break;
  }
}
