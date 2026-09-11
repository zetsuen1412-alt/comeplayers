import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL || "http://localhost:3000";
const startLocalServer = !process.env.E2E_BASE_URL && process.env.E2E_START_SERVER !== "false";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  outputDir: "test-results/playwright",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: /mobile-responsive\.spec\.ts/,
    },
    {
      name: "mobile-chrome",
      testMatch: /mobile-responsive\.spec\.ts/,
      use: { ...devices["Pixel 5"] },
    },
    {
      name: "mobile-safari",
      testMatch: /mobile-responsive\.spec\.ts/,
      use: { ...devices["iPhone 13"] },
    },
  ],
  webServer: startLocalServer
    ? {
        command: "npm run dev",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      }
    : undefined,
});
