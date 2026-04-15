import { chromium, devices } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const artifactDir = process.argv[2];
const base = 'http://127.0.0.1:3001';
const routes = ['/landing', '/pricing', '/pro', '/faq', '/install'];
const contexts = [
  { name: 'desktop', viewport: { width: 1440, height: 900 }, userAgent: undefined },
  { name: 'mobile', ...devices['iPhone 12'] },
];

await fs.mkdir(artifactDir, { recursive: true });
const logRows = [];
const now = () => new Date().toISOString();

const browser = await chromium.launch({ headless: true });
try {
  for (const ctxDef of contexts) {
    const context = await browser.newContext(ctxDef);
    const page = await context.newPage();
    for (const route of routes) {
      const routeName = route.replace('/', '') || 'root';
      const target = `${base}${route}`;
      const rowBase = { ts: now(), context: ctxDef.name, route, target };
      try {
        await page.goto(target, { waitUntil: 'networkidle', timeout: 45000 });
      } catch {
        await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 45000 });
      }
      const shot = path.join(artifactDir, `visual_${ctxDef.name}_${routeName}.png`);
      await page.screenshot({ path: shot, fullPage: true });
      logRows.push({ ...rowBase, kind: 'visual', artifact: shot, url: page.url() });

      if (ctxDef.name === 'desktop') {
        // Nav replay
        let navStatus = 'no_target';
        let navName = '[none]';
        const navCandidates = [
          page.getByRole('link', { name: /pricing/i }).first(),
          page.getByRole('link', { name: /faq/i }).first(),
          page.getByRole('link', { name: /install/i }).first(),
          page.getByRole('link', { name: /pro/i }).first(),
          page.getByRole('link', { name: /landing/i }).first(),
          page.getByRole('link', { name: /home/i }).first(),
        ];
        for (const c of navCandidates) {
          if (await c.count()) {
            navName = (await c.first().innerText().catch(() => 'link')).trim() || 'link';
            try {
              await c.first().click({ timeout: 5000 });
              await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
              navStatus = 'clicked';
            } catch {
              navStatus = 'click_error';
            }
            break;
          }
        }
        const navShot = path.join(artifactDir, `interaction_nav_${routeName}.png`);
        await page.screenshot({ path: navShot, fullPage: true });
        logRows.push({
          ...rowBase,
          kind: 'interaction_nav',
          action: navName,
          status: navStatus,
          observedUrl: page.url(),
          artifact: navShot,
        });

        // Return to route before CTA interaction
        await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 45000 });

        // CTA replay
        let ctaStatus = 'no_target';
        let ctaName = '[none]';
        const ctaCandidates = [
          page.getByRole('button', { name: /start|get|join|install|access|pro|team|waitlist|book|try/i }).first(),
          page.getByRole('link', { name: /start|get|join|install|access|pro|team|waitlist|book|try/i }).first(),
          page.locator('button').first(),
          page.locator('a').first(),
        ];
        for (const c of ctaCandidates) {
          if (await c.count()) {
            ctaName = (await c.first().innerText().catch(() => 'cta')).trim() || 'cta';
            try {
              await c.first().click({ timeout: 5000 });
              await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
              ctaStatus = 'clicked';
            } catch {
              ctaStatus = 'click_error';
            }
            break;
          }
        }
        const ctaShot = path.join(artifactDir, `interaction_cta_${routeName}.png`);
        await page.screenshot({ path: ctaShot, fullPage: true });
        logRows.push({
          ...rowBase,
          kind: 'interaction_cta',
          action: ctaName,
          status: ctaStatus,
          observedUrl: page.url(),
          artifact: ctaShot,
        });
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
}

const jsonPath = path.join(artifactDir, 'interaction_replay.json');
await fs.writeFile(jsonPath, JSON.stringify(logRows, null, 2));

const tsvHeader = 'ts\tkind\tcontext\troute\taction\tstatus\turl\tartifact\n';
const tsvBody = logRows.map((r) => [
  r.ts ?? '',
  r.kind ?? '',
  r.context ?? '',
  r.route ?? '',
  r.action ?? '',
  r.status ?? '',
  (r.observedUrl ?? r.url ?? ''),
  r.artifact ?? '',
].join('\t')).join('\n') + '\n';
await fs.writeFile(path.join(artifactDir, 'interaction_replay.tsv'), tsvHeader + tsvBody);

console.log(JSON.stringify({ ok: true, rows: logRows.length, jsonPath }, null, 2));
