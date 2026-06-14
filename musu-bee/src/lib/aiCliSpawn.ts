import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import path from "node:path";

/**
 * Audit H11: hardened spawning of the user-configured AI CLI.
 *
 * The chat routes shell out to an external AI CLI (`claude`, `codex`,
 * `gemini`, ...). Two problems with the original `spawn(MUSU_AI_CLI,
 * [...args, prompt], { env: { ...process.env } })`:
 *
 *  1. The full `process.env` (cloud secrets, DB creds, deploy tokens) was
 *     handed to the child. A compromised or substituted CLI could exfiltrate
 *     everything.
 *  2. `MUSU_AI_CLI` is env-configurable with no validation — a traversal-y or
 *     absolute path to an arbitrary binary would run unchecked.
 *
 * Per Critic H-C2/H-C1, the allowlist is NOT a hardcoded set (that would break
 * users who configured a different CLI). Instead:
 *  - The user's own configured `MUSU_AI_CLI` basename is always honored.
 *  - A documented default set is allowed.
 *  - `MUSU_AI_CLI_ALLOWLIST` (comma-separated basenames) extends it opt-in.
 *  - The resolved command is rejected if it contains path traversal.
 *  - The child receives a minimal env: PATH/HOME-class vars + an explicit
 *    passthrough allowlist (the AI-provider keys the CLI actually needs),
 *    never the full process.env.
 */

const DEFAULT_ALLOWED_CLIS = ["claude", "codex", "gemini", "musu"];

/** Env var names the AI CLI legitimately needs, passed through explicitly. */
const ENV_PASSTHROUGH_EXACT = new Set([
  "PATH",
  "Path",
  "HOME",
  "USERPROFILE",
  "TMPDIR",
  "TEMP",
  "TMP",
  "LANG",
  "LC_ALL",
  "SystemRoot",
  "windir",
  "APPDATA",
  "LOCALAPPDATA",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_BASE_URL",
  "CLAUDE_CODE_OAUTH_TOKEN",
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
]);

/** Prefixes whose vars are intended for the CLI and safe to pass through. */
const ENV_PASSTHROUGH_PREFIXES = ["MUSU_AI_", "CLAUDE_"];

export type CliResolution =
  | { ok: true; command: string; basename: string }
  | { ok: false; error: string };

function allowedClis(): Set<string> {
  const extra = (process.env.MUSU_AI_CLI_ALLOWLIST ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  // The user's own configured CLI basename is always honored — config is trust.
  const configured = (process.env.MUSU_AI_CLI ?? process.env.CLAUDE_CLI_PATH ?? "")
    .trim();
  const configuredBase = configured
    ? path.basename(configured).replace(/\.(exe|cmd|bat)$/i, "").toLowerCase()
    : "";
  return new Set(
    [...DEFAULT_ALLOWED_CLIS, ...extra, configuredBase].filter(Boolean)
  );
}

/**
 * Validate the configured CLI path. Rejects traversal and disallowed
 * basenames. Returns the command to spawn (the configured value verbatim so
 * absolute paths the operator set still work) plus its normalized basename.
 */
export function resolveAiCli(rawCommand: string | undefined): CliResolution {
  const command = (rawCommand ?? "").trim();
  if (!command) {
    return { ok: false, error: "AI CLI not configured (set MUSU_AI_CLI)" };
  }
  // Reject path traversal segments outright.
  const normalized = command.replace(/\\/g, "/");
  if (normalized.split("/").some((seg) => seg === "..")) {
    return { ok: false, error: "AI CLI path rejected: traversal" };
  }
  const basename = path
    .basename(normalized)
    .replace(/\.(exe|cmd|bat)$/i, "")
    .toLowerCase();
  if (!basename) {
    return { ok: false, error: "AI CLI path rejected: empty basename" };
  }
  if (!allowedClis().has(basename)) {
    return {
      ok: false,
      error: `AI CLI '${basename}' not allowed (extend MUSU_AI_CLI_ALLOWLIST)`,
    };
  }
  return { ok: true, command, basename };
}

/** Build the minimal child env — never the full process.env. */
export function buildCliEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (
      ENV_PASSTHROUGH_EXACT.has(key) ||
      ENV_PASSTHROUGH_PREFIXES.some((p) => key.startsWith(p))
    ) {
      out[key] = value;
    }
  }
  return out;
}

export type SpawnAiCliResult =
  | { ok: true; child: ChildProcessWithoutNullStreams }
  | { ok: false; error: string };

/**
 * Spawn the AI CLI with a hardened env. `args` should already include the
 * prompt as a single argument (passed via argv, never a shell string).
 */
export function spawnAiCli(
  rawCommand: string | undefined,
  args: string[]
): SpawnAiCliResult {
  const resolved = resolveAiCli(rawCommand);
  if (!resolved.ok) {
    return { ok: false, error: resolved.error };
  }
  if (args.length > 32) {
    return { ok: false, error: "AI CLI arg count exceeds limit" };
  }
  const child = spawn(resolved.command, args, {
    env: buildCliEnv() as NodeJS.ProcessEnv,
    // shell:false (default) — args go through argv, no shell interpolation.
  }) as ChildProcessWithoutNullStreams;
  return { ok: true, child };
}
