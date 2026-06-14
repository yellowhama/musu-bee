import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveAiCli, buildCliEnv } from "./aiCliSpawn";

test("resolveAiCli rejects unconfigured", () => {
  const r = resolveAiCli(undefined);
  assert.equal(r.ok, false);
});

test("resolveAiCli allows default CLI by basename", () => {
  const r = resolveAiCli("claude");
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.basename, "claude");
});

test("resolveAiCli allows absolute path to a default CLI", () => {
  const r = resolveAiCli("/usr/local/bin/codex");
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.basename, "codex");
});

test("resolveAiCli rejects path traversal", () => {
  const r = resolveAiCli("../../../../usr/bin/curl");
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /traversal/);
});

test("resolveAiCli rejects a binary not on the allowlist", () => {
  const r = resolveAiCli("/usr/bin/bash");
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /not allowed/);
});

test("resolveAiCli honors the user-configured CLI basename", () => {
  const prev = process.env.MUSU_AI_CLI;
  process.env.MUSU_AI_CLI = "/opt/tools/myllm";
  try {
    const r = resolveAiCli("/opt/tools/myllm");
    assert.equal(r.ok, true);
  } finally {
    if (prev === undefined) delete process.env.MUSU_AI_CLI;
    else process.env.MUSU_AI_CLI = prev;
  }
});

test("resolveAiCli honors MUSU_AI_CLI_ALLOWLIST extension", () => {
  const prev = process.env.MUSU_AI_CLI_ALLOWLIST;
  process.env.MUSU_AI_CLI_ALLOWLIST = "ollama, llm";
  try {
    const r = resolveAiCli("ollama");
    assert.equal(r.ok, true);
  } finally {
    if (prev === undefined) delete process.env.MUSU_AI_CLI_ALLOWLIST;
    else process.env.MUSU_AI_CLI_ALLOWLIST = prev;
  }
});

test("buildCliEnv excludes unrelated secrets but keeps provider keys", () => {
  const prevSecret = process.env.AWS_SECRET_ACCESS_KEY;
  const prevDb = process.env.DATABASE_URL;
  const prevAnthropic = process.env.ANTHROPIC_API_KEY;
  process.env.AWS_SECRET_ACCESS_KEY = "leak-me";
  process.env.DATABASE_URL = "postgres://secret";
  process.env.ANTHROPIC_API_KEY = "keep-me";
  try {
    const env = buildCliEnv();
    assert.equal(env.AWS_SECRET_ACCESS_KEY, undefined, "AWS secret must not pass through");
    assert.equal(env.DATABASE_URL, undefined, "DB url must not pass through");
    assert.equal(env.ANTHROPIC_API_KEY, "keep-me", "provider key must pass through");
    assert.ok(env.PATH !== undefined || env.Path !== undefined, "PATH must pass through");
  } finally {
    if (prevSecret === undefined) delete process.env.AWS_SECRET_ACCESS_KEY;
    else process.env.AWS_SECRET_ACCESS_KEY = prevSecret;
    if (prevDb === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = prevDb;
    if (prevAnthropic === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = prevAnthropic;
  }
});
