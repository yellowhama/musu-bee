import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

const LANDING_PAGE_PATH = resolve(process.cwd(), "src/app/landing-exp/page.tsx");

test("landing-exp waitlist form posts to canonical action contract", async () => {
  const source = await readFile(LANDING_PAGE_PATH, "utf8");

  assert.match(
    source,
    /<form action="\/api\/waitlist\?from=\/landing-exp" method="post"/,
    "waitlist form action contract must remain /api/waitlist?from=/landing-exp with POST",
  );
});

test("landing-exp explicitly handles all supported waitlist statuses", async () => {
  const source = await readFile(LANDING_PAGE_PATH, "utf8");

  const statusMatches = Array.from(
    source.matchAll(/waitlistStatus === "([^"]+)"/g),
    (match) => match[1],
  ).sort();

  assert.deepEqual(statusMatches, ["error", "invalid_email", "ok"]);

  assert.match(
    source,
    /waitlistStatus === "ok"[\s\S]*You are on the list\. We will send your access window soon\./,
  );
  assert.match(
    source,
    /waitlistStatus === "invalid_email"[\s\S]*That email looks invalid\. Please check and submit again\./,
  );
  assert.match(
    source,
    /waitlistStatus === "error"[\s\S]*Waitlist is temporarily unavailable\. Retry in a minute\./,
  );
});
