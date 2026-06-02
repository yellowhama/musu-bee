# MUSU 1.15.0-rc.1 Post Fleet SSE Primary Evidence Refresh

Date: 2026-06-03 07:50 KST

## Scope

This pass restored primary-machine release evidence after the Fleet SSE
lifecycle hardening changed frontend runtime source.

The key objective was to make the local evidence true for the current source
again:

- rebuild and install the current local-sideload MSIX
- run packaged single-machine smoke through the explicit WindowsApps alias
- record desktop-open idle CPU evidence with MUSU, Node, and WebView2 separated
- record the four-state runtime CPU scenario matrix
- re-run clean go/no-go

## MSIX Build And Install

Current source was built into:

- `.local-build\msix\output\musu_1.15.0.0_x64_local-sideload-manual.msix`

Build notes:

- Rust release runtime build completed in `9m 24s`
- Tauri desktop shell build completed
- WinApp CLI generated and packed the local-sideload MSIX
- installed package:
  `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`

Install verification passed through `install-and-verify-msix.ps1`:

- installed package contract matched artifact
- packaged runtime identity reported `distribution=store-msix`
- startup task `MusuBridgeStartup` remained enabled
- explicit WindowsApps alias invocation is:
  `& "C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe"`

Important caveat: `capture-msix-install-evidence.ps1` still fails on this
machine because PATH resolves `C:\Users\empty\.cargo\bin\musu.exe` before the
WindowsApps alias. That failure was not recorded into `docs\evidence`; all
runtime evidence in this pass used the explicit WindowsApps alias to avoid
developer alias shadowing.

## Evidence

Single-machine smoke:

- `docs\evidence\single-machine\1.15.0-rc.1\20260603-073941-HUGH_SECOND.evidence.json`
- verification:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-073941-HUGH_SECOND.verification.json`
- dashboard task:
  `595585da-e3c5-43f4-8468-d1cec100133a`
- bridge:
  `http://127.0.0.1:4760`
- output:
  `MUSU_RELEASE_SMOKE_OK_20260603_073920`

Desktop-open idle CPU:

- `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-074231-HUGH_SECOND.desktop-open.evidence.json`
- measured from clean git state
- sample duration: `60.061s`
- MUSU CPU: `0`
- repo Node CPU: `0.05`
- WebView2 CPU: `0.16`
- hot process count: `0`
- process counts: MUSU `2`, Node `1`, WebView2 `6`
- working set after sample: `500.12MB`

Runtime CPU scenario matrix:

- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-074415-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- route token:
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_074415`
- verifier: `ok=true`, `fail_count=0`

Matrix summary:

| Scenario | MUSU | Node | WebView2 | Hot | Working set |
| --- | ---: | ---: | ---: | ---: | ---: |
| runtime-started | 0 | 0.03 | 0.05 | 0 | 502.71MB |
| dashboard-open | 0.03 | 0.03 | 0.10 | 0 | 504.75MB |
| desktop-open | 0 | 0 | 0.16 | 0 | 504.17MB |
| post-route | 0.03 | 0.03 | 0.13 | 0 | 503.12MB |

## Go/No-Go

Clean go/no-go on commit `0428c20020a5fbd0331e3aa6ed2ae319e54348d0`:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `multi_device_verified=false`
- runtime idle CPU valid machines: `1`
- runtime CPU scenario matrix valid machines: `1`
- `p2p_control_plane_verified=false`
- `support_mailbox_verified=false`
- `store_submission_verified=null`
- `manifest_git.dirty=false`

## Qualitative Evaluation

Primary desktop quality is back to acceptable for the current local machine:

- the reported 20% idle busy-loop was not reproduced on the packaged desktop
  path
- MUSU-owned runtime and desktop CPU stayed effectively idle
- WebView2 stayed well under the 5% one-core release budget
- repo Node was visible and separately attributed
- no hot processes were observed
- the post-route scenario stayed under budget after an actual local route task

This still does not prove public release readiness. The release gate requires
the same runtime CPU and matrix evidence on a second Windows PC, and it still
requires release-grade P2P, support, and Store evidence.

## Remaining Release Blockers

- second-PC route evidence
- second-PC desktop-open CPU evidence
- second-PC runtime CPU scenario matrix
- live `musu.pro` owner-scoped KV/Upstash relay lease evidence
- relay payload transport proof
- `musu@musu.pro` mailbox receive/forward evidence
- Partner Center / Microsoft Store submission evidence

## Cleanup

After evidence capture:

- the evidence `next start -p 3001` process was stopped
- packaged bridge PID `2036` was stopped
- packaged desktop PID `13052` was stopped
- no `musu.exe`, `musu-desktop.exe`, or repo-related `musu-bee` Node process
  remained
