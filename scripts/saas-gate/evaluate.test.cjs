const test = require("node:test");
const assert = require("node:assert/strict");

const { evaluateSaasGate } = require("./evaluate.cjs");

test("passes when no product files are touched", () => {
  const result = evaluateSaasGate({
    files: [
      { filename: "scripts/windows/install.ps1", addedLines: ['$x = "https://app.fly.dev"'] },
      { filename: "docs/SOME_DOC.md", addedLines: ["uses @sentry/node"] },
      { filename: ".github/workflows/deploy.yml", addedLines: ["vercel deploy"] },
    ],
  });
  assert.equal(result.productFilesTouched, false);
  assert.equal(result.pass, true);
  assert.deepEqual(result.violations, []);
});

test("fails when a product file adds a banned SaaS SDK import", () => {
  const result = evaluateSaasGate({
    files: [
      {
        filename: "musu-bee/src/app/api/track/route.ts",
        addedLines: ['import * as Sentry from "@sentry/nextjs";', "Sentry.init({});"],
      },
    ],
  });
  assert.equal(result.productFilesTouched, true);
  assert.equal(result.pass, false);
  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0].token, "Sentry SDK");
  assert.equal(result.violations[0].file, "musu-bee/src/app/api/track/route.ts");
});

test("fails on a hardcoded hosted SaaS endpoint in product code", () => {
  const result = evaluateSaasGate({
    files: [
      {
        filename: "musu-bee/src/lib/llm.ts",
        addedLines: ['const url = "https://api.openai.com/v1/chat/completions";'],
      },
    ],
  });
  assert.equal(result.pass, false);
  assert.equal(result.violations[0].token, "OpenAI hosted endpoint");
});

test("fails on a Rust product file referencing an AWS host", () => {
  const result = evaluateSaasGate({
    files: [
      {
        filename: "musu-rs/src/cloud/uploader.rs",
        addedLines: ['let bucket = "musu-prod.s3.amazonaws.com";'],
      },
    ],
  });
  assert.equal(result.pass, false);
  assert.equal(result.violations[0].token, "AWS host");
});

test("ALLOWS the env-gated optional integrations (supabase, vercel/kv)", () => {
  const result = evaluateSaasGate({
    files: [
      {
        filename: "musu-bee/src/lib/supabase.ts",
        addedLines: ['import { createClient } from "@supabase/supabase-js";'],
      },
      {
        filename: "musu-bee/src/app/api/waitlist/route.ts",
        addedLines: ['const { kv } = await import("@vercel/kv");'],
      },
    ],
  });
  assert.equal(result.productFilesTouched, true);
  assert.equal(result.pass, true);
  assert.deepEqual(result.violations, []);
});

test("does NOT flag the local OpenAI-compatible protocol (false-positive guard)", () => {
  const result = evaluateSaasGate({
    files: [
      {
        filename: "musu-rs/src/adapter/openai_compat.rs",
        addedLines: [
          "//! OpenAI-compatible adapter (local bridge, not the SaaS)",
          'let url = format!("{}/v1/chat/completions", base_url);',
          'adapter_type: "openai_compat_local",',
        ],
      },
      {
        filename: "musu-bee/src/lib/aiCliSpawn.ts",
        addedLines: ['env: { OPENAI_API_KEY: process.env.OPENAI_API_KEY }'],
      },
    ],
  });
  assert.equal(result.pass, true);
  assert.deepEqual(result.violations, []);
});

test("does NOT flag a .vercel.app origin-allowlist check (real main false-positive)", () => {
  // From src/components/auth/AuthBridgeListener.tsx — a security origin check,
  // not a SaaS runtime dependency. `.vercel.app` is intentionally NOT a banned host.
  const result = evaluateSaasGate({
    files: [
      {
        filename: "musu-bee/src/components/auth/AuthBridgeListener.tsx",
        addedLines: [
          'if (event.origin !== TRUSTED_ORIGIN && !event.origin.endsWith(".vercel.app")) return;',
        ],
      },
    ],
  });
  assert.equal(result.pass, true);
});

test("does NOT flag Win32 API symbols that contain SaaS substrings (false-positive guard)", () => {
  const result = evaluateSaasGate({
    files: [
      {
        filename: "musu-rs/src/bridge/services.rs",
        addedLines: [
          "let mut entry: PROCESSENTRY32W = std::mem::zeroed();",
          "use windows::Win32::System::Diagnostics::ToolHelp::Process32FirstW;",
        ],
      },
    ],
  });
  assert.equal(result.pass, true);
  assert.deepEqual(result.violations, []);
});

test("ignores test files even when they reference banned hosts", () => {
  const result = evaluateSaasGate({
    files: [
      {
        filename: "musu-bee/src/app/api/waitlist/route.test.ts",
        addedLines: ['const FAKE = "https://test.fly.dev";'],
      },
    ],
  });
  assert.equal(result.productFilesTouched, false);
  assert.equal(result.pass, true);
});
