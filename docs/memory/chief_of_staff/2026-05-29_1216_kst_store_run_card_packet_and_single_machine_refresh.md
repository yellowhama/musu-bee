# CoS Memory Note - Store Run Card Packet + Single-Machine Refresh (2026-05-29 12:16 KST)

## Facts

- `prepare-final-operator-gate-packet.ps1` now copies `docs/MICROSOFT_STORE_RELEASE_RUN_CARD_2026_05_29.md`.
- `verify-final-operator-gate-packet.ps1` now requires the run card and checks that the packet README points to it.
- Code commit: `745d852ff603cc5d04ddb78592bcbc2888143250`.
- Single-machine smoke was rerun on that commit and passed.
- Current evidence file: `docs/evidence/single-machine/1.15.0-rc.1/20260529-121456-HUGH_SECOND.evidence.json`.
- Dashboard task: `ea9fe1ed-14c7-4af9-b9a8-1f1394deb88c`.
- Dashboard output: `MUSU_RELEASE_SMOKE_OK_20260529_1214`.
- CLI route output: `MUSU_CLI_ROUTE_OK_20260529_1214`.

## Decision

- Treat `20260529-121456-HUGH_SECOND` as the current single-machine smoke evidence.
- Older single-machine evidence files remain historical, but should not be cited as current release evidence.
