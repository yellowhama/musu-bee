# MUSU 1.15.0-rc.1 Qualitative Evaluation, Code Audit, and Roadmap

**Wiki ID**: wiki/518
**Date**: 2026-05-29
**Scope**: Windows local beta path, Rust bridge/runner, Next dashboard bridge integration, docs/index state.

## Executive State

`1.15.0-rc.1` is beta-ready for the **single-machine Windows operator path**:

- `musu up` can create/read `~/.musu/bridge.env`, start the Rust bridge, and report dashboard readiness.
- Next dashboard APIs can discover the bridge dynamic port from `~/.musu/services/bridge.json`.
- Dashboard-to-bridge task forwarding works with the real Claude runner hot path.
- Doctor/readiness state is visible from `/fleet` through `/api/doctor`.

This is not yet a Store-grade or full multi-machine release. Store/MSIX auto-start still depends on Partner Center verification and Microsoft review. Non-Claude adapters remain registered in the adapter layer but are not wired into the runner hot path.

## Product Spec Updates

Current product contract changes from this work:

1. **First-run command**: `musu up` is now the primary local beta entry point.
2. **Health command**: `musu doctor` is the operator-facing readiness and install-shadowing diagnostic.
3. **Bridge token source**: dashboard server routes read the bridge bearer token from env first, then `~/.musu/bridge.env`.
4. **Bridge URL resolution**: dashboard server routes must call `getBridgeUrl()` per request. Do not cache dynamic bridge URLs at module import time.
5. **Agent task default**: dashboard and bridge task hot paths default to `adapter_type="claude"` until adapter dispatch is unified.
6. **Windows alias state**: `C:\Users\empty\.cargo\bin\musu.exe` shadowing the WindowsApps alias is a warning, not a hidden failure.
7. **Windows distribution boundary**: direct-download/local beta and Store-reviewed auto-start are separate contracts.

## Qualitative Evaluation

Overall single-machine beta completion: **about 80%**.

The important loop now closes: start local services, check readiness, send a real task, get the result back through dashboard APIs. The product finally has a believable local operator path instead of being only a pile of subsystem work.

Main strengths:

- Bootstrap UX is much better: `musu up` + `/fleet` doctor turns setup state into an explicit surface.
- The dynamic bridge port issue is structurally addressed by per-request resolution.
- Token sharing is coherent across CLI, bridge, and dashboard.
- Real Claude smoke passed through the production-style dashboard route.

Main weaknesses:

- The beta is still Claude-first. OpenAI-compatible adapters exist, but the runner hot path rejects non-Claude task dispatch.
- Coverage is stronger for the smoke path than for every legacy dashboard/API route.
- Store/MSIX auto-start remains an external approval track, not a shipped product promise.
- The repo worktree has a broad pre-existing dirty state; commits for this release must stay scoped.

## Code Audit

Audit focus:

- stale cached bridge URLs in Next API routes
- direct `MUSU_BRIDGE_TOKEN` usage bypassing the shared token helper
- agent defaults that still point at `openai_compat_local`
- Windows `file:///F:/...` workspace path handling
- Windows CLI alias shadowing and Claude command resolution

Findings:

1. **Fixed: legacy Rust `/api/ai/chat` defaulted to `openai_compat_local`.**
   - Risk: that route could enqueue a task the runner hot path cannot dispatch.
   - Fix: changed the handler default to `claude`.

2. **No remaining module-level cached bridge URL found in the audited dashboard API surface.**
   - `device-status` has a `BRIDGE_URL` local inside `GET()`, which is acceptable.
   - Bridge-facing routes now resolve the URL per request.

3. **Token access is centralized for the audited dashboard routes.**
   - Routes use `getBridgeToken()` and `buildBridgeHeaders()` instead of assuming only `process.env.MUSU_BRIDGE_TOKEN`.

4. **Windows workspace URI handling is correct for the smoke path.**
   - `/api/tasks/forward` converts `file:///F:/workspace/...` with `fileURLToPath`.

5. **Windows CLI diagnostics are explicit.**
   - `doctor` reports first PATH `musu`, WindowsApps alias, and alias shadowing.

Residual risks:

- Add a regression test for `/api/ai/chat` default adapter.
- Add a dashboard API restart-regression test that changes `services/bridge.json` between requests.
- Keep `openai_compat_local` out of UI defaults until runner dispatch supports it.

## Verification Evidence

Passed gates after the 1.15.0-rc.1 bump:

```powershell
npm run typecheck
npm run lint -- --quiet
npm run build
cargo check --manifest-path .\musu-rs\Cargo.toml -j 1
cargo build --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1
cargo clippy --manifest-path .\musu-rs\Cargo.toml --all-targets -j 1 -- -D warnings
cargo test --manifest-path .\musu-rs\Cargo.toml --lib -- --test-threads=1
```

Passed integration bundle:

```powershell
$env:CARGO_INCREMENTAL='0'
cargo test --manifest-path .\musu-rs\Cargo.toml `
  --test r13_mcp_http `
  --test r10_registry `
  --test r9_workflow_dag `
  --test r7_peer_register `
  --test w12_deadline_middleware `
  -j 1
```

Live production smoke:

- dashboard: `http://127.0.0.1:3001`
- bridge: `http://127.0.0.1:11041`
- bridge version: `1.15.0-rc.1`
- task id: `72ff5cff-f122-496b-ad6a-6d7e55711bf4`
- terminal task state: `done`
- terminal output: `MUSU_SMOKE_OK`
- SSE route: `HTTP/1.1 200 OK`, `content-type: text/event-stream`

Indexing:

- `musu indexer sync --work-dir . --name musu-bee`
- result: `810 files`, `1880 symbols`
- search verification: query `musu-system integration` returns `docs/MUSU_SYSTEM_INTEGRATION_ASSESSMENT_2026_05_29.md`

Adjacent repo assessment:

- `yellowhama/musu-system` cloned and reviewed
- `go test ./...` passed for `core`, `crawl-ai`, `marketer`, and `nurikun`
- decision recorded in `docs/MUSU_SYSTEM_INTEGRATION_ASSESSMENT_2026_05_29.md`

## Roadmap

P0 before tagging:

- Re-run Rust check/clippy/lib tests after the `/api/ai/chat` adapter fix.
- Re-index code/docs after this document set lands.
- Commit and push the scoped beta-readiness changes.

P1 beta hardening:

- Add regression tests for dynamic bridge URL restart behavior.
- Add a test for `/api/ai/chat` defaulting to `claude`.
- Add a tiny smoke script that runs `musu up`, `doctor`, `/api/doctor`, task forward, task poll, and SSE HEAD.

P2 product hardening:

- Unify adapter dispatch so non-Claude adapters can run through the same task runner path.
- Make dashboard port detection explicit in `musu up` instead of only checking standard ports.
- Turn `/fleet` doctor warnings into direct operator actions where possible.
- Add optional tool discovery for adjacent ecosystem tools (`musu-crawl-ai`, `musu-marketer`, `musu-nurikun`) without making beta health depend on them.

P3 distribution:

- Keep direct-download beta separate from Store/MSIX claims.
- Partner Center enrollment approval cleared by operator report on 2026-05-29.
- Do not submit the older 2026-05-27 `1.13.0.0` Store-reviewed bundle as the current release candidate.
- Regenerate Store-reviewed MSIX and submission bundle for `1.15.0-rc.1`.
- Submit Store-reviewed auto-start only after current-version package verification passes.
- Record Microsoft approval/rejection back into repo docs before changing packaging code.
- Do not bundle crawler/marketing/email tooling into the first Store package.
