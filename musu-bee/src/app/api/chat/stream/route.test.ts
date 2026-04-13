import assert from "node:assert/strict";
import { before, test } from "node:test";
import { EventEmitter } from "node:events";
import type { SpawnSyncReturns } from "node:child_process";
import { NextRequest } from "next/server";

// Access the CJS module directly so we can monkey-patch spawn (ESM namespace
// objects are sealed and mock.method("spawn") receives undefined on them).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cpCjs = require("child_process") as typeof import("child_process");

type Module = { GET: (req: NextRequest) => Promise<Response> };
let GET: Module["GET"];

before(async () => {
  // Set Claude CLI path to a real binary for the passthrough tests.
  // Spawn is mocked per-test for success/failure scenarios.
  process.env.CLAUDE_CLI_PATH = "/bin/echo";
  process.env.MUSU_CHAT_RATE_LIMIT_PER_MINUTE = "20";
  // wiki will fail gracefully (no table) — route wraps queryWiki in try/catch
  process.env.MUSU_WIKI_DB = ":memory:";
  ({ GET } = (await import("./route")) as Module);
});

function req(message?: string) {
  const url = new URL("http://localhost/api/chat/stream");
  if (message !== undefined) url.searchParams.set("message", message);
  return new NextRequest(url.toString());
}

async function collectSse(res: Response): Promise<Record<string, unknown>[]> {
  const text = await res.text();
  return text
    .split("\n\n")
    .filter((chunk) => chunk.startsWith("data: "))
    .map((chunk) => JSON.parse(chunk.slice(6)) as Record<string, unknown>);
}

/** Create a fake child_process-like EventEmitter that behaves like spawn(). */
function makeFakeProc(tokens: string[], exitCode = 0) {
  const proc = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: () => void;
  };
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.kill = () => {};
  setImmediate(() => {
    for (const t of tokens) proc.stdout.emit("data", Buffer.from(t));
    proc.emit("close", exitCode);
  });
  return proc;
}

// ── 입력 검증 (spawn 불필요) ──────────────────────────────────────────────────

test("message 없음 → 400 error event", async () => {
  const res = await GET(req());
  assert.equal(res.status, 400);
  const events = await collectSse(res);
  assert.ok(events.some((e) => typeof e.error === "string"));
});

test("message 빈 문자열 → 400 error event", async () => {
  const res = await GET(req("   "));
  assert.equal(res.status, 400);
  const events = await collectSse(res);
  assert.ok(events.some((e) => typeof e.error === "string"));
});

// ── rate limit ───────────────────────────────────────────────────────────────

test("rate limit 초과 → 429 + Retry-After", async () => {
  // Directly inject a saturated rate-limit entry for the untrusted-bucket key.
  (globalThis as Record<string, unknown>).__musuChatRateLimit = new Map([
    ["boundary:untrusted", { count: 999, windowStartMs: Date.now() }],
  ]);
  try {
    const res = await GET(req("안녕하세요"));
    assert.equal(res.status, 429);
    assert.ok(res.headers.get("Retry-After"));
  } finally {
    // Reset so subsequent tests start clean.
    ((globalThis as Record<string, unknown>).__musuChatRateLimit as Map<string, unknown>)?.clear();
  }
});

// ── 정상 경로 (spawn 모킹) ─────────────────────────────────────────────────────

function withSpawnMock(
  fakeFn: (...args: unknown[]) => unknown,
  fn: () => Promise<void>
): Promise<void> {
  const orig = cpCjs.spawn;
  (cpCjs as { spawn: unknown }).spawn = fakeFn;
  return fn().finally(() => { (cpCjs as { spawn: unknown }).spawn = orig; });
}

test("정상 메시지 → token events + done:true event", async () => {
  await withSpawnMock(
    () => makeFakeProc(["안녕", "하세요"], 0),
    async () => {
      const res = await GET(req("테스트 메시지"));
      const events = await collectSse(res);
      assert.ok(events.some((e) => typeof e.token === "string"), "should have token events");
      assert.ok(events.some((e) => e.done === true), "should have done:true event");
    }
  );
});

test("Claude CLI exit code 1 → error event", async () => {
  await withSpawnMock(
    () => makeFakeProc([], 1),
    async () => {
      const res = await GET(req("실패 메시지"));
      const events = await collectSse(res);
      assert.ok(events.some((e) => typeof e.error === "string"), "should have error event");
      assert.ok(events.some((e) => e.done === true), "should have done:true event");
    }
  );
});

test("spawn 실패 (ENOENT) → error event", async () => {
  await withSpawnMock(
    () => {
      // Simulate a spawn error (e.g., binary not found).
      // Emit only 'error' then 'close' — no stdout chunks.
      const proc = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter;
        stderr: EventEmitter;
        kill: () => void;
      };
      proc.stdout = new EventEmitter();
      proc.stderr = new EventEmitter();
      proc.kill = () => {};
      setImmediate(() => {
        proc.emit("error", Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
        // Node.js emits 'close' after 'error' for spawn errors, but the route
        // settles on the first finish() call so the close is a no-op.
        proc.emit("close", null);
      });
      return proc;
    },
    async () => {
      const res = await GET(req("ENOENT 메시지"));
      const events = await collectSse(res);
      assert.ok(events.some((e) => typeof e.error === "string"), "should have error event");
    }
  );
});
