# MUSU 1.15.0-rc.1 External Gate Recheck

Date: 2026-06-06

## Summary

External release gates were rechecked from clean HEAD
`f0b09139de93cfa98ab1b5d0d8f85e0115fea6b3` after hardening the external gate
recorder to expose actionable root-cause fields.

This pass proves that public metadata is live and correct. The remaining
release blockers are second-PC, account/session, hosted P2P infrastructure,
support mailbox, and Store evidence gaps. They are not a new local MUSU Desktop
runtime, localhost dashboard, or idle CPU issue.

Evidence:

- external gate recheck:
  `docs\evidence\external-gates\1.15.0-rc.1\20260606-090152-HUGH_SECOND.external-gates.evidence.json`
- external gate summary:
  `docs\evidence\external-gates\1.15.0-rc.1\20260606-090152-HUGH_SECOND.external-gates.summary.md`
- external evidence SHA256:
  `6bb5ad0265a2f602f16b058affee42dd8dae3ced945d06191ee74a20c0af28a8`
- live P2P evidence:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260606-090333-musu.pro.evidence.json`
- live P2P verification:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260606-090333-musu.pro.verification.json`

## Recorder Hardening

`scripts/windows/record-external-release-gate-recheck.ps1` now flattens the
fields an operator needs first:

- public metadata checked/ok
- second-PC ping/TCP success and TCP error
- P2P relay status/transport/leases/route-evidence logged-in state
- P2P owner-scope status
- relay lease store configured/backend/release-grade state
- relay transport descriptor/connect/payload endpoint wiring
- relay route evidence count and relay payload proof count

It also tolerates null child JSON inputs in its property helpers, so a failed
child recorder can still become actionable evidence instead of aborting the
outer external-gate snapshot.

Regression coverage:

- PowerShell parser check: pass
- `test-release-evidence-verifiers.ps1`: `ok=true`, `case_count=55`,
  `failed_case_count=0`
- source contract added:
  `external gate recheck exposes actionable root-cause fields`
- `git diff --check`: pass

## Public Metadata

Public metadata remains verified:

- `public_metadata_checked=True`
- `public_metadata_ok=True`
- `https://musu.pro/privacy` returns HTTP `200`
- `https://musu.pro/support` returns HTTP `200`
- both pages contain `musu@musu.pro`

`store-public-metadata` is not a blocker when public metadata is not skipped.

## Current Go/No-Go State

The release remains No-Go.

Passing local/current gates:

- `local_artifacts_ready=True`
- `single_machine_verified=True`
- `msix_install_verified=True`
- `msix_desktop_entrypoint_verified=True`
- frontend polling, Rust background-loop, idle busy-loop, local API auth,
  operator API security, degraded mode, P2P store-forward relay, secret storage,
  process ownership, startup single-instance, and desktop single-instance
  contract gates remain true

Remaining go/no-go blockers:

- `multi-device`
- `runtime-idle-cpu`
- `runtime-cpu-scenario-matrix`
- `support-mailbox`
- `store-release`
- `p2p-control-plane`

External recorder root-cause blockers:

- `second_pc_unreachable`
- `p2p_env_not_ready`
- `p2p_control_plane_evidence_not_verified`
- `p2p_runtime_not_logged_in`
- `p2p_owner_scope_not_verified`
- `p2p_relay_lease_store_not_release_grade`
- `p2p_relay_transport_not_wired`
- `p2p_relay_payload_endpoint_not_wired`
- `p2p_relay_payload_transport_not_proven`
- `p2p_relay_payload_delivery_proof_missing`

## Second PC

The bounded probe to `192.168.1.192:8949` failed:

- ping succeeded: `False`
- TCP succeeded: `False`
- TCP error: `tcp_connect_timeout`
- timeout: `3000ms`

This blocks second-PC route, idle CPU, and runtime CPU matrix proof. The next
action is to install or run the current MUSU build on that second Windows PC,
make the local bridge reachable, and rerun the second-PC return flow.

## Hosted P2P

Live P2P evidence was captured through the packaged WindowsApps alias:

- MUSU exe:
  `C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`
- MUSU exe source: `windowsapps_alias`
- base URL: `https://musu.pro`
- P2P evidence verified: `False`
- P2P verification `fail_count=40`
- relay route evidence count: `0`
- relay payload transport proven: `False`
- relay payload delivery proof valid count: `0`

Flattened root cause:

- relay status logged in: `False`
- relay transport logged in: `False`
- relay leases logged in: `False`
- relay route evidence logged in: `False`
- owner scope verified: `False`
- relay lease store configured: `False`
- relay lease store backend: none
- relay lease store release-grade: `False`
- relay transport descriptor wired: `False`
- relay transport wired: `False`
- relay connect endpoint wired: `False`
- relay payload endpoint wired: `False`

Interpretation: the hosted P2P blocker is account/session and production
control-plane/relay infrastructure state. It is not evidence that the local
desktop must become a web app or that work should execute on MUSU.PRO.

## Qualitative Audit

No high or medium code issue was found in the changed release-gate recorder or
verifier contract. The main quality improvement is observability: the external
gate report now names the exact next operator actions instead of hiding them
inside nested child JSON.

Residual risks:

- The release remains blocked until a real second machine participates.
- Hosted P2P remains blocked until a production runtime is logged in and
  accepted by owner-scoped P2P control auth.
- Relay fallback remains non-release-grade until production KV/Upstash storage,
  release tunnel transport, payload endpoint wiring, route evidence, and
  payload delivery proof are all present.
- Support mailbox and Store/Partner Center evidence remain manual/external.

Product boundary remains unchanged:

- MUSU Desktop is the local executor on each device.
- MUSU.PRO accepts remote input and coordinates project/company rooms,
  presence, rendezvous, path selection, relay fallback, and evidence.
- MUSU.PRO helps bootstrap connections; direct P2P mesh remains preferred after
  bootstrap.
- Hosted relay is fallback-only and must not become the default payload data
  path.

## Next Steps

1. Log in the packaged MUSU runtime against the production account before
   recording hosted P2P evidence.
2. Configure production P2P control auth and release-grade KV/Upstash relay
   lease storage on MUSU.PRO.
3. Wire the distinct release relay tunnel transport and payload endpoint, then
   capture route evidence with actual payload transit proof.
4. Bring the second Windows PC online at the current build and capture
   route/idle CPU/runtime matrix evidence.
5. Record real support mailbox delivery evidence for `musu@musu.pro`.
6. Record real Partner Center product reservation, app submission,
   certification, and restricted capability approval evidence.

Detailed next-step plan:

- `docs\plans\RELEASE_1_15_0_RC1_NEXT_STEPS_AFTER_EXTERNAL_GATE_ROOT_CAUSE_RECHECK_2026_06_06.md`
