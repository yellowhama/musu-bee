# MUSU Local API Auth Contract Audit

**Wiki ID**: wiki/543
**Date**: 2026-06-02
**Scope**: Rust bridge localhost authentication contract, current operator docs, and final release packet tooling.

## Verdict

Pass after documentation correction.

The Rust bridge source already had the correct security posture: localhost API requests require `Authorization: Bearer <MUSU_BRIDGE_TOKEN>` by default. The only bypass is an explicit local-development opt-out through `MUSU_BRIDGE_LOCALHOST_AUTH=0` / `false` / `no`.

The problem was stale current-facing documentation. Several docs still described the older Python-era contract where localhost requests bypassed auth by default or told operators to set `MUSU_BRIDGE_LOCALHOST_AUTH=1` to require auth. That was wrong for the current Rust bridge.

## Spec Lock

1. Bridge API auth is required by default, including `127.0.0.1` and `::1`.
2. `MUSU_BRIDGE_LOCALHOST_AUTH=0` is the explicit trusted local development bypass.
3. `MUSU_BRIDGE_LOCALHOST_AUTH=1` must not be documented as the way to enable localhost auth. Auth is already enabled by default.
4. Production and shared-machine docs must tell operators not to set `MUSU_BRIDGE_LOCALHOST_AUTH=0`.
5. Current release docs must not claim "localhost requests bypass auth" unless clearly describing historical behavior.

## Code Audit

Source checks:

- `musu-rs/src/bridge/config.rs` documents `default = true` for `localhost_auth_required`.
- `musu-rs/src/bridge/config.rs` enables bypass only for `MUSU_BRIDGE_LOCALHOST_AUTH=0`, `false`, or `no`.
- `musu-rs/src/bridge/config.rs` has tests for default-required localhost auth and explicit bypass opt-in.
- `musu-rs/src/bridge/auth.rs` only bypasses when `!state.localhost_auth_required && is_loopback_strict(ip)`.
- `musu-rs/src/bridge/auth.rs` still parses Bearer auth and compares tokens through the constant-time compare path.

No runtime source change was required.

## Documentation Changes

Corrected current-facing docs:

- `docs/API.md`
- `docs/ARCHITECTURE.md`
- `docs/CONFIG.md`
- `docs/GETTING_STARTED.md`
- `docs/MANUAL.md`
- `docs/PRODUCTION.md`
- `docs/TROUBLESHOOTING.md`

Historical planning docs are not rewritten unless they are part of the current operator path.

## New Audit Tool

Added `scripts/windows/audit-local-api-auth-contract.ps1`.

It emits schema `musu.local_api_auth_contract.v1` and checks:

- source-level localhost auth default and opt-in bypass contract
- source-level auth middleware shape
- absence of stale localhost-bypass wording in current docs
- presence of positive current-contract wording in release-facing docs

Validation on 2026-06-02:

```text
schema: musu.local_api_auth_contract.v1
ok: true
fail_count: 0
stale_doc_hit_count: 0
```

The script is now included in desktop release readiness checks, final operator packet contents, final packet verification, and release evidence freshness allowlists as status-only tooling.

## Qualitative Evaluation

This closes a real release-readiness documentation risk. The shipped code was safer than the docs said, but stale docs could make operators set unnecessary or misleading env values and could weaken reviewer confidence during Store or security review.

Current qualitative state:

- Security posture: improved at the documentation and handoff layer.
- Runtime risk: unchanged, because runtime auth code was already correct.
- Release gate status: public release remains No-Go until second-PC runtime/route evidence, live `musu.pro` P2P control-plane evidence, `musu@musu.pro` mailbox evidence, and Store evidence are recorded.

## Next Step

Run this before final handoff:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\audit-local-api-auth-contract.ps1 -FailOnProblem -Json
```

If it fails, fix the current docs or source contract before regenerating final operator packets.
