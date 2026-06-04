# MUSU 1.15.0-rc.1 Post Stale-Proof Query Primary Evidence Refresh - 2026-06-04

## Context

After the relay route-evidence stale proof query hardening, the release freshness
gate required primary-machine evidence on the new HEAD.

## Fresh Evidence

- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-100843-HUGH_SECOND.evidence.json`
- desktop-open idle CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-101133-HUGH_SECOND.desktop-open.evidence.json`
- five-state runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-101925-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

## Results

- smoke output: `MUSU_RELEASE_SMOKE_OK_20260604_100843`
- smoke bridge: `http://127.0.0.1:2751`
- smoke task: `e45ff280-80a3-41cf-92bd-54f9e9776c0a`
- desktop-open idle CPU passed for `60.052s`
- desktop-open CPU maxes: MUSU `0`, Node `0.03`, WebView2 `0.16`
- desktop-open working set: `509.29MB`
- desktop-open hot process count: `0`
- matrix route token: `MUSU_CPU_SCENARIO_ROUTE_OK_20260604_101925`
- matrix verifier: `ok=true`, `fail_count=0`
- matrix max CPU: MUSU `0`, Node `0.08`, WebView2 `0.18`
- matrix max working set: `509.47MB`
- matrix hot process count: `0`

## Go/No-Go

Clean go/no-go on `a2087e6b` reports:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `msix_install_verified=true`
- runtime idle CPU evidence `1/2 [HUGH_SECOND]`
- runtime CPU scenario matrix evidence `1/2 [HUGH_SECOND]`
- `p2p_relay_route_evidence_count=0`
- `p2p_relay_payload_transport_proven=false`
- `p2p_relay_payload_delivery_proof_valid_count=0`
- `manifest_dirty=false`

Public release remains No-Go until real second-PC multi-device evidence,
second-PC runtime CPU/matrix evidence, live owner-scoped `musu.pro` relay proof,
`musu@musu.pro` delivery evidence, and Store/Partner Center evidence are
recorded.
