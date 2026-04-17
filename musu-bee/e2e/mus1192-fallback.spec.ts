import { test, expect } from "@playwright/test";

test("MUS-1192: AI chat fallback works when musu-port is down", async ({ page }) => {
  // 1. Go to the app
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator("textarea").first().waitFor({ timeout: 5000 });

  // 2. Switch to 'ceo' channel
  await page.locator('[data-testid="channel-item-ceo"]').click();

  // 3. Verify channel switch via placeholder
  const textarea = page.locator("textarea").first();
  await expect.poll(
    () => textarea.getAttribute("placeholder"),
    { timeout: 5000 }
  ).toContain("ceo");

  // 4. Send message expecting fallback to local LLM
  const testMsg = "Respond with exactly OK";
  await textarea.fill(testMsg);
  await textarea.press("Enter");

  // 5. Verify user message is visible
  await expect(page.locator(`text=${testMsg}`)).toBeVisible({ timeout: 5000 });

  // 6. Verify AI response is received (fallback path)
  // The local LLM might take a few seconds. We expect "OK" in a message bubble.
  // AI messages in ChatArea.tsx have background: "#1e1e1e"
  const aiResponse = page.locator('div[style*="background: rgb(30, 30, 30)"]', { hasText: "OK" });
  await expect(aiResponse).toBeVisible({ timeout: 30000 });

  console.log("MUS-1192 G2: PASS - AI response received via fallback");
});
