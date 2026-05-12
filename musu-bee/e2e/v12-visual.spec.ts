import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import {
  bridgeHealthy,
  deleteApproval,
  fetchActiveCompanyId,
  insertPendingApproval,
} from "./helpers/db-fixture";

/**
 * v13-visual A — Headless visual smoke for v12 surfaces.
 *
 * Covers four user-visible surfaces:
 *   1. canvas loaded (cards or empty trigger)
 *   2. 4-tab CompanyOnboardingModal (steps 1 → 2)
 *   3. inbox bell dropdown
 *   4. canvas card yellow-ring flash on new approval (with bell badge)
 *
 * All cases bypass auth via `?embed=1`. Artifacts land under
 * `musu-bee/runtime/visual-smoke/<timestamp>/` (gitignored at repo root).
 */
const TS = new Date().toISOString().replace(/[:.]/g, "-");
const ARTIFACT_DIR = path.join(__dirname, "..", "runtime", "visual-smoke", TS);

test.beforeAll(async () => {
  if (!fs.existsSync(ARTIFACT_DIR)) fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const ok = await bridgeHealthy();
  if (!ok) {
    test.skip(
      true,
      "bridge not reachable via http://localhost:3001/api/bridge/workspace — start musu-bridge on :8070 first",
    );
  }
});

async function shot(page: import("@playwright/test").Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(ARTIFACT_DIR, `${name}.png`), fullPage: false });
}

async function gotoApp(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/app?embed=1", { waitUntil: "domcontentloaded" });
  // Wait for hydration + tldraw dynamic chunk. 60s allows for first-time compile.
  await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => {});
  // Give React 5s extra to finish hydrating (next-server-compile + tldraw dynamic).
  await page.waitForTimeout(5_000);
}

// v13.6 — Surfaces of dev-overlay noise we explicitly ignore in console
// error assertions. The hot-reload / overlay errors are not v12 regressions.
const IGNORED_ERROR_PATTERNS = [
  /Failed to load resource.*4\d\d/,        // 404s + 429s from rate-limited dev fleet
  /\[Fast Refresh\]/,
  /Refused to (apply style|execute script)/,
  /webpack\.cache\.PackFileCacheStrategy/,
  /Encountered two children with the same key/, // tracked separately
];

function shouldIgnore(msg: string): boolean {
  return IGNORED_ERROR_PATTERNS.some((p) => p.test(msg));
}

test.describe("v12 visual surfaces", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("01 app baseline + canvas surface", async ({ page }) => {
    await gotoApp(page);
    // Always capture what the user actually sees first.
    await page.waitForTimeout(2_000);
    await shot(page, "01-app-baseline");

    const canvasShell = await page.locator(".canvas-shell").count();
    const briefing = await page.locator('button:has-text("Briefing")').count();
    const tabs = await page.locator("button:has-text('Briefing'), button:has-text('Files'), button:has-text('canvas')").allTextContents();

    // soft-assert: report what's there even if canvas didn't load.
    test.info().annotations.push({
      type: "diagnostic",
      description: `canvasShell=${canvasShell} briefing=${briefing} tabs=${JSON.stringify(tabs)}`,
    });

    if (canvasShell === 0) {
      // Known P0: /app?embed=1 lands on Briefing tab, canvas surface missing.
      await shot(page, "01-canvas-missing");
    } else {
      await shot(page, "01-canvas");
    }
  });

  test("02 onboarding modal — step 1 → 2", async ({ page }) => {
    await gotoApp(page);

    const hasCanvas = await page.locator(".canvas-shell").count();
    if (hasCanvas === 0) {
      test.skip(true, "canvas surface not active (P0 — see test 01)");
    }

    // v14.2 — either the empty-trigger (no companies) or the floating "+ New"
    // button (companies exist) opens the onboarding modal.
    const empty = page.locator(".canvas-empty-trigger");
    const floating = page.locator(".canvas-new-trigger");
    const emptyCount = await empty.count();
    const floatingCount = await floating.count();
    if (emptyCount === 0 && floatingCount === 0) {
      test.skip(true, "neither empty-trigger nor floating + button visible");
    }
    if (emptyCount > 0) {
      await empty.click();
    } else {
      await floating.click();
    }

    await expect(page.locator(".onboarding-modal")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator(".onboarding-step.active")).toContainText("Company");
    await shot(page, "02-onboarding-step1");

    await page.locator(".onboarding-field").nth(0).locator("input").fill("Visual Smoke Co");
    await page
      .locator(".onboarding-field")
      .nth(1)
      .locator("textarea")
      .fill("Run a SaaS that delivers AI news digests by email. Target $5k MRR.");
    await page.locator(".onboarding-btn.primary").click();
    await expect(page.locator(".onboarding-step.active")).toContainText("CEO");
    await shot(page, "03-onboarding-step2");
  });

  test("03 inbox bell dropdown", async ({ page }) => {
    await gotoApp(page);
    const bellCount = await page.locator(".inbox-bell-btn").count();
    if (bellCount === 0) {
      await shot(page, "04-bell-missing");
      throw new Error("inbox bell button not rendered (expected in topbar)");
    }
    await shot(page, "04-bell-closed");
    await page.locator(".inbox-bell-btn").click();
    await expect(page.locator(".inbox-dropdown")).toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(300);
    await shot(page, "05-inbox-open");
    await page.keyboard.press("Escape");
    await expect(page.locator(".inbox-dropdown")).toHaveCount(0);
  });

  test("05 no hydration / pageerror noise", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() !== "error") return;
      const text = m.text();
      if (shouldIgnore(text)) return;
      errors.push(text);
    });
    await gotoApp(page);
    await page.waitForTimeout(2_000);

    const hydration = errors.filter((e) => /Hydration failed|hydration mismatch/i.test(e));
    if (hydration.length > 0) {
      console.log("[hydration errors]");
      for (const h of hydration) console.log("  -", h.slice(0, 300));
    }
    expect(hydration, "hydration errors").toEqual([]);
  });

  test("04 canvas card flash on new approval", async ({ page }) => {
    const cid = await fetchActiveCompanyId();
    if (!cid) test.skip(true, "no active company in workspace");

    await gotoApp(page);
    const cardCount = await page.locator(`.company-card[data-company-id="${cid}"]`).count();
    if (cardCount === 0) {
      await shot(page, "06-card-missing");
      test.skip(true, "active-company card not on canvas (P0 — canvas surface inactive)");
    }

    const aid = `v13-visual-${Date.now()}`;
    insertPendingApproval({
      id: aid,
      companyId: cid as string,
      reason: "v13-visual smoke test approval",
    });

    try {
      // inbox polls every 10s; allow up to 15s for the flash class to appear.
      await page.waitForFunction(
        (selector) => Boolean(document.querySelector(selector)),
        `.company-card[data-company-id="${cid}"].company-card-flash`,
        { timeout: 15_000 },
      );
      await page.waitForTimeout(300);
      await shot(page, "07-card-flash");

      await expect(page.locator(".inbox-badge")).toBeVisible({ timeout: 2_000 });
      await shot(page, "08-bell-with-badge");
    } finally {
      deleteApproval(aid);
    }
  });
});
