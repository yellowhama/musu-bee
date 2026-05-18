// V23.5 W-5 — TldrCard unit tests.
//
// Runner: `node:test` via tsx (musu-bee convention; see WikiHtmlRender.test.tsx).
// Run: `cd musu-bee && npx tsx --test src/components/wiki-explainer/__tests__/TldrCard.test.tsx`

import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TldrCard } from "../TldrCard";

test("TldrCard: default variant=info reflected in className", () => {
  const html = renderToStaticMarkup(
    <TldrCard>body content</TldrCard>,
  );
  assert.match(html, /class="[^"]*tldr-card[^"]*"/, `no .tldr-card class: ${html}`);
  assert.match(html, /tldr-card--info/, `no info variant class: ${html}`);
  assert.match(html, /role="note"/, `missing role=note: ${html}`);
  assert.match(html, /aria-label="TL;DR"/, `missing default aria-label: ${html}`);
});

test("TldrCard: variant=warning applied + custom title used as aria-label", () => {
  const html = renderToStaticMarkup(
    <TldrCard variant="warning" title="Heads up">Caveat here</TldrCard>,
  );
  assert.match(html, /tldr-card--warning/, `warning variant missing: ${html}`);
  assert.match(html, /aria-label="Heads up"/, `custom title not in aria-label: ${html}`);
  assert.match(html, /Caveat here/, `body content missing: ${html}`);
});
