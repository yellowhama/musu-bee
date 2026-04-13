import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const thisFile = fileURLToPath(import.meta.url);
const appDir = path.dirname(thisFile);
const srcDir = path.resolve(appDir, "..");
const globalsPath = path.join(appDir, "globals.css");

const brandHexPatterns = [
  /#facc15/i,
  /#ffd166/i,
  /#2d1d19/i,
  /#fdfcf0/i,
  /#f8f6f1/i,
];

const deprecatedBrandVars = [
  "var(--musu-yellow)",
  "var(--musu-brown)",
  "var(--musu-off-white)",
  "var(--musu-stroke)",
];

function walkFiles(dir: string, out: string[] = []): string[] {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      walkFiles(fullPath, out);
      continue;
    }
    if (/\.(css|ts|tsx)$/.test(entry)) {
      out.push(fullPath);
    }
  }
  return out;
}

function isTestFile(filePath: string): boolean {
  return /\.test\.(ts|tsx)$/.test(filePath) || /\.spec\.(ts|tsx)$/.test(filePath);
}

test("globals.css defines canonical MUSU brand tokens", () => {
  const globals = readFileSync(globalsPath, "utf8");
  assert.match(globals, /--musu-color-brand-accent:\s*#FFD166;/);
  assert.match(globals, /--musu-color-brand-ink:\s*#2D1D19;/);
  assert.match(globals, /--musu-color-brand-canvas:\s*#FDFCF0;/);
  assert.match(globals, /--musu-color-brand-stroke:\s*#F8F6F1;/);
  assert.match(globals, /--musu-yellow:\s*var\(--musu-color-brand-accent\);/);
  assert.match(globals, /--musu-cocoa-brown:\s*var\(--musu-color-brand-ink\);/);
  assert.match(globals, /--musu-off-white:\s*var\(--musu-color-brand-canvas\);/);
});

test("brand hex literals are not used outside globals.css", () => {
  const offenders: string[] = [];
  for (const filePath of walkFiles(srcDir)) {
    if (filePath === globalsPath || isTestFile(filePath)) continue;
    const content = readFileSync(filePath, "utf8");
    if (brandHexPatterns.some((pattern) => pattern.test(content))) {
      offenders.push(path.relative(srcDir, filePath));
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `Found raw brand hex literals outside globals.css: ${offenders.join(", ")}`,
  );
});

test("deprecated brand aliases are not consumed directly", () => {
  const offenders: string[] = [];
  for (const filePath of walkFiles(srcDir)) {
    if (filePath === globalsPath || isTestFile(filePath)) continue;
    const content = readFileSync(filePath, "utf8");
    if (deprecatedBrandVars.some((legacyVar) => content.includes(legacyVar))) {
      offenders.push(path.relative(srcDir, filePath));
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `Found deprecated brand variable consumption: ${offenders.join(", ")}`,
  );
});
