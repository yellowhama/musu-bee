/**
 * HISTORY-3: musu-bee E2E 메시지 히스토리 specs
 *
 * Tests message history behaviour in the MUSU chat UI:
 * - UI loads with expected structure
 * - Channel navigation works
 * - Messages send and display in local channels
 * - Per-channel history isolation (messages don't bleed across channels)
 * - Multi-message accumulation within a channel
 *
 * NOTE: Tests target non-agent channels (general, dev, tasks, alerts) which
 * use in-memory local state — no WebSocket / musu-port required.
 */

import { test, expect } from "@playwright/test";

// The default active channel on load is "ceo" (an agent channel requiring WS).
// Navigate to a local channel before each test so send works without backend.
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  // Wait for the MUSU header to confirm React has hydrated.
  await expect(page.getByText("MUSU")).toBeVisible();
  // Click the "general" channel to enter a non-agent channel.
  await page.getByTestId("channel-item-general").click();
});

// ─── Scenario 1: UI loads with expected structure ───────────────────────────
test("chat UI loads with channel list, device sidebar, and message input", async ({
  page,
}) => {
  // Top bar
  await expect(page.getByText("MUSU")).toBeVisible();

  // Channel sidebar items
  for (const ch of ["general", "dev", "tasks", "alerts"]) {
    await expect(page.getByTestId(`channel-item-${ch}`)).toBeVisible();
  }

  // Device sidebar items
  await expect(page.getByText("4060Ti Desktop")).toBeVisible();
  await expect(page.getByText("5070Ti Desktop")).toBeVisible();

  // Message input
  await expect(page.locator("textarea")).toBeVisible();
  await expect(page.locator("button", { hasText: "전송" })).toBeVisible();
});

// ─── Scenario 2: Channel switching updates the active channel ───────────────
test("clicking a channel updates the active channel header", async ({
  page,
}) => {
  // Switch to "dev" channel
  await page.getByTestId("channel-item-dev").click();
  // The textarea placeholder mentions the channel name
  const textarea = page.locator("textarea");
  await expect(textarea).toHaveAttribute("placeholder", /dev/);

  // Switch to "tasks" channel
  await page.getByTestId("channel-item-tasks").click();
  await expect(textarea).toHaveAttribute("placeholder", /tasks/);
});

// ─── Scenario 3: Sending a message makes it appear in the chat ──────────────
test("sending a message in general channel displays it immediately", async ({
  page,
}) => {
  const textarea = page.locator("textarea");
  const sendBtn = page.locator("button", { hasText: "전송" });

  const testMsg = "E2E test message — 안녕 세계";

  await textarea.fill(testMsg);
  await sendBtn.click();

  // Message should appear in the chat area
  await expect(page.getByText(testMsg)).toBeVisible();

  // Input should be cleared after send
  await expect(textarea).toHaveValue("");
});

// ─── Scenario 4: Message history is isolated per channel ────────────────────
test("message sent in general is not visible in tasks channel", async ({
  page,
}) => {
  const textarea = page.locator("textarea");
  const sendBtn = page.locator("button", { hasText: "전송" });

  const generalMsg = "general-only message " + Date.now();

  // Send in general
  await textarea.fill(generalMsg);
  await sendBtn.click();
  await expect(page.getByText(generalMsg)).toBeVisible();

  // Switch to tasks channel
  await page.getByTestId("channel-item-tasks").click();

  // The message should NOT be visible in tasks
  await expect(page.getByText(generalMsg)).not.toBeVisible();
});

// ─── Scenario 5: Switching away and back preserves channel history ──────────
test("history in general channel is preserved after switching away and back", async ({
  page,
}) => {
  const textarea = page.locator("textarea");
  const sendBtn = page.locator("button", { hasText: "전송" });

  const msg1 = "persistence test A " + Date.now();
  const msg2 = "persistence test B " + Date.now();

  // Send two messages in general
  await textarea.fill(msg1);
  await sendBtn.click();
  await textarea.fill(msg2);
  await sendBtn.click();

  await expect(page.getByText(msg1)).toBeVisible();
  await expect(page.getByText(msg2)).toBeVisible();

  // Navigate away to dev
  await page.getByTestId("channel-item-dev").click();
  // Confirm messages no longer shown in dev
  await expect(page.getByText(msg1)).not.toBeVisible();

  // Return to general
  await page.getByTestId("channel-item-general").click();

  // Both messages should still be present
  await expect(page.getByText(msg1)).toBeVisible();
  await expect(page.getByText(msg2)).toBeVisible();
});

// ─── Scenario 6: Multiple messages accumulate in order ──────────────────────
test("multiple messages accumulate in the chat area in send order", async ({
  page,
}) => {
  const textarea = page.locator("textarea");
  const sendBtn = page.locator("button", { hasText: "전송" });

  const messages = ["first message", "second message", "third message"];

  for (const msg of messages) {
    await textarea.fill(msg);
    await sendBtn.click();
  }

  for (const msg of messages) {
    await expect(page.getByText(msg)).toBeVisible();
  }

  // Verify ordering: first appears before third in DOM
  const msgLocators = await page.getByText(/message/).all();
  const texts = await Promise.all(msgLocators.map((l) => l.textContent()));
  const firstIdx = texts.findIndex((t) => t?.includes("first"));
  const thirdIdx = texts.findIndex((t) => t?.includes("third"));
  expect(firstIdx).toBeLessThan(thirdIdx);
});
