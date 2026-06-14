import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./src-tauri-shell",
  testMatch: /cockpit-browser\.spec\.ts/,
  timeout: 30_000,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
