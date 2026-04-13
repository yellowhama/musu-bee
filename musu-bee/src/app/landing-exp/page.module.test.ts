import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

const PAGE_MODULE_PATH = resolve(process.cwd(), "src/app/landing-exp/page.module.css");

test("landing-exp module uses brand css vars instead of hardcoded brand palette", async () => {
  const css = await readFile(PAGE_MODULE_PATH, "utf8");

  const forbiddenPatterns = [
    /#2d1d19/i,
    /#ffd166/i,
    /#fdfcf0/i,
    /rgba\(45,\s*29,\s*25/i,
    /rgba\(255,\s*209,\s*102/i,
    /rgba\(253,\s*252,\s*240/i,
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
