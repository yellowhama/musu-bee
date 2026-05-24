import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

const PAGE_MODULE_PATH = resolve(process.cwd(), "src/app/landing-exp/page.module.css");

test("landing-exp module uses brand css vars instead of hardcoded brand palette", async () => {
  const css = await readFile(PAGE_MODULE_PATH, "utf8");

  const forbiddenPatterns = [
    /#2d1d19/i,    // old ink
    /#432c1c/i,    // new ink
    /#ffd166/i,    // old accent
    /#ffa602/i,    // new accent
    /#fdfcf0/i,    // old canvas
    /#fdfbf7/i,    // new canvas
    /rgba\(45,\s*29,\s*25/i,    // old ink rgba
    /rgba\(67,\s*44,\s*28/i,    // new ink rgba
    /rgba\(255,\s*209,\s*102/i, // old accent rgba
    /rgba\(255,\s*166,\s*2/i,   // new accent rgba
    /rgba\(253,\s*252,\s*240/i, // old canvas rgba
    /rgba\(253,\s*251,\s*247/i, // new canvas rgba
  ];

  for (const pattern of forbiddenPatterns) {
    assert.equal(
      pattern.test(css),
      false,
      `Forbidden hardcoded brand color matched: ${pattern}`
    );
  }

  assert.equal(css.includes("var(--musu-color-brand-ink)"), true);
  assert.equal(css.includes("var(--musu-color-brand-accent)"), true);
  assert.equal(css.includes("var(--musu-color-brand-canvas)"), true);
  assert.equal(css.includes("var(--musu-color-brand-ink-rgb)"), true);
  assert.equal(css.includes("var(--musu-color-brand-accent-rgb)"), true);
  assert.equal(css.includes("var(--musu-color-brand-canvas-rgb)"), true);
});
