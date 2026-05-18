// V23.5 W-5 — FaqDetails unit tests.

import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FaqDetails } from "../FaqDetails";

test("FaqDetails: default closed (no `open` attribute)", () => {
  const html = renderToStaticMarkup(
    <FaqDetails question="What is musu?">Multi-machine AI runtime.</FaqDetails>,
  );
  assert.match(html, /<details[^>]*class="[^"]*faq-details/, `root <details> missing: ${html}`);
  assert.ok(!/<details[^>]*\sopen/.test(html), `should not be open by default: ${html}`);
  assert.match(html, /What is musu\?/, `question missing: ${html}`);
});

test("FaqDetails: defaultOpen=true renders with `open` attribute", () => {
  const html = renderToStaticMarkup(
    <FaqDetails question="Why HTML wiki?" defaultOpen>Severity badges + tabs need real HTML.</FaqDetails>,
  );
  assert.match(html, /<details[^>]*\sopen/, `open attribute missing: ${html}`);
  assert.match(html, /Why HTML wiki\?/, `question missing: ${html}`);
  assert.match(html, /class="faq-details__summary"/, `summary class missing: ${html}`);
  assert.match(html, /class="faq-details__body"/, `body class missing: ${html}`);
});
