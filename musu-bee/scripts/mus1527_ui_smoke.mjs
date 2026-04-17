import { chromium } from '@playwright/test';
import fs from 'node:fs';

const OUT_DIR = '/home/hugh51/musu-functions/artifacts/mus1527-evidence-2026-04-11';
const APP_URL = 'http://127.0.0.1:3001/app';
const PROMPT = 'MUS-1527 UI smoke verify: reply with one short sentence mentioning MUS1527.';

fs.mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(240_000);

let apiRequestBody = null;
let apiResponseBody = null;
let apiStatus = null;

page.on('request', (req) => {
  if (req.url().endsWith('/api/chat') && req.method() === 'POST') {
    apiRequestBody = req.postData() ?? null;
  }
});

page.on('response', async (res) => {
  if (res.url().endsWith('/api/chat') && res.request().method() === 'POST') {
    apiStatus = res.status();
    try {
      apiResponseBody = await res.text();
    } catch {
      apiResponseBody = '[unreadable]';
    }
  }
});

await page.route('**/api/history**', async (route) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '[]',
  });
});

await page.route('**/api/device-status**', async (route) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ cpu: 0, gpu: 0, ram: 0, device_id: 'desktop-4060' }),
  });
});

await page.route('**/api/subscription**', async (route) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ deviceLimit: 3 }),
  });
});

await page.route('**/api/agents**', async (route) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      fetchedAt: new Date().toISOString(),
      degraded: false,
      stale: false,
      summary: {
        bossHost: null,
        lastHandoffTarget: null,
        handoffReasonCode: null,
        handoffRecordedAtMs: null,
        departments: [],
        statusCounts: {},
      },
      snapshot: [],
    }),
  });
});

await page.goto(APP_URL, { waitUntil: 'commit', timeout: 240_000 });
await page.locator('[data-testid="channel-item-ceo"]').waitFor({ state: 'visible', timeout: 240_000 });

const textarea = page.locator('textarea[placeholder*="#ceo"]');
await textarea.waitFor({ state: 'visible', timeout: 240_000 });
await textarea.fill(PROMPT);
await page.getByRole('button', { name: 'Send' }).click();

await page.waitForResponse(
  (res) => res.url().endsWith('/api/chat') && res.request().method() === 'POST',
  { timeout: 240_000 }
);
await page.waitForTimeout(2500);

const screenshotPath = OUT_DIR + '/ui_reply_screenshot.png';
await page.screenshot({ path: screenshotPath, fullPage: true });

let reply = null;
try {
  const parsed = JSON.parse(apiResponseBody ?? '{}');
  reply = parsed.text ?? null;
} catch {
  reply = null;
}

const uiEvidence = {
  prompt: PROMPT,
  apiStatus,
  apiRequestBody,
  apiResponseBody,
  reply,
};

fs.writeFileSync(OUT_DIR + '/ui_chat_response.json', JSON.stringify(uiEvidence, null, 2));
fs.writeFileSync(
  OUT_DIR + '/ui_reply_excerpt.txt',
  'prompt: ' + PROMPT + '\nreply: ' + (reply ?? '[TBD: awaiting real data]')
);

console.log(JSON.stringify({ screenshotPath, apiStatus, reply }, null, 2));

await browser.close();
