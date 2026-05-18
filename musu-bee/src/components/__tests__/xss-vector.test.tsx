// V23.5 W-1 — XSS vector sanitization contract test (wiki/460 §2 W-1, Critic C7).
//
// Purpose: lock the XSS defense contract for V23.5 wiki-html rendering BEFORE
// W-2 (`WikiHtmlRender.tsx`) lands. Verifies that DOMPurify (client-side fallback
// + W-2 defense layer) strips every documented attack vector. W-2 Builder must
// keep this test green; if W-2 changes sanitizer config, this test catches
// regressions in the XSS contract.
//
// Project convention: `node:test` runner (matches src/lib/*.test.ts + brand-tokens
// test — no Jest in musu-bee). File uses `.test.tsx` extension per W-1 spec path;
// pure DOM string assertions, no React render needed (alternative path from W-1
// task: test DOMPurify directly so W-2 dependency is decoupled).
//
// Run: `cd musu-bee && npx tsx --test src/components/__tests__/xss-vector.test.tsx`

import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import createDOMPurify from "dompurify";

// Construct a JSDOM-backed DOMPurify instance. W-2 will use the browser window
// in client; this test exercises the same DOMPurify code path against the same
// vectors so server-equivalent assertions hold.
const dom = new JSDOM("");
// dompurify factory accepts a Window-like (structural Pick of globalThis).
// jsdom's window provides all required members at runtime; we cast through
// `unknown` to satisfy the `WindowLike` structural subset without pulling in
// dompurify's internal type re-exports.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const purify = createDOMPurify(dom.window as unknown as any);

// Sanitizer config mirrors the planned W-2 config: allow standard markdown-render
// HTML, strip script + on* + javascript:/vbscript:/data: URIs + form/style/iframe.
// Keep config in sync with W-2 WikiHtmlRender; if W-2 diverges, update both
// together. DOMPurify's html profile permits <form> by default, so we forbid it
// explicitly here (Critic C7 vector 10).
const SANITIZE_CONFIG = {
  USE_PROFILES: { html: true },
  // Tags we must reject even though html profile would allow them.
  FORBID_TAGS: ["form", "style", "iframe"],
  // Attributes we must reject even though html profile would allow them.
  FORBID_ATTR: ["formaction", "action"],
};

interface XssVector {
  name: string;
  input: string;
  // Substrings (case-insensitive) that MUST NOT appear in sanitized output.
  forbidden: string[];
}

// ≥10 vectors per Critic C7. 12 vectors total covering:
//   - raw script injection (1, 12)
//   - event handler attrs (2, 6, 7)
//   - URI-scheme injection in markdown / HTML (3, 4, 11)
//   - structural element injection (5, 8, 10)
//   - data-URI bypass (9)
//   - parser-confusion bypass (12)
const VECTORS: XssVector[] = [
  {
    name: "raw-script-tag",
    input: "<script>alert(1)</script>",
    forbidden: ["<script", "alert(1)"],
  },
  {
    name: "img-onerror",
    input: '<img src=x onerror="alert(1)">',
    forbidden: ["onerror", "alert(1)"],
  },
  {
    name: "markdown-javascript-link",
    // Markdown link with javascript: URI — DOMPurify strips javascript: from href.
    input: '<a href="javascript:alert(1)">click</a>',
    forbidden: ["javascript:", "alert(1)"],
  },
  {
    name: "anchor-javascript-href",
    input: '<a href="javascript:void(0)" onclick="alert(1)">x</a>',
    forbidden: ["javascript:", "onclick", "alert(1)"],
  },
  {
    name: "iframe-injection",
    input: '<iframe src="https://evil.example.com"></iframe>',
    forbidden: ["<iframe"],
  },
  {
    name: "svg-onload",
    input: '<svg onload="alert(1)"><circle r="10"/></svg>',
    forbidden: ["onload", "alert(1)"],
  },
  {
    name: "body-onload",
    input: '<body onload="alert(1)">content</body>',
    forbidden: ["onload", "alert(1)"],
  },
  {
    name: "style-tag-injection",
    input: "<style>body{display:none}</style>",
    forbidden: ["<style"],
  },
  {
    name: "data-uri-html",
    input: '<a href="data:text/html,<script>alert(1)</script>">x</a>',
    // DOMPurify default forbids data: in href (only http/https/ftp/ftps/tel/mailto/
    // callto/sms/cid/xmpp pass). Output must not retain the data:text/html prefix
    // nor the script payload.
    forbidden: ["data:text/html", "<script", "alert(1)"],
  },
  {
    name: "form-injection",
    input: '<form action="https://evil.example.com"><input name="p"/></form>',
    forbidden: ["<form", "action="],
  },
  {
    name: "vbscript-legacy",
    input: '<a href="vbscript:alert(1)">legacy</a>',
    forbidden: ["vbscript:", "alert(1)"],
  },
  {
    name: "nested-tag-bypass",
    // Classic "<<script>script>" bypass — relies on naive regex stripping that
    // leaves the inner script intact. DOMPurify must defeat it.
    input: "<<script>script>alert(1)<</script>/script>",
    forbidden: ["<script", "alert(1)"],
  },
];

for (const vector of VECTORS) {
  test(`XSS-${vector.name}: sanitizer strips dangerous tokens`, () => {
    const clean = String(purify.sanitize(vector.input, SANITIZE_CONFIG));
    const lower = clean.toLowerCase();
    for (const forbidden of vector.forbidden) {
      assert.ok(
        !lower.includes(forbidden.toLowerCase()),
        `Vector "${vector.name}" leaked forbidden token "${forbidden}" — sanitized output was: ${JSON.stringify(clean)}`,
      );
    }
  });
}

// Meta-test: confirm we have at least the Critic-mandated vector count.
test("XSS contract: at least 10 vectors covered", () => {
  assert.ok(
    VECTORS.length >= 10,
    `W-1 requires ≥10 XSS vectors per Critic C7; got ${VECTORS.length}`,
  );
});

// Sanity: ensure DOMPurify actually preserves benign markdown-rendered HTML so
// the test isn't trivially passing by stripping everything.
test("XSS contract: benign HTML is preserved", () => {
  const benign = "<p>Hello <strong>world</strong> <a href=\"https://example.com\">link</a></p>";
  const clean = String(purify.sanitize(benign, SANITIZE_CONFIG));
  assert.ok(clean.includes("<p>"), `benign <p> tag stripped: ${clean}`);
  assert.ok(clean.includes("<strong>"), `benign <strong> tag stripped: ${clean}`);
  assert.ok(
    clean.includes('href="https://example.com"'),
    `benign https href stripped: ${clean}`,
  );
});
