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

  // v16.E-2 — swipe gesture should flip mobileView. Playwright's
  // page.touchscreen exposes tap-only; dispatch the touch* events
  // manually with bubbling so React's onTouchStart/onTouchEnd handlers
  // on .appshell-main run.
  test("swipe left → chat, swipe right → panel", async ({ page }) => {
    await page.goto("/app?embed=1", { waitUntil: "networkidle" });

    const panelPane = page.locator(".appshell-pane-panel");
    const chatPane = page.locator(".appshell-pane-chat");
    await expect(panelPane).toBeVisible();

    const swipe = async (fromX: number, toX: number) => {
      await page.evaluate(
        ({ fromX, toX }) => {
          const main = document.querySelector(".appshell-main");
          if (!main) throw new Error("appshell-main not found");
          const mkTouch = (clientX: number) =>
            new Touch({
              identifier: 1,
              target: main,
              clientX,
              clientY: 400,
              radiusX: 1,
              radiusY: 1,
            });
          const start = new TouchEvent("touchstart", {
            bubbles: true,
            cancelable: true,
            touches: [mkTouch(fromX)],
            targetTouches: [mkTouch(fromX)],
            changedTouches: [mkTouch(fromX)],
          });
          const end = new TouchEvent("touchend", {
            bubbles: true,
            cancelable: true,
            touches: [],
            targetTouches: [],
            changedTouches: [mkTouch(toX)],
          });
          main.dispatchEvent(start);
          main.dispatchEvent(end);
        },
        { fromX, toX }
      );
    };

    // Swipe left (300px → 100px = dx=-200) → chat visible.
    await swipe(300, 100);
    await expect(chatPane).toBeVisible();
    await expect(panelPane).toBeHidden();

    // Swipe right (100px → 300px = dx=+200) → back to panel.
    await swipe(100, 300);
    await expect(panelPane).toBeVisible();
    await expect(chatPane).toBeHidden();
  });

  // v16.E-1 — visualViewport handling. Hard to truly simulate iOS
  // keyboard open/close inside Chromium, but we can at least assert the
  // listener wiring doesn't crash the chat panel and the bottom of the
  // chat is reachable when focused.
  test("chat textarea is reachable after focus on mobile viewport", async ({ page }) => {
    await page.goto("/app?embed=1", { waitUntil: "networkidle" });

    // Flip to chat pane.
    const switcher = page.locator(".appshell-mobile-switch");
    await switcher.getByRole("tab", { name: "Chat" }).click();
    const chatPane = page.locator(".appshell-pane-chat");
    await expect(chatPane).toBeVisible();

    // Focus a textarea inside the chat pane. ChatArea renders the
    // composer textarea once history loads; if the agent CLI is missing
    // we may not get a textarea at all — skip the assertion in that
    // case rather than failing the visual smoke.
    const textarea = chatPane.locator("textarea").first();
    const hasTextarea = (await textarea.count()) > 0;
    test.skip(!hasTextarea, "no chat textarea — skipping focus check");
    await textarea.focus();
    await expect(textarea).toBeFocused();
  });
});
