# MUSU 1.15.0-rc.1 Relay Route Proof Linkage Hardening

Date: 2026-06-05

## Decision

The roadmap remains locked to the local-executor / web-control split:

- the installed local MUSU program executes work on each device
- `musu.pro` is remote user input, project/company rooms, presence,
  rendezvous, path selection, relay-fallback policy, and evidence
- `localhost:3001/app` is an optional workspace dashboard, not the packaged
  local program; connection refused on that port is expected when the workspace
  dashboard is stopped
- devices can use `musu.pro` to bootstrap discovery and route offers, then
  communicate P2P; relay remains fallback-only and non-default

## Hardening

Root cause: release-grade route-evidence queries already revalidated proof
shapes, but relay transport proof was not bound tightly enough to the route
record fallback lease/session. A stale stored relay record with
`release_grade=true` and mismatched transport proof could pass the query shape
checks if the stored fields otherwise looked current.

Commit `9d1d9666ee7fc9443f424401c5315b40750071ba` fixes that by binding
`hasCurrentRelayTransportProof` to:

- `relay_fallback.lease_id`
- route-evidence `session_id`
- current relay transport proof shape

Changed files:

- `musu-bee/src/lib/routeEvidenceStore.ts`
- `musu-bee/src/app/api/v1/p2p/route-evidence/route.test.ts`
- `scripts/windows/audit-p2p-store-forward-relay-contract.ps1`

Validation:

- `npm run test:p2p` passed `79/79`
- `npm run typecheck` passed
- `audit-p2p-store-forward-relay-contract.ps1 -FailOnProblem -Json` passed
  with `ok=true`, `fail_count=0`
- new audit check:
  `release-grade query binds relay transport proof to fallback lease`
- `git diff --check` passed

## Fresh local evidence

After the code hardening, the packaged local runtime evidence was refreshed.

MSIX and single-machine evidence:

- strict MSIX install:
  `docs\evidence\msix-install\1.15.0-rc.1\20260605-072911-HUGH_SECOND.evidence.json`
- bridge-only single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260605-073044-HUGH_SECOND.evidence.json`
- installed bridge: `http://127.0.0.1:8186`
- `dashboard_required=false`
- `single_machine_surface=local-bridge-only`

Runtime CPU evidence:

- desktop-open idle CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260605-074243-HUGH_SECOND.desktop-open.evidence.json`
- idle CPU passed for `60.061s` with clean git state, MUSU `0`, Node `0`,
  WebView2 `0.03`, owned WebView2 `6`, working set `368.98MB`, and hot `0`
- five-state CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-074400-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- matrix verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-074400-HUGH_SECOND.verification.json`
- matrix verifier passed with `ok=true`, `fail_count=0`
- route token: `MUSU_CPU_SCENARIO_ROUTE_OK_20260605_074400`
- max scenario CPU: MUSU `0.03`, Node `0`, WebView2 `0.16`
- `dashboard-open` measured packaged runtime state because no dashboard URL was
  exposed, so the release evidence did not depend on `localhost:3001`

Evidence commits:

- `cf92a3f2ff2cc0c25fe82503c1910190cf1308cb` records MSIX and single-machine
  smoke evidence
- `9b331698dbb5312a80f291866539d6293b9c2591` records runtime CPU evidence

## Current handoff

Clean final handoff after `9b331698` reports:

- packet/action-pack verified
- local artifacts ready
- single-machine verified
- MSIX install verified
- MSIX desktop entrypoint verified
- frontend polling, Rust background loop, local API auth, operator API
  security, P2P store-forward relay contract, secret storage, process
  ownership, startup single-instance, and desktop single-instance verified
- runtime idle CPU valid machines: `1/2 [HUGH_SECOND]`
- runtime CPU scenario matrix valid machines: `1/2 [HUGH_SECOND]`
- `manifest_git_dirty=false`
- `ready_for_public_desktop_release=false`

Remaining blockers:

- real second-PC current-build multi-device evidence
- second-PC runtime idle CPU evidence
- second-PC runtime CPU scenario matrix evidence
- `musu@musu.pro` support mailbox delivery proof
- Partner Center / Microsoft Store release evidence
- live `musu.pro` P2P control-plane proof

## P2P No-Go Details

`show-musu-pro-p2p-env-status.ps1 -Json` still reports No-Go:

- `relay_payload_queue_fallback_implemented=true`
- queue fallback components are present:
  policy marker, web queue store/claim/deliver, Rust enqueue-after-lease, and
  Rust target drain/delivery proof
- `relay_connect_endpoint_implemented=false`
- `relay_payload_endpoint_implemented=false`
- GitHub/Vercel production storage is missing
  `KV_REST_API_URL`/`KV_REST_API_TOKEN` or Upstash equivalents
- live evidence fails with `p2p_relay_lease_kv_not_configured`
- release relay transport is not wired
- owner-scoped release-grade relay route evidence count is `0`
- live relay payload delivery proof is missing

This is intentional: the queue fallback source contract is wired, but it is not
a release-grade QUIC/TLS relay transport. Env flags alone cannot close the P2P
gate.

## Next Steps

1. Install this current build on the second Windows PC and record current-build
   multi-device, idle CPU, and CPU matrix evidence.
2. Provision production KV/Upstash for `musu.pro`, deploy, and rerun hosted P2P
   control-plane evidence.
3. Replace the fail-closed relay connect/payload placeholders with real
   release-grade QUIC/TLS fallback transport and route proof.
4. Record owner-scoped release relay route evidence with delivery proof.
5. Record support mailbox and Store release evidence.
