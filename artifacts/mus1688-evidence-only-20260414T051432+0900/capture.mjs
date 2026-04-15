import { chromium, devices } from '@playwright/test';
import fs from 'node:fs';
const art = process.env.ART;
const base = process.env.BASE;
const routes = ['/landing','/pricing','/pro','/faq','/install'];
const variants = [
  { name: 'desktop', viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  { name: 'mobile', ...devices['iPhone 12'] },
];
const visualRows = [];
const interactionRows = [];
const browser = await chromium.launch({ headless: true });
for (const v of variants) {
  const context = await browser.newContext(v.name === 'mobile' ? v : { viewport: v.viewport, deviceScaleFactor: v.deviceScaleFactor, isMobile: v.isMobile, hasTouch: v.hasTouch });
  for (const route of routes) {
    const page = await context.newPage();
    const url = `${base}${route}`;
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(800);
    const shot = `${art}/visual/${route.slice(1)}-${v.name}.png`;
    await page.screenshot({ path: shot, fullPage: true });
    visualRows.push({ route, variant: v.name, status: resp ? resp.status() : -1, screenshot: shot });
    await page.close();
  }
  await context.close();
}
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
for (const route of routes) {
  const page = await ctx.newPage();
  const url = `${base}${route}`;
  const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(700);
  const before = `${art}/interaction/${route.slice(1)}-before.png`;
  await page.screenshot({ path: before, fullPage: true });
  const href = await page.evaluate((currentPath) => {
    const anchors = Array.from(document.querySelectorAll('a[href]'));
    for (const a of anchors) {
      const raw = a.getAttribute('href') || '';
      if (!raw.startsWith('/')) continue;
      if (raw === currentPath) continue;
      if (raw.startsWith('/api/')) continue;
      return raw;
    }
    return null;
  }, route);
  let observed = 'no_internal_link';
  let target = '';
  if (href) {
    target = href;
    await page.goto(`${base}${href}`, { waitUntil: 'domcontentloaded', timeout: 10000 });
    observed = new URL(page.url()).pathname;
  }
  await page.waitForTimeout(700);
  const after = `${art}/interaction/${route.slice(1)}-after.png`;
  await page.screenshot({ path: after, fullPage: true });
  interactionRows.push({ route, expectedAction: target || '[none]', observed, before, after, status: resp ? resp.status() : -1 });
  await page.close();
}
await ctx.close();
await browser.close();
fs.writeFileSync(`${art}/visual_matrix.json`, JSON.stringify(visualRows, null, 2));
fs.writeFileSync(`${art}/interaction_replay.json`, JSON.stringify(interactionRows, null, 2));
