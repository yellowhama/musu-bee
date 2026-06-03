const test = require("node:test");
const assert = require("node:assert/strict");

const { evaluateDesignGate } = require("./evaluate.cjs");

test("passes when no UI paths are touched", () => {
  const result = evaluateDesignGate({
    changedFiles: ["musu-port/crates/musu-port-core/src/server.rs"],
    prBody: "",
  });

  assert.equal(result.uiTouched, false);
  assert.equal(result.pass, true);
});

test("fails when UI paths are touched without required evidence", () => {
  const result = evaluateDesignGate({
    changedFiles: ["musu-bee/src/app/page.tsx"],
    prBody: "Small UI tweak",
  });

  assert.equal(result.uiTouched, true);
  assert.equal(result.pass, false);
  assert.deepEqual(result.missingRequirements, [
    "`Design: Approved` token",
    "Paperclip brief issue URL",
    "artifact URL ending in `.pen` or `.png`",
  ]);
});

test("ignores Next app route handlers", () => {
  const result = evaluateDesignGate({
    changedFiles: ["musu-bee/src/app/api/v1/p2p/route-evidence/route.ts"],
    prBody: "",
  });

  assert.equal(result.uiTouched, false);
  assert.equal(result.pass, true);
  assert.deepEqual(result.matchedUiFiles, []);
});

test("passes when UI paths are touched with all required evidence", () => {
  const result = evaluateDesignGate({
    changedFiles: ["musu-bee/src/components/Sidebar.tsx"],
    prBody: [
      "Design: Approved",
      "Paperclip brief: https://paperclip.local/MUS/issues/MUS-1801",
      "Artifact: https://example.com/mockups/dashboard-v3.pen",
    ].join("\n"),
  });

  assert.equal(result.uiTouched, true);
  assert.equal(result.pass, true);
  assert.deepEqual(result.missingRequirements, []);
});

test("fails when PR body uses non-URL bypass tokens", () => {
  const result = evaluateDesignGate({
    changedFiles: ["musu-bee/src/app/landing/page.tsx"],
    prBody: [
      "Design: Approved",
      "Paperclip brief: MUS-1801",
      "Artifact: fake-local.pen",
    ].join("\n"),
  });

  assert.equal(result.uiTouched, true);
  assert.equal(result.pass, false);
  assert.deepEqual(result.missingRequirements, [
    "Paperclip brief issue URL",
    "artifact URL ending in `.pen` or `.png`",
  ]);
});
