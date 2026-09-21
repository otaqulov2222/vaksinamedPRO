import { defineConfig } from "drizzle-kit";
import path from "path";

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL || "postgres://127.0.0.1:5432/vaksinamed",
  },
});
