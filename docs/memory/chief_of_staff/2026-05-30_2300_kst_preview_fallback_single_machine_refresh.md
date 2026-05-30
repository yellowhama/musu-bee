# 2026-05-30 23:00 KST - Preview Fallback Single-Machine Evidence Refresh

## Durable Decision

- After documenting the `show-second-pc-return-card.ps1` preview fallback in the final operator packet README generator, the single-machine release smoke was rerun from source commit `7c7d537ea9b8397c79eabb34e26cb574c2429909`.
- Current evidence:
  - `docs\evidence\single-machine\1.15.0-rc.1\20260530-225842-HUGH_SECOND.evidence.json`
  - dashboard output `MUSU_RELEASE_SMOKE_OK_20260530_2258`
  - CLI route output `MUSU_CLI_ROUTE_OK_20260530_2258`
  - dashboard task `69d71cea-dec0-47af-a0bb-fdde166c080e`
  - bridge `http://127.0.0.1:3718`

## Why It Matters

- The current release-tooling HEAD has matching single-machine evidence.
- Public desktop release remains No-Go until real second-PC MSIX install evidence, real multi-device route evidence, `musu@musu.pro` inbox delivery evidence, and Partner Center/Microsoft Store approval evidence are recorded.
