import { defineConfig } from "@playwright/test";
const port = Number(process.env.SMOKE_PORT || 43127);
const webPort = Number(process.env.SMOKE_WEB_PORT || 43128);
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: "tests/e2e",
  retries: 0,
  workers: 1,
  use: { baseURL, trace: "retain-on-failure" },
  webServer: [
    {
      command: "npm start",
      url: `${baseURL}/api/health`,
      env: { PORT: String(port) },
      reuseExistingServer: false,
    },
    {
      command: "npm run dev -w @labelbridge/web",
      url: `http://127.0.0.1:${webPort}`,
      env: { WEB_PORT: String(webPort), API_TARGET: baseURL },
      reuseExistingServer: false,
    },
  ],
});
