import { defineConfig, devices } from "@playwright/test";
import path from "path";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: "http://localhost:3001",
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: [
    {
      command: "npm run dev",
      url: "http://localhost:3001",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: [
        `MUSU_PORT_MANAGER_PORT=1355`,
        `MUSU_PORT_MANAGER_ALLOW_FALLBACK=false`,
        `MUSU_PORT_DATA_ROOT=/tmp/musu-port-e2e`,
        `MUSU_PORT_SEED_SERVICES=${path.resolve(__dirname, "../musu-port/data/seed-services.json")}`,
        path.resolve(__dirname, "../musu-port/target/release/musu-portd"),
      ].join(" "),
      url: "http://localhost:1355/health",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});
