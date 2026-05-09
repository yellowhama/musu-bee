import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const PROMPT_FILE_CANDIDATES = [
  path.join("src", "prompts", "musu-system-prompt-v1.md"),
  path.join("musu-bee", "src", "prompts", "musu-system-prompt-v1.md"),
];

let cachedPromptPath: string | null = null;
let cachedPromptText: string | null = null;

function resolvePromptPath(): string {
  for (const relativePath of PROMPT_FILE_CANDIDATES) {
    const absolutePath = path.resolve(process.cwd(), relativePath);
    if (existsSync(absolutePath)) {
      return absolutePath;
    }
  }

  throw new Error(
    `MUSU system prompt file not found. Checked: ${PROMPT_FILE_CANDIDATES.join(", ")}`
  );
}

export function getMusuSystemPromptV1Path(): string {
  if (!cachedPromptPath) {
    cachedPromptPath = resolvePromptPath();
  }
  return cachedPromptPath;
}

export function loadMusuSystemPromptV1(): string {
  if (!cachedPromptText) {
    const rawText = readFileSync(getMusuSystemPromptV1Path(), "utf8").trim();
    if (!rawText) {
      throw new Error("MUSU system prompt file is empty");
    }
    cachedPromptText = rawText;
  }

  return cachedPromptText;
}

export function buildMusuSystemPrompt(systemContext?: string): string {
  const basePrompt = loadMusuSystemPromptV1();
  return systemContext ? `${basePrompt}\n\n${systemContext}` : basePrompt;
}

export function buildMusuCliPrompt(message: string, systemContext?: string): string {
  return `${buildMusuSystemPrompt(systemContext)}\n\nUser: ${message}`;
}
