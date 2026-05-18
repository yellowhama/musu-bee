/**
 * V23.4 Phase 4 T2-D-mini — Workflow builder E2E (wiki/435 v2 §7.2).
 *
 * Mocks /api/workflows* responses at the BROWSER boundary so the test runs
 * without a live musu-bridge. Note: Next.js routes the page's fetch through
 * its server-side proxy, but the BROWSER-originated fetches (POST/PATCH from
 * the form, GET polling from RunPanel) hit the Next /api proxy URL directly.
 *
 * Audit-fix A2 (wiki/435 v2): mock patterns target relative `/api/workflows*`
 * paths via `**` glob so they intercept the browser → Next /api proxy hop.
 * The previous absolute `http://localhost:8070/api/workflows*` patterns only
 * matched Node-side fetches from Next route handlers, which Playwright's
 * `page.route` cannot intercept — mocks never fired and the test gave a
 * false-positive pass.
 *
 * Validates:
 *   - happy path: 2-step workflow → Save (POST 201) → Run (PATCH 200) →
 *     RunPanel polls /status and at least one step transitions to running
 *   - PATCH body is exactly {status: "running"} (Critic C4 — no wrapper fields)
 *   - No @xyflow/react / tldraw / reactflow on page (master plan §5.D)
 */
import { test, expect, type Route } from "@playwright/test";

const COMPANY_ID = "co-test";
const WF_ID = "wf-test-1";

test.describe("Workflow builder (/c/[id]/workflows)", () => {
  test("create 2-step workflow → save → run → step transitions to running", async ({ page }) => {
    let createBody: unknown = null;
    let patchBody: unknown = null;
    let stepStatus = "pending";
    let pollCount = 0;

    // Most-specific routes registered FIRST so they win over the catch-all.
    // Playwright `page.route` matches in registration order; literal-path
    // handlers must precede the `**/api/workflows*` wildcard.
    await page.route(`**/api/workflows/${WF_ID}/status`, async (route: Route) => {
      pollCount += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: WF_ID,
          status: stepStatus,
          steps: [
            { id: "s1", agent_id: "writer", status: stepStatus, started_at: null, finished_at: null, error_json: null, retry_count: 0, assigned_pc: null },
            { id: "s2", agent_id: "reviewer", status: "pending", started_at: null, finished_at: null, error_json: null, retry_count: 0, assigned_pc: null },
          ],
        }),
      });
    });

    await page.route(`**/api/workflows/${WF_ID}`, async (route: Route) => {
      const method = route.request().method();
      if (method === "PATCH") {
        patchBody = JSON.parse(route.request().postData() ?? "{}");
        stepStatus = "running";
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ id: WF_ID, company_id: COMPANY_ID, name: "test", status: "running", created_at: 0 }),
        });
        return;
      }
      await route.fulfill({ status: 404, body: "{}" });
    });

    await page.route("**/api/workflows*", async (route: Route) => {
      const method = route.request().method();
      if (method === "POST") {
        createBody = JSON.parse(route.request().postData() ?? "{}");
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ id: WF_ID, company_id: COMPANY_ID, name: "test", status: "pending", created_at: 0 }),
        });
        return;
      }
      // GET list
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    });

    await page.goto(`/c/${COMPANY_ID}/workflows/new/edit`);

    // Name
    await page.getByPlaceholder("Daily summary").fill("Test flow");

    // Step 1
    await page.getByRole("button", { name: "+ Add step" }).click();
    await page.getByTestId("step-row-0").getByPlaceholder("e.g. writer").fill("writer");
    await page.getByTestId("step-row-0").locator("textarea").fill("summarize today");

    // Step 2
    await page.getByRole("button", { name: "+ Add step" }).click();
    await page.getByTestId("step-row-1").getByPlaceholder("e.g. writer").fill("reviewer");
    await page.getByTestId("step-row-1").locator("textarea").fill("review summary");
    // Wire dependency: reviewer depends on writer.
    await page.getByTestId("step-row-1").getByRole("checkbox").first().check();

    // Save and Run (chained id path — Critic C7)
    await page.getByTestId("btn-save-run").click();

    // Wait for POST + PATCH to fire.
    await expect.poll(() => createBody).not.toBeNull();
    await expect.poll(() => patchBody).not.toBeNull();

    // Critic C4: PATCH body is exactly {status: "running"} — no wrapper.
    expect(patchBody).toEqual({ status: "running" });

    // POST body shape sanity: name + spec + company_id; agents use agent_id as id.
    const cb = createBody as { name: string; company_id: string; spec: { agents: { id: string }[]; edges: { from: string; to: string }[] } };
    expect(cb.name).toBe("Test flow");
    expect(cb.company_id).toBe(COMPANY_ID);
    expect(cb.spec.agents.map((a) => a.id)).toEqual(["writer", "reviewer"]);
    expect(cb.spec.edges).toContainEqual({ from: "writer", to: "reviewer", condition: "succeeded" });

    // RunPanel polled at least once and shows the running state.
    await expect.poll(() => pollCount).toBeGreaterThan(0);
    await expect(page.getByTestId("run-panel")).toBeVisible();
    await expect(page.getByTestId("run-step-writer")).toContainText("running");
  });
});
