# Release 1.15.0-rc.1 Startup-Open CPU Attribution

Generated: 2026-06-07 KST

## Scope

This record captures the packaged MUSU Desktop startup activation window on
`HUGH_SECOND`. It is a targeted CPU attribution sample for the reported
idle busy-loop investigation, not a replacement for the full five-state CPU
matrix or the two-machine release gate.

Product boundary remains unchanged:

- MUSU Desktop is the local executor on each Windows device.
- MUSU.PRO is remote input, project room, rendezvous, path selection, relay
  fallback, and evidence/control plane.
- `localhost:3001` is not the packaged desktop runtime contract.

## Evidence

- idle CPU evidence:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260607-111114-HUGH_SECOND.startup-open.evidence.json`
- targeted matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-111114-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- source commit:
  `af394058c10d9691cf9d5217ffaa4ed24e4a31f9`
- packaged command:
  `C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`
- desktop app id:
  `Yellowhama.MUSU_ygcjq669as2b6!MUSU`

The matrix used `-OpenDesktopApp` and records `sample_delay_seconds=2.01`, so
sampling started immediately after packaged desktop activation.

## Result

- matrix verifier: `ok=true`, `fail_count=0`
- scenario: `startup-open`
- sample duration: `60.039s`
- `git_dirty=false`
- hot processes: `0`
- resource budget violations: `0`
- process roles: MUSU `2`, Node `0`, WebView2 `6`, other `0`
- process subroles: bridge runtime `1`, desktop shell `1`, Node helper `0`,
  WebView2 helper `6`
- max one-core CPU by role: MUSU `0`, Node `0`, WebView2 `0.52`, other `0`
- max one-core CPU by subrole: bridge runtime `0`, desktop shell `0`,
  Node helper `0`, WebView2 helper `0.52`
- total working set after sample: `359.53MB`
- total private memory after sample: `182.36MB`

## Attribution

The only measurable CPU during startup activation came from MUSU-owned
WebView2 helpers. The bridge runtime and desktop shell stayed at `0%` of one
logical core over the 60s window, and no MUSU-owned Node helper was present.

This narrows the local busy-loop investigation:

- bridge readiness/health loop: not implicated by bridge-only,
  runtime-started, or startup-open evidence on `HUGH_SECOND`
- desktop shell process: not implicated by startup-open CPU
- Node helper: absent from the startup-open MUSU process tree
- WebView2/UI: low but present startup activation cost, still far below the
  5% one-core release budget

## Verification

Command:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\verify-runtime-cpu-scenario-matrix.ps1 -EvidencePath docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-111114-HUGH_SECOND.runtime-cpu-scenario-matrix.json -RequiredScenarios startup-open -Json
```

Verifier result:

- `ok=true`
- `fail_count=0`
- required scenarios: `startup-open`
- startup app opened: pass
- startup sample delay: pass, `2.01s <= 3s`
- CPU attribution roles/subroles: pass
- role and subrole CPU budgets: pass
- process and WebView2 count budgets: pass
- working-set budget: pass

## Code Audit

No runtime source changed in this step. The only new artifacts are generated
evidence JSON and documentation. The targeted verifier passed, and the result
does not create a new code-path risk.

Residual release risk remains external/coverage-driven:

- this is one-machine evidence only;
- this is a targeted `startup-open` matrix, not the full five-state matrix;
- post-route behavior still needs a current focused attribution pass;
- second-PC CPU/matrix/route evidence is still required;
- hosted MUSU.PRO route/relay/payload proof remains missing.

## Release Meaning

The current one-machine evidence does not reproduce a 20% idle CPU busy-loop
on packaged MUSU Desktop startup activation. Public release remains No-Go
until the second Windows machine and hosted MUSU.PRO P2P/relay/support/Store
gates are proven.

Next local attribution step:

1. capture focused post-route behavior on current HEAD;
2. then move the same CPU/matrix checks to the second Windows machine.
