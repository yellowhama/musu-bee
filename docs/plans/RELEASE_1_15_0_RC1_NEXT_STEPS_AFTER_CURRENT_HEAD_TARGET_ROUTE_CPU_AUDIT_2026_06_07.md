# Release 1.15.0-rc.1 Next Steps After Current-HEAD Target Route CPU Audit

Generated: 2026-06-07T07:33:44+09:00

## Current State

Current HEAD `6cbeb3b34dad0c01c4a539f170435759095efc59` has restored:

- current packaged local desktop evidence on `HUGH_SECOND`
- single-machine smoke
- process ownership
- startup single-instance
- desktop single-instance
- desktop-open idle CPU
- five-state runtime CPU matrix
- targeted `HUGH-MAIN` failed-route CPU diagnostic

Public release remains No-Go because the release still lacks real second-PC
route/CPU/matrix evidence and live MUSU.PRO P2P/relay proof.

## Next Execution Order

1. Install or update the same current MSIX on `HUGH-MAIN`.

   Required package identity:

   - `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`
   - source commit:
     `6cbeb3b34dad0c01c4a539f170435759095efc59`

2. Run the second-PC release check from the extracted transfer kit.

   Preferred command inside the kit:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\run-second-pc-release-check.ps1
   ```

   Required outputs:

   - MSIX install evidence
   - process ownership evidence
   - desktop-open idle CPU evidence
   - five-state runtime CPU matrix evidence
   - multi-device route smoke evidence
   - return zip

3. Import the second-PC return on `HUGH_SECOND`.

   Use:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\import-second-pc-return.ps1 -RequireReleaseGateEvidence -ReturnZip <RETURN_ZIP>
   ```

4. Re-run clean go/no-go.

   Expected direction:

   - runtime idle CPU valid machine count should move from `1` toward `2`
   - runtime CPU scenario matrix valid machine count should move from `1`
     toward `2`
   - multi-device route evidence should move from false toward true

5. Fix live MUSU.PRO P2P env blockers.

   Required areas:

   - production runtime login
   - owner-scoped KV/Upstash storage
   - live rendezvous and route evidence with owner scope
   - release `quic_relay_tunnel` runtime
   - release payload endpoint
   - release relay transport proof
   - release relay payload delivery proof

6. Capture non-P2P external release evidence.

   Required:

   - support inbox delivery evidence for `musu@musu.pro`
   - Microsoft Store / Partner Center evidence

## Boundary Reminder

Do not treat `localhost:3001` as the packaged program. The packaged user-facing
local program is MUSU Desktop. MUSU.PRO is the remote input, room, rendezvous,
path-selection, relay fallback, and evidence plane. Work runs on local devices,
and MUSU.PRO only brokers or records the connection unless an explicit relay
fallback is issued and proven.
