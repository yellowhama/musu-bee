import assert from "node:assert/strict";
import { test } from "node:test";
import type { Message } from "@/types";
import type { CommandContext } from "./types";
import { createRouteHandler } from "./handleRouteCommand";

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

function statusResponse(overrides: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      cpu: 30, gpu: 45, ram: 60,
      device_id: "local-box",
      recommended_for: ["general"],
      ...overrides,
    }),
    { status: 200 }
  );
}

function routeResponse(host = "local-box", reason = "best_fit") {
  return new Response(
    JSON.stringify({ selected_host: host, reason_code: reason }),
    { status: 200 }
  );
}

// ── @route ────────────────────────────────────────────────────────────────────

test("@route 빈 task → false 반환", async () => {
  const { ctx, msgs } = makeCtx();
  const handle = createRouteHandler(ctx);
  const result = await handle("@route ");
  assert.equal(result, false);
  assert.equal(msgs.length, 0);
});

test("@route 비 @route 커맨드 → false", async () => {
  const { ctx } = makeCtx();
  const handle = createRouteHandler(ctx);
  assert.equal(await handle("/task foo"), false);
  assert.equal(await handle("hello"), false);
});

test("@route 정상 → host + reason + 상태 포함 메시지", async () => {
  const { ctx, msgs } = makeCtx();
  const handle = createRouteHandler(ctx);

  await withFetchMock(
    async (url) => {
      const u = url.toString();
      if (u.includes("/api/device-status")) return statusResponse();
      return routeResponse("rtx-worker", "gpu_available");
    },
    async () => {
      const result = await handle("@route GPU 추론 작업");
      assert.equal(result, true);
      assert.equal(msgs[0].senderKind, "user");
      const reply = msgs[1];
      assert.ok(reply.text.includes("rtx-worker"), "should include host");
      assert.ok(reply.text.includes("gpu_available"), "should include reason");
      assert.ok(reply.text.includes("CPU"), "should include status");
    }
  );
});

test("@route gpu 키워드 → resource='gpu' 전달", async () => {
  const { ctx } = makeCtx();
  const handle = createRouteHandler(ctx);

  let capturedResource: string | null = null;
  await withFetchMock(
    async (url, init) => {
      if (url.toString().includes("/api/route") && init?.method === "POST") {
        const body = JSON.parse(init.body as string) as { resource_requirement: string };
        capturedResource = body.resource_requirement;
      }
      return url.toString().includes("/api/device-status")
        ? statusResponse()
        : routeResponse();
    },
    async () => {
      await handle("@route GPU 모델 추론");
      assert.equal(capturedResource, "gpu");
    }
  );
});

test("@route cpu 키워드 → resource='cpu' 전달", async () => {
  const { ctx } = makeCtx();
  const handle = createRouteHandler(ctx);

  let capturedResource: string | null = null;
  await withFetchMock(
    async (url, init) => {
      if (url.toString().includes("/api/route") && init?.method === "POST") {
        const body = JSON.parse(init.body as string) as { resource_requirement: string };
        capturedResource = body.resource_requirement;
      }
      return url.toString().includes("/api/device-status")
        ? statusResponse()
        : routeResponse();
    },
    async () => {
      await handle("@route 빌드 작업");
      assert.equal(capturedResource, "cpu");
    }
  );
});

test("@route 일반 작업 → resource='general' 전달", async () => {
  const { ctx } = makeCtx();
  const handle = createRouteHandler(ctx);

  let capturedResource: string | null = null;
  await withFetchMock(
    async (url, init) => {
      if (url.toString().includes("/api/route") && init?.method === "POST") {
        const body = JSON.parse(init.body as string) as { resource_requirement: string };
        capturedResource = body.resource_requirement;
      }
      return url.toString().includes("/api/device-status")
        ? statusResponse()
        : routeResponse();
    },
    async () => {
      await handle("@route 파일 정리");
      assert.equal(capturedResource, "general");
    }
  );
});

test("@route fetch throws → network error 메시지", async () => {
  const { ctx, msgs } = makeCtx();
  const handle = createRouteHandler(ctx);

  await withFetchMock(
    async () => { throw new Error("ECONNREFUSED"); },
    async () => {
      const result = await handle("@route 테스트 작업");
      assert.equal(result, true);
      assert.ok(msgs.some((m) => m.text.includes("network error")));
    }
  );
});

test("@route device-status 실패 → host는 routing fallback 사용", async () => {
  const { ctx, msgs } = makeCtx();
  const handle = createRouteHandler(ctx);

  await withFetchMock(
    async (url) => {
      if (url.toString().includes("/api/device-status")) {
        return new Response("", { status: 503 });
      }
      return routeResponse("fallback-host", "musu_port_unavailable");
    },
    async () => {
      await handle("@route 테스트");
      const reply = msgs.find((m) => m.senderKind === "system");
      assert.ok(reply?.text.includes("fallback-host"));
    }
  );
});
