import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  outputDir: "/tmp/frontend-mentor-playwright",
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "corepack pnpm@9.15.4 --filter @mentor/api dev",
      url: "http://127.0.0.1:3100/health",
      reuseExistingServer: false,
      env: { DATABASE_URL: "/tmp/frontend-mentor-e2e.db", PORT: "3100" },
    },
    {
      command: "corepack pnpm@9.15.4 --filter @mentor/web preview --host 127.0.0.1",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: false,
      env: { VITE_API_PROXY_TARGET: "http://127.0.0.1:3100" },
    },
  ],
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
    },
  ],
});
