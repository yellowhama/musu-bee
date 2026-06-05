# MUSU 1.15.0-rc.1 Filesystem Watcher Scope Contract Gate

Date: 2026-06-06 KST
Branch: `harden-relay-fallback-payload-evidence`
Base HEAD before this change: `47cc165a32a85e624879c7aa4628cb22c2a99e58`

## Summary

The Rust background-loop release audit now explicitly gates filesystem watcher
scope. This hardens the local desktop runtime boundary without changing runtime
behavior.

New contract:

- filesystem watcher primitives are allowed only in:
  - `musu-rs/src/indexer/watch.rs`
  - `musu-rs/src/install/sync.rs`
- `musu indexer watch` must remain an explicit CLI subcommand path
- the default bridge/runtime path must not call the indexer watcher
- file-sync watcher starts are allowed only from the configured bridge sync
  path or the explicit `musu sync` CLI

## Product Spec

MUSU Desktop remains the local executor. MUSU.PRO can receive remote user input,
host project/company rooms, coordinate rendezvous/path selection, issue relay
fallback policy, and record evidence. Work still runs on local MUSU programs.

The default local desktop runtime should not start hidden file/index watchers.
The current source model is:

- `musu indexer watch`: explicit developer/operator command
- file sync watcher: starts only when shared file roots are configured, or when
  an operator explicitly runs `musu sync`
- MUSU.PRO control-plane work does not make the web service the executor or the
  default payload data path

## Source Changes

- `scripts/windows/audit-rust-background-loop-contract.ps1`
  - adds command-scope checks for `musu indexer watch`
  - rejects `RecommendedWatcher`, `recommended_watcher`, and `watcher.watch(`
    outside the filesystem watcher allowlist
  - rejects `crate::install::sync::start_watcher(` outside the configured
    bridge path and explicit sync CLI
  - emits `filesystem_watcher_primitive_hit_count` and
    `file_sync_watcher_start_hit_count`
- `scripts/windows/test-release-evidence-verifiers.ps1`
  - adds regression case `rust background audit limits filesystem watcher scope`
- `scripts/windows/verify-final-operator-gate-packet.ps1`
  - verifies final operator packets include the strengthened watcher-scope
    audit contract

## Validation

Passed:

- PowerShell parser for the changed scripts
- `audit-rust-background-loop-contract.ps1 -Json`:
  - `ok=true`
  - `fail_count=0`
  - `unaudited_loop_hit_count=0`
  - `unaudited_spawn_hit_count=0`
  - `filesystem_watcher_primitive_hit_count=0`
  - `file_sync_watcher_start_hit_count=0`
- `test-release-evidence-verifiers.ps1 -Json`:
  - `ok=true`
  - `case_count=47`
  - `failed_case_count=0`
- `git diff --check`
- dirty-tree `write-release-go-no-go.ps1 -SkipPublicMetadata -Json`:
  - `local_artifacts_ready=true`
  - `single_machine_verified=true`
  - `msix_install_verified=true`
  - `runtime_idle_cpu_valid_machine_count=1/2 [HUGH_SECOND]`
  - `runtime_cpu_scenario_matrix_valid_machine_count=1/2`
  - `runtime_cpu_second_pc_route_attempt_verified=true`
  - `rust_background_loop_contract_verified=true`
  - `idle_busy_loop_candidate_contract_verified=true`
  - `p2p_control_plane_verified=false`
  - `manifest_git.dirty=true` because this source/docs change is uncommitted

## Code Audit

Finding severity: no high or medium runtime issue found in the changed source.

One audit-layer gap was closed: filesystem watcher primitives were previously
covered by named loop checks and allowlisted loop files, but the audit did not
separately fail if a new watcher primitive appeared in another Rust module or
if `musu indexer watch` drifted into the default bridge path.

## Code And Document Indexing

MUSU local indexing was refreshed after the watcher-scope source, report, wiki,
checklist, network boundary spec, GOAL, WIKI_INDEX, and CoS updates:

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- files: `2483`
- symbols: `2719`
- elapsed: `10455 ms`

gbrain was not rerun because the same-session blocker remains unchanged:
missing `ZEROENTROPY_API_KEY`, generated/evidence import failures,
`sync.last_commit` not advancing, and `gstack-brain-sync exited undefined`.
The MUSU local index remains the reliable current code/document index.

## Current Status

Public desktop release remains No-Go. This change strengthens local runtime
resource-budget enforcement, but it does not replace the two-machine CPU gates
or prove hosted P2P.

Remaining release blockers:

- real second-PC multi-device route evidence
- second-PC `desktop-open` idle CPU evidence
- second-PC runtime CPU scenario matrix evidence
- hosted MUSU.PRO owner-scoped P2P proof with release-grade relay route and
  relay payload delivery proof
- `musu@musu.pro` support mailbox proof
- Partner Center / Store evidence

## Next Steps

1. Keep local runtime hardening source-gated while external evidence is blocked.
2. Install the current MUSU Desktop build on the second Windows PC and capture
   route, idle CPU, runtime matrix, process attribution, and release-check
   return evidence.
3. Configure production KV/Upstash for MUSU.PRO and capture live owner-scoped
   relay route/payload proof.
4. Regenerate final operator packets after any runtime or packet script change.
