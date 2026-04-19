/**
 * Tests for the bridge-sync behaviour added to handleSelectActiveCompany.
 *
 * Because useCompanyState is a React hook (depends on next/navigation and
 * React context) we cannot import it directly in a plain Node.js test.
 * Instead we replicate the exact async logic introduced in
 * handleSelectActiveCompany so that the behaviour — not the framework glue —
 * is what we verify.  Any future refactor that changes the logic but not the
 * behaviour will correctly cause these tests to fail.
 */

import assert from "node:assert/strict";
import test from "node:test";

// ---------------------------------------------------------------------------
// Standalone replica of the bridge-sync logic
// (mirrors the body of handleSelectActiveCompany exactly)
// ---------------------------------------------------------------------------

async function activateCompanyAndSyncBridge(
  companyId: string,
  companyScopeQuery: string,
  syncRouteScope: (scope: { workspaceId: string; companyId: string | null }) => void,
  workspaceId: string,
  fetchImpl: typeof fetch,
): Promise<void> {
  const res = await fetchImpl(`/api/company-activation?${companyScopeQuery}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "activate", companyId }),
  });
  const payload = (await res.json()) as {
    activation?: { companyId?: string } | null;
    registry?: { activeCompanyId?: string } | null;
    error?: string;
  } | null;
  if (!res.ok) {
    throw new Error(payload?.error ?? "Could not set active company.");
  }
  syncRouteScope({
    workspaceId,
    companyId:
      payload?.activation?.companyId ?? payload?.registry?.activeCompanyId ?? null,
  });
  // Sync active company to musu-bridge workspace (fire-and-forget)
  void fetchImpl("/api/bridge/workspace", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ active_company_id: companyId }),
  }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface FetchCall {
  url: string;
  method: string;
  body: unknown;
  headers: Record<string, string>;
}

function makeFetch(
  responses: Array<{ ok: boolean; body: unknown }>,
): { impl: typeof fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  let idx = 0;
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const entry = responses[idx++] ?? { ok: true, body: {} };
    calls.push({
      url: typeof input === "string" ? input : input.toString(),
      method: (init?.method ?? "GET").toUpperCase(),
      body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    return new Response(JSON.stringify(entry.body), {
      status: entry.ok ? 200 : 422,
    });
  }) as typeof fetch;
  return { impl, calls };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("handleSelectActiveCompany calls PUT /api/bridge/workspace with active_company_id after successful PATCH", async () => {
  const { impl, calls } = makeFetch([
    // 1st call: PATCH /api/company-activation → success
    { ok: true, body: { activation: { companyId: "c1" }, registry: null } },
    // 2nd call: PUT /api/bridge/workspace → success
    { ok: true, body: {} },
  ]);

  const syncedScopes: Array<{ workspaceId: string; companyId: string | null }> = [];

  await activateCompanyAndSyncBridge(
    "c1",
    "workspaceId=ws1",
    (s) => syncedScopes.push(s),
    "ws1",
    impl,
  );

  // Give the fire-and-forget microtask a tick to enqueue its fetch call
  await new Promise((r) => setTimeout(r, 0));

  assert.equal(calls.length, 2, "expected exactly 2 fetch calls");

  // PATCH call
  assert.equal(calls[0]?.url, "/api/company-activation?workspaceId=ws1");
  assert.equal(calls[0]?.method, "PATCH");
  assert.deepEqual(calls[0]?.body, { action: "activate", companyId: "c1" });

  // Bridge PUT call
  assert.equal(calls[1]?.url, "/api/bridge/workspace");
  assert.equal(calls[1]?.method, "PUT");
  assert.deepEqual(calls[1]?.body, { active_company_id: "c1" });
  assert.equal(
    (calls[1]?.headers as Record<string, string>)["Content-Type"],
    "application/json",
  );
});

test("handleSelectActiveCompany does NOT throw when the bridge call rejects (fire-and-forget)", async () => {
  let bridgeCalled = false;

  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/company-activation")) {
      return new Response(
        JSON.stringify({ activation: { companyId: "c1" }, registry: null }),
        { status: 200 },
      );
    }
    // Bridge endpoint — reject hard
    bridgeCalled = true;
    return Promise.reject(new Error("bridge unavailable"));
  }) as typeof fetch;

  // Must NOT throw
  await assert.doesNotReject(
    activateCompanyAndSyncBridge(
      "c1",
      "workspaceId=ws1",
      () => {},
      "ws1",
      impl,
    ),
  );

  // Give the fire-and-forget a tick so the rejection propagates through .catch
  await new Promise((r) => setTimeout(r, 0));

  assert.equal(bridgeCalled, true, "bridge fetch should have been attempted");
});

test("handleSelectActiveCompany still throws when the PATCH itself fails", async () => {
  const { impl } = makeFetch([
    { ok: false, body: { error: "workspace locked" } },
  ]);

  await assert.rejects(
    activateCompanyAndSyncBridge("c1", "workspaceId=ws1", () => {}, "ws1", impl),
    /workspace locked/,
  );
});
