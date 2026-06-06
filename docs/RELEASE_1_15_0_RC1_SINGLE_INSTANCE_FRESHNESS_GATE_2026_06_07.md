# MUSU 1.15.0-rc.1 Single-Instance Freshness Gate

**Date**: 2026-06-07 00:03 KST
**Branch**: `harden-relay-fallback-payload-evidence`
**Base HEAD before change**: `519b4ac2ada6c4e76a67fab2f0eaf9963bf32376`

## Summary

Startup and desktop single-instance release evidence is now freshness-gated.

A passing `musu.startup_single_instance_audit.v1` or
`musu.desktop_single_instance_audit.v1` file is release-valid only when its
recorded `git_commit` matches current HEAD, or when the delta to current HEAD
contains only documentation, evidence, status, or tooling-only changes.
Runtime-affecting changes after single-instance capture require fresh
single-instance evidence.

## Changed

- `scripts\windows\write-release-go-no-go.ps1`
  - passes current HEAD into `Test-StartupSingleInstanceEvidence`
  - passes current HEAD into `Test-DesktopSingleInstanceEvidence`
  - requires each single-instance candidate to record a valid `git_commit`
  - allows stale single-instance evidence only when
    `Test-DocumentationOrStatusOnlyGitDelta` proves no runtime-affecting delta
  - exposes candidate `git_commit` in the single-instance result objects
- `scripts\windows\test-release-evidence-verifiers.ps1`
  - adds source-contract case
    `go-no-go single-instance evidence requires current freshness`

## Evidence Impact

The dirty-tree go/no-go smoke now correctly rejects stale local
single-instance proof:

- `ready=false`
- `dirty=true`
- `blocker_count=10`
- blockers:
  `multi-device`, `runtime-idle-cpu`, `runtime-cpu-scenario-matrix`,
  `runtime-cpu-second-pc-route-attempt`, `startup-single-instance`,
  `desktop-single-instance`, `support-mailbox`, `store-release`,
  `p2p-control-plane`, `git`
- `startup_single_instance_verified=false`
- `startup_valid_machine_count=0`
- startup candidate commit:
  `dd0e409ee3a8ade2153bb858f74c4c5a0abf5bc2`
- startup `expected git commit`: `fail`
- `desktop_single_instance_verified=false`
- `desktop_valid_machine_count=0`
- desktop candidate commit:
  `fad519c509d784453f938a79df28b02fff497c10`
- desktop `expected git commit`: `fail`

This is expected. The old evidence had been passing because it still proved
the historical package state, not the current runtime/desktop state.

## Validation

- PowerShell parser checks: pass
- `git diff --check`: pass
- release evidence verifier regression: `ok=true`, `case_count=86`,
  `failed_case_count=0`
- dirty-tree go/no-go smoke: stale startup and desktop single-instance
  evidence are rejected by the new current-HEAD freshness check

## Qualitative Audit

No high or medium issue was found.

The implementation follows the existing process ownership freshness pattern
and uses the already-centralized
`Test-DocumentationOrStatusOnlyGitDelta` helper. The blast radius is limited
to release status verification; it does not change desktop startup behavior,
runtime process ownership, MUSU.PRO routing, or local execution.

Residual risk is operational: public release now requires fresh startup and
desktop single-instance evidence from the current committed build, ideally
captured together with process ownership and CPU/matrix evidence on the same
installed package.

## Product Spec Update

MUSU Desktop remains the local executor. MUSU.PRO is the remote input,
project/company room, presence, rendezvous, path-selection, relay policy, and
evidence/control plane.

Single-instance proof belongs to the local desktop/runtime boundary. A web
control-plane command or MUSU.PRO room meeting does not prove local desktop
single-instance safety. Each Windows device must prove that its installed
local MUSU program does not spawn duplicate startup bridges or duplicate
desktop shells after runtime-affecting changes.

## Release State

Public desktop release remains No-Go until:

- startup and desktop single-instance evidence are refreshed on current HEAD
- real second-PC route/CPU/matrix evidence is recorded
- live hosted MUSU.PRO P2P/relay proof is recorded
- support mailbox evidence is recorded
- Store / Partner Center evidence is recorded
