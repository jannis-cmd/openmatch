import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command:
        "OPENMATCH_DB=:memory: OPENMATCH_ACCOUNTS_DB=:memory: pnpm --filter @openmatch/api dev",
      cwd: "../..",
      url: "http://127.0.0.1:4000/health",
      reuseExistingServer: false,
    },
    {
      command: "pnpm --filter @openmatch/web dev",
      cwd: "../..",
      url: "http://localhost:3000",
      reuseExistingServer: false,
    },
  ],
});
