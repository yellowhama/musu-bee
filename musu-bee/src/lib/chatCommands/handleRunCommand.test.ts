import assert from "node:assert/strict";
import { test } from "node:test";
import type { Message } from "@/types";
import type { CommandContext } from "./types";
import { createRunHandler } from "./handleRunCommand";

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

type FetchMock = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function withFetchMock(mockFn: FetchMock, fn: () => Promise<void>) {
  const orig = globalThis.fetch;
  globalThis.fetch = mockFn as typeof fetch;
  return fn().finally(() => { globalThis.fetch = orig; });
}

// ── /run ──────────────────────────────────────────────────────────────────────

test("/run 빈 command → false 반환", async () => {
  const { ctx, msgs } = makeCtx();
  const handle = createRunHandler(ctx);
  const result = await handle("/run ");
  assert.equal(result, false);
  assert.equal(msgs.length, 0);
});

test("비 /run 커맨드 → false", async () => {
  const { ctx } = makeCtx();
  const handle = createRunHandler(ctx);
  assert.equal(await handle("/task foo"), false);
  assert.equal(await handle("hello"), false);
});

test("/run 정상 → stdout 포함 코드블록 응답", async () => {
  const { ctx, msgs, typingCalls } = makeCtx();
  const handle = createRunHandler(ctx);

  await withFetchMock(
    async (_url, init) => {
      const body = JSON.parse((init as RequestInit).body as string) as {
        prompt: string;
        cli_type: string;
        timeout_sec: number;
      };
      assert.equal(body.cli_type, "bash");
      assert.equal(body.prompt, "ls -la");
      return new Response(
        JSON.stringify({ stdout: "total 8\ndrwxr-xr-x 2 root root", stderr: "", exit_code: 0 }),
        { status: 200 }
      );
    },
    async () => {
      const result = await handle("/run ls -la");
      assert.equal(result, true);
      assert.ok(typingCalls.includes(true), "typing 시작돼야 함");
      assert.ok(typingCalls.includes(false), "typing 리셋돼야 함");
      assert.equal(msgs[0].senderKind, "user");
      const reply = msgs[1];
      assert.equal(reply.senderKind, "ai");
      assert.ok(reply.text.includes("```"), "response should be a code block");
      assert.ok(reply.text.includes("total 8"), "response should include stdout");
    }
  );
});

test("/run exit code != 0 → (exit N) 포함", async () => {
  const { ctx, msgs } = makeCtx();
  const handle = createRunHandler(ctx);

  await withFetchMock(
    async () =>
      new Response(
        JSON.stringify({ stdout: "", stderr: "command not found", exit_code: 127 }),
        { status: 200 }
      ),
    async () => {
      await handle("/run nonexistent-cmd");
      const reply = msgs.find((m) => m.senderKind === "ai");
      assert.ok(reply?.text.includes("(exit 127)"), "should include exit code note");
    }
  );
});

test("/run no output → '(no output)' 표시", async () => {
  const { ctx, msgs } = makeCtx();
  const handle = createRunHandler(ctx);

  await withFetchMock(
    async () =>
      new Response(
        JSON.stringify({ stdout: "", stderr: "", exit_code: 0 }),
        { status: 200 }
      ),
    async () => {
      await handle("/run true");
      const reply = msgs.find((m) => m.senderKind === "ai");
      assert.ok(reply?.text.includes("(no output)"));
    }
  );
});

test("/run worker 5xx → Run failed 메시지", async () => {
  const { ctx, msgs, typingCalls } = makeCtx();
  const handle = createRunHandler(ctx);

  await withFetchMock(
    async () => new Response("Internal Server Error", { status: 500 }),
    async () => {
      const result = await handle("/run crash-cmd");
      assert.equal(result, true);
      assert.ok(msgs.some((m) => m.senderKind === "system" && m.text.includes("Run failed")));
      assert.ok(typingCalls.includes(false), "typing 리셋돼야 함");
    }
  );
});

test("/run fetch throws → Run failed 메시지", async () => {
  const { ctx, msgs, typingCalls } = makeCtx();
  const handle = createRunHandler(ctx);

  await withFetchMock(
    async () => { throw new Error("ECONNREFUSED"); },
    async () => {
      await handle("/run ls");
      assert.ok(msgs.some((m) => m.text.includes("Run failed")));
      assert.ok(typingCalls.includes(false));
    }
  );
});

test("/run --device flag → custom host URL 사용", async () => {
  const { ctx, msgs } = makeCtx();
  const handle = createRunHandler(ctx);

  let capturedUrl: string | null = null;
  await withFetchMock(
    async (url) => {
      capturedUrl = url.toString();
      return new Response(
        JSON.stringify({ stdout: "ok", stderr: "", exit_code: 0 }),
        { status: 200 }
      );
    },
    async () => {
      const result = await handle("/run echo hello --device rtx-worker");
      assert.equal(result, true);
      assert.ok(capturedUrl?.includes("rtx-worker:9700"), "should use device-specific URL");
      // sender should be the device name
      const reply = msgs.find((m) => m.senderKind === "ai");
      assert.equal(reply?.sender, "rtx-worker");
    }
  );
});

test("/run --device: command excludes the flag", async () => {
  const { ctx } = makeCtx();
  const handle = createRunHandler(ctx);

  let capturedBody: { prompt: string } | null = null;
  await withFetchMock(
    async (_url, init) => {
      capturedBody = JSON.parse((init as RequestInit).body as string) as { prompt: string };
      return new Response(JSON.stringify({ stdout: "hi", stderr: "", exit_code: 0 }), { status: 200 });
    },
    async () => {
      await handle("/run echo hello --device rtx-worker");
      assert.equal(capturedBody?.prompt, "echo hello", "device flag should be stripped from command");
    }
  );
});
