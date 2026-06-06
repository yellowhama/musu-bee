# 2026-06-07 P2P Env Blockers Go/No-Go Surface

## Decision

The primary release go/no-go JSON must include P2P env readiness and blocker
details, not only a broad `p2p-control-plane` blocker.

## Change

- `write-release-go-no-go.ps1` now invokes
  `show-musu-pro-p2p-env-status.ps1 -Json`.
- The selected latest P2P evidence path is passed through to the env status
  reporter.
- Go/no-go now emits:
  - `p2p_control_plane_env_ready`
  - `p2p_control_plane_env_blockers`
  - `p2p_control_plane_env_status`
- The P2P blocker message now includes a concise `P2P env blockers:` summary.
- Release verifier regression adds
  `go-no-go surfaces P2P env status blockers`.

## Evidence

Current env status remains `ok=false` and shows expected blockers including
release relay payload endpoint missing, release relay tunnel runtime missing,
preview queue non-release-grade, missing KV/Upstash names, runtime not logged
in, relay route/proof/delivery proof missing.

Validation passed:

- parser checks for the touched PowerShell scripts
- `git diff --check`
- release verifier regression `case_count=96`, `failed_case_count=0`
- dirty go/no-go smoke with `p2p_control_plane_env_ready=false`, `12` P2P env
  blockers, and the expected `git` blocker while the tree was dirty

## Product Boundary

This is a status/evidence surface change only. MUSU Desktop still does local
work. MUSU.PRO is remote input, rooms, rendezvous, path selection,
relay-fallback coordination, and evidence/control plane.

## Release Status

Public release remains No-Go on second-PC route/CPU/matrix, hosted MUSU.PRO
P2P/relay proof, support mailbox, and Store proof.
