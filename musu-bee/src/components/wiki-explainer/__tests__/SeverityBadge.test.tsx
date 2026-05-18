// V23.5 W-5 — SeverityBadge unit tests.

import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SeverityBadge } from "../SeverityBadge";

test("SeverityBadge: HIGH renders correct class + aria-label + visible text", () => {
  const html = renderToStaticMarkup(<SeverityBadge severity="HIGH" />);
  assert.match(html, /class="[^"]*severity-badge[^"]*"/, `root class missing: ${html}`);
  assert.match(html, /severity-badge--high/, `--high modifier missing: ${html}`);
  assert.match(html, /aria-label="severity HIGH"/, `aria-label wrong: ${html}`);
  // Visible text label MUST be present (colour-blind redundancy).
  assert.match(html, />HIGH</, `visible HIGH text missing: ${html}`);
  assert.match(html, /role="status"/, `role=status missing: ${html}`);
});

test("SeverityBadge: text override displayed + reflected in aria-label", () => {
  const html = renderToStaticMarkup(
    <SeverityBadge severity="MED" text="needs review" />,
  );
  assert.match(html, /severity-badge--med/, `--med modifier missing: ${html}`);
  assert.match(html, />needs review</, `override text missing in body: ${html}`);
  assert.match(
    html,
    /aria-label="severity MEDIUM: needs review"/,
    `aria-label not composed: ${html}`,
  );
});

test("SeverityBadge: LOW + INFO variants get their own modifier classes", () => {
  const lowHtml = renderToStaticMarkup(<SeverityBadge severity="LOW" />);
  assert.match(lowHtml, /severity-badge--low/, `LOW modifier missing: ${lowHtml}`);

  const infoHtml = renderToStaticMarkup(<SeverityBadge severity="INFO" />);
  assert.match(infoHtml, /severity-badge--info/, `INFO modifier missing: ${infoHtml}`);
});
