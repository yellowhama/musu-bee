# CoS Memory Note - Store Release Evidence Gate (2026-05-29 08:05 KST)

Facts:

- Added `scripts\windows\verify-store-release-evidence.ps1`.
- Added `scripts\windows\record-store-release-verification.ps1`.
- Updated `scripts\windows\write-release-go-no-go.ps1` so public desktop release readiness is blocked until Store release approval evidence is recorded.
- Store approval evidence covers:
  - Partner Center product/app submission
  - Microsoft app certification
  - restricted startup capability approval
- The final operator gate packet now includes the Store release recorder/verifier scripts and README instructions for recording Microsoft approval.

Decision:

- Partner Center/Microsoft approval is no longer only a free-text manual external gate in the final go/no-go report.
- It is now a machine-readable release blocker via `store_release_verified=false`.
- The app can still be treated as ready for a Partner Center submission attempt when local package/artifact gates pass, but it must not be called public desktop release-ready until Store approval evidence is recorded.

Current expected blockers:

- real second-PC multi-device evidence
- `musu@musu.pro` inbox delivery evidence
- Store release approval evidence

Canonical scripts:

- `scripts\windows\verify-store-release-evidence.ps1`
- `scripts\windows\record-store-release-verification.ps1`
- `scripts\windows\write-release-go-no-go.ps1`
