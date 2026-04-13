import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlinkSync } from "node:fs";
import { NextRequest } from "next/server";

type Module = {
  GET: () => Promise<Response>;
  POST: (req: NextRequest) => Promise<Response>;
};
let GET: Module["GET"];
let POST: Module["POST"];

let wikiDbPath: string;

before(async () => {
  // Tasks: in-memory SQLite (tasks.ts has singleton, creates tables itself)
  process.env.MUSU_TASKS_DB = ":memory:";

  // Wiki: temp file (wiki.ts creates a new connection per call, no table init)
  wikiDbPath = join(tmpdir(), `mcp-wiki-test-${Date.now()}.db`);
  const wikiDb = new DatabaseSync(wikiDbPath);
  wikiDb.exec(`
    CREATE TABLE IF NOT EXISTS wiki_pages (
      id TEXT PRIMARY KEY, scope TEXT NOT NULL, title TEXT NOT NULL,
      summary TEXT, key_points TEXT, evidence TEXT, related TEXT,
      open_questions TEXT, source_raw TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS wiki_scope_idx ON wiki_pages(scope);
    CREATE VIRTUAL TABLE IF NOT EXISTS wiki_fts USING fts5(id, scope, title, summary, key_points);
  `);
  wikiDb.close();
  process.env.MUSU_WIKI_DB = wikiDbPath;

  process.env.MUSU_PORT_URL = "http://port.test";
  process.env.MUSU_BRIDGE_URL = "http://bridge.test";

  ({ GET, POST } = (await import("./route")) as Module);
});

after(() => {
  try { unlinkSync(wikiDbPath); } catch { /* ignore */ }
});

function withFetchMock(
  mockFn: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  fn: () => Promise<void>
) {
  const orig = globalThis.fetch;
  globalThis.fetch = mockFn as typeof fetch;
  return fn().finally(() => { globalThis.fetch = orig; });
}

function rpcReq(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/mcp", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

// ── GET ──────────────────────────────────────────────────────────────────────

test("GET → MCP metadata + tools 배열", async () => {
  const res = await GET();
  assert.equal(res.status, 200);
  const body = await res.json() as { name: string; tools: unknown[] };
  assert.equal(body.name, "MUSU MCP Server");
  assert.ok(Array.isArray(body.tools));
  assert.ok(body.tools.length > 0);
});

// ── JSON-RPC 유효성 ───────────────────────────────────────────────────────────

test("jsonrpc 버전 누락 → -32600", async () => {
  const res = await POST(rpcReq({ id: 1, method: "musu_get_tasks" }));
  assert.equal(res.status, 400);
  const body = await res.json() as { error: { code: number } };
  assert.equal(body.error.code, -32600);
});

test("method 누락 → -32600", async () => {
  const res = await POST(rpcReq({ jsonrpc: "2.0", id: 1 }));
  assert.equal(res.status, 400);
  const body = await res.json() as { error: { code: number } };
  assert.equal(body.error.code, -32600);
});

test("알 수 없는 method → -32601", async () => {
  const res = await POST(rpcReq({ jsonrpc: "2.0", id: 1, method: "no_such_tool" }));
  assert.equal(res.status, 200);
  const body = await res.json() as { error: { code: number } };
  assert.equal(body.error.code, -32601);
});

// ── musu_get_devices ─────────────────────────────────────────────────────────

test("musu_get_devices → devices 배열", async () => {
  await withFetchMock(
    async () =>
      new Response(
        JSON.stringify({ device_id: "dev-1", cpu: 20, gpu: 40, ram: 30, status: "ok" }),
        { status: 200 }
      ),
    async () => {
      const res = await POST(rpcReq({ jsonrpc: "2.0", id: 1, method: "musu_get_devices" }));
      assert.equal(res.status, 200);
      const body = await res.json() as { result: { devices: unknown[] } };
      assert.ok(Array.isArray(body.result.devices));
      assert.equal(body.result.devices.length, 1);
    }
  );
});

test("musu_get_devices (fetch 실패) → error 포함 응답", async () => {
  await withFetchMock(
    async () => { throw new Error("ECONNREFUSED"); },
    async () => {
      const res = await POST(rpcReq({ jsonrpc: "2.0", id: 1, method: "musu_get_devices" }));
      assert.equal(res.status, 200);
      const body = await res.json() as { result: { error: string; devices: unknown[] } };
      assert.equal(body.result.error, "musu_port_unreachable");
      assert.deepEqual(body.result.devices, []);
    }
  );
});

// ── musu_get_tasks ───────────────────────────────────────────────────────────

test("musu_get_tasks → tasks + count", async () => {
  const res = await POST(rpcReq({ jsonrpc: "2.0", id: 2, method: "musu_get_tasks" }));
  assert.equal(res.status, 200);
  const body = await res.json() as { result: { tasks: unknown[]; count: number } };
  assert.ok(Array.isArray(body.result.tasks));
  assert.equal(typeof body.result.count, "number");
});

// ── musu_create_task ─────────────────────────────────────────────────────────

test("musu_create_task title 없음 → error", async () => {
  const res = await POST(rpcReq({
    jsonrpc: "2.0", id: 3, method: "musu_create_task", params: {}
  }));
  assert.equal(res.status, 200);
  const body = await res.json() as { result: { error: string } };
  assert.equal(body.result.error, "title_required");
});

test("musu_create_task 정상 → task", async () => {
  const res = await POST(rpcReq({
    jsonrpc: "2.0", id: 4, method: "musu_create_task",
    params: { title: "MCP 태스크" },
  }));
  assert.equal(res.status, 200);
  const body = await res.json() as { result: { task: { id: string; title: string } } };
  assert.ok(body.result.task.id);
  assert.equal(body.result.task.title, "MCP 태스크");
});

// ── musu_update_task ─────────────────────────────────────────────────────────

test("musu_update_task id_prefix 없음 → error", async () => {
  const res = await POST(rpcReq({
    jsonrpc: "2.0", id: 5, method: "musu_update_task", params: {}
  }));
  const body = await res.json() as { result: { error: string } };
  assert.equal(body.result.error, "id_prefix_required");
});

// ── musu_send_message ────────────────────────────────────────────────────────

test("musu_send_message → musu-bridge 호출", async () => {
  await withFetchMock(
    async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    async () => {
      const res = await POST(rpcReq({
        jsonrpc: "2.0", id: 6, method: "musu_send_message",
        params: { channel: "general", text: "안녕하세요" },
      }));
      const body = await res.json() as { result: { sent: boolean } };
      assert.equal(body.result.sent, true);
    }
  );
});

test("musu_send_message (bridge 실패) → sent:false", async () => {
  await withFetchMock(
    async () => { throw new Error("ECONNREFUSED"); },
    async () => {
      const res = await POST(rpcReq({
        jsonrpc: "2.0", id: 7, method: "musu_send_message",
        params: { channel: "general", text: "test" },
      }));
      const body = await res.json() as { result: { sent: boolean } };
      assert.equal(body.result.sent, false);
    }
  );
});

// ── musu_search_wiki ─────────────────────────────────────────────────────────

test("musu_search_wiki → results 배열", async () => {
  const res = await POST(rpcReq({
    jsonrpc: "2.0", id: 8, method: "musu_search_wiki",
    params: { query: "테스트" },
  }));
  assert.equal(res.status, 200);
  const body = await res.json() as { result: { results: unknown[] } };
  assert.ok(Array.isArray(body.result.results));
});
