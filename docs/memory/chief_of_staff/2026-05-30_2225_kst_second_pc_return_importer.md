# 2026-05-30 22:25 KST - Second-PC Return Importer

## Durable Decision

- Added `scripts\windows\import-second-pc-return.ps1`.
- The importer accepts `.local-build\second-pc-return\*.zip`, extracts it under `.local-build\second-pc-return\imported\`, copies the MSIX install evidence/handoff/release-check JSON into their canonical `.local-build` roots, verifies MSIX install evidence with `verify-msix-install-evidence.ps1`, and uses `show-second-pc-return-card.ps1` to generate the primary-side commands.
- With `-RecordMsixInstall`, the importer immediately records the MSIX install gate via `record-msix-install-evidence.ps1`.

## Why It Matters

- The second-PC operator return path is now one command from returned ZIP to validated/recorded MSIX install evidence and exact multi-device smoke commands.
- This still does not satisfy the real multi-device route evidence gate; the primary machine must still run `smoke-multidevice-beta.ps1` against the returned `host:port` and record the resulting `.local-build\multi-device\*.evidence.json`.
