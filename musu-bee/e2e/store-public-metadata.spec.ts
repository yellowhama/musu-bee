import { expect, test } from "@playwright/test";
import { SUPPORT_EMAIL } from "../src/lib/contact";

test.describe("Store public metadata", () => {
  test("privacy page exposes Partner Center required content", async ({ page }) => {
    await page.goto("/privacy", { waitUntil: "domcontentloaded" });

    await expect(
      page.getByRole("heading", { name: "MUSU Privacy Policy", level: 1 }),
    ).toBeVisible();
    await expect(page.getByText("Data MUSU may process")).toBeVisible();
    await expect(page.getByText(SUPPORT_EMAIL).first()).toBeVisible();
  });

  test("support page exposes support evidence instructions", async ({ page }) => {
    await page.goto("/support", { waitUntil: "domcontentloaded" });

    await expect(
      page.getByRole("heading", { name: "MUSU Support", level: 1 }),
    ).toBeVisible();
    await expect(page.getByText("Include this diagnostic evidence")).toBeVisible();
    await expect(page.getByText(SUPPORT_EMAIL).first()).toBeVisible();
  });
});
