import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();

function source(relativePath: string) {
  return readFileSync(path.join(ROOT, relativePath), "utf8");
}

// The web workspace SaaS surface is gated off by default. Both /app and
// /workspace must return UseDesktopGate before mounting AppShell when
// MUSU_WORKSPACE_UI is not enabled — otherwise a direct deep-link bypasses the
// gate and the companies-401 / ceo-OFFLINE calls fire on AppShell mount.
test("/app gates AppShell behind isWorkspaceUiEnabled", () => {
  const text = source("src/app/app/page.tsx");
  assert.match(text, /isWorkspaceUiEnabled/);
  assert.match(text, /UseDesktopGate/);
  assert.match(text, /if \(!isWorkspaceUiEnabled\(\)\)/);
});

test("/workspace gates AppShell with the same flag (no deep-link bypass)", () => {
  const text = source("src/app/workspace/page.tsx");
  assert.match(text, /isWorkspaceUiEnabled/);
  assert.match(text, /UseDesktopGate/);
  assert.match(text, /if \(!isWorkspaceUiEnabled\(\)\)/);
});

test("the gate flag is a server-side runtime read, default OFF", () => {
  const text = source("src/lib/workspaceUi.ts");
  assert.match(text, /server-only/);
  assert.match(text, /MUSU_WORKSPACE_UI/);
  // Compared to "true" (default OFF): any other value keeps the gate shown.
  assert.match(text, /=== "true"/);
});
