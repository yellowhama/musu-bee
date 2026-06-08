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

test("dashboard relay reconnect pauses while hidden and resumes with remaining backoff", () => {
  const text = source("src/components/dashboard/DashboardClient.tsx");

  assert.match(text, /relayReconnectPendingWhenVisible/);
  assert.match(text, /relayNextReconnectAt/);
  assert.match(text, /document\.addEventListener\("visibilitychange", handleRelayVisibilityChange\)/);
  assert.match(text, /document\.removeEventListener\("visibilitychange", handleRelayVisibilityChange\)/);
  assert.match(text, /if \(!relayDocumentIsVisible\(\)\)\s*\{\s*relayReconnectPendingWhenVisible\.current = true/);
  assert.match(text, /const remainingDelayMs = Math\.max\(0,\s*relayNextReconnectAt\.current - Date\.now\(\)\)/);
  assert.match(text, /if \(remainingDelayMs > 0\)\s*\{\s*armRelayReconnectTimer\(reconnectGeneration,\s*remainingDelayMs,\s*relayInfoArg,\s*node\)/);
  assert.doesNotMatch(text, /setInterval\s*\(/);
});

test("chat SSE reconnect is capped, visibility-aware, and ignores stale generations", () => {
  const text = source("src/lib/useChat.ts");

  assert.match(text, /SSE_RECONNECT_INITIAL_MS\s*=\s*1_000/);
  assert.match(text, /SSE_RECONNECT_MAX_MS\s*=\s*10_000/);
  assert.match(text, /SSE_RECONNECT_MULTIPLIER\s*=\s*2/);
  assert.match(text, /SSE_MAX_RETRIES\s*=\s*5/);
  assert.match(text, /reconnectAttempts/);
  assert.match(text, /reconnectAttempts\.current\s*>=\s*SSE_MAX_RETRIES/);
  assert.match(text, /reconnectGenerationRef/);
  assert.match(text, /clearReconnectTimer/);
  assert.match(text, /resetReconnectState/);
  assert.match(text, /reconnectGenerationRef\.current !== reconnectGeneration/);
  assert.match(text, /EventSource\.CONNECTING/);
  assert.match(text, /reconnectPendingWhenVisible/);
  assert.match(text, /nextReconnectAt/);
  assert.match(text, /document\.addEventListener\("visibilitychange", handleVisibilityChange\)/);
  assert.match(text, /document\.removeEventListener\("visibilitychange", handleVisibilityChange\)/);
  assert.match(text, /if \(!chatDocumentIsVisible\(\)\)\s*\{\s*reconnectPendingWhenVisible\.current = true/);
  assert.match(text, /const remainingDelayMs = Math\.max\(0,\s*nextReconnectAt\.current - Date\.now\(\)\)/);
  assert.match(text, /if \(remainingDelayMs > 0\)\s*\{\s*armReconnectTimer\(reconnectGeneration,\s*remainingDelayMs\)/);
  assert.doesNotMatch(text, /setInterval\s*\(/);
});

test("fleet store SSE reconnect is bounded and explicitly closed", () => {
  const storeText = source("src/store/useFleetStore.ts");
  const fleetPageText = source("src/app/dashboard/fleet/page.tsx");
  const agentPageText = source("src/app/dashboard/agent/[id]/page.tsx");

  assert.match(storeText, /FLEET_SSE_RECONNECT_INITIAL_MS\s*=\s*1_000/);
  assert.match(storeText, /FLEET_SSE_RECONNECT_MAX_MS\s*=\s*10_000/);
  assert.match(storeText, /FLEET_SSE_RECONNECT_MULTIPLIER\s*=\s*2/);
  assert.match(storeText, /FLEET_SSE_MAX_RETRIES\s*=\s*5/);
  assert.match(storeText, /fleetReconnectGeneration/);
  assert.match(storeText, /clearFleetReconnectTimer/);
  assert.match(storeText, /scheduleFleetReconnect/);
  assert.match(storeText, /fleetReconnectAttempts\s*>=\s*FLEET_SSE_MAX_RETRIES/);
  assert.match(storeText, /fleetReconnectGeneration !== reconnectGeneration/);
  assert.match(storeText, /EventSource\.CONNECTING/);
  assert.match(storeText, /fleetReconnectPendingWhenVisible/);
  assert.match(storeText, /fleetNextReconnectAt/);
  assert.match(storeText, /document\.addEventListener\("visibilitychange", handleFleetVisibilityChange\)/);
  assert.match(storeText, /document\.removeEventListener\("visibilitychange", handleFleetVisibilityChange\)/);
  assert.match(storeText, /if \(!fleetDocumentIsVisible\(\)\)\s*\{\s*fleetReconnectPendingWhenVisible = true/);
  assert.match(storeText, /const remainingDelayMs = Math\.max\(0,\s*fleetNextReconnectAt - Date\.now\(\)\)/);
  assert.match(storeText, /if \(remainingDelayMs > 0\)\s*\{\s*armFleetReconnectTimer\(reconnectGeneration,\s*remainingDelayMs\)/);
  assert.doesNotMatch(storeText, /setInterval\s*\(/);
  assert.match(fleetPageText, /return \(\) => closeSSE\(\)/);
  assert.match(agentPageText, /return \(\) => closeSSE\(\)/);
});

test("shared bounded EventSource closes failed streams and caps reconnects", () => {
  const text = source("src/lib/useBoundedEventSource.ts");

  assert.match(text, /BOUNDED_SSE_RECONNECT_INITIAL_MS\s*=\s*1_000/);
  assert.match(text, /BOUNDED_SSE_RECONNECT_MAX_MS\s*=\s*10_000/);
  assert.match(text, /BOUNDED_SSE_RECONNECT_MULTIPLIER\s*=\s*2/);
  assert.match(text, /BOUNDED_SSE_MAX_RETRIES\s*=\s*5/);
  assert.match(text, /new EventSource\(url\)/);
  assert.match(text, /es\.close\(\)/);
  assert.match(text, /reconnectAttempts\s*>=\s*maxRetries/);
  assert.match(text, /useLowDutyPolling/);
  assert.match(text, /useLowDutyPolling\(\s*\(signal\)\s*=>/);
  assert.match(text, /if \(signal\.aborted\) return/);
  assert.match(text, /BOUNDED_SSE_VISIBILITY_RECONNECT_CHECK_MS\s*=\s*10_000/);
  assert.match(text, /let reconnectExhausted = false/);
  assert.match(text, /reconnectExhausted = true/);
  assert.match(text, /if \(cancelled \|\| source \|\| reconnectExhausted\) return/);
  assert.doesNotMatch(text, /reconnectAttempts\s*=\s*0;\s*connect\(\);/);
  assert.doesNotMatch(text, /document\.addEventListener\("visibilitychange"/);
  assert.doesNotMatch(text, /document\.removeEventListener\("visibilitychange"/);
});

test("frontend polling audit inventories all low-duty call sites", () => {
  const text = source("../scripts/windows/audit-frontend-polling-contract.ps1");

  assert.match(text, /\$expectedLowDutyPollingCallSitePaths\s*=\s*@\(/);
  assert.match(text, /low_duty_polling_call_site_count/);
  assert.match(text, /expected_low_duty_polling_call_site_count/);
  assert.match(text, /missing_low_duty_polling_call_site_count/);
  assert.match(text, /missing_low_duty_polling_call_sites/);
  assert.match(text, /unexpected_low_duty_polling_call_site_count/);
  assert.match(text, /unexpected_low_duty_polling_call_sites/);
  assert.match(text, /Low-duty polling inventory drift found/);
  assert.match(text, /low_duty_polling_signal_gap_count/);
  assert.match(text, /low-duty polling call-site inventory/);
  assert.match(text, /low-duty polling callbacks expose abort signals/);
  assert.match(text, /polling callback does not expose AbortSignal/);
  assert.match(text, /musu-bee\\src\\lib\\useServiceHealth\.ts/);
  assert.match(text, /musu-bee\\src\\components\\dashboard\\DashboardClient\.tsx/);
  assert.match(text, /musu-bee\\views\\nodes\\NodesView\.tsx/);
  assert.match(text, /musu-bee\\views\\tasks\\TasksView\.tsx/);
});

test("dashboard axis pages use bounded EventSource instead of browser auto-retry", () => {
  const fleetText = source("src/app/fleet/page.tsx");
  const companyText = source("src/app/c/[id]/page.tsx");
  const machineText = source("src/app/m/[id]/page.tsx");
  const tasksText = source("src/components/TasksPanel.tsx");

  for (const text of [fleetText, companyText, machineText, tasksText]) {
    assert.match(text, /useBoundedEventSource/);
    assert.doesNotMatch(text, /new EventSource\(/);
    assert.doesNotMatch(text, /Browser auto-retries/);
  }
});

test("CEO dispatch run streams are explicitly closed", () => {
  const text = source("src/components/dispatch/CeoChatClient.tsx");

  assert.match(text, /runStreamsRef/);
  assert.match(text, /useRef<Map<string,\s*EventSource>>\(new Map\(\)\)/);
  assert.match(text, /closeRunStream/);
  assert.match(text, /runStreamsRef\.current\.set\(runId,\s*es\)/);
  assert.match(text, /runStreamsRef\.current\.delete\(runId\)/);
  assert.match(text, /runStreamsRef\.current\.clear\(\)/);
  assert.match(text, /stream connection closed/);
  assert.doesNotMatch(text, /setInterval\s*\(/);
});

test("node panel refresh loop stays on shared low-duty polling", () => {
  const text = source("src/components/NodePanel.tsx");

  assert.match(text, /useLowDutyPolling/);
  assert.doesNotMatch(text, /document\.addEventListener\("visibilitychange"/);
  assert.match(text, /intervalMs:\s*NODE_PANEL_REFRESH_VISIBLE_MS/);
  assert.match(text, /maxBackoffMs:\s*NODE_PANEL_REFRESH_HIDDEN_MS/);
});

test("MCP app views use cancellable low-duty polling instead of setInterval", () => {
  const pollerText = source("views/shared/useLowDutyPolling.ts");
  const nodesText = source("views/nodes/NodesView.tsx");
  const tasksText = source("views/tasks/TasksView.tsx");
  const apiText = source("views/shared/api.ts");

  assert.match(pollerText, /MIN_LOW_DUTY_POLL_INTERVAL_MS\s*=\s*5_000/);
  assert.match(pollerText, /AbortSignal\.timeout\(taskTimeoutMs\)/);
  assert.match(pollerText, /AbortSignal\.any/);
  assert.doesNotMatch(pollerText, /setInterval\s*\(/);

  for (const text of [nodesText, tasksText]) {
    assert.match(text, /useLowDutyPolling/);
    assert.doesNotMatch(text, /setInterval\s*\(/);
    assert.doesNotMatch(text, /document\.addEventListener\("visibilitychange"/);
  }
  assert.match(nodesText, /useLowDutyPolling\(\(signal\)\s*=>\s*pollNodes\(signal\)/);
  assert.match(nodesText, /callServerTool\([\s\S]*name:\s*"poll_agents"[\s\S]*signal\s*\?\s*\{\s*signal\s*\}\s*:\s*undefined/);
  assert.match(tasksText, /useLowDutyPolling\(\(signal\)\s*=>\s*pollTasks\(null,\s*signal\)/);
  assert.match(tasksText, /callServerTool\([\s\S]*name:\s*"poll_tasks"[\s\S]*signal\s*\?\s*\{\s*signal\s*\}\s*:\s*undefined/);
  assert.match(apiText, /fetchTasks\([\s\S]*signal\?:\s*AbortSignal/);
  assert.match(apiText, /cancelTask\([\s\S]*signal\?:\s*AbortSignal/);
});

test("shared low-duty polling supports bounded task timeout cancellation", () => {
  const text = source("src/lib/useLowDutyPolling.ts");

  assert.match(text, /taskTimeoutMs\?:\s*number/);
  assert.match(text, /DEFAULT_LOW_DUTY_POLL_TASK_TIMEOUT_MS\s*=\s*10_000/);
  assert.match(text, /taskTimeoutMs\s*=\s*DEFAULT_LOW_DUTY_POLL_TASK_TIMEOUT_MS/);
  assert.match(text, /AbortSignal\.timeout\(taskTimeoutMs\)/);
  assert.match(text, /AbortSignal\.any/);
});

test("shared low-duty polling clamps accidental tight intervals", () => {
  const text = source("src/lib/useLowDutyPolling.ts");

  assert.match(text, /MIN_LOW_DUTY_POLL_INTERVAL_MS\s*=\s*5_000/);
  assert.match(text, /LOW_DUTY_HIDDEN_BACKOFF_MULTIPLIER\s*=\s*4/);
  assert.match(text, /effectiveIntervalMs\s*=\s*Math\.max\(intervalMs,\s*MIN_LOW_DUTY_POLL_INTERVAL_MS\)/);
  assert.match(text, /effectiveMaxBackoffMs\s*=\s*Math\.max\(maxBackoffMs,\s*effectiveIntervalMs\)/);
  assert.match(text, /MAX_FAILURE_BACKOFF_EXPONENT\s*=\s*8/);
  assert.match(text, /let nextAllowedRunAt = 0/);
  assert.match(text, /nextAllowedRunAt = Date\.now\(\) \+ delayMs/);
  assert.match(text, /const remainingDelayMs = Math\.max\(0,\s*nextAllowedRunAt - Date\.now\(\)\)/);
  assert.match(text, /if \(remainingDelayMs > 0\)\s*\{\s*schedule\(remainingDelayMs\)/);
  assert.doesNotMatch(text, /clearTimer\(\);\s*void run\(\);/);
  assert.match(text, /typeof document !== "undefined"/);
});

test("MCP app low-duty polling visibility wake respects scheduled backoff", () => {
  const text = source("views/shared/useLowDutyPolling.ts");

  assert.match(text, /let nextAllowedRunAt = 0/);
  assert.match(text, /nextAllowedRunAt = Date\.now\(\) \+ delayMs/);
  assert.match(text, /const remainingDelayMs = Math\.max\(0,\s*nextAllowedRunAt - Date\.now\(\)\)/);
  assert.match(text, /if \(remainingDelayMs > 0\)\s*\{\s*schedule\(remainingDelayMs\)/);
  assert.doesNotMatch(text, /clearTimer\(\);\s*void run\(\);/);
});
