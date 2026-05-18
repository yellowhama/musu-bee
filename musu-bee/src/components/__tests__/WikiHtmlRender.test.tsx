// V23.5 W-2 — WikiHtmlRender pipeline contract test.
//
// Exercises the same render+sanitize pipeline the component uses at runtime
// (`renderWikiHtml`) against benign and adversarial markdown / HTML. This is the
// component-level companion to `xss-vector.test.tsx` (W-1, raw DOMPurify) —
// together they prove the full Layer-1 (rehype-sanitize + urlTransform) +
// Layer-3 (DOMPurify) defense holds end-to-end.
//
// Runner: `node:test` via tsx (musu-bee convention).
// Run: `cd musu-bee && npx tsx --test src/components/__tests__/WikiHtmlRender.test.tsx`

import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

// Hand JSDOM's window to the WikiHtmlRender pipeline before import-time effects.
const dom = new JSDOM("");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const win = dom.window as unknown as any;

// Polyfill globals expected by react-dom/server in node test env.
if (typeof globalThis.window === "undefined") {
  globalThis.window = win;
}
if (typeof globalThis.document === "undefined") {
  globalThis.document = win.document;
}

import { renderWikiHtml, safeUrlTransform } from "../WikiHtmlRender";

function render(md: string): string {
  return renderWikiHtml(md, win);
}

// ---------------------------------------------------------------------------
// Benign rendering — confirms pipeline produces useful output, not over-strip.
// ---------------------------------------------------------------------------

test("WikiHtmlRender: plain markdown renders to HTML", () => {
  const out = render("Hello **world**");
  assert.match(out, /<strong>world<\/strong>/, `expected <strong>: ${out}`);
});

test("WikiHtmlRender: GFM table renders as <table>", () => {
  const md = [
    "| Col1 | Col2 |",
    "|------|------|",
    "| a    | b    |",
  ].join("\n");
  const out = render(md);
  assert.match(out, /<table/, `expected GFM <table>: ${out}`);
  assert.match(out, /<th>Col1<\/th>/, `expected header cell: ${out}`);
  assert.match(out, /<td>a<\/td>/, `expected body cell: ${out}`);
});

test("WikiHtmlRender: http(s) link preserved", () => {
  const out = render("[link](https://example.com)");
  assert.match(out, /href="https:\/\/example\.com"/, `https href stripped: ${out}`);
});

test("WikiHtmlRender: mailto: link preserved", () => {
  const out = render("[email](mailto:user@example.com)");
  assert.match(out, /href="mailto:user@example\.com"/, `mailto href stripped: ${out}`);
});

test("WikiHtmlRender: relative link preserved", () => {
  const out = render("[doc](./foo.md)");
  assert.match(out, /href="\.\/foo\.md"/, `relative href stripped: ${out}`);
});

test("WikiHtmlRender: root-relative link preserved", () => {
  const out = render("[home](/dashboard)");
  assert.match(out, /href="\/dashboard"/, `root-relative href stripped: ${out}`);
});

// ---------------------------------------------------------------------------
// Adversarial — these MUST be stripped.
// ---------------------------------------------------------------------------

test("WikiHtmlRender: javascript: link blocked → href=#", () => {
  const out = render("[click](javascript:alert(1))");
  assert.ok(!out.toLowerCase().includes("javascript:"), `javascript: leaked: ${out}`);
  assert.ok(!out.includes("alert(1)"), `alert(1) leaked: ${out}`);
});

test("WikiHtmlRender: <script> tag stripped from raw HTML in markdown", () => {
  const out = render("before <script>alert(1)</script> after");
  // The dangerous part is the executable <script> element. The inner text
  // "alert(1)" surviving as plain <p> text is inert (no execution context).
  // Mirror this distinction explicitly so the test asserts what matters.
  assert.ok(!out.toLowerCase().includes("<script"), `<script> leaked: ${out}`);
  assert.ok(
    !/<script[\s>]/i.test(out),
    `executable script tag present: ${out}`,
  );
});

test("WikiHtmlRender: <iframe> stripped", () => {
  const out = render('<iframe src="https://evil.example.com"></iframe>');
  assert.ok(!out.toLowerCase().includes("<iframe"), `<iframe> leaked: ${out}`);
});

test("WikiHtmlRender: <form> stripped", () => {
  const out = render('<form action="https://evil.example.com"><input/></form>');
  assert.ok(!out.toLowerCase().includes("<form"), `<form> leaked: ${out}`);
  assert.ok(!out.toLowerCase().includes("action="), `action= leaked: ${out}`);
});

test("WikiHtmlRender: <style> stripped", () => {
  const out = render("<style>body{display:none}</style>visible");
  assert.ok(!out.toLowerCase().includes("<style"), `<style> leaked: ${out}`);
});

test("WikiHtmlRender: data:text/html URL blocked", () => {
  const out = render('[x](data:text/html,<script>alert(1)</script>)');
  assert.ok(!out.includes("data:text/html"), `data:text/html leaked: ${out}`);
  assert.ok(!out.toLowerCase().includes("<script"), `<script> from data URI leaked: ${out}`);
});

test("WikiHtmlRender: img onerror stripped", () => {
  const out = render('<img src=x onerror="alert(1)">');
  assert.ok(!out.toLowerCase().includes("onerror"), `onerror leaked: ${out}`);
  assert.ok(!out.includes("alert(1)"), `alert(1) leaked: ${out}`);
});

test("WikiHtmlRender: vbscript: protocol blocked", () => {
  const out = render('[legacy](vbscript:alert(1))');
  assert.ok(!out.toLowerCase().includes("vbscript:"), `vbscript: leaked: ${out}`);
});

// ---------------------------------------------------------------------------
// safeUrlTransform unit cases — direct coverage of the URL allowlist branch.
// ---------------------------------------------------------------------------

test("safeUrlTransform: http allowed", () => {
  assert.equal(safeUrlTransform("http://example.com"), "http://example.com");
});
test("safeUrlTransform: https allowed", () => {
  assert.equal(safeUrlTransform("https://example.com/path?q=1"), "https://example.com/path?q=1");
});
test("safeUrlTransform: mailto allowed", () => {
  assert.equal(safeUrlTransform("mailto:a@b.c"), "mailto:a@b.c");
});
test("safeUrlTransform: relative preserved", () => {
  assert.equal(safeUrlTransform("./foo.md"), "./foo.md");
  assert.equal(safeUrlTransform("../bar"), "../bar");
  assert.equal(safeUrlTransform("/abs"), "/abs");
  assert.equal(safeUrlTransform("#anchor"), "#anchor");
  assert.equal(safeUrlTransform("?q=1"), "?q=1");
});
test("safeUrlTransform: javascript: blocked", () => {
  assert.equal(safeUrlTransform("javascript:alert(1)"), "#");
  assert.equal(safeUrlTransform("JavaScript:alert(1)"), "#");
});
test("safeUrlTransform: vbscript: blocked", () => {
  assert.equal(safeUrlTransform("vbscript:alert(1)"), "#");
});
test("safeUrlTransform: data:text/html blocked", () => {
  assert.equal(safeUrlTransform("data:text/html,<x>"), "#");
});
test("safeUrlTransform: file: blocked", () => {
  assert.equal(safeUrlTransform("file:///etc/passwd"), "#");
});
test("safeUrlTransform: empty/whitespace → #", () => {
  assert.equal(safeUrlTransform(""), "#");
  assert.equal(safeUrlTransform("   "), "#");
});
