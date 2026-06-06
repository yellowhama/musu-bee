# Next Steps After Crash-Recovery Contract Gate

Date: 2026-06-06
Branch: `harden-relay-fallback-payload-evidence`

## Immediate

1. Regenerate clean packaged runtime evidence from the commit that contains the
   `musu up` stale bridge registry cleanup change.
2. Run current go/no-go from a clean working tree and confirm
   `crash_recovery_contract_verified=true`.
3. Refresh final operator packet/action pack so the new Gate D4 audit is
   present in the handoff material.

## Local Runtime

1. Keep `audit-musu-crash-recovery-contract.ps1` in the release gate set.
2. If a future live stale-registry simulation is added, run it in an isolated
   temporary `MUSU_HOME` and always clean up via `musu down --json`.
3. Keep process ownership and startup single-instance as separate gates:
   crash recovery proves source and handoff wiring; startup/process ownership
   prove live packaged runtime state.

## External Release Gates

1. Install the current package on the second Windows PC.
2. Run the second-PC kit and return:
   - MSIX install evidence
   - runtime idle CPU evidence
   - runtime CPU scenario matrix evidence
   - second-PC handoff zip
3. Run successful two-machine route evidence with release-grade transport
   proof.
4. Provision live MUSU.PRO P2P storage/login/relay proof:
   - KV/Upstash lease storage
   - runtime logged-in proof
   - owner-scoped relay route evidence
   - relay route transport proof
   - relay payload delivery proof
5. Record support mailbox proof and Store/Partner Center proof.

## Product Boundary

Do not route execution through MUSU.PRO. MUSU.PRO is the remote input,
project/company room, rendezvous, path-selection, relay fallback coordination,
and evidence/control plane. Each local MUSU Desktop program performs the work
on its own device.
