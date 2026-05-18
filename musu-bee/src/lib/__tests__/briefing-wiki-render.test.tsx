// V23.5 C-2 — ProjectBriefing recent_wiki_pages section unit tests.
//
// Exercises the RecentWikiPagesSection sub-component (exported from
// ProjectBriefing.tsx) and the buildAgentWikiHref pure helper. We render the
// section in isolation rather than the whole ProjectBriefing because the
// parent uses `useState`/`useEffect` + `fetch`, which is not the unit under
// test here — C-2 only added the new section.
//
// Runner: `node:test` via tsx (musu-bee convention; see W-5 component tests).
// Run:
//   cd musu-bee
//   npx tsx --test src/lib/__tests__/briefing-wiki-render.test.tsx

import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  RecentWikiPagesSection,
  buildAgentWikiHref,
  type RecentWikiPage,
} from "../../components/ProjectBriefing";

const COMPANY_ID = "abc12345-1111-2222-3333-444455556666";

const globalPage: RecentWikiPage = {
  page_id: "kb/intro",
  title: "Intro to musu",
  scope: "global",
  updated_at: "2026-05-19T08:00:00Z",
  summary_excerpt: "First page",
};
const companyPage: RecentWikiPage = {
  page_id: "process/onboarding",
  title: "Onboarding flow",
  scope: "company:abc12345",
  updated_at: "2026-05-19T09:00:00Z",
  summary_excerpt: "How new hires get going",
};
const companyPageNoExcerpt: RecentWikiPage = {
  page_id: "ops/oncall",
  title: "Oncall rota",
  scope: "company:abc12345",
  updated_at: "2026-05-19T10:00:00Z",
  summary_excerpt: "",
};

// ─────────────────────────────────────────────────────────────────────────────
// buildAgentWikiHref — pure helper covered first (used by section + would be
// reused by any future deep-link from elsewhere in the briefing).
// ─────────────────────────────────────────────────────────────────────────────

test("buildAgentWikiHref: global scope omits company_id even when one is provided", () => {
  const href = buildAgentWikiHref("kb/intro", "global", COMPANY_ID);
  assert.equal(href, "/app/wiki/agent/kb%2Fintro");
  assert.ok(!href.includes("company_id="), `global link must not carry company_id: ${href}`);
});

test("buildAgentWikiHref: company scope adds full company_id from props (NOT the truncated 8-char one)", () => {
  const href = buildAgentWikiHref(
    "process/onboarding",
    "company:abc12345",
    COMPANY_ID,
  );
  assert.match(
    href,
    new RegExp(`^/app/wiki/agent/process%2Fonboarding\\?company_id=${COMPANY_ID}$`),
    `bad company-scoped link: ${href}`,
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// RecentWikiPagesSection — render contract
// ─────────────────────────────────────────────────────────────────────────────

test("RecentWikiPagesSection: empty array → renders nothing (no <section>, no header)", () => {
  const html = renderToStaticMarkup(
    <RecentWikiPagesSection pages={[]} companyId={COMPANY_ID} synthesisEnabled={false} />,
  );
  assert.equal(html, "", `expected empty render, got: ${html}`);
});

test("RecentWikiPagesSection: three pages → three <li> cards with title + scope text", () => {
  const html = renderToStaticMarkup(
    <RecentWikiPagesSection
      pages={[globalPage, companyPage, companyPageNoExcerpt]}
      companyId={COMPANY_ID}
      synthesisEnabled={false}
    />,
  );
  const liCount = (html.match(/<li\b/g) ?? []).length;
  assert.equal(liCount, 3, `expected 3 list items, got ${liCount}: ${html}`);
  assert.match(html, /Intro to musu/, `globalPage title missing: ${html}`);
  assert.match(html, /Onboarding flow/, `companyPage title missing: ${html}`);
  assert.match(html, /Oncall rota/, `companyPageNoExcerpt title missing: ${html}`);
  // Scope text rendered for differentiation.
  assert.match(html, />global</, `global scope label missing: ${html}`);
  assert.match(html, />company:abc12345</, `company scope label missing: ${html}`);
  // Header count reflects payload length.
  assert.match(html, /Recent wiki updates \(3\)/, `header count wrong: ${html}`);
});

test("RecentWikiPagesSection: global scope card → href has NO company_id query", () => {
  const html = renderToStaticMarkup(
    <RecentWikiPagesSection pages={[globalPage]} companyId={COMPANY_ID} synthesisEnabled={false} />,
  );
  assert.match(
    html,
    /href="\/app\/wiki\/agent\/kb%2Fintro"/,
    `global href should be plain (no query): ${html}`,
  );
  // Defensive: make sure we didn't leak the company_id anywhere on a global card.
  assert.ok(
    !html.includes(`company_id=${COMPANY_ID}`),
    `global card must not carry company_id: ${html}`,
  );
});

test("RecentWikiPagesSection: company scope card → href includes encoded company_id", () => {
  const html = renderToStaticMarkup(
    <RecentWikiPagesSection pages={[companyPage]} companyId={COMPANY_ID} synthesisEnabled={false} />,
  );
  assert.match(
    html,
    new RegExp(
      `href="\\/app\\/wiki\\/agent\\/process%2Fonboarding\\?company_id=${COMPANY_ID}"`,
    ),
    `company-scoped href wrong: ${html}`,
  );
});

test("RecentWikiPagesSection: AI synthesis button is disabled when synthesisEnabled=false (C-3 stub)", () => {
  const html = renderToStaticMarkup(
    <RecentWikiPagesSection pages={[globalPage]} companyId={COMPANY_ID} synthesisEnabled={false} />,
  );
  // React renders disabled boolean as a bare attribute on the button.
  assert.match(html, /<button[^>]*\bdisabled\b[^>]*>[^<]*📝 Get AI synthesis/, `button not disabled: ${html}`);
  assert.match(html, /aria-disabled="true"/, `aria-disabled missing: ${html}`);
  assert.match(
    html,
    /title="AI synthesis is opt-in \(V23\.5 C-3, not yet enabled\)"/,
    `disabled-tooltip wrong: ${html}`,
  );
});

test("RecentWikiPagesSection: empty summary_excerpt → no <p> body rendered for that card", () => {
  const htmlNoExcerpt = renderToStaticMarkup(
    <RecentWikiPagesSection
      pages={[companyPageNoExcerpt]}
      companyId={COMPANY_ID}
      synthesisEnabled={false}
    />,
  );
  // The card itself renders, but the body <p> should be absent.
  assert.match(htmlNoExcerpt, /Oncall rota/, `card title still expected: ${htmlNoExcerpt}`);
  assert.ok(
    !/<p\b/.test(htmlNoExcerpt),
    `<p> body must not render for empty excerpt: ${htmlNoExcerpt}`,
  );

  // Sanity contrast: a page WITH an excerpt does render a <p>.
  const htmlWithExcerpt = renderToStaticMarkup(
    <RecentWikiPagesSection
      pages={[globalPage]}
      companyId={COMPANY_ID}
      synthesisEnabled={false}
    />,
  );
  assert.match(htmlWithExcerpt, /<p[^>]*>First page<\/p>/, `excerpt <p> should render: ${htmlWithExcerpt}`);
});
