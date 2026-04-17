import { test, expect } from "@playwright/test";

test("QA: AI chat fallback verification", async ({ page }) => {
  // Go to the app
  console.log("Navigating to http://127.0.0.1:3001...");
  await page.goto("http://127.0.0.1:3001", { waitUntil: "domcontentloaded" });
  
  // Wait for the page to be ready
  await page.waitForSelector("textarea", { timeout: 20000 });

  // 1. Switch to 'ceo' channel
  console.log("Switching to #ceo channel...");
  const ceoChannel = page.locator('[data-testid="channel-item-ceo"]');
  await ceoChannel.click();
  
  // Wait for UI to stabilize
  await page.waitForTimeout(2000);

  // 2. Wait for the textarea to be ready for the ceo channel
  const textarea = page.locator('textarea[placeholder*="#ceo"]');
  await textarea.waitFor({ state: "visible", timeout: 10000 });
  await textarea.focus();

  // Ensure dot is red (disconnected)
  const statusDot = page.locator('span[title="연결 끊김"]');
  await expect(statusDot).toBeVisible({ timeout: 5000 });

  // 3. Send message
  const testMsg = "QA Test: Respond with exactly YELLOW";
  console.log(`Filling message: ${testMsg}`);
  await textarea.fill(testMsg);
  
  // Verify the send button is now enabled
  const sendBtn = page.locator('button', { hasText: "전송" });
  await expect(sendBtn).toBeEnabled({ timeout: 5000 });
  
  console.log("Clicking send button...");
  await sendBtn.click();

  // 4. Verify user message is visible in the chat list
  await expect(page.locator(`text=${testMsg}`)).toBeVisible({ timeout: 10000 });

  // 5. Verify AI response is received (fallback path via /api/chat)
  console.log("Waiting for AI response (up to 60s)...");
  
  const aiBubble = page.locator('div[style*="background: rgb(30, 30, 30)"]', { hasText: "YELLOW" });
  
  try {
    await expect(aiBubble).toBeVisible({ timeout: 60000 });
    console.log("QA Verification SUCCESS: AI response received via fallback.");
  } catch (err) {
    // If it fails, check if there is an error message from the system
    const systemError = page.locator('div', { hasText: "chat backend unavailable" });
    if (await systemError.isVisible()) {
      const errorText = await systemError.textContent();
      console.error(`QA Verification FAILED: System reported backend error: ${errorText}`);
    } else {
      console.error("QA Verification FAILED: Timeout or unknown error.");
    }
    throw err;
  }
});
