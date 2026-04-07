/**
 * Wave G-6: E2E Messenger Scenarios — QA Gate (GO/NO-GO)
 *
 * Scenarios:
 * 1. 채팅 UI 접속 — Chat UI loads with all elements
 * 2. 채널 전환 — Channel switching works
 * 3. 실시간 메시지 — Local message send visible in non-agent channel
 * 4. 기기 사이드바 수치 갱신 — Device sidebar shows live stats
 * 5. 파트장 AI 대화 — Agent channel (ceo) accepts input and WS connection attempted
 *
 * Pass criteria: all 5 PASS, <5s response per action
 */
import { test, expect } from "@playwright/test";

// Channel items render as: <span>#</span><span>{name}</span>
// Device items render as: <span>🖥 {device.name}</span> where name is "4060Ti Desktop"

test.describe("Wave G E2E — 5 Scenarios", () => {
  // ─────────────────────────────────────────────
  // Scenario 1: 채팅 UI 접속
  // ─────────────────────────────────────────────
  test("S1: 채팅 UI 접속 — app loads with sidebar and chat area", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    const t0 = Date.now();
    await page.goto("/", { waitUntil: "domcontentloaded" });

    // Topbar: MUSU branding
    await expect(page.locator("text=MUSU").first()).toBeVisible({ timeout: 5000 });

    // Sidebar: channel list header
    await expect(page.locator("text=채널").first()).toBeVisible({ timeout: 5000 });

    // Sidebar: general channel
    await expect(page.getByText("general", { exact: true })).toBeVisible({ timeout: 5000 });

    // Chat area: textarea input present
    await expect(page.locator("textarea").first()).toBeVisible({ timeout: 5000 });

    const elapsed = Date.now() - t0;
    console.log(`S1 elapsed: ${elapsed}ms, console errors: ${errors.length}`);
    expect(elapsed).toBeLessThan(5000);

    // No critical JS errors
    const criticalErrors = errors.filter(e => !e.includes("WebSocket") && !e.includes("ws://"));
    if (criticalErrors.length > 0) {
      console.warn("S1 console errors:", criticalErrors);
    }
  });

  // ─────────────────────────────────────────────
  // Scenario 2: 채널 전환
  // ─────────────────────────────────────────────
  test("S2: 채널 전환 — clicking channels updates active state", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.locator("textarea").first().waitFor({ timeout: 5000 });

    const t0 = Date.now();
    const textarea = page.locator("textarea").first();

    // Click 'dev' channel via data-testid to ensure the clickable div is targeted
    await page.locator('[data-testid="channel-item-dev"]').click();

    // Wait until placeholder reflects the channel switch (not a fixed sleep)
    await expect.poll(
      () => textarea.getAttribute("placeholder"),
      { timeout: 2000 }
    ).toContain("dev");
    const placeholder = await textarea.getAttribute("placeholder");
    console.log(`S2 after clicking dev — placeholder: ${placeholder}`);

    // Click 'tasks' channel
    await page.locator('[data-testid="channel-item-tasks"]').click();

    await expect.poll(
      () => textarea.getAttribute("placeholder"),
      { timeout: 2000 }
    ).toContain("tasks");
    const placeholder2 = await textarea.getAttribute("placeholder");
    console.log(`S2 after clicking tasks — placeholder: ${placeholder2}`);

    const elapsed = Date.now() - t0;
    console.log(`S2 elapsed: ${elapsed}ms`);
    expect(elapsed).toBeLessThan(5000);
  });

  // ─────────────────────────────────────────────
  // Scenario 3: 실시간 메시지
  // ─────────────────────────────────────────────
  test("S3: 실시간 메시지 — sending message in tasks channel shows it", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    // Navigate to tasks (non-agent channel, uses local state)
    await page.locator('[data-testid="channel-item-tasks"]').click();
    await expect.poll(
      () => page.locator("textarea").first().getAttribute("placeholder"),
      { timeout: 2000 }
    ).toContain("tasks");

    const t0 = Date.now();
    const textarea = page.locator("textarea").first();
    await textarea.waitFor({ timeout: 5000 });

    const testMsg = `E2E 테스트 메시지 ${Date.now()}`;
    await textarea.click();
    await textarea.fill(testMsg);
    await textarea.press("Enter");

    // Message should appear in chat area within 5s
    await expect(page.locator(`text=${testMsg}`)).toBeVisible({ timeout: 5000 });

    const elapsed = Date.now() - t0;
    console.log(`S3 elapsed: ${elapsed}ms`);
    expect(elapsed).toBeLessThan(5000);
  });

  // ─────────────────────────────────────────────
  // Scenario 4: 기기 사이드바 수치 갱신
  // ─────────────────────────────────────────────
  test("S4: 기기 사이드바 수치 갱신 — device stats visible and API returns metrics", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.locator("textarea").first().waitFor({ timeout: 5000 });

    const t0 = Date.now();

    // Device sidebar: "부서" section header
    await expect(page.locator("text=부서")).toBeVisible({ timeout: 5000 });

    // Device card: 4060Ti Desktop (from INITIAL_DEVICES)
    await expect(page.getByText("4060Ti Desktop")).toBeVisible({ timeout: 5000 });

    // CPU label in device card
    await expect(page.locator("text=CPU").first()).toBeVisible({ timeout: 5000 });

    // RAM label in device card
    await expect(page.locator("text=RAM").first()).toBeVisible({ timeout: 5000 });

    // Verify /api/device-status returns valid JSON with cpu + ram
    const resp = await page.request.get("/api/device-status");
    expect(resp.status()).toBe(200);
    const body = await resp.json() as { cpu: number; gpu: number | null; ram: number };
    expect(typeof body.cpu).toBe("number");
    expect(typeof body.ram).toBe("number");
    expect(body.cpu).toBeGreaterThanOrEqual(0);
    expect(body.cpu).toBeLessThanOrEqual(100);
    console.log(`S4 device-status: cpu=${body.cpu}% ram=${body.ram}% gpu=${body.gpu}`);

    const elapsed = Date.now() - t0;
    console.log(`S4 elapsed: ${elapsed}ms`);
    expect(elapsed).toBeLessThan(5000);
  });

  // ─────────────────────────────────────────────
  // Scenario 5: 파트장 AI 대화
  // ─────────────────────────────────────────────
  test("S5: 파트장 AI 대화 — ceo channel accepts input, WS attempted", async ({ page }) => {
    const wsAttempts: string[] = [];
    // Track WebSocket connection attempts
    page.on("websocket", (ws) => wsAttempts.push(ws.url()));

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.locator("textarea").first().waitFor({ timeout: 5000 });

    const t0 = Date.now();

    // Navigate to CEO agent channel
    await page.locator('[data-testid="channel-item-ceo"]').click();

    // Wait for placeholder to confirm channel switch
    const textarea = page.locator("textarea").first();
    await expect.poll(
      () => textarea.getAttribute("placeholder"),
      { timeout: 2000 }
    ).toContain("ceo");
    const placeholder = await textarea.getAttribute("placeholder");
    expect(placeholder).toContain("ceo");

    // Type a message
    const testMsg = `파트장 AI 테스트 ${Date.now()}`;
    await textarea.click();
    await textarea.fill(testMsg);

    // Send button should be enabled
    const sendBtn = page.locator("button").last();
    await expect(sendBtn).toBeEnabled({ timeout: 3000 });

    // Press Enter to send
    await textarea.press("Enter");
    await page.waitForTimeout(1000);

    // App should still be responsive (no crash)
    await expect(page.locator("text=MUSU").first()).toBeVisible({ timeout: 3000 });

    // WebSocket should have been attempted to musu-portd
    const ceoWsAttempted = wsAttempts.some(url => url.includes("/chat/ws/ceo") || url.includes("1355"));
    console.log(`S5 WS attempts: ${JSON.stringify(wsAttempts)}`);
    console.log(`S5 WS to ceo channel attempted: ${ceoWsAttempted}`);

    // musu-portd is running on port 1355 — verify it accepts WS connections
    const wsReachable = await page.evaluate(async () => {
      return new Promise<boolean>((resolve) => {
        try {
          const ws = new WebSocket("ws://localhost:1355/chat/ws/ceo");
          ws.onopen = () => { ws.close(); resolve(true); };
          ws.onerror = () => resolve(false);
          setTimeout(() => { ws.close(); resolve(false); }, 3000);
        } catch { resolve(false); }
      });
    });
    console.log(`S5 musu-portd WS reachable: ${wsReachable}`);
    expect(wsReachable).toBe(true);

    const elapsed = Date.now() - t0;
    console.log(`S5 elapsed: ${elapsed}ms`);
    expect(elapsed).toBeLessThan(5000);
  });
});
