// V23.5 W-5 — SectionTabs unit tests.
//
// Runner: `node:test` via tsx. Tests SSR output of the CSS-only tabs;
// the actual "switch on click" behaviour is browser-native (radio inputs
// + :checked sibling CSS) and not exercised here.

import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SectionTabs } from "../SectionTabs";

const TABS = [
  { id: "t1", label: "First", content: <p>first body</p> },
  { id: "t2", label: "Second", content: <p>second body</p> },
  { id: "t3", label: "Third", content: <p>third body</p> },
];

test("SectionTabs: first tab marked defaultChecked when defaultActiveId omitted", () => {
  const html = renderToStaticMarkup(<SectionTabs tabs={TABS} />);
  // First radio should have checked attribute; later two should not.
  const radioRegex = /<input[^>]*data-tab-id="t1"[^>]*>/;
  const firstRadioMatch = html.match(radioRegex);
  assert.ok(firstRadioMatch, `t1 radio not found in: ${html}`);
  assert.match(firstRadioMatch![0], /checked/, `t1 radio not checked: ${firstRadioMatch![0]}`);

  const t2 = html.match(/<input[^>]*data-tab-id="t2"[^>]*>/);
  assert.ok(t2, "t2 radio missing");
  assert.ok(!/checked/.test(t2![0]), `t2 should not be checked: ${t2![0]}`);
});

test("SectionTabs: explicit defaultActiveId selects that tab", () => {
  const html = renderToStaticMarkup(
    <SectionTabs tabs={TABS} defaultActiveId="t3" />,
  );
  const t3 = html.match(/<input[^>]*data-tab-id="t3"[^>]*>/);
  assert.ok(t3, "t3 radio missing");
  assert.match(t3![0], /checked/, `t3 should be checked: ${t3![0]}`);

  const t1 = html.match(/<input[^>]*data-tab-id="t1"[^>]*>/);
  assert.ok(t1, "t1 radio missing");
  assert.ok(!/checked/.test(t1![0]), `t1 should not be checked when t3 active: ${t1![0]}`);
});

test("SectionTabs: radio group name unique across two instances on same page", () => {
  const page = renderToStaticMarkup(
    <div>
      <SectionTabs tabs={TABS} key="a" />
      <SectionTabs tabs={TABS} key="b" />
    </div>,
  );
  // Extract all `name="..."` from radio inputs.
  const names = [...page.matchAll(/<input[^>]*name="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(names.length >= 6, `expected >=6 radios across 2 groups, got ${names.length}: ${page}`);
  const unique = new Set(names);
  // 3 tabs * 2 instances = 6 radios but only 2 distinct group names.
  assert.equal(unique.size, 2, `radio groups should be 2 unique names, got: ${[...unique].join(", ")}`);
});

test("SectionTabs: groupId override honored", () => {
  const html = renderToStaticMarkup(
    <SectionTabs tabs={TABS} groupId="templates" />,
  );
  assert.match(html, /name="templates"/, `custom groupId not used: ${html}`);
});

test("SectionTabs: aria-label on region + role=tablist on buttons", () => {
  const html = renderToStaticMarkup(
    <SectionTabs tabs={TABS} ariaLabel="Company templates" />,
  );
  assert.match(html, /role="region"/, `missing region role: ${html}`);
  assert.match(html, /aria-label="Company templates"/, `aria-label missing: ${html}`);
  assert.match(html, /role="tablist"/, `tablist role missing: ${html}`);
  assert.match(html, /role="tabpanel"/, `tabpanel role missing: ${html}`);
});

test("SectionTabs: empty tabs renders empty region without crash", () => {
  const html = renderToStaticMarkup(<SectionTabs tabs={[]} />);
  assert.match(html, /class="section-tabs"/, `root class missing: ${html}`);
});
