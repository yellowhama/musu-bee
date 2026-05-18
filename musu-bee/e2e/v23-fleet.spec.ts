/**
 * V23.4 T2-C — Fleet view (/fleet) E2E (wiki/434 §2.9 + §3 T15..T20).
 *
 * Mocks the bridge HTTP responses (axis_routes.py + server.py) so the test
 * runs without a live bridge. Validates:
 *   - /fleet renders list of paired PCs from bridge GET /api/machines
 *   - 3 capacity bars per PC card (GPU / Memory / CPU)
 *   - Click on PC card navigates to /m/[id]
 *   - Error banner shows when bridge 503s
 *   - AddPcWizard fetches GET /api/agents on modal open
 *   - 503 on GET /api/agents → free-text fallback
 *   - AddPcWizard POST body has NO `version` field (F-R7 regression)
 *
 * Modeled on e2e/v21-axis-views.spec.ts (Researcher F-R6 stubBridge precedent).
 */

import { test, expect, type Route } from "@playwright/test";

const BRIDGE = "http://localhost:8070";

const MACHINES_LIST = {
  machines: [
    {
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
      inflight_requests: 3,
    },
    {
      id: "m-laptop",
      hostname: "laptop-7",
      os: "darwin",
      arch: "arm64",
      status: "stale",
      last_seen_at: "2026-05-15T09:30:00Z",
      capacity: null,
      inflight_requests: 0,
    },
  ],
  count: 2,
};

const AGENTS_LIST = [
  { id: "agent-scout", name: "Scout" },
  { id: "agent-ranger", name: "Ranger" },
];

interface BridgeStubs {
  machines?: object | number; // object = response body; number = HTTP status
  agents?: object | number;
}

async function stubBridge(
  page: import("@playwright/test").Page,
  opts: BridgeStubs = {},
) {
  const machinesBody = opts.machines ?? MACHINES_LIST;
  const agentsBody = opts.agents ?? AGENTS_LIST;

  await page.route(`${BRIDGE}/api/machines`, async (route: Route) => {
    if (typeof machinesBody === "number") {
      await route.fulfill({
        status: machinesBody,
        contentType: "application/json",
        body: JSON.stringify({ detail: "stub error" }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(machinesBody),
    });
  });

  await page.route(`${BRIDGE}/api/agents`, async (route: Route) => {
    if (typeof agentsBody === "number") {
      await route.fulfill({
        status: agentsBody,
        contentType: "application/json",
        body: JSON.stringify({ detail: "stub error" }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(agentsBody),
    });
  });

  // Single machine detail (for navigation from /fleet → /m/[id]).
  await page.route(`${BRIDGE}/api/machines/m-gpu`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...MACHINES_LIST.machines[0],
        active_requests: [],
      }),
    });
  });

  // SSE: long-running response with no events. Lets the page mount cleanly.
  await page.route(`${BRIDGE}/api/watch/subscribe?**`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream" },
      body: ":keepalive\n\n",
    });
  });
}

test.describe("Fleet view (/fleet)", () => {
  test("renders list of paired PCs from bridge", async ({ page }) => {
    await stubBridge(page);
    await page.goto("/fleet");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Your PCs",
    );
    await expect(page.getByTestId("pc-m-gpu")).toBeVisible();
    await expect(page.getByTestId("pc-m-laptop")).toBeVisible();
  });

  test("renders 3 capacity bars on a PC card with capacity", async ({
    page,
  }) => {
    await stubBridge(page);
    await page.goto("/fleet");
    const card = page.getByTestId("pc-m-gpu");
    await expect(card).toContainText(/GPU VRAM/);
    await expect(card).toContainText(/Memory/);
    await expect(card).toContainText(/CPU/);
    // Inflight badge = 3 active
    await expect(card).toContainText("3 active");
  });

  test("click on PC card navigates to /m/[id]", async ({ page }) => {
    await stubBridge(page);
    await page.goto("/fleet");
    await page.getByTestId("pc-m-gpu").click();
    await expect(page).toHaveURL(/\/m\/m-gpu$/);
  });

  test("error banner shows when bridge 503s", async ({ page }) => {
    await stubBridge(page, { machines: 503 });
    await page.goto("/fleet");
    await expect(page.getByRole("alert")).toContainText(/Bridge unreachable/);
  });

  test("AddPcWizard modal-open triggers GET /api/agents and renders multiselect", async ({
    page,
  }) => {
    await stubBridge(page);
    await page.goto("/fleet");
    await page.getByRole("button", { name: "+ Add a PC" }).click();
    await expect(page.getByRole("dialog", { name: "Add PC" })).toBeVisible();
    // Multiselect populated with two agents
    await expect(page.getByRole("option", { name: /Scout/ })).toBeVisible();
    await expect(page.getByRole("option", { name: /Ranger/ })).toBeVisible();
  });

  test("AddPcWizard with 503 on /api/agents shows free-text fallback + banner", async ({
    page,
  }) => {
    await stubBridge(page, { agents: 503 });
    await page.goto("/fleet");
    await page.getByRole("button", { name: "+ Add a PC" }).click();
    await expect(
      page.getByText(/Agents list unavailable/),
    ).toBeVisible();
    await expect(
      page.getByPlaceholder(/agent-id-1, agent-id-2/),
    ).toBeVisible();
  });

  test("AddPcWizard POST body has NO version field (F-R7)", async ({
    page,
  }) => {
    await stubBridge(page);

    let capturedBody: unknown = null;
    await page.route(
      `${BRIDGE}/api/admin/pair/accept`,
      async (route: Route) => {
        capturedBody = JSON.parse(route.request().postData() || "{}");
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true }),
        });
      },
    );

    await page.goto("/fleet");
    await page.getByRole("button", { name: "+ Add a PC" }).click();
    await page
      .getByPlaceholder(/workstation-1/)
      .fill("workstation-9");
    await page
      .getByPlaceholder(/http:\/\/192\.168/)
      .fill("http://192.168.1.42:8070");
    await page.getByRole("button", { name: /Pair PC/ }).click();

    await expect.poll(() => capturedBody).not.toBeNull();
    const body = capturedBody as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["agents", "name", "url"]);
    expect("version" in body).toBe(false);
  });
});
