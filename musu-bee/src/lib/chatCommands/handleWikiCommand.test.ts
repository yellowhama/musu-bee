import assert from "node:assert/strict";
import { test } from "node:test";
import type { Message } from "@/types";
import type { CommandContext } from "./types";
import { createWikiHandler } from "./handleWikiCommand";

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

// ── /learn ────────────────────────────────────────────────────────────────────

test("/learn 빈 content → false 반환", async () => {
  const { ctx, msgs } = makeCtx();
  const handle = createWikiHandler(ctx);
  const result = await handle("/learn ");
  assert.equal(result, false);
  assert.equal(msgs.length, 0);
});

test("/learn 정상 → wiki 저장 + 타이틀 포함 메시지", async () => {
  const { ctx, msgs, typingCalls } = makeCtx();
  const handle = createWikiHandler(ctx);

  await withFetchMock(
    async () =>
      new Response(
        JSON.stringify({ ok: true, page: { id: "wiki-001", title: "Rust 메모리 관리" } }),
        { status: 200 }
      ),
    async () => {
      const result = await handle("/learn Rust는 소유권 시스템으로 메모리를 관리한다.");
      assert.equal(result, true);
      assert.ok(typingCalls.includes(true), "setIsAgentTyping(true) 호출돼야 함");
      assert.ok(typingCalls.includes(false), "setIsAgentTyping(false) 호출돼야 함");
      assert.equal(msgs[0].senderKind, "user");
      const reply = msgs[1];
      assert.ok(reply.text.includes("Saved to wiki"), "should include 'Saved to wiki'");
      assert.ok(reply.text.includes("Rust 메모리 관리"), "should include page title");
    }
  );
});

test("/learn wiki 저장 실패 → error 메시지", async () => {
  const { ctx, msgs } = makeCtx();
  const handle = createWikiHandler(ctx);

  await withFetchMock(
    async () =>
      new Response(JSON.stringify({ ok: false, error: "llm_unavailable" }), { status: 200 }),
    async () => {
      const result = await handle("/learn 실패할 내용");
      assert.equal(result, true);
      assert.ok(msgs.some((m) => m.text.includes("Wiki save failed")));
      assert.ok(msgs.some((m) => m.text.includes("llm_unavailable")));
    }
  );
});

test("/learn fetch throws → network error 메시지", async () => {
  const { ctx, msgs, typingCalls } = makeCtx();
  const handle = createWikiHandler(ctx);

  await withFetchMock(
    async () => { throw new Error("ECONNREFUSED"); },
    async () => {
      await handle("/learn 네트워크 에러 케이스");
      assert.ok(msgs.some((m) => m.text.includes("network error")));
      // typing should be reset even on error
      assert.ok(typingCalls.includes(false), "setIsAgentTyping(false) 호출돼야 함");
    }
  );
});

// ── @wiki ─────────────────────────────────────────────────────────────────────

test("@wiki 빈 query → false 반환", async () => {
  const { ctx, msgs } = makeCtx();
  const handle = createWikiHandler(ctx);
  const result = await handle("@wiki ");
  assert.equal(result, false);
  assert.equal(msgs.length, 0);
});

test("@wiki 정상 → 검색 결과 포함 ai 메시지", async () => {
  const { ctx, msgs, typingCalls } = makeCtx();
  const handle = createWikiHandler(ctx);

  await withFetchMock(
    async (url) => {
      assert.ok(url.toString().includes("q=Rust"), "query param should be encoded");
      return new Response(
        JSON.stringify({
          pages: [
            {
              title: "Rust 소유권",
              summary: "Rust의 소유권 개념 설명",
              key_points: ["move semantics", "borrow checker", "lifetimes"],
            },
          ],
        }),
        { status: 200 }
      );
    },
    async () => {
      const result = await handle("@wiki Rust");
      assert.equal(result, true);
      assert.ok(typingCalls.includes(false), "typing 리셋돼야 함");
      const reply = msgs.find((m) => m.senderKind === "ai");
      assert.ok(reply, "ai 메시지가 있어야 함");
      assert.ok(reply?.text.includes("Rust 소유권"));
      assert.ok(reply?.text.includes("move semantics"));
    }
  );
});

test("@wiki 결과 없음 → 'No wiki results' 메시지", async () => {
  const { ctx, msgs } = makeCtx();
  const handle = createWikiHandler(ctx);

  await withFetchMock(
    async () => new Response(JSON.stringify({ pages: [] }), { status: 200 }),
    async () => {
      await handle("@wiki 없는검색어");
      assert.ok(msgs.some((m) => m.text.includes("No wiki results")));
    }
  );
});

test("@wiki fetch throws → network error 메시지", async () => {
  const { ctx, msgs, typingCalls } = makeCtx();
  const handle = createWikiHandler(ctx);

  await withFetchMock(
    async () => { throw new Error("timeout"); },
    async () => {
      await handle("@wiki 타임아웃 쿼리");
      assert.ok(msgs.some((m) => m.text.includes("network error")));
      assert.ok(typingCalls.includes(false), "typing 리셋돼야 함");
    }
  );
});

// ── 알 수 없는 커맨드 ─────────────────────────────────────────────────────────

test("알 수 없는 커맨드 → false", async () => {
  const { ctx } = makeCtx();
  const handle = createWikiHandler(ctx);
  assert.equal(await handle("/task foo"), false);
  assert.equal(await handle("일반 메시지"), false);
});
