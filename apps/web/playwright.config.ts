import { defineConfig, devices } from "@playwright/test";

const apiPort = process.env.OPENMATCH_E2E_API_PORT ?? "4000";
const webPort = process.env.OPENMATCH_E2E_WEB_PORT ?? "3000";
const apiUrl = `http://127.0.0.1:${apiPort}`;
const webUrl = `http://localhost:${webPort}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  use: { baseURL: webUrl, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `PORT=${apiPort} OPENMATCH_ALLOWED_ORIGINS=${webUrl} OPENMATCH_DB=:memory: OPENMATCH_ACCOUNTS_DB=:memory: OPENMATCH_AUTH_RATE_LIMIT_MAX=100 pnpm --filter @openmatch/api dev`,
      cwd: "../..",
      url: `${apiUrl}/health`,
      reuseExistingServer: false,
    },
    {
      command: `NEXT_PUBLIC_OPENMATCH_API_URL=${apiUrl} pnpm --filter @openmatch/web dev --port ${webPort}`,
      cwd: "../..",
      url: webUrl,
      reuseExistingServer: false,
    },
  ],
});
