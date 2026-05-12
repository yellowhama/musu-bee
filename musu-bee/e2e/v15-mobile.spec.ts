import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { bridgeHealthy } from "./helpers/db-fixture";

/**
 * v15.5 — Mobile (375px) visual smoke.
 *
 * Verifies the AppShell:
 *   1. Stacks panel + chat (no horizontal scroll on 375x667).
 *   2. Renders the in-app Panel/Chat switcher.
 *   3. Switching to "Chat" hides the panel pane and shows the chat one.
 *
 * Bypasses auth via `?embed=1`. Artifacts land under
 * musu-bee/runtime/visual-smoke/<timestamp>/v15-mobile-*.png.
 */
const TS = new Date().toISOString().replace(/[:.]/g, "-");
const ARTIFACT_DIR = path.join(__dirname, "..", "runtime", "visual-smoke", TS);

test.beforeAll(async () => {
  if (!fs.existsSync(ARTIFACT_DIR)) fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const ok = await bridgeHealthy();
  if (!ok) {
    test.skip(true, "bridge not running on 8070 — skipping mobile spec");
  }
});

test.describe("v15.5 mobile responsive", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("panel + chat stack on 375px with switcher visible", async ({ page }) => {
    await page.goto("/app?embed=1", { waitUntil: "networkidle" });

    // Switcher renders.
    const switcher = page.locator(".appshell-mobile-switch");
    await expect(switcher).toBeVisible();

    // No horizontal scroll on the body (375px viewport).
    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const clientWidth = await page.evaluate(() => document.body.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1); // allow 1px rounding

    // Default = panel pane visible, chat pane hidden.
    const panelPane = page.locator(".appshell-pane-panel");
    const chatPane = page.locator(".appshell-pane-chat");
    await expect(panelPane).toBeVisible();
    // chat pane has display:none on mobile when not .mobile-active
    await expect(chatPane).toBeHidden();

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "v15-mobile-panel.png"),
      fullPage: false,
    });

    // Click Chat tab → chat visible, panel hidden.
    await switcher.getByRole("tab", { name: "Chat" }).click();
    await expect(chatPane).toBeVisible();
    await expect(panelPane).toBeHidden();

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "v15-mobile-chat.png"),
      fullPage: false,
    });
  });
});
