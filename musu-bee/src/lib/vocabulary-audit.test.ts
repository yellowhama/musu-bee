// V23.4 T2-C — Vocabulary audit tests (wiki/434 §2.5 + §3 T10/T11).
//
// Per Auditor OQ-A4 + Critic OQ-CRIT-1: narrow-walker tests.
//   - T10: BANNED_PATTERNS catches banned word in fleet scope (regex word-boundary)
//   - T11: namespace regex does NOT match `namespace/foo`, `namespaces`, `namespaced`
//   - Audit baseline: narrow scope produces zero violations on real code.
//
// Modeled on `src/app/brand-tokens.test.ts` (Researcher F-R14): `node:test`
// runner + recursive `readdirSync`. Run via `npm run test:vocab`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
import { auditDir, BANNED_PATTERNS } from "./vocabulary-audit";

const thisFile = fileURLToPath(import.meta.url);
const libDir = path.dirname(thisFile);
const srcDir = path.resolve(libDir, "..");
const fleetDir = path.join(srcDir, "app", "fleet");
const dashboardDir = path.join(srcDir, "app", "dashboard");

test("BANNED_PATTERNS catches banned word in fleet scope (fixture)", () => {
  // Write fixture with K8s-vocab leakage, then assert audit catches it.
  if (!fs.existsSync(fleetDir)) {
    fs.mkdirSync(fleetDir, { recursive: true });
  }
  const fixturePath = path.join(fleetDir, "argo-leak.test-fixture.ts");
  // Use .ts (audited) but with .test-fixture suffix — auditDir auto-excludes
  // `.test-fixture.` so we need to write it WITHOUT the suffix for this test
  // to actually pick it up. Use a plain `argo-leak-fixture.ts` instead.
  const realFixturePath = path.join(fleetDir, "argo-leak-fixture.ts");
  fs.writeFileSync(realFixturePath, "// uses Argo here\nexport const x = 1;\n");
  try {
    const violations = auditDir(fleetDir);
    assert.ok(
      violations.some((v) => /Argo/.test(v.pattern)),
      `expected Argo violation; got: ${JSON.stringify(violations, null, 2)}`,
    );
  } finally {
    fs.unlinkSync(realFixturePath);
  }
  // Clean up potential stray dir if test created it
  if (fs.existsSync(fixturePath)) fs.unlinkSync(fixturePath);
});

test("namespace regex does NOT match namespace/foo, namespaces, namespaced (A-7 / OQ-A5)", () => {
  const nsPat = BANNED_PATTERNS.find((p) => p.source.includes("namespace"));
  assert.ok(nsPat, "namespace pattern must be present in BANNED_PATTERNS");
  assert.ok(!nsPat!.test("namespace/foo"), "must NOT match namespace/foo");
  assert.ok(!nsPat!.test("namespaces"), "must NOT match namespaces");
  assert.ok(!nsPat!.test("namespaced"), "must NOT match namespaced");
  assert.ok(nsPat!.test("namespace bar"), "MUST match bare 'namespace'");
});

test("webhook regex requires admission|mutating|validating qualifier (A-8)", () => {
  const wPat = BANNED_PATTERNS.find((p) => p.source.includes("webhook"));
  assert.ok(wPat, "webhook pattern must be present in BANNED_PATTERNS");
  assert.ok(!wPat!.test("Stripe webhook handler"), "bare 'webhook' must NOT match");
  assert.ok(!wPat!.test("GitHub webhook"), "bare 'webhook' must NOT match");
  assert.ok(wPat!.test("admission webhook"), "MUST match 'admission webhook'");
  assert.ok(wPat!.test("mutating webhook"), "MUST match 'mutating webhook'");
  assert.ok(wPat!.test("validating webhook"), "MUST match 'validating webhook'");
});

test("Pod regex requires K8s noun shape (not Podcast / Podiatry)", () => {
  const pPat = BANNED_PATTERNS.find((p) => p.source.startsWith("\\bPod"));
  assert.ok(pPat, "Pod pattern must be present in BANNED_PATTERNS");
  assert.ok(!pPat!.test("Podcast"), "must NOT match Podcast");
  assert.ok(!pPat!.test("Podiatry"), "must NOT match Podiatry");
  assert.ok(pPat!.test("Pod restart"), "MUST match 'Pod restart' (K8s noun)");
});

test("audit passes on narrow scope (fleet + dashboard, no fixtures)", () => {
  // OQ-A4 narrow walker: explicitly NOT scanning src/app/ broadly.
  // After Builder finishes, this MUST return zero violations.
  const violations = [
    ...auditDir(fleetDir),
    ...auditDir(dashboardDir),
  ];
  assert.equal(
    violations.length,
    0,
    `expected zero vocab violations under fleet+dashboard scope; got:\n${JSON.stringify(violations, null, 2)}`,
  );
});
