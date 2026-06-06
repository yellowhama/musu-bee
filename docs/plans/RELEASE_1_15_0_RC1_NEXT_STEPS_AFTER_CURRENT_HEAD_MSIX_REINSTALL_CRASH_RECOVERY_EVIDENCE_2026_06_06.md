# MUSU 1.15.0-rc.1 Next Steps After Current HEAD MSIX Reinstall and Crash-Recovery Evidence

**Generated**: 2026-06-06 20:13 KST
**Evidence HEAD**: `29dc84db1d8018fd8f8f7bf98588cb6bca0700a2`
**Related report**:
`docs\RELEASE_1_15_0_RC1_CURRENT_HEAD_MSIX_REINSTALL_CRASH_RECOVERY_EVIDENCE_2026_06_06.md`

## Current Position

Current HEAD was rebuilt, reinstalled, and verified as MUSU Desktop on
`HUGH_SECOND`. The installed package exposes the crash-recovery JSON fields and
removes stale bridge registry records for dead PIDs. Single-machine packaged
smoke and desktop-open idle CPU evidence are current and passing.

The product boundary is settled for this release path:

- local MUSU Desktop executes work
- MUSU.PRO receives remote user input and coordinates rooms, rendezvous, path
  selection, relay fallback, and evidence
- `localhost:3001` is optional developer/operator dashboard behavior, not the
  packaged runtime contract

## No-Go Items

Public release remains blocked by:

- no successful second-PC route evidence for the same current build
- no second-PC idle CPU evidence
- no current full runtime CPU matrix including `post-route`
- no live MUSU.PRO runtime login evidence from packaged desktop
- no production owner-scoped P2P storage evidence
- no release `quic_relay_tunnel` transport proof
- no release relay payload delivery proof
- no support mailbox proof
- no Microsoft Store proof

## Next Execution Order

1. Prepare second Windows PC
   - install the current MSIX package
   - verify WindowsApps `musu.exe` alias resolves before developer binaries
   - run `musu up --json` and confirm bridge health plus
     `stale_bridge_registry_removed`

2. Record second-PC local evidence
   - run `smoke-single-machine-beta.ps1`
   - record second-PC idle CPU evidence
   - run full runtime CPU matrix with `post-route`

3. Prove two-machine route
   - run route from `HUGH_SECOND` to the second PC
   - capture route kind, peer identity proof, encryption proof, and payload
     transit flag
   - confirm `payload_transited_musu_infra=false` for direct routes

4. Prove MUSU.PRO control-plane path
   - log packaged runtime into production MUSU.PRO
   - publish presence and candidates
   - create project/company room work order
   - verify local program receives the user input and executes locally

5. Prove relay fallback only after direct failure
   - wire release `quic_relay_tunnel` transport
   - require fallback evidence showing direct candidates failed first
   - record relay transport proof and payload delivery proof
   - verify owner/source/target/lease/session binding

6. Close external release artifacts
   - support mailbox proof
   - Store package and listing proof
   - final clean go/no-go

## Audit Notes

The latest local evidence path has no high or medium code concern. The main
residual risk is release interpretation: one-machine local proof must not be
marketed as multi-device, internet P2P, or release relay readiness.

Keep release copy scoped to:

- local desktop executor
- local bridge-only single-machine operation
- MUSU.PRO as remote input/control plane
- multi-device and relay as beta or blocked until proof is recorded
