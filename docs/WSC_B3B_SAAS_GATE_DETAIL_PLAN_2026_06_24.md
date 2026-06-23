# WS-C B-3b — SaaS Route Gate Detail Plan (2026-06-24)

Detail plan + closure for the SaaS route gate (master `cosmic-honking-cake.md`
Track 2). First machine enforcement of the self-contained-product invariant.

## Why
The self-contained-product invariant ("musu must run from a user install alone;
external SaaS = installer optionality, never required in product code") was
documented (`docs/GOAL.md:319,422`, `[[feedback-self-contained-product]]`) but
**review-only — no CI enforcement**. A future PR could quietly add a required
`@sentry`/`aws-sdk`/hosted-OpenAI dependency to a product route and only a careful
human reviewer would catch it. B-3b makes it a CI gate.

## Design (mirrors design-gate, scans content not paths)
- `scripts/saas-gate/evaluate.cjs` — pure `evaluateSaasGate({files})` where
  `files = [{filename, addedLines[]}]`. Returns `{pass, productFilesTouched,
  scannedFiles, violations:[{file,token,line}]}`. CLI harness + exports identical
  shape to design-gate's evaluator.
- `scripts/saas-gate/evaluate.test.cjs` — 9 cases incl. the real-main
  false-positive guards.
- `.github/workflows/saas-gate.yml` — `pull_request → main`, extracts ADDED lines
  from each file's `patch` (lines starting `+`, not `+++`), runs the unit tests
  (`node --test scripts/saas-gate/` — fixes the design-gate's un-wired-tests gap),
  then evaluates and `setFailed` with per-violation detail + remediation hint.

### What it flags vs allows (the precision that matters)
- **Watched**: `musu-bee/src/**` + `musu-rs/src/**`, EXCLUDING `*.test.*`/`*.spec.*`
  /`__tests__/` (the inverse of design-gate, which excludes API routes — here API
  routes are the primary concern).
- **Banned**: SDK import specifiers (`@sentry/*`, `aws-sdk`/`@aws-sdk/*`, `posthog`,
  `datadog`/`dd-trace`, `amplitude`, `mixpanel`, `@segment/*`) + hardcoded hosted
  endpoints (`api.openai.com`, `api.anthropic.com`, `*.fly.dev`, `*.amazonaws.com`,
  `*.execute-api.*`, `*.herokuapp.com`, `sentry.io`).
- **Allowed (env-gated optionals already shipped)**: `@supabase/supabase-js`,
  `@supabase/ssr`, `@vercel/kv` — they degrade gracefully via `isXConfigured()` +
  fallback, so they are installer optionality, not required deps.
- **NOT flagged (false-positive guards, all tested)**:
  - local OpenAI-compatible protocol (`openai_compat.rs`, `/v1/chat/completions`
    against a local bridge, `OPENAI_API_KEY` env name) — the protocol, not the SaaS.
  - `.vercel.app` in a security origin-allowlist (`AuthBridgeListener.tsx`) — not a
    runtime dependency, so `.vercel.app` is deliberately NOT a banned host.
  - Win32 API symbols (`PROCESSENTRY32W`, `Process32FirstW`) that contain SaaS
    substrings — pattern uses anchored import/host shapes, not bare substrings.

## Verification (the bar: zero false positives on existing code)
- `node --test scripts/saas-gate/` → **9/9 pass** (incl. 3 false-positive guards).
- Swept ALL **407 product files** on main through the evaluator (full content as
  added lines) → **0 violations, pass:true**. The gate does not block any existing
  legitimate code.
- Spot-checked the 7 trickiest files (supabase.ts, AuthBridgeListener.tsx,
  waitlist/route.ts, chat/route.ts, aiCliSpawn.ts, services.rs, openai_compat.rs)
  → all clean.

## Adding a legitimately-optional SaaS later
Gate the import behind an env-var check with a graceful fallback (the repo idiom:
`Boolean(process.env.X && process.env.Y)` + dev fallback, or dynamic
`await import()`), OR add the specifier to `ALLOWED_OPTIONAL_SPECIFIERS` in
`evaluate.cjs` with rationale. The gate's message says exactly this on failure.

## Gate / scope
🔒 CI-only — adds a workflow + scripts, NO production deploy, NO runtime change.
main push under Const VII batched approval.
