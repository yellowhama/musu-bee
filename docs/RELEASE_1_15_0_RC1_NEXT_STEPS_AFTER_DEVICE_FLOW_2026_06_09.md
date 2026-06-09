# MUSU 1.15.0-rc.1 — Next Steps After Device-Flow Landing

Date: 2026-06-09
Branch: `fix/audit-findings-2026-06-08` (PR #9)

## What this session changed (product spec deltas)

1. **`musu login` now has a real server endpoint.** The one-machine MUSU.PRO
   blocker was not "the user hasn't logged in" — it was that
   `https://musu.pro/api/v1/auth/device` was **never implemented**. A hardened
   RFC-8628 device authorization flow now exists, plus the `POST
   /api/v1/nodes/register` endpoint the Rust client auto-calls after login.
   **Spec impact:** login is now a single-owner, approval-gated flow. The
   issued token is the shared `MUSU_P2P_CONTROL_TOKEN`; every approved device
   shares one owner scope (single-owner-enforced via
   `MUSU_DEVICE_APPROVER_USER_IDS`, not multi-tenant).

2. **Multi-CLI adapters exist (codex, gemini) on the trait/registry surface.**
   But they are NOT yet wired into the writer hot path — the runner still
   dispatches only claude (M3/W12 unification deferred). **Spec impact:** "musu
   runs your local AI" is claude-only in the *hot path*; codex/gemini work via
   the registry/workflow surface only.

3. **Internal TS SDK (`proxyToBridge`) started** — 7 routes migrated, no
   behavior change. Internal-only; no product-facing impact.

4. **Audit: 10 HIGH fixed, H2 deferred.** H2 (relay-path source identity) is a
   **known security limitation**: a node forging its own `public_key` at
   rendezvous can impersonate a source over the relay path. Acceptable at
   current single-owner / few-PCs scale; must be closed (TOFU pinning or
   proof-of-possession) before any multi-owner or untrusted-peer deployment.

## ⛔ DEPLOY BLOCKER — resolve before any musu.pro deploy (2026-06-09 investigation)

A pre-deploy investigation found a **3-way codebase mismatch** that must be
resolved by the owner before this session's device-flow can reach musu.pro:

- **Live musu.pro** currently serves an OLD **pages-router** build (response
  shows `pages/404`, `_buildManifest`) with NO device-flow endpoint — this is
  the real reason `musu login` got a 404, independent of env. Deployed via the
  Vercel project `musu-pro` (team `team_rx99...`), pushed manually by CLI
  (yellowhama) — preview deploys as recent as minutes ago, so the project is
  active, NOT offline.
- **`F:/Aisaak/Projects/musu-pro`** (App Router) has a DB/Supabase-based
  device-flow (`device_codes.repo`), is on a different GitHub repo
  (`yellowhama/musu-pro`), git last commit 2026-05-27 "take site offline during
  migration". This is NOT the same code as what's live, and NOT the same as
  musu-bee.
- **`F:/workspace/musu-bee`** (this session's work) has a KV-based device-flow
  (`deviceCodeStore.ts`), is the `yellowhama/musu-bee` repo, and has **no Vercel
  link and no env configured**.

**SWOT verdict: do NOT auto-deploy.** The threat (deploying the wrong codebase
to production musu.pro, or deploying musu-bee with zero env → Supabase auth
crash at runtime) outweighs the benefit. Which codebase IS the canonical
musu.pro is a product-architecture decision for the owner, not an autonomous
call. Required owner decisions before deploy:

1. **Which repo is canonical musu.pro?** musu-bee (then: link the `musu-pro`
   Vercel project to musu-bee code + migrate ALL env) or musu-pro (then: this
   session's musu-bee device-flow is not the deploy target — musu-pro already
   has its own).
2. If musu-bee: provision env on the Vercel project (Supabase URL/anon/service,
   relay url/secret, AND the device-flow secrets MUSU_P2P_CONTROL_TOKEN +
   MUSU_DEVICE_APPROVER_USER_IDS). None are set today.
3. Deploy **preview first** (`vercel` without `--prod`) to validate device-flow
   live before touching production.

## The remaining critical path to one-machine MUSU.PRO E2E

These are now the ordered blockers (all server-side code exists; the rest is
deploy + operator config + proof):

1. **Push + open/refresh PR #9** — 16 commits on `fix/audit-findings-2026-06-08`.
   (Const VII gate.)
2. **Deploy musu.pro** with the new endpoints (Vercel, production).
3. **Set production env** (operator-only secrets):
   - `MUSU_P2P_CONTROL_TOKEN` = the raw control token (without it, the device
     flow returns 503 `p2p_control_token_not_issuable` by design — it refuses
     to fabricate).
   - `MUSU_DEVICE_APPROVER_USER_IDS` = the owner's Supabase user id (unset =
     all approvals denied, fail-closed).
   - Confirm KV creds (`KV_REST_API_URL`/`_TOKEN` or Upstash) are present.
4. **Rebuild + reinstall the packaged MUSU** so the alias includes the
   `poll_device_token` POST-body change and the new login flow. (Also folds in
   the `blossompark.musu` Store identity from B4 — the currently installed
   package is still `Yellowhama.MUSU_1.15.0.0`.)
5. **Run `musu login`** → approve at `https://musu.pro/link` → confirm
   `~/.musu/token` is written and `musu whoami` shows logged-in.
6. **Rerun the one-machine smoke** without `-AllowUnverified`; prove work-order
   POST → local Desktop claim → bridge task → server delivery ack → result. The
   smoke evidence should flip from `ok=false, fail_count=11,
   account_logged_in=false` to a logged-in pass.
7. **Capture post-run 60s idle CPU evidence** after the remote-input flow.

## Secondary / deferred work (not blocking one-machine E2E)

- **M3/W12 adapter unification** — collapse the writer hot path
  (`claude_dispatch_spawn`) and the trait `execute()` path so codex/gemini run
  in the hot path too. Larger refactor; do after login E2E is proven.
- **H2 node identity** — TOFU pinning or proof-of-possession before
  multi-owner. Separate trust-model workstream (`AUDIT_H2_KNOWN_ISSUE_*`).
- **`claude.rs` M1 hole** — `ctx.extra["claude_binary"]` reads a binary path
  from task payload (registry path only; hot path is safe). Close when touching
  the adapter unification.
- **TS SDK phase 2+** — graceful-200 routes need an `onError` option before
  migrating; transform routes (agents/chat/device-status) stay bespoke.
- **Store submission** — needs an Entra ID tenant + Store Submission API
  credentials (Tenant/Client/Secret from Partner Center → Account settings →
  Users → Azure AD app); deferred until the app is functionally complete.

## Release status

**Public release remains No-Go.** One-machine MUSU.PRO E2E is now unblocked at
the code level but unproven (pending deploy + login + smoke). Two-machine
route/CPU/matrix evidence, hosted P2P/relay proof, support mailbox proof, and
Store evidence remain open.
