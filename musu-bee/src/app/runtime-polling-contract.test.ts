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

test("dashboard refresh loop stays on shared low-duty polling", () => {
  const text = source("src/components/dashboard/DashboardClient.tsx");

  assert.match(text, /useLowDutyPolling/);
  assert.doesNotMatch(text, /document\.addEventListener\("visibilitychange"/);
  assert.match(text, /intervalMs:\s*DASHBOARD_REFRESH_VISIBLE_MS/);
  assert.match(text, /maxBackoffMs:\s*DASHBOARD_REFRESH_HIDDEN_MS/);
  assert.match(text, /taskTimeoutMs:\s*DASHBOARD_REFRESH_TIMEOUT_MS/);
});

test("dashboard relay connection is on-demand instead of mount-time polling", () => {
  const text = source("src/components/dashboard/DashboardClient.tsx");

  assert.match(text, /handleRelayConnect/);
  assert.match(text, /fetchRelayToken/);
  assert.doesNotMatch(text, /Auto-connect when relayInfo/);
  assert.doesNotMatch(text, /connectRelay\(relayInfo,\s*selectedNode\)/);
  assert.doesNotMatch(text, /useEffect\(\(\)\s*=>\s*\{[\s\S]*const controller = new AbortController\(\);[\s\S]*fetch\("\/api\/account\/relay-token"/);
});

test("dashboard relay reconnect stays bounded with capped backoff", () => {
  const text = source("src/components/dashboard/DashboardClient.tsx");

  assert.match(text, /RELAY_RECONNECT_INITIAL_MS\s*=\s*5_000/);
  assert.match(text, /RELAY_RECONNECT_MAX_MS\s*=\s*60_000/);
  assert.match(text, /relayReconnectDelayMs/);
  assert.match(text, /Math\.min\(\s*RELAY_RECONNECT_MAX_MS/);
  assert.doesNotMatch(text, /const RETRY_DELAY_MS\s*=/);
});

test("chat SSE reconnect clears timers and ignores stale generations", () => {
  const text = source("src/lib/useChat.ts");

  assert.match(text, /SSE_RECONNECT_INITIAL_MS\s*=\s*1_000/);
  assert.match(text, /SSE_RECONNECT_MAX_MS\s*=\s*10_000/);
  assert.match(text, /SSE_RECONNECT_MULTIPLIER\s*=\s*2/);
  assert.match(text, /reconnectGenerationRef/);
  assert.match(text, /clearReconnectTimer/);
  assert.match(text, /reconnectGenerationRef\.current !== reconnectGeneration/);
  assert.match(text, /EventSource\.CONNECTING/);
});

test("node panel refresh loop stays on shared low-duty polling", () => {
  const text = source("src/components/NodePanel.tsx");

  assert.match(text, /useLowDutyPolling/);
  assert.doesNotMatch(text, /document\.addEventListener\("visibilitychange"/);
  assert.match(text, /intervalMs:\s*NODE_PANEL_REFRESH_VISIBLE_MS/);
  assert.match(text, /maxBackoffMs:\s*NODE_PANEL_REFRESH_HIDDEN_MS/);
});

test("shared low-duty polling supports bounded task timeout cancellation", () => {
  const text = source("src/lib/useLowDutyPolling.ts");

  assert.match(text, /taskTimeoutMs\?:\s*number/);
  assert.match(text, /DEFAULT_LOW_DUTY_POLL_TASK_TIMEOUT_MS\s*=\s*10_000/);
  assert.match(text, /taskTimeoutMs\s*=\s*DEFAULT_LOW_DUTY_POLL_TASK_TIMEOUT_MS/);
  assert.match(text, /AbortSignal\.timeout\(taskTimeoutMs\)/);
  assert.match(text, /AbortSignal\.any/);
});
