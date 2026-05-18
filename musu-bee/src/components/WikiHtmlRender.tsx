// V23.5 W-2 — WikiHtmlRender: defense-in-depth markdown → HTML rendering.
//
// Layered XSS defense (Critic C7 / Plan §2 W-2 / R2):
//   Layer 1 (hast): react-markdown@9 + rehype-sanitize@6 with custom Schema
//                   (defaultSchema minus form/style/iframe) + remark-gfm@4.
//   Layer 2 (URL):  urlTransform allowlist — http / https / mailto / relative only.
//                   javascript:, vbscript:, data:text/html, file:, etc. → "#".
//   Layer 3 (DOM):  DOMPurify@3 post-pass after renderToStaticMarkup, with
//                   USE_PROFILES.html + FORBID_TAGS form/style/iframe +
//                   FORBID_ATTR formaction/action. Mirrors W-1 contract
//                   (`musu-bee/src/components/__tests__/xss-vector.test.tsx`)
//                   so the locked 12-vector contract continues to hold.
//
// Tariq #14 wrapper: <article className="wiki-html-render">. CSS lives in W-5
// (`musu-bee/src/styles/wiki-explainer.css`); this component only exposes the
// stable className for downstream styling.
//
// Note on API rename: the task spec uses the legacy name `transformLinkUri` but
// react-markdown@9 renamed it to `urlTransform`. Behaviour identical; comment
// preserved for cross-reference with V23.5 master plan §5.W-2.

"use client";

import React, { useMemo } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import type { Schema } from "hast-util-sanitize";
import createDOMPurify from "dompurify";

// ---------------------------------------------------------------------------
// Layer 1: rehype-sanitize schema (filter dangerous structural tags out of the
// defaultSchema's tagNames allow-list; defense-in-depth even though defaultSchema
// already disallows form/style/iframe — drift insurance if upstream relaxes).
// ---------------------------------------------------------------------------
const FORBIDDEN_TAGS = new Set(["form", "style", "iframe", "script", "object", "embed"]);

const SANITIZE_SCHEMA: Schema = {
  ...defaultSchema,
  tagNames: (defaultSchema.tagNames ?? []).filter((t) => !FORBIDDEN_TAGS.has(t)),
  attributes: {
    ...(defaultSchema.attributes ?? {}),
    // Allow className on every element so W-5 wiki-explainer CSS can hook in.
    "*": [
      ...((defaultSchema.attributes && defaultSchema.attributes["*"]) ?? []),
      "className",
    ],
  },
};

// ---------------------------------------------------------------------------
// Layer 2: URL allowlist. react-markdown@9 signature is
// `(url, key, node) => string | null | undefined`.
// We accept http/https/mailto and relative refs; everything else → "#".
// ---------------------------------------------------------------------------
export function safeUrlTransform(uri: string): string {
  if (typeof uri !== "string") return "#";
  const trimmed = uri.trim();
  if (!trimmed) return "#";
  // Relative references — covered before URL parsing because URL parser would
  // resolve them against a base and lose the relative form.
  if (
    trimmed.startsWith("/") ||
    trimmed.startsWith("./") ||
    trimmed.startsWith("../") ||
    trimmed.startsWith("#") ||
    trimmed.startsWith("?")
  ) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed, "https://wiki-render.invalid/");
    if (["http:", "https:", "mailto:"].includes(parsed.protocol)) {
      return trimmed;
    }
  } catch {
    /* fall through to block */
  }
  return "#";
}

// ---------------------------------------------------------------------------
// Layer 3: DOMPurify config — kept byte-identical with W-1 xss-vector test.
// ---------------------------------------------------------------------------
export const DOMPURIFY_CONFIG: {
  USE_PROFILES: { html: boolean };
  FORBID_TAGS: string[];
  FORBID_ATTR: string[];
} = {
  USE_PROFILES: { html: true },
  FORBID_TAGS: ["form", "style", "iframe"],
  FORBID_ATTR: ["formaction", "action"],
};

// DOMPurify factory: in the browser this binds to `window`; in tests we hand it
// a JSDOM window. Using a lazy singleton avoids re-instantiating per render.
type WindowLike = Parameters<typeof createDOMPurify>[0];

let purifyInstance: ReturnType<typeof createDOMPurify> | null = null;
function getPurify(win?: WindowLike): ReturnType<typeof createDOMPurify> {
  if (purifyInstance) return purifyInstance;
  const w = win ?? (typeof window !== "undefined" ? (window as unknown as WindowLike) : undefined);
  if (!w) {
    throw new Error("WikiHtmlRender: no window available for DOMPurify (SSR pass-through not yet supported)");
  }
  purifyInstance = createDOMPurify(w);
  return purifyInstance;
}

// Internal: render markdown → HTML string with Layers 1+2, then sanitize with
// Layer 3. Exported for test reuse so tests exercise the exact same pipeline
// the runtime component does.
export function renderWikiHtml(markdown: string, win?: WindowLike): string {
  const reactTree = (
    <Markdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[[rehypeSanitize, SANITIZE_SCHEMA]]}
      urlTransform={safeUrlTransform}
      skipHtml={false}
    >
      {markdown}
    </Markdown>
  );
  const layered = renderToStaticMarkup(reactTree);
  const purify = getPurify(win);
  return String(purify.sanitize(layered, DOMPURIFY_CONFIG));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export interface WikiHtmlRenderProps {
  /** Raw markdown source. */
  markdown: string;
  /** Optional extra className appended to the Tariq #14 wrapper. */
  className?: string;
}

export default function WikiHtmlRender({ markdown, className }: WikiHtmlRenderProps) {
  const safeHtml = useMemo(() => renderWikiHtml(markdown), [markdown]);
  const wrapperClass = className
    ? `wiki-html-render ${className}`
    : "wiki-html-render";
  return (
    <article
      className={wrapperClass}
      // Layer 3 sanitized output. Safe to inject as innerHTML because the
      // pipeline above strips every documented XSS vector (W-1 contract test
      // `xss-vector.test.tsx` 12 vectors + Tariq #14 wrapper invariant).
      dangerouslySetInnerHTML={{ __html: safeHtml }}
    />
  );
}
