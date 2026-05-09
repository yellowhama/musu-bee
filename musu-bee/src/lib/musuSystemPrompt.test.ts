import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

import {
  buildMusuCliPrompt,
  buildMusuSystemPrompt,
  getMusuSystemPromptV1Path,
  loadMusuSystemPromptV1,
} from "@/lib/musuSystemPrompt";

test("MUSU system prompt v1 file is loaded and non-empty", () => {
  const promptPath = getMusuSystemPromptV1Path();
  assert.ok(existsSync(promptPath), `prompt file must exist: ${promptPath}`);

  const prompt = loadMusuSystemPromptV1();
  assert.ok(prompt.length > 0, "prompt text must be non-empty");
  assert.match(prompt, /Role Contract:/);
  assert.match(prompt, /Guardrails:/);
  assert.match(prompt, /Output Shape Constraints:/);

  const fileText = readFileSync(promptPath, "utf8").trim();
  assert.equal(prompt, fileText, "runtime loader should read the committed prompt file");
});

test("MUSU prompt builders produce deterministic runtime payloads", () => {
  const basePrompt = buildMusuSystemPrompt();
  assert.ok(basePrompt.length > 0);

  const withContext = buildMusuSystemPrompt("## Runtime Context");
  assert.match(withContext, /## Runtime Context/);

  const cliPrompt = buildMusuCliPrompt("ping", "## Runtime Context");
  assert.match(cliPrompt, /User: ping/);
  assert.match(cliPrompt, /## Runtime Context/);
});
