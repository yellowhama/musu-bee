# 2026-05-30 10:05 KST - Second-PC Return Zip

## Durable Decision

- `run-second-pc-release-check.ps1` now creates `.local-build\second-pc-return\*.zip` by default after writing the MSIX install evidence, second-PC handoff JSON, and release-check summary.
- `show-second-pc-return-card.ps1` now accepts `-ReturnZipPath`, extracts the returned archive under `.local-build\second-pc-return\extracted\`, locates the handoff/MSIX evidence, and prints primary-side record/smoke commands.
- Operator docs, action pack quickstart, packet README generation, and packet/action-pack verifiers now require or describe the second-PC return archive.

## Why It Matters

- The remaining second-PC gate still requires a real external Windows machine, but the return path is less error-prone: the operator can move one ZIP back to the release repo instead of manually tracking three JSON files across separate `.local-build` directories.
- This does not satisfy the MSIX install or multi-device gates by itself; it only reduces handoff friction and stale/missing-file risk.
