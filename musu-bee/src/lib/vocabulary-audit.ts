// V23.4 T2-C — Vocabulary audit (K8s-vocab regression guard)
//
// Per wiki/434 §2.5 + Auditor OQ-A4/A-5/A-6/A-7/A-8 + Critic C-T2C-1 (OQ-CRIT-1):
//
//   - Word-boundary regex `BANNED_PATTERNS` (NOT substring match) to avoid
//     false-positives on legitimate marketing copy.
//   - `IGNORED_PATHS` is INTENTIONALLY REMOVED per Auditor A-5/A-6: the walker
//     is already narrow (called via two explicit `auditDir("src/app/fleet")` +
//     `auditDir("src/app/dashboard")` invocations, NOT a global `auditDir("src")`).
//     Phantom path `src/app/landing.tsx` (Auditor A-6) is no longer referenced.
//
// NOTE: BANNED_PATTERNS deliberately requires K8s qualifier (e.g., `K8s operator`,
//       `admission|mutating|validating webhook`). Bare `operator` and bare `webhook`
//       are PERMITTED for HR / marketing / Stripe / GitHub / Slack copy. If
//       BANNED_PATTERNS broadens later, the narrow walker scope (`src/app/fleet`
//       + `src/app/dashboard` only) is the safety net (Auditor A-12 — documented).
//
// Vocab rule (musu's own product positioning): UI must speak musu's vocab
// (PC, peer, workflow), NOT K8s vocab (Pod, namespace, operator, CRD).
// See [[feedback-no-yagni-architecture]] memory for context.

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

// Word-boundary regex patterns (NOT substring match) per Critic C-T2C-1.
// Auditor fixes applied: OQ-A5 namespace lookahead, A-8 webhook qualifier.
export const BANNED_PATTERNS: RegExp[] = [
  /\bArgo\b/,
  /\bK8s\s+operator\b/,
  /\bcontroller-runtime\b/,
  /\bCRD\b/,
  // A-8: require explicit qualifier; bare "webhook" too common in
  // Stripe / GitHub / Slack contexts.
  /\b(admission|mutating|validating)\s+webhook\b/i,
  /\bRBAC\b/,
  // Pod as K8s noun, NOT "Podcast", "Podiatry", etc.
  /\bPod\b(?![A-Za-z])/,
  // A-7 / OQ-A5: K8s namespace; do NOT match "namespaces" (plural),
  // "namespaced" (adjective), or "namespace/foo" (path).
  /\bnamespace(?![sd/])/,
];

export type VocabViolation = {
  file: string;
  line: number;
  pattern: string;
  text: string;
};

/**
 * Recursive walker: scan every `.ts` / `.tsx` file under `rootDir` for
 * `BANNED_PATTERNS` and return file:line:pattern triples for each match.
 *
 * Test fixtures named `*.test-fixture.ts` are EXCLUDED so vocab tests can
 * write throwaway fixtures without permanently polluting the audit baseline.
 * Test files (`*.test.ts`, `*.test.tsx`) are also excluded.
 */
export function auditDir(rootDir: string): VocabViolation[] {
  const violations: VocabViolation[] = [];
  let entries: string[];
  try {
    entries = readdirSync(rootDir);
  } catch {
    // Directory doesn't exist — return empty (caller decides if that's an error).
    return violations;
  }

  for (const entry of entries) {
    const full = path.join(rootDir, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      violations.push(...auditDir(full));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry)) continue;
    // Skip our own test fixtures + test files.
    if (/\.test-fixture\.(ts|tsx)$/.test(entry)) continue;
    if (/\.test\.(ts|tsx)$/.test(entry)) continue;
    if (/\.spec\.(ts|tsx)$/.test(entry)) continue;

    let content: string;
    try {
      content = readFileSync(full, "utf8");
    } catch {
      continue;
    }
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const text = lines[i];
      for (const pat of BANNED_PATTERNS) {
        if (pat.test(text)) {
          violations.push({
            file: full,
            line: i + 1,
            pattern: pat.source,
            text: text.trim().slice(0, 120),
          });
        }
      }
    }
  }
  return violations;
}
