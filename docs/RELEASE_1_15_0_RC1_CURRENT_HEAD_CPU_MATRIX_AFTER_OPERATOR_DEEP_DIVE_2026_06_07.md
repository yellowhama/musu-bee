# 1.15.0-rc.1 Current HEAD CPU Matrix After Operator Deep Dive

Date: 2026-06-07 16:25 KST

## Scope

After the operator-requested SaaS deep dive was committed and pushed, a fresh
single-machine packaged runtime CPU scenario matrix was captured from clean
HEAD.

This closes only the current-head one-machine matrix freshness gap. It does not
close public release because the release still requires second-machine
CPU/matrix evidence, successful multi-device route proof, live MUSU.PRO P2P
control-plane proof, support mailbox proof, and Store/Partner Center proof.

## Source State

- commit: `924a2b1f680f6c9041bc01c2307d011c626276fd`
- branch: `harden-relay-fallback-payload-evidence`
- git state during measurement: `clean`
- release version: `1.15.0-rc.1`
- operator machine: `HUGH_SECOND`
- MUSU executable:
  `C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`
- release executable identity: `true`

## Evidence

Canonical evidence promoted under
`docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\`:

- `20260607-161441-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- `20260607-161441-HUGH_SECOND.runtime-cpu-scenario-matrix.verification.json`
- `20260607-161441-HUGH_SECOND.startup-open.evidence.json`
- `20260607-161441-HUGH_SECOND.runtime-started.evidence.json`
- `20260607-161441-HUGH_SECOND.dashboard-open.evidence.json`
- `20260607-161441-HUGH_SECOND.desktop-open.evidence.json`
- `20260607-161441-HUGH_SECOND.post-route.evidence.json`

## Command

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\measure-musu-runtime-cpu-scenarios.ps1 -Scenario startup-open,runtime-started,dashboard-open,desktop-open,post-route -SampleSeconds 60 -OpenDesktopApp -RunRouteProbe -Json
```

Verifier:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\verify-runtime-cpu-scenario-matrix.ps1 -EvidencePath .local-build\runtime-cpu-scenarios\20260607-161441-HUGH_SECOND\20260607-161441-HUGH_SECOND.runtime-cpu-scenario-matrix.json -Json
```

## Result

Matrix:

- `ok=true`
- `fail_count=0`
- `git_dirty=false`
- route probe `ok=true`
- route task: `02b2af44-5ec5-451f-b692-343a7db40b10`
- route token: `MUSU_CPU_SCENARIO_ROUTE_OK_20260607_161441`

Verifier:

- `ok=true`
- `fail_count=0`
- required scenarios present:
  `startup-open`, `runtime-started`, `dashboard-open`, `desktop-open`,
  `post-route`
- post-route route probe required and passed

Scenario summary:

| Scenario | Sample seconds | Hot processes | MUSU one-core CPU | Node one-core CPU | WebView2 one-core CPU | Owned processes | WebView2 helpers | Working set |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `startup-open` | `60.03` | `0` | `0` | `0` | `0.05` | `8` | `6` | `370.42MB` |
| `runtime-started` | `60.04` | `0` | `0` | `0` | `0.08` | `8` | `6` | `370.39MB` |
| `dashboard-open` | `60.03` | `0` | `0` | `0` | `0.03` | `8` | `6` | `370.46MB` |
| `desktop-open` | `60.04` | `0` | `0` | `0` | `0.08` | `8` | `6` | `370.43MB` |
| `post-route` | `60.04` | `0` | `0` | `0` | `0.03` | `8` | `6` | `370.45MB` |

Maximum observed values:

- MUSU one-core CPU: `0`
- Node one-core CPU: `0`
- owned WebView2 one-core CPU: `0.08`
- owned process count: `8`
- owned WebView2 helper count: `6`
- total working set: `370.46MB`

## Go/No-Go Impact

Dirty-tree go/no-go after evidence promotion reported:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `multi_device_verified=false`
- `runtime_idle_cpu_valid_machine_count=1`
- `runtime_cpu_scenario_matrix_valid_machine_count=1`
- `runtime_cpu_second_pc_route_attempt_valid_machine_count=1`
- `p2p_control_plane_verified=false`
- `support_mailbox_verified=false`
- `store_release_verified=false`

The `git` blocker is expected in this intermediate run because the evidence and
documentation had not yet been committed.

## Release Meaning

The current HEAD now has fresh one-machine matrix evidence again. Public release
remains No-Go because the matrix gate requires two machines and because the
second-PC route proof is still not successful release-grade multi-device proof.

Remaining release blockers:

- second machine runtime idle CPU evidence;
- second machine successful five-state runtime CPU matrix;
- successful release-grade multi-device route proof;
- live MUSU.PRO route metadata, transport proof, and payload delivery proof;
- release relay tunnel byte path and payload endpoint;
- support mailbox proof;
- Microsoft Store / Partner Center proof.
