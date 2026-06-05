# MUSU 1.15.0-rc.1 External Gate Recheck

Date: 2026-06-06

## Summary

Current external release gates were rechecked after the post room-control CPU
audit commit `8bdb6c5b2a5967172835fcec6c1348b9cd7bb044`.

This pass proves public metadata is live and correct, while the remaining
public release blockers are external evidence/deployment gaps rather than a
new local idle CPU issue.

Evidence:

- external gate recheck:
  `docs\evidence\external-gates\1.15.0-rc.1\20260606-082244-HUGH_SECOND.external-gates.evidence.json`
- external gate summary:
  `docs\evidence\external-gates\1.15.0-rc.1\20260606-082244-HUGH_SECOND.external-gates.summary.md`
- live P2P evidence:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260606-082429-musu.pro.evidence.json`
- live P2P verification:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260606-082429-musu.pro.verification.json`

## Public Metadata

`verify-store-public-metadata.ps1 -BaseUrl https://musu.pro -Json` passed:

- `ok=true`
- `fail_count=0`
- `https://musu.pro/privacy` returned HTTP `200`
- `https://musu.pro/support` returned HTTP `200`
- both pages contain `musu@musu.pro`

Go/no-go without `-SkipPublicMetadata` now reports:

- `public_metadata_ok=True`
- no `store-public-metadata` blocker

## Remaining Go/No-Go State

The release remains No-Go, but the blocker list is reduced to the real external
gates:

- `multi-device`
- `runtime-idle-cpu`
- `runtime-cpu-scenario-matrix`
- `support-mailbox`
- `store-release`
- `p2p-control-plane`

Current true gates:

- `local_artifacts_ready=True`
- `single_machine_verified=True`
- `msix_install_verified=True`
- `msix_desktop_entrypoint_verified=True`
- `frontend_polling_contract_verified=True`
- `rust_background_loop_contract_verified=True`
- `idle_busy_loop_candidate_contract_verified=True`
- `local_api_auth_contract_verified=True`
- `operator_api_security_contract_verified=True`
- `degraded_mode_contract_verified=True`
- `p2p_store_forward_relay_contract_verified=True`
- `secret_storage_contract_verified=True`
- `process_ownership_verified=True`
- `startup_single_instance_verified=True`
- `desktop_single_instance_verified=True`

## Second PC

The bounded probe to `192.168.1.192:8949` failed:

- ping: `False`
- TCP reachable: `False`
- TCP error: `tcp_connect_timeout`
- timeout: `3000ms`

This means second-PC route/CPU/matrix proof cannot be closed from the current
machine state. The next concrete action is to run/install the current MUSU build
on that second Windows PC and re-run the second-PC return flow.

## Hosted P2P

Live P2P control-plane evidence was captured through the packaged WindowsApps
alias:

- MUSU exe:
  `C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`
- MUSU exe source: `windowsapps_alias`
- base URL: `https://musu.pro`
- P2P evidence verified: `False`
- P2P verification `fail_count=40`
- relay route evidence count: `0`
- relay payload transport proven: `False`
- relay payload delivery proof valid count: `0`

The live P2P evidence is fail-closed because the runtime is not logged in and
release-grade hosted relay pieces are not ready:

- relay status `logged_in=false`
- relay transport query `logged_in=false`
- relay leases query `logged_in=false`
- relay route evidence query `logged_in=false`
- owner scope not verified
- relay lease store configured `False`
- relay lease store release-grade `False`
- relay transport wired `False`
- relay connect endpoint wired `False`
- relay payload endpoint wired `False`

This confirms the root cause of the live P2P blocker is external
account/env/deployment state plus missing release relay tunnel proof, not the
local desktop CPU evidence path.

## Qualitative Assessment

No new high/medium code issue was found in this pass. The evidence improves
release accuracy by separating:

- confirmed live public metadata readiness
- missing second-PC machine state
- missing live account login / owner-scoped P2P readiness
- missing release relay tunnel payload proof
- missing support mailbox and Store/Partner Center operator evidence

The product boundary remains unchanged: MUSU Desktop executes locally on each
device; MUSU.PRO accepts remote input and coordinates rooms, presence,
rendezvous, path selection, relay fallback, and evidence. MUSU.PRO still does
not become the default execution server or default payload data path.

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
