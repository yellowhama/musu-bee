import { defineConfig, devices } from "@playwright/test";

const paddleClientToken =
  process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN?.trim() || "e2e_dummy_token";

// Keep token-present checkout smoke deterministic in local/CI runs.
process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN = paddleClientToken;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  retries: 0,
  workers: 1,
  reporter: "list",

  use: {
    baseURL: "http://localhost:3004",
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: "pnpm exec next dev -p 3004",
    url: "http://localhost:3004/pricing",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
