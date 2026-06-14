import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as unknown as NodeJS.Module;

type PostHandler = (req: Request) => Promise<Response>;

async function loadPostHandler(cacheBust: string): Promise<PostHandler> {
  const moduleUrl = new URL(`./route.ts?case=${cacheBust}`, import.meta.url).href;
  const mod = (await import(moduleUrl)) as { POST: PostHandler };
  return mod.POST;
}

function postReq(body: unknown): Request {
  return new Request("http://app.test/api/agent-route", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function withFetchCapture(
  responseFor: (url: URL, body: Record<string, unknown>) => unknown,
  fn: (calls: Array<{ url: string; init?: RequestInit; body: Record<string, unknown> }>) => Promise<void>
) {
  const prevBridgeUrl = process.env.MUSU_BRIDGE_URL;
  const prevBridgeToken = process.env.MUSU_BRIDGE_TOKEN;
  const prevRemoteUrl = process.env.MUSU_BRIDGE_REMOTE_URL;
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit; body: Record<string, unknown> }> = [];

  try {
    process.env.MUSU_BRIDGE_URL = "http://127.0.0.1:8070";
    process.env.MUSU_BRIDGE_TOKEN = "test-token-32-chars-or-more-xx";
    delete process.env.MUSU_BRIDGE_REMOTE_URL;

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const body = init?.body
        ? JSON.parse(String(init.body)) as Record<string, unknown>
        : {};
      calls.push({
        url: String(input),
        init,
        body,
      });
      return new Response(JSON.stringify(responseFor(url, body)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    await fn(calls);
  } finally {
    globalThis.fetch = originalFetch;
    if (prevBridgeUrl === undefined) delete process.env.MUSU_BRIDGE_URL;
    else process.env.MUSU_BRIDGE_URL = prevBridgeUrl;
    if (prevBridgeToken === undefined) delete process.env.MUSU_BRIDGE_TOKEN;
    else process.env.MUSU_BRIDGE_TOKEN = prevBridgeToken;
    if (prevRemoteUrl === undefined) delete process.env.MUSU_BRIDGE_REMOTE_URL;
    else process.env.MUSU_BRIDGE_REMOTE_URL = prevRemoteUrl;
  }
}

test("agent-route preserves selected machine as bridge target_node", async () => {
  await withFetchCapture(
    (url) => url.pathname === "/api/tasks/delegate"
      ? { task_id: "task-1", status: "pending" }
      : { task_id: "task-1", status: "done", output: "done", duration_sec: 0.5 },
    async (calls) => {
      const POST = await loadPostHandler(`target-node-${Date.now()}`);
      const res = await POST(postReq({
        channel: "cto",
        sender_id: "user-1",
        text: "run this there",
        node: "studio-pc",
        adapter_override: "codex",
        cost_optimized: true,
      }));

      assert.equal(res.status, 200);
      assert.equal(calls.length, 2);
      assert.equal(new URL(calls[0].url).pathname, "/api/tasks/delegate");
      assert.equal(new URL(calls[1].url).pathname, "/api/tasks/task-1");
      assert.equal(calls[0].body.channel, "cto");
      assert.equal(calls[0].body.sender_id, "user-1");
      assert.equal(calls[0].body.text, "run this there");
      assert.equal(calls[0].body.target_node, "studio-pc");
      assert.equal(calls[0].body.adapter_type, "codex");
      assert.equal(calls[0].body.adapter_override, "codex");
      assert.equal(calls[0].body.cost_optimized, true);
      assert.equal(calls[0].body.allow_duplicate, true);

      const response = await res.json() as { response: string; task_id: string; agent_id: string };
      assert.equal(response.response, "done");
      assert.equal(response.task_id, "task-1");
      assert.equal(response.agent_id, "task-1");
    }
  );
});

test("agent-route does not send local as a remote target_node", async () => {
  await withFetchCapture((url) => url.pathname === "/api/tasks/delegate"
    ? { task_id: "task-local", status: "pending" }
    : { task_id: "task-local", status: "done", output: "local done" }, async (calls) => {
    const POST = await loadPostHandler(`local-node-${Date.now()}`);
    const res = await POST(postReq({
      channel: "engineer",
      text: "run here",
      node: "local",
    }));

    assert.equal(res.status, 200);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].body.target_node, undefined);
    assert.equal(calls[0].body.text, "run here");
  });
});

test("agent-route returns bridge task failure with task id", async () => {
  await withFetchCapture((url) => url.pathname === "/api/tasks/delegate"
    ? { task_id: "task-failed", status: "pending" }
    : { task_id: "task-failed", status: "failed", error: "adapter_failed", exit_code: 1 }, async (calls) => {
    const POST = await loadPostHandler(`failed-node-${Date.now()}`);
    const res = await POST(postReq({
      channel: "qa",
      text: "break",
      node: "studio-pc",
    }));

    assert.equal(res.status, 502);
    assert.equal(calls.length, 2);
    const body = await res.json() as { error: string; task_id: string; exit_code: number };
    assert.equal(body.error, "adapter_failed");
    assert.equal(body.task_id, "task-failed");
    assert.equal(body.exit_code, 1);
  });
});
