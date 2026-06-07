# Release 1.15.0-rc.1 Next Steps After Current-Head Qual Audit

Generated: 2026-06-07 KST

## Current State

Current HEAD `078ce1c5eeb11edc00aa9a6597e6db1f5b0acc59` is locally healthy on
`HUGH_SECOND` but remains public-release No-Go.

Local one-machine gates are current:

- single-machine smoke
- MSIX install
- process ownership
- startup single-instance
- desktop single-instance
- 60s desktop-open idle CPU
- five-state runtime CPU matrix
- targeted HUGH-MAIN route-attempt CPU diagnostic

Open gates:

- second Windows machine route/CPU/matrix proof
- hosted MUSU.PRO P2P/relay proof
- support mailbox proof
- Store/Partner Center proof

## Execution Order

1. Regenerate operator handoff artifacts from current HEAD.

   The latest recorded operator pack was generated from `981f37ac`. Before
   touching the second PC, regenerate final operator gate and action packs from
   `078ce1c5` so the transferred kit matches the evidence and docs.

2. Install the current MSIX on the second machine.

   Required package:

   - `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`

   The second machine must run the packaged MUSU Desktop local program, not a
   developer dashboard URL.

3. Run the second-PC release check from the regenerated transfer kit.

   Required outputs:

   - MSIX install evidence
   - process ownership evidence
   - desktop-open idle CPU evidence
   - five-state runtime CPU matrix evidence
   - route reachability diagnostic
   - multi-device route smoke evidence
   - return zip

4. Import the return zip on `HUGH_SECOND`.

   The import must preserve canonical evidence roots and reject self/local
   route targets.

5. Re-run clean go/no-go.

   Expected progress:

   - `runtime_idle_cpu_valid_machine_count` moves from `1` to `2`
   - `runtime_cpu_scenario_matrix_valid_machine_count` moves from `1` to `2`
   - `multi_device_verified` moves toward `true`

6. Wire live hosted MUSU.PRO P2P proof.

   Required work:

   - production runtime login
   - owner-scoped KV/Upstash storage
   - live owner-scoped rendezvous and route evidence
   - release `quic_relay_tunnel` runtime
   - release payload endpoint
   - release relay transport proof
   - release relay payload delivery proof

7. Capture external release evidence.

   Required:

   - support inbox delivery proof for `musu@musu.pro`
   - Partner Center/Store submission and certification evidence

## Boundary Rule

Do not solve second-machine or hosted P2P gaps by moving execution into
MUSU.PRO. MUSU.PRO is the remote input, project room, rendezvous,
path-selection, relay fallback, and evidence plane. Work runs on local MUSU
Desktop programs, with relay used only as an explicitly proven fallback.
