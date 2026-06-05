import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

type AgentsGetHandler = () => Promise<Response>;

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as unknown as NodeJS.Module;

const AGENTS_ENV_KEYS = [
  "PAPERCLIP_API_URL",
  "PAPERCLIP_COMPANY_ID",
  "MUSU_PORT_URL",
  "AGENTS_STALE_THRESHOLD_MS",
];

function snapshotEnv(keys: string[]) {
  const snapshot: Record<string, string | undefined> = {};
  for (const key of keys) {
    snapshot[key] = process.env[key];
  }
  return snapshot;
}

function restoreEnv(snapshot: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

async function loadGetHandler(cacheBust: string): Promise<AgentsGetHandler> {
  const moduleUrl = new URL(`./route.ts?case=${cacheBust}`, import.meta.url).href;
  const mod = (await import(moduleUrl)) as { GET: AgentsGetHandler };
  return mod.GET;
}

test("agents route returns parity summary without leaking upstream runtime metadata", async () => {
  const env = snapshotEnv(AGENTS_ENV_KEYS);
  const originalFetch = globalThis.fetch;
  const nowIso = new Date().toISOString();

  try {
    process.env.PAPERCLIP_API_URL = "http://127.0.0.1:3100";
    process.env.PAPERCLIP_COMPANY_ID = "company-test";
    process.env.MUSU_PORT_URL = "http://127.0.0.1:1355";
    process.env.AGENTS_STALE_THRESHOLD_MS = "600000";

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/companies/company-test/agents")) {
        return new Response(
          JSON.stringify([
            {
              id: "agent-1",
              name: "CTO",
              role: "cto",
              status: "running",
              urlKey: "cto",
              lastHeartbeatAt: nowIso,
              adapter: { id: "internal-adapter" },
              runtimeEnv: "prod",
              instructions: "internal_only",
            },
            {
              id: "agent-2",
              name: "QA Lead",
              role: "qa",
              status: "idle",
              urlKey: "qa-lead",
              lastHeartbeatAt: nowIso,
            },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.endsWith("/handoff/latest")) {
        return new Response(
          JSON.stringify({
            available: true,
            recorded_at_ms: 12345,
            decision: {
              boss_host: "ingress-beta",
              selected_target: "device-b",
              decision_reason_code: "resource_rule_remote_selected",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const GET = await loadGetHandler(`success-${Date.now()}`);
    const res = await GET();

    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      degraded: boolean;
      stale: boolean;
      summary: {
        bossHost: string | null;
        lastHandoffTarget: string | null;
        handoffReasonCode: string | null;
        departments: Array<{ id: string; status: string; [key: string]: unknown }>;
        statusCounts: Record<string, number>;
      };
      [key: string]: unknown;
    };

    assert.equal(body.degraded, false);
    assert.equal(body.stale, false);
    assert.equal(body.summary.bossHost, "ingress-beta");
    assert.equal(body.summary.lastHandoffTarget, "device-b");
    assert.equal(body.summary.handoffReasonCode, "resource_rule_remote_selected");
    assert.equal(body.summary.departments.length, 2);
    assert.equal(body.summary.statusCounts.running, 1);
    assert.equal(body.summary.statusCounts.idle, 1);
    assert.equal("snapshot" in body, false);
    const first = body.summary.departments[0] ?? {};
    assert.equal("adapter" in first, false);
    assert.equal("runtimeEnv" in first, false);
    assert.equal("instructions" in first, false);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }
});

test("agents route reports degraded without fabricating department state when /agents fails", async () => {
  const env = snapshotEnv(AGENTS_ENV_KEYS);
  const originalFetch = globalThis.fetch;

  try {
    process.env.PAPERCLIP_API_URL = "http://127.0.0.1:3100/api";
    process.env.PAPERCLIP_COMPANY_ID = "company-test";
    process.env.MUSU_PORT_URL = "http://127.0.0.1:1355";

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/companies/company-test/agents")) {
        return new Response("upstream unavailable", { status: 503 });
      }
      if (url.endsWith("/handoff/latest")) {
        return new Response(
          JSON.stringify({ available: false, recorded_at_ms: null, decision: null }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const GET = await loadGetHandler(`agents-down-${Date.now()}`);
    const res = await GET();

    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      degraded: boolean;
      degradedReason: string | null;
      summary: { departments: unknown[]; statusCounts: Record<string, number> };
      [key: string]: unknown;
    };
    assert.equal(body.degraded, true);
    assert.match(String(body.degradedReason), /^agents_unavailable:/);
    assert.equal(body.summary.departments.length, 0);
    assert.deepEqual(body.summary.statusCounts, {});
    assert.equal("snapshot" in body, false);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }
});

test("agents route marks stale snapshots as degraded", async () => {
  const env = snapshotEnv(AGENTS_ENV_KEYS);
  const originalFetch = globalThis.fetch;
  const staleIso = new Date(Date.now() - 20 * 60 * 1000).toISOString();

  try {
    process.env.PAPERCLIP_API_URL = "http://127.0.0.1:3100/api";
    process.env.PAPERCLIP_COMPANY_ID = "company-test";
    process.env.MUSU_PORT_URL = "http://127.0.0.1:1355";
    process.env.AGENTS_STALE_THRESHOLD_MS = "600000";

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/companies/company-test/agents")) {
        return new Response(
          JSON.stringify([
            {
              id: "agent-1",
              name: "Founding Engineer",
              role: "engineer",
              status: "running",
              lastHeartbeatAt: staleIso,
            },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.endsWith("/handoff/latest")) {
        return new Response(
          JSON.stringify({ available: false, recorded_at_ms: null, decision: null }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const GET = await loadGetHandler(`stale-${Date.now()}`);
    const res = await GET();
    assert.equal(res.status, 200);

    const body = (await res.json()) as {
      degraded: boolean;
      degradedReason: string | null;
      stale: boolean;
      summary: { departments: Array<{ id: string }> };
    };
    assert.equal(body.degraded, true);
    assert.equal(body.stale, true);
    assert.equal(body.degradedReason, "agents_stale");
    assert.equal(body.summary.departments.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(env);
  }
});
