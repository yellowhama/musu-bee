import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();

function source(relativePath: string) {
  return readFileSync(path.join(ROOT, relativePath), "utf8");
}

test("workflow run panel uses cancellable low-duty polling instead of setInterval", () => {
  const text = source("src/app/c/[id]/workflows/[wfId]/edit/RunPanel.tsx");

  assert.match(text, /useLowDutyPolling/);
  assert.doesNotMatch(text, /setInterval\s*\(/);
  assert.match(text, /intervalMs:\s*5_000/);
});

test("remote screen page uses cancellable low-duty polling instead of setInterval", () => {
  const text = source("src/app/app/screen/page.tsx");

  assert.match(text, /useLowDutyPolling/);
  assert.doesNotMatch(text, /setInterval\s*\(/);
  assert.match(text, /maxBackoffMs:\s*120_000/);
});

test("agents surface polling stays on shared low-duty polling", () => {
  const text = source("src/lib/useAgentsSurface.ts");

  assert.match(text, /useLowDutyPolling/);
  assert.doesNotMatch(text, /setInterval\s*\(/);
  assert.doesNotMatch(text, /document\.addEventListener\("visibilitychange"/);
  assert.match(text, /AGENTS_SURFACE_REFRESH_HIDDEN_MS/);
});

test("onboarding research task polling uses shared low-duty polling", () => {
  const text = source("src/components/onboarding/useOnboardingFlow.ts");

  assert.match(text, /useLowDutyPolling/);
  assert.doesNotMatch(text, /setInterval\s*\(/);
  assert.match(text, /pollResearchTask/);
});
