import { defineConfig, devices } from "@playwright/test";

try {
  process.loadEnvFile(); // SEED_ADMIN_* para o teste de login
} catch {
  // sem .env: o teste de login é pulado
}

export default defineConfig({
  testDir: "tests/e2e",
  use: { baseURL: "http://localhost:3000", trace: "on-first-retry" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: { command: "npm run dev", url: "http://localhost:3000", reuseExistingServer: true },
});
