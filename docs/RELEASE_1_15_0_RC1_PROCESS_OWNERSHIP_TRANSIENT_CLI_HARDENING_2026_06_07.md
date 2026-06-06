# MUSU 1.15.0-rc.1 Process Ownership Transient CLI Hardening

**Date**: 2026-06-07 02:35 KST
**Wiki ID**: wiki/909
**Machine**: `HUGH_SECOND`

## Summary

Process ownership evidence now separates long-lived MUSU bridge runtimes from
transient `musu.exe` CLI commands.

Root cause found during local 1-machine verification:

- `musu status --json` and process attribution were run at the same time.
- The old process ownership audit counted every `musu.exe` process as a
  runtime root.
- That could report `musu_runtime=2` even when the real packaged bridge
  runtime was still a single long-lived process.
- Rerunning attribution by itself passed, confirming this was an audit
  false-positive risk, not duplicate runtime startup.

## Product Spec Update

`musu_runtime` now means a long-lived local execution runtime:

- `musud`
- the bridge registry PID from `%USERPROFILE%\.musu\services\bridge.json`
- a `musu.exe bridge` command line

Other short-lived `musu.exe` commands are reported as `musu_cli`. They are
diagnostic/operator commands, not bridge runtime roots.

This keeps the product boundary intact:

- MUSU Desktop remains the local executor.
- MUSU.PRO remains remote input, project/company room, AI meeting room,
  presence, rendezvous, path selection, relay fallback coordination, and
  evidence/control plane.
- `localhost:3001` remains developer/operator dashboard behavior, not the
  packaged desktop runtime contract.

## Implementation

Updated `scripts/windows/audit-musu-process-ownership.ps1`:

- added `Test-MusuBridgeCommandLine`
- added `Test-MusuRuntimeRoot`
- reads the bridge registry before classifying processes
- counts only bridge roots as `musu_runtime`
- reports transient CLI processes as `process_counts.musu_cli`

Updated `scripts/windows/show-musu-process-attribution.ps1`:

- exposes `counts.musu_cli`
- adds a finding when transient MUSU CLI processes were excluded from bridge
  runtime ownership count

Updated `scripts/windows/test-release-evidence-verifiers.ps1`:

- added source-contract regression
  `process ownership excludes transient MUSU CLI from bridge runtime count`

## Evidence

Current local status:

- local bridge: `http://127.0.0.1:1158`, healthy
- local node: `hugh_second`
- peer: `HUGH-MAIN`, `192.168.1.192:8949`, unhealthy, `version=unknown`

Process ownership after patch:

- `ok=true`
- `fail_count=0`
- `musu_runtime=1`
- `musu_cli=0`
- `desktop_shell=1`
- `owned_node=0`
- `owned_webview2=6`
- `packaged_runtime=1`
- `non_packaged_runtime=0`
- bridge PID `39876`
- bridge `/health` HTTP `200`

Process attribution after patch:

- `ok=true`
- `musu_runtime=1`
- `musu_cli=0`
- `desktop_shell=1`
- machine-wide Node `18`
- owned Node `0`
- machine-wide WebView2 `18`
- owned WebView2 `6`
- orphan repo helpers `0`

60s desktop-open CPU diagnostic after patch:

- path:
  `.local-build\runtime-idle-cpu\20260607-022857-HUGH_SECOND.desktop-open.post-process-ownership-cli-hardening.json`
- `ok=true`
- `git_dirty=true`
- `sample_seconds=60.049`
- `hot_process_count=0`
- MUSU max one-core CPU `0`
- Node max one-core CPU `0`
- WebView2 max one-core CPU `0.05`
- working set after sample `361.45MB`
- resource budget violations `0`

The CPU sample is diagnostic only because the tree was dirty while the scripts
were being patched. It is not clean release-gate evidence.

## Validation

Passed:

- PowerShell parser checks for the three updated scripts
- `scripts/windows/audit-rust-background-loop-contract.ps1 -Json`:
  `ok=true`, `fail_count=0`, unaudited loop/spawn hits `0`
- `scripts/windows/audit-frontend-polling-contract.ps1 -Json`:
  `ok=true`, `fail_count=0`, direct interval/listener hits `0`
- `scripts/windows/audit-musu-process-ownership.ps1 -Json`:
  `ok=true`, `fail_count=0`
- `scripts/windows/show-musu-process-attribution.ps1 -Json`:
  `ok=true`
- `scripts/windows/test-release-evidence-verifiers.ps1 -Json`:
  `ok=true`, `case_count=94`, `failed_case_count=0`

## Qualitative Audit

No high or medium issue was found in this scoped hardening.

The change reduces false release-blocker noise from legitimate short-lived
operator commands. It does not weaken the bridge runtime gate because the
registered bridge PID, `musu.exe bridge` command line, packaged path checks,
process ownership tree, and bridge `/health` check still have to pass.

Residual risks:

- Current 1-machine desktop-open CPU remains quiet, but the post-patch 60s
  sample was captured from a dirty tree and is diagnostic only.
- This does not close the real second-PC route/CPU/matrix gates.
- This does not implement hosted MUSU.PRO release relay tunnel payload
  transport.
- Support mailbox and Store/Partner Center proof remain missing.

## Release Status

Public release remains No-Go until clean current evidence closes:

- second-PC multi-device route proof
- two-machine runtime idle CPU evidence
- two-machine runtime CPU scenario matrix evidence
- hosted MUSU.PRO owner-scoped P2P/relay proof with release route metadata,
  transport proof, and payload delivery proof
- support mailbox proof
- Store/Partner Center proof
