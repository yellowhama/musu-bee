import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();

function source(relativePath: string) {
  return readFileSync(path.join(ROOT, relativePath), "utf8");
}

test("local dashboard gate allows loopback hosts for free plans", () => {
  const text = source("src/app/app/page.tsx");

  assert.match(text, /headers\(\)/);
  assert.match(text, /isLoopbackDashboardHost/);
  assert.match(text, /host === "localhost"/);
  assert.match(text, /host === "127\.0\.0\.1"/);
  assert.match(text, /host\.startsWith\("127\."\)/);
  assert.match(text, /host === "::1"/);
  assert.match(
    text,
    /!isPaidTier && !isEmbedded && !isLocalDashboardRequest/
  );
});
