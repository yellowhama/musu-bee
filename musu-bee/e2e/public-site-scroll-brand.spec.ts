import { expect, test } from "@playwright/test";

const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 720 },
  { name: "mobile", width: 390, height: 844 },
] as const;

test.describe("public site scroll and brand", () => {
  for (const viewport of VIEWPORTS) {
    test(`home page scrolls and keeps the favicon mark on ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/", { waitUntil: "networkidle" });

      await expect(page.getByTestId("public-home")).toBeVisible();

      const metrics = await page.evaluate(async () => {
        const scrollingElement = document.scrollingElement ?? document.documentElement;
        const before = scrollingElement.scrollTop;
        window.scrollTo(0, Math.min(900, scrollingElement.scrollHeight));
        await new Promise((resolve) => window.setTimeout(resolve, 150));
        return {
          before,
          after: scrollingElement.scrollTop,
          scrollHeight: scrollingElement.scrollHeight,
          clientHeight: scrollingElement.clientHeight,
          scrollWidth: document.body.scrollWidth,
          clientWidth: document.body.clientWidth,
          bodyOverflowY: window.getComputedStyle(document.body).overflowY,
          htmlOverflowY: window.getComputedStyle(document.documentElement).overflowY,
        };
      });

      expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight + 100);
      expect(metrics.after).toBeGreaterThan(metrics.before);
      expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
      expect(["auto", "scroll", "visible"]).toContain(metrics.bodyOverflowY);
      expect(["auto", "scroll", "visible"]).toContain(metrics.htmlOverflowY);

      const mark = page.locator("[aria-label='MUSU'] img").first();
      await expect(mark).toBeVisible();
      const src = await mark.getAttribute("src");
      expect(src).toContain("favicon-header");

      const emerald = await page.evaluate(() =>
        window.getComputedStyle(document.documentElement).getPropertyValue("--musu-color-brand-emerald").trim()
      );
      expect(emerald.toLowerCase()).toBe("#24c8db");

      const emeraldAccent = page.locator("[data-brand-accent='emerald']").first();
      await expect(emeraldAccent).toBeVisible();
      const accentColor = await emeraldAccent.evaluate((node) => {
        const style = window.getComputedStyle(node);
        return `${style.color} ${style.backgroundColor} ${style.borderColor}`;
      });
      expect(accentColor).toContain("36, 200, 219");
    });
  }
});
