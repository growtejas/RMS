import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3010",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run start -- -p 3010",
    url: "http://127.0.0.1:3010/api/health",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
