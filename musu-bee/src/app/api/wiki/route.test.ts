import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlinkSync } from "node:fs";
import { NextRequest } from "next/server";

type Module = {
  GET: (req: NextRequest) => Promise<Response>;
  POST: (req: NextRequest) => Promise<Response>;
  DELETE: (req: NextRequest) => Promise<Response>;
};
let GET: Module["GET"];
let POST: Module["POST"];
let DELETE: Module["DELETE"];

let dbPath: string;

before(async () => {
  // wiki.ts creates a new connection per call and expects the schema to exist.
  // Create a temp DB file and initialize the schema before importing the route.
  dbPath = join(tmpdir(), `wiki-test-${Date.now()}.db`);
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS wiki_pages (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT,
      key_points TEXT,
      evidence TEXT,
      related TEXT,
      open_questions TEXT,
      source_raw TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS wiki_scope_idx ON wiki_pages(scope);
    CREATE VIRTUAL TABLE IF NOT EXISTS wiki_fts USING fts5(id, scope, title, summary, key_points);
  `);
  db.close();

  process.env.MUSU_WIKI_DB = dbPath;
  process.env.MUSU_LLM_URL = "http://llm.test";
  ({ GET, POST, DELETE } = (await import("./route")) as Module);
});

after(() => {
  try { unlinkSync(dbPath); } catch { /* ignore */ }
});

function withFetchMock(
  mockFn: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  fn: () => Promise<void>
) {
  const orig = globalThis.fetch;
  globalThis.fetch = mockFn as typeof fetch;
  return fn().finally(() => { globalThis.fetch = orig; });
}

function postReq(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/wiki", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function getReq(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/wiki");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url.toString());
}

function deleteReq(id?: string) {
  const url = "http://localhost/api/wiki" + (id ? `?id=${id}` : "");
  return new NextRequest(url, { method: "DELETE" });
}

// ── POST manual mode ──────────────────────────────────────────────────────────

test("POST title+summary → ok:true + page", async () => {
  const res = await POST(postReq({ title: "테스트 페이지", summary: "요약 내용" }));
  assert.equal(res.status, 200);
  const body = await res.json() as { ok: boolean; page: { title: string } };
  assert.equal(body.ok, true);
  assert.equal(body.page.title, "테스트 페이지");
});

test("POST title 없음 → 400", async () => {
  const res = await POST(postReq({ summary: "요약만 있음" }));
  assert.equal(res.status, 400);
  const body = await res.json() as { error: string };
  assert.equal(body.error, "title required");
});

// ── POST LLM mode (content만 제공) ────────────────────────────────────────────

test("POST content + LLM 성공 → ok:true", async () => {
  const llmPayload = {
    choices: [{
      message: {
        content: JSON.stringify({
          title: "LLM 추출 제목",
          summary: "LLM 요약",
          key_points: ["포인트 1"],
          evidence: [],
          related: [],
          open_questions: [],
        }),
      },
    }],
  };

  await withFetchMock(
    async (url) => {
      if (url.toString().includes("/v1/models")) {
        return new Response(JSON.stringify({ data: [{ id: "qwen2.5:7b" }] }), { status: 200 });
      }
      return new Response(JSON.stringify(llmPayload), { status: 200 });
    },
    async () => {
      const res = await POST(postReq({ content: "LLM으로 추출할 긴 내용입니다." }));
      assert.equal(res.status, 200);
      const body = await res.json() as { ok: boolean };
      assert.equal(body.ok, true);
    }
  );
});

test("POST content + LLM 실패 → 502", async () => {
  await withFetchMock(
    async () => { throw new Error("connection refused"); },
    async () => {
      const res = await POST(postReq({ content: "LLM 실패 시나리오" }));
      assert.equal(res.status, 502);
      const body = await res.json() as { error: string };
      assert.ok(body.error.includes("LLM extraction failed"));
    }
  );
});

test("POST content + LLM 모델 없음 → 502", async () => {
  await withFetchMock(
    async () => new Response(JSON.stringify({ data: [] }), { status: 200 }),
    async () => {
      const res = await POST(postReq({ content: "모델 없음 시나리오" }));
      assert.equal(res.status, 502);
    }
  );
});

// ── GET ──────────────────────────────────────────────────────────────────────

test("GET ?list=1 → 전체 목록", async () => {
  const res = await GET(getReq({ list: "1" }));
  assert.equal(res.status, 200);
  const body = await res.json() as { pages: unknown[] };
  assert.ok(Array.isArray(body.pages));
  assert.ok(body.pages.length >= 1, "should include pages added by prior tests");
});

test("GET ?q=keyword → 검색 결과 배열", async () => {
  await POST(postReq({ title: "검색 키워드 페이지", summary: "찾을 수 있는 내용" }));
  const res = await GET(getReq({ q: "검색 키워드" }));
  assert.equal(res.status, 200);
  const body = await res.json() as { pages: unknown[] };
  assert.ok(Array.isArray(body.pages));
});

// ── DELETE ───────────────────────────────────────────────────────────────────

test("DELETE id 없음 → 400", async () => {
  const res = await DELETE(deleteReq());
  assert.equal(res.status, 400);
  const body = await res.json() as { error: string };
  assert.equal(body.error, "id required");
});

test("DELETE 정상 → ok:true", async () => {
  // Provide explicit id to avoid upsertWikiPage's params spread overwriting the computed id.
  const explicitId = "delete-test-page";
  await POST(postReq({ id: explicitId, title: "삭제할 페이지" }));
  const res = await DELETE(deleteReq(explicitId));
  assert.equal(res.status, 200);
  const body = await res.json() as { ok: boolean };
  assert.equal(body.ok, true);
});
