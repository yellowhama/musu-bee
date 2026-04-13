import assert from "node:assert/strict";
import { test } from "node:test";
import type { Message } from "@/types";
import type { CommandContext } from "./types";
import { createTaskHandler } from "./handleTaskCommand";

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

// ── /task ────────────────────────────────────────────────────────────────────

test("/task 빈 title → false 반환 (메시지 없음)", async () => {
  const { ctx, msgs } = makeCtx();
  const handle = createTaskHandler(ctx);
  const result = await handle("/task ");
  assert.equal(result, false);
  assert.equal(msgs.length, 0);
});

test("/task 정상 → task 생성 + 라우팅 + 시스템 메시지", async () => {
  const { ctx, msgs } = makeCtx();
  const handle = createTaskHandler(ctx);

  let callIndex = 0;
  await withFetchMock(
    async (_url, init) => {
      callIndex++;
      if (callIndex === 1) {
        // POST /api/tasks
        assert.equal((init as RequestInit).method, "POST");
        return new Response(
          JSON.stringify({ task: { id: "task-abc123", title: "테스트 태스크" } }),
          { status: 201 }
        );
      }
      if (callIndex === 2) {
        // POST /api/route
        return new Response(
          JSON.stringify({ selected_host: "rtx-worker", reason_code: "gpu_available" }),
          { status: 200 }
        );
      }
      // PATCH /api/tasks (assign device)
      return new Response(
        JSON.stringify({ task: { id: "task-abc123", title: "테스트 태스크", assigned_device: "rtx-worker" } }),
        { status: 200 }
      );
    },
    async () => {
      const result = await handle("/task 테스트 태스크");
      assert.equal(result, true);
      // msgs[0] = user echo, msgs[1] = system reply
      assert.equal(msgs.length, 2);
      assert.equal(msgs[0].senderKind, "user");
      assert.ok(msgs[1].text.includes("테스트 태스크"), "reply should include task title");
      assert.ok(msgs[1].text.includes("rtx-worker"), "reply should include assigned device");
    }
  );
});

test("/task: routing 실패 시에도 task 생성됨", async () => {
  const { ctx, msgs } = makeCtx();
  const handle = createTaskHandler(ctx);

  let callIndex = 0;
  await withFetchMock(
    async () => {
      callIndex++;
      if (callIndex === 1) {
        return new Response(
          JSON.stringify({ task: { id: "task-xyz", title: "라우팅 없는 태스크" } }),
          { status: 201 }
        );
      }
      // route call throws
      throw new Error("ECONNREFUSED");
    },
    async () => {
      const result = await handle("/task 라우팅 없는 태스크");
      assert.equal(result, true);
      assert.ok(msgs.some((m) => m.text.includes("라우팅 없는 태스크")));
    }
  );
});

test("/task: task 생성 실패 → error 시스템 메시지", async () => {
  const { ctx, msgs } = makeCtx();
  const handle = createTaskHandler(ctx);

  await withFetchMock(
    async () => new Response(JSON.stringify({ error: "title required" }), { status: 400 }),
    async () => {
      const result = await handle("/task 실패할 태스크");
      assert.equal(result, true);
      assert.ok(msgs.some((m) => m.senderKind === "system" && m.text.includes("failed")));
    }
  );
});

// ── /tasks ───────────────────────────────────────────────────────────────────

test("/tasks → 현재 채널 태스크 목록", async () => {
  const { ctx, msgs } = makeCtx();
  const handle = createTaskHandler(ctx);

  await withFetchMock(
    async (url) => {
      // verify channel filter is passed
      assert.ok(url.toString().includes("channel=general"), "should filter by channel");
      return new Response(
        JSON.stringify({
          tasks: [
            { id: "task-001", title: "첫 번째 태스크", status: "todo" },
            { id: "task-002", title: "두 번째 태스크", status: "in_progress" },
          ],
        }),
        { status: 200 }
      );
    },
    async () => {
      const result = await handle("/tasks");
      assert.equal(result, true);
      assert.ok(msgs.some((m) => m.text.includes("첫 번째 태스크")));
      assert.ok(msgs.some((m) => m.text.includes("두 번째 태스크")));
    }
  );
});

test("/tasks 빈 목록 → 'No active tasks' 메시지", async () => {
  const { ctx, msgs } = makeCtx();
  const handle = createTaskHandler(ctx);

  await withFetchMock(
    async () => new Response(JSON.stringify({ tasks: [] }), { status: 200 }),
    async () => {
      await handle("/tasks");
      assert.ok(msgs.some((m) => m.text.includes("No active tasks")));
    }
  );
});

// ── /done ────────────────────────────────────────────────────────────────────

test("/done 빈 prefix → false", async () => {
  const { ctx } = makeCtx();
  const handle = createTaskHandler(ctx);
  const result = await handle("/done ");
  assert.equal(result, false);
});

test("/done 정상 → status:done 업데이트 + 시스템 메시지", async () => {
  const { ctx, msgs } = makeCtx();
  const handle = createTaskHandler(ctx);

  await withFetchMock(
    async (_url, init) => {
      const body = JSON.parse((init as RequestInit).body as string) as { status: string };
      assert.equal(body.status, "done");
      return new Response(
        JSON.stringify({ task: { id: "task-abc", title: "완료 태스크" } }),
        { status: 200 }
      );
    },
    async () => {
      const result = await handle("/done task-abc");
      assert.equal(result, true);
      assert.ok(msgs.some((m) => m.text.includes("Done") && m.text.includes("완료 태스크")));
    }
  );
});

// ── /block ───────────────────────────────────────────────────────────────────

test("/block 정상 → status:blocked + 시스템 메시지", async () => {
  const { ctx, msgs } = makeCtx();
  const handle = createTaskHandler(ctx);

  await withFetchMock(
    async () =>
      new Response(
        JSON.stringify({ task: { id: "task-def", title: "블락된 태스크" } }),
        { status: 200 }
      ),
    async () => {
      const result = await handle("/block task-def");
      assert.equal(result, true);
      assert.ok(msgs.some((m) => m.text.includes("Blocked") && m.text.includes("블락된 태스크")));
    }
  );
});

test("알 수 없는 커맨드 → false", async () => {
  const { ctx } = makeCtx();
  const handle = createTaskHandler(ctx);
  assert.equal(await handle("/unknown"), false);
  assert.equal(await handle("일반 메시지"), false);
});
