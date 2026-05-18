// V23.5 W-4 — agentWikiClient tests.
//
// We test the pure primitives from `agentWikiClient.shared.ts`. The thin
// outer wrapper `fetchAgentWikiPage` in `agentWikiClient.ts` is just
// `buildWikiUrl` → `fetch` → `parseFetchResponse` plus a `next/headers`
// origin lookup; the lookup is exercised via Next.js E2E (Playwright), and
// the rest is fully covered here.
//
// Coverage matrix:
//   T1  happy 200            → ok:true with data
//   T2  404 with JSON detail → ok:false, status 404, detail forwarded
//   T3  503 markdown_lib_unavailable
//   T4  503 wiki_path_read_only
//   T5  non-JSON error body  → falls back to detail = "fetch_failed"
//   T6  company_id query param round-trips correctly via buildWikiUrl
//   T7  buildWikiUrl: trailing-slash origin + encoded page_id

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildWikiUrl,
  parseFetchResponse,
  type WikiHtmlResponse,
} from "../agentWikiClient.shared";

function mkJson(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// T1 ──────────────────────────────────────────────────────────────────────────
test("T1 happy 200 → ok:true with parsed data", async () => {
  const sample: WikiHtmlResponse = {
    page_id: "rust-ownership",
    title: "Rust Ownership",
    html: "<p>borrow checker</p>",
    source_markdown: "borrow checker",
    scope: "global",
    updated_at: "2026-05-19T10:00:00Z",
  };
  const out = await parseFetchResponse(mkJson(200, sample));
  assert.equal(out.ok, true);
  if (out.ok) {
    assert.equal(out.data.page_id, "rust-ownership");
    assert.equal(out.data.title, "Rust Ownership");
    assert.equal(out.data.scope, "global");
    assert.equal(out.data.source_markdown, "borrow checker");
    assert.equal(out.data.html, "<p>borrow checker</p>");
    assert.equal(out.data.updated_at, "2026-05-19T10:00:00Z");
  }
});

// T2 ──────────────────────────────────────────────────────────────────────────
test("T2 404 with detail → ok:false status 404 detail forwarded", async () => {
  const res = mkJson(404, {
    detail: "Wiki page 'foo' not found in scope 'global'.",
  });
  const out = await parseFetchResponse(res);
  assert.equal(out.ok, false);
  if (!out.ok) {
    assert.equal(out.error.status, 404);
    assert.match(out.error.detail, /not found/);
  }
});

// T3 ──────────────────────────────────────────────────────────────────────────
test("T3 503 markdown_lib_unavailable → forwarded verbatim", async () => {
  const out = await parseFetchResponse(
    mkJson(503, { detail: "markdown_lib_unavailable" }),
  );
  assert.equal(out.ok, false);
  if (!out.ok) {
    assert.equal(out.error.status, 503);
    assert.equal(out.error.detail, "markdown_lib_unavailable");
  }
});

// T4 ──────────────────────────────────────────────────────────────────────────
test("T4 503 wiki_path_read_only → forwarded verbatim", async () => {
  const out = await parseFetchResponse(
    mkJson(503, { detail: "wiki_path_read_only" }),
  );
  assert.equal(out.ok, false);
  if (!out.ok) {
    assert.equal(out.error.status, 503);
    assert.equal(out.error.detail, "wiki_path_read_only");
  }
});

// T5 ──────────────────────────────────────────────────────────────────────────
test("T5 non-JSON error body → detail falls back to 'fetch_failed'", async () => {
  const res = new Response("<html>nginx 502</html>", {
    status: 502,
    headers: { "content-type": "text/html" },
  });
  const out = await parseFetchResponse(res);
  assert.equal(out.ok, false);
  if (!out.ok) {
    assert.equal(out.error.status, 502);
    assert.equal(out.error.detail, "fetch_failed");
  }
});

// T6 ──────────────────────────────────────────────────────────────────────────
test("T6 buildWikiUrl appends company_id query param", () => {
  const u1 = buildWikiUrl("http://localhost:3001", "rust-ownership");
  assert.equal(u1, "http://localhost:3001/api/wiki/page/rust-ownership/html");

  const u2 = buildWikiUrl(
    "http://localhost:3001",
    "rust-ownership",
    "abc12345",
  );
  assert.match(
    u2,
    /\/api\/wiki\/page\/rust-ownership\/html\?company_id=abc12345$/,
  );

  // company_id omitted when undefined.
  const u3 = buildWikiUrl("http://localhost:3001", "page", undefined);
  assert.equal(u3, "http://localhost:3001/api/wiki/page/page/html");
});

// T7 ──────────────────────────────────────────────────────────────────────────
test("T7 buildWikiUrl: trailing-slash origin stripped + page_id encoded", () => {
  // Trailing slash(es) on origin stripped.
  const u1 = buildWikiUrl("http://localhost:3001/", "foo");
  assert.equal(u1, "http://localhost:3001/api/wiki/page/foo/html");

  const u2 = buildWikiUrl("http://localhost:3001///", "foo");
  assert.equal(u2, "http://localhost:3001/api/wiki/page/foo/html");

  // Slash- and space-containing page_id URL-encoded.
  const u3 = buildWikiUrl("http://x.test", "folder/page name");
  assert.match(u3, /\/api\/wiki\/page\/folder%2Fpage(%20|\+)name\/html$/);
});
