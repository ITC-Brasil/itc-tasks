import { defineConfig } from "drizzle-kit";

try {
  process.loadEnvFile();
} catch {
  // sem .env: variáveis vêm do ambiente (CI, container)
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
