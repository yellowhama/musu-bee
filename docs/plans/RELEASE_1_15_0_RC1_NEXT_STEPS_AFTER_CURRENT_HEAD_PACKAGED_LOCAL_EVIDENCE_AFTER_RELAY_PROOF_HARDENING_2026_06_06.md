# Next Steps After Current HEAD Packaged Local Evidence Refresh

## Current State

Current HEAD has fresh packaged local evidence on `HUGH_SECOND`:

- single-machine smoke passes
- desktop-open idle CPU passes
- five-scenario runtime CPU matrix passes
- targeted `HUGH-MAIN` failed-route CPU diagnostic passes

This restores primary-machine evidence to `1/2`. It does not close the real
second-PC, hosted P2P, support mailbox, or Store gates.

## Next Actions

1. Run the current second-PC transfer kit on a separate Windows machine with
   the current MSIX installed.
2. Import second-PC return evidence and require:
   - successful route evidence
   - desktop-open idle CPU
   - full runtime CPU scenario matrix
   - process subrole attribution
3. Log in the packaged runtime to MUSU.PRO with the explicit WindowsApps alias:
   `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" login`
4. Configure production KV/Upstash and hosted P2P relay env.
5. Record live owner-scoped `https://musu.pro` P2P evidence with release relay
   lease storage, `relay_default_data_path=false`, route transport proof, and
   release relay payload delivery proof.
6. Record support mailbox and Microsoft Store evidence.

## Non-Goals

- Do not treat the failed `HUGH-MAIN` route attempt as successful two-machine
  route proof.
- Do not count preview store-forward queue payload proof as release relay
  tunnel proof.
- Do not move local task execution into MUSU.PRO.
