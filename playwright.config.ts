import { defineConfig, devices } from "@playwright/test";
import { STORAGE } from "./tests/e2e/session";

try {
  process.loadEnvFile(); // SEED_ADMIN_* para o teste de login
} catch {
  // sem .env: o teste de login é pulado
}

// E2E_BASE_URL: roda contra outro servidor (ex.: o build de produção com `next start`)
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "tests/e2e",
  use: { baseURL, trace: "on-first-retry" },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], storageState: STORAGE },
      dependencies: ["setup"],
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"], storageState: STORAGE },
      dependencies: ["setup"],
    },
  ],
  webServer: { command: "npm run dev", url: baseURL, reuseExistingServer: true },
});
