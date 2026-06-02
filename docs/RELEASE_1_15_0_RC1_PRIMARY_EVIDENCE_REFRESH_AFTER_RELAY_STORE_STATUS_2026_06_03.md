# MUSU 1.15.0-rc.1 Primary Evidence Refresh After Relay Store Status

Date: 2026-06-03 06:44 KST

## Scope

This pass refreshed primary-machine release evidence after the relay lease store
status live P2P evidence pass.

It does not change the public release decision. It proves the current primary
Windows machine still passes local smoke and idle/runtime CPU gates after the
latest evidence commits, while second-PC, hosted P2P, support mailbox, and
Store gates remain open.

No source code changed in this pass. The changed surface is release evidence
and documentation.

## Evidence

Single-machine smoke:

- evidence:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-062456-HUGH_SECOND.evidence.json`
- verification:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-062456-HUGH_SECOND.verification.json`
- summary:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-062456-HUGH_SECOND.summary.md`
- evidence commit recorded in artifact:
  `22d537c1f460f1fa8bbcd67e6c392fb83c81936a`
- dashboard task: `5fa8a73b-3d0b-4976-b234-0b9d256827c6`
- dashboard output: `MUSU_RELEASE_SMOKE_OK_20260603_062433`
- evidence SHA256:
  `68357b4c78dc740dd04f290d08a071ff06b4de568fe61d3d596c71036354a127`

Desktop-open idle CPU:

- evidence:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-062633-HUGH_SECOND.desktop-open.evidence.json`
- `ok=true`
- evidence commit recorded in artifact:
  `69d1f721338cb59f9c8b89e6b0841ebd1aad36f0`
- `git_dirty=false`
- sample: `60.068s`
- process counts: MUSU `2`, repo Node `1`, owned WebView2 `6`, other `0`
- max one-core CPU: MUSU `0`, Node `0.05`, WebView2 `0.31`, other `0`
- working set: `501.98MB`
- hot processes: `0`
- evidence SHA256:
  `d554f398dddbece42d5f33352101ee9ad7a46add978107ba1b8da6150fb95c32`

Runtime CPU scenario matrix:

- matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-063400-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- scenario artifacts:
  - `20260603-063400-HUGH_SECOND.runtime-started.evidence.json`
  - `20260603-063400-HUGH_SECOND.dashboard-open.evidence.json`
  - `20260603-063400-HUGH_SECOND.desktop-open.evidence.json`
  - `20260603-063400-HUGH_SECOND.post-route.evidence.json`
- verifier: `ok=true`, `fail_count=0`
- evidence commit recorded in artifact:
  `6714364ad7bc871d65d1253bab51db34fe9802c0`
- `git_dirty=false`
- route token: `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_063400`
- matrix SHA256:
  `4b657f922a39d3dbae54b8c3b6a0b16e1bf6dd982ed89b8406132a471e90119a`

Scenario CPU summary:

| Scenario | MUSU | Node | WebView2 | Other | Working set | Hot |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| runtime-started | 0 | 0 | 0.03 | 0 | 504.3MB | 0 |
| dashboard-open | 0 | 0.05 | 0.05 | 0 | 504.13MB | 0 |
| desktop-open | 0 | 0 | 0.13 | 0 | 504.69MB | 0 |
| post-route | 0 | 0.03 | 0.1 | 0 | 504.24MB | 0 |

## Current Go/No-Go

Current go/no-go on clean HEAD
`85dec851f33b90518cc55ea67208c85154b74d90` reports:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `multi_device_verified=false`
- `runtime_idle_cpu_verified=false`
- `runtime_cpu_scenario_matrix_verified=false`
- `p2p_control_plane_verified=false`
- `support_mailbox_verified=false`
- `store_submission_verified=null`
- `manifest_dirty=false`

Open release blockers:

- real second-PC multi-device evidence has not been recorded
- runtime idle CPU evidence has not passed on at least two machines
- runtime CPU scenario matrix evidence has not passed on at least two machines
- `musu@musu.pro` delivery has not been operator-verified
- Partner Center product reservation, app submission, certification, and
  restricted capability approval evidence has not been recorded
- live `https://musu.pro` P2P evidence has not verified owner-scoped relay
  lease queries with `relay_default_data_path=false`

## Qualitative Audit

The primary machine does not currently reproduce a MUSU-owned busy loop.
Under the packaged desktop-open path, MUSU-owned CPU remains effectively idle,
no hot process is recorded, and WebView2 stays well under the 5% one-core
release budget.

The machine-wide Node.js concern remains diagnostic unless attribution shows
MUSU-owned helpers or repo-owned orphan helpers. This pass records repo Node
`1` from the local dashboard process, owned WebView2 `6`, and no CPU/resource
budget violation.

No code audit blocker was found in the changed scope because this pass did not
modify source code. The remaining blockers are release evidence and hosted
operations blockers, not newly discovered source defects.

## Next Work

1. Run/import a current second-PC release check that includes route evidence,
   desktop-open idle CPU, four-state runtime CPU matrix, process attribution,
   and cleanup evidence.
2. Provision production KV or Upstash for `musu.pro`, set the required hosted
   env values, redeploy, and rerun live P2P evidence without `-AllowUnverified`.
3. Implement and prove relay payload transport separately after owner-scoped
   relay lease storage passes.
4. Record `musu@musu.pro` mailbox delivery/receive evidence.
5. Record Partner Center name reservation, submission, certification, and
   restricted capability approval evidence.
6. Rerun final go/no-go after those gates pass.
