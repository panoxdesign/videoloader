import { defineConfig, devices } from "@playwright/test";

// Läuft im Playwright-Container der Test-Compose gegen das Runtime-Image (`npm run test:e2e`).
export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  timeout: 90_000,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
