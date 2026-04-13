import assert from "node:assert/strict";
import { test } from "node:test";
import type { Message } from "@/types";
import type { CommandContext } from "./types";
import { createApprovalHandler } from "./handleApprovalCommand";

function makeCtx() {
  const msgs: Message[] = [];
  const typingCalls: boolean[] = [];
  const ctx: CommandContext = {
    appendChatMessage: (msg) => msgs.push(msg),
    channel: "general",
    setIsAgentTyping: (v) => typingCalls.push(v),
  };
  return { ctx, msgs, typingCalls };
}

function withFetchMock(
  mockFn: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  fn: () => Promise<void>
) {
  const orig = globalThis.fetch;
  globalThis.fetch = mockFn as typeof fetch;
  return fn().finally(() => { globalThis.fetch = orig; });
}

// ── /approve ─────────────────────────────────────────────────────────────────

test("/approve 빈 prefix → false 반환", async () => {
  const { ctx, msgs } = makeCtx();
  const handle = createApprovalHandler(ctx);
  const result = await handle("/approve ");
  assert.equal(result, false);
  assert.equal(msgs.length, 0);
});

test("/approve 정상 → in_progress 업데이트 + 시스템 메시지", async () => {
  const { ctx, msgs } = makeCtx();
  const handle = createApprovalHandler(ctx);

  await withFetchMock(
    async (_url, init) => {
      const body = JSON.parse((init as RequestInit).body as string) as { status: string };
      assert.equal(body.status, "in_progress");
      return new Response(
        JSON.stringify({ task: { id: "task-abc", title: "승인 태스크" } }),
        { status: 200 }
      );
    },
    async () => {
      const result = await handle("/approve task-abc");
      assert.equal(result, true);
      assert.equal(msgs.length, 2);
      assert.equal(msgs[0].senderKind, "user");
      assert.ok(msgs[1].text.includes("Approved"), "reply should include 'Approved'");
      assert.ok(msgs[1].text.includes("승인 태스크"), "reply should include task title");
    }
  );
});

test("/approve task not found → error 메시지", async () => {
  const { ctx, msgs } = makeCtx();
  const handle = createApprovalHandler(ctx);

  await withFetchMock(
    async () => new Response(JSON.stringify({ error: "task_not_found" }), { status: 404 }),
    async () => {
      const result = await handle("/approve task-missing");
      assert.equal(result, true);
      assert.ok(msgs.some((m) => m.text.includes("Approve failed")));
    }
  );
});

test("/approve fetch throws → network error 메시지", async () => {
  const { ctx, msgs } = makeCtx();
  const handle = createApprovalHandler(ctx);

  await withFetchMock(
    async () => { throw new Error("ECONNREFUSED"); },
    async () => {
      const result = await handle("/approve task-abc");
      assert.equal(result, true);
      assert.ok(msgs.some((m) => m.text.includes("network error")));
    }
  );
});

// ── /reject ───────────────────────────────────────────────────────────────────

test("/reject 빈 prefix → false 반환", async () => {
  const { ctx, msgs } = makeCtx();
  const handle = createApprovalHandler(ctx);
  const result = await handle("/reject ");
  assert.equal(result, false);
  assert.equal(msgs.length, 0);
});

test("/reject 정상 → blocked + 'Rejected by user' result + 시스템 메시지", async () => {
  const { ctx, msgs } = makeCtx();
  const handle = createApprovalHandler(ctx);

  await withFetchMock(
    async (_url, init) => {
      const body = JSON.parse((init as RequestInit).body as string) as { status: string; result: string };
      assert.equal(body.status, "blocked");
      assert.equal(body.result, "Rejected by user");
      return new Response(
        JSON.stringify({ task: { id: "task-def", title: "거절 태스크" } }),
        { status: 200 }
      );
    },
    async () => {
      const result = await handle("/reject task-def");
      assert.equal(result, true);
      assert.ok(msgs.some((m) => m.text.includes("Rejected") && m.text.includes("거절 태스크")));
    }
  );
});

test("/reject fetch throws → network error 메시지", async () => {
  const { ctx, msgs } = makeCtx();
  const handle = createApprovalHandler(ctx);

  await withFetchMock(
    async () => { throw new Error("timeout"); },
    async () => {
      await handle("/reject task-def");
      assert.ok(msgs.some((m) => m.text.includes("network error")));
    }
  );
});

// ── 알 수 없는 커맨드 ─────────────────────────────────────────────────────────

test("알 수 없는 커맨드 → false", async () => {
  const { ctx } = makeCtx();
  const handle = createApprovalHandler(ctx);
  assert.equal(await handle("/task something"), false);
  assert.equal(await handle("일반 메시지"), false);
});
