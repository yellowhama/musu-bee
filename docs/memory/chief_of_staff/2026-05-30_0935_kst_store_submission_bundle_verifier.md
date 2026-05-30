# CoS Memory - Store Submission Bundle Verifier

Date: 2026-05-30 09:35 KST

Durable facts:

- Added `scripts\windows\verify-store-submission-bundle.ps1`.
- `prepare-store-submission-bundle.ps1` now writes `SHA256SUMS.txt` into each Store submission bundle.
- `audit-desktop-release-readiness.ps1` verifies the latest Store submission bundle and reports `Store submission bundle verification`.
- `prepare-operator-action-pack.ps1` verifies the Store submission bundle before creating the Partner Center copy.
- `verify-operator-action-pack.ps1` now expects the Partner Center zip to include the Store bundle `SHA256SUMS.txt`.
- Latest verified Store submission bundle: `.local-build\msix\submission-bundles\store-reviewed-20260530-093140`.
- This improves Partner Center handoff safety, but it does not close the Store release evidence gate; Partner Center product reservation, submission, Microsoft certification, and restricted capability approval evidence are still required.
