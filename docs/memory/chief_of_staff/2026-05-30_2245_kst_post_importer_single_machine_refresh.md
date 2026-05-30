# 2026-05-30 22:45 KST - Post-Importer Single-Machine Evidence Refresh

## Durable Decision

- After committing `import-second-pc-return.ps1`, the single-machine release smoke was rerun from source commit `2eca0405e660b23d39ce7c993d30a44ecc580483`.
- Current evidence:
  - `docs\evidence\single-machine\1.15.0-rc.1\20260530-224123-HUGH_SECOND.evidence.json`
  - dashboard output `MUSU_RELEASE_SMOKE_OK_20260530_2240`
  - CLI route output `MUSU_CLI_ROUTE_OK_20260530_2240`
  - dashboard task `dbb4d9dc-1c94-439c-89ae-98b43285f6b3`
  - bridge `http://127.0.0.1:3718`

## Why It Matters

- The latest committed release tooling now has matching current single-machine evidence.
- This still does not close the public release gate; real second-PC MSIX install, real multi-device routing, `musu@musu.pro` inbox delivery, and Partner Center/Microsoft Store approval evidence remain external gates.
