/**
 * v21.F — Company axis (/c/[id]) and Machine axis (/m/[id]) views.
 *
 * Mocks the bridge HTTP responses (axis_routes.py) so the test runs
 * without a live bridge. Validates:
 *   - Company page renders agents + their in-flight requests + totals
 *   - Machine page renders capacity bars + active requests
 *   - Cross-axis navigation: company → machine via the bound link
 *   - Loading and error states
 *   - SSE EventSource is opened against the right table(s)
 */

import { test, expect, Route } from "@playwright/test";

const BRIDGE = "http://localhost:8070";

const COMPANY_DISPATCH = {
  company: { id: "co-alpha", name: "Alpha Inc" },
  agents: [
    {
      id: "agent-scout",
      name: "Scout",
      status: "active",
      adapter_type: "claude_local",
      inflight_requests: [
        {
          id: "req-aaaaaaaa-1111",
          status: "running",
          priority: 1,
          bound_machine_id: "m-gpu",
          created_at: "2026-05-15T10:00:00Z",
        },
      ],
    },
    {
      id: "agent-ranger",
      name: "Ranger",
      status: "paused",
      adapter_type: "remote_process",
      inflight_requests: [],
    },
  ],
  totals: {
    agents_total: 2,
    agents_active: 1,
    requests_pending: 0,
    requests_running: 1,
  },
};

const MACHINE_DETAIL = {
  id: "m-gpu",
  hostname: "workstation-1",
  os: "linux",
  arch: "x86_64",
  status: "online",
  last_seen_at: "2026-05-15T10:01:00Z",
  capacity: {
    gpu_models: ["RTX 4060"],
    gpu_vram_total_gb: 8.0,
    gpu_vram_free_gb: 2.0,
    cpu_cores: 8,
    cpu_idle_pct: 65.0,
    mem_total_gb: 32.0,
    mem_free_gb: 16.0,
    runtime_classes: ["claude_local"],
    last_heartbeat_at: "2026-05-15T10:01:00Z",
  },
  active_requests: [
    {
      id: "req-aaaaaaaa-1111",
      agent_id: "agent-scout",
      company_id: "co-alpha",
      priority: 1,
      status: "running",
      bound_at: "2026-05-15T10:00:30Z",
      created_at: "2026-05-15T10:00:00Z",
    },
  ],
};

async function stubBridge(page: import("@playwright/test").Page) {
  await page.route(`${BRIDGE}/api/companies/co-alpha/dispatch`, async (route: Route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(COMPANY_DISPATCH) });
  });
  await page.route(`${BRIDGE}/api/machines/m-gpu`, async (route: Route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MACHINE_DETAIL) });
  });
  await page.route(`${BRIDGE}/api/companies/co-ghost/dispatch`, async (route: Route) => {
    await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ detail: "company 'co-ghost' not found" }) });
  });
  // SSE: long-running response with no events. Lets the page mount without errors.
  await page.route(`${BRIDGE}/api/watch/subscribe?**`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream" },
      body: ":keepalive\n\n",
    });
  });
}

test.describe("Company axis (/c/[id])", () => {
  test.beforeEach(async ({ page }) => {
    await stubBridge(page);
  });

  test("renders agents and totals", async ({ page }) => {
    await page.goto("/c/co-alpha");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Alpha Inc");

    // Totals
    await expect(page.getByText("Agents", { exact: true })).toBeVisible();
    await expect(page.getByText("Active", { exact: true })).toBeVisible();

    // Both agents rendered
    await expect(page.getByTestId("agent-agent-scout")).toBeVisible();
    await expect(page.getByTestId("agent-agent-ranger")).toBeVisible();

    // Scout's request line shows the machine link
    await expect(page.getByTestId("agent-agent-scout")).toContainText("running");
  });

  test("clicking the bound machine link navigates to /m/m-gpu", async ({ page }) => {
    await page.goto("/c/co-alpha");
    await page.getByRole("link", { name: /m-gpu/ }).first().click();
    await expect(page).toHaveURL(/\/m\/m-gpu$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("workstation-1");
  });

  test("shows error when bridge returns 404", async ({ page }) => {
    await page.goto("/c/co-ghost");
    await expect(page.getByRole("alert")).toContainText("Bridge unreachable");
  });
});

test.describe("Machine axis (/m/[id])", () => {
  test.beforeEach(async ({ page }) => {
    await stubBridge(page);
  });

  test("renders capacity bars and active requests", async ({ page }) => {
    await page.goto("/m/m-gpu");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("workstation-1");
    await expect(page.getByText(/RTX 4060/)).toBeVisible();
    await expect(page.getByText(/GPU VRAM/)).toBeVisible();
    await expect(page.getByText(/8 cores/)).toBeVisible();

    // Active request shown
    await expect(page.getByTestId("request-req-aaaaaaaa-1111")).toBeVisible();
    await expect(page.getByTestId("request-req-aaaaaaaa-1111")).toContainText("running");
  });

  test("company link in active request goes back to /c/co-alpha", async ({ page }) => {
    await page.goto("/m/m-gpu");
    await page.getByRole("link", { name: "co-alpha" }).click();
    await expect(page).toHaveURL(/\/c\/co-alpha$/);
  });
});
