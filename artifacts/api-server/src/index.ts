import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import app from "./app";
import { logger } from "./lib/logger";

/** Lokal .env ni yuklash (ESKIZ_EMAIL, ESKIZ_PASSWORD, ...) */
function loadEnvFile() {
  const candidates = [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "../../.env"),
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
      if (!(key in process.env)) process.env[key] = val;
    }
    logger.info({ file }, "Loaded env file");
    break;
  }
}

loadEnvFile();

const rawPort = process.env.PORT || "5000";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const smsMode = process.env.ESKIZ_EMAIL && process.env.ESKIZ_PASSWORD ? "eskiz" : "dev";

app.listen(port, "0.0.0.0", (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port, smsMode }, "Vaksina Med API listening");
});
