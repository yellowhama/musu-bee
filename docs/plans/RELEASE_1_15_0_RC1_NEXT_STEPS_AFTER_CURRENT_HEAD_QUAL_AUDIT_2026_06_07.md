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

## 2026-06-07 Frontend Polling Inventory Gate Update

The frontend interval/refetch busy-loop gate is now stricter. The release audit
locks the exact current inventory of 29 `useLowDutyPolling` call-site files and
go/no-go requires that inventory check for the `frontend interval/refetch`
idle-busy-loop candidate.

This does not change the release execution order below. It prevents a new UI
polling surface from silently appearing while local CPU evidence is being
collected on the second machine.

Validation for this update:

- frontend polling audit: `ok=true`, expected/actual call-site count `29/29`
- runtime polling tests: `17/17`
- P2P tests: `112/112`
- typecheck: passed
- release evidence verifier regression: `ok=True`
- P2P env status: expected No-Go with 12 blockers
- `git diff --check`: passed

Canonical report:

- `docs\RELEASE_1_15_0_RC1_FRONTEND_POLLING_INVENTORY_GATE_2026_06_07.md`

## Execution Order

1. Regenerate operator handoff artifacts from current HEAD.

   Done after the frontend polling inventory gate. The latest generated
   operator artifacts now use source commit
   `e53810cf365c4c3228cae5a14b373ee8878376fb`.

   Current second-PC transfer zip:

   - `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260607-101255\second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260607-101255.zip`

   Canonical handoff record:

   - `docs\RELEASE_1_15_0_RC1_CURRENT_OPERATOR_HANDOFF_AFTER_FRONTEND_POLLING_INVENTORY_GATE_2026_06_07.md`

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
