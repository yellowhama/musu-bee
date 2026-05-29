# MSIX Install Evidence Gate - 2026-05-29 09:10 KST

Durable update:

- Added `scripts\windows\capture-msix-install-evidence.ps1`.
- Added `scripts\windows\verify-msix-install-evidence.ps1`.
- Added `scripts\windows\record-msix-install-evidence.ps1`.
- `write-release-go-no-go.ps1` now reports `msix_install_verified` and blocks public desktop release until clean/current Windows MSIX install evidence is recorded.
- `show-final-release-handoff-status.ps1` now lists MSIX install evidence roots and an operator step.
- `complete-final-operator-gates.ps1` now accepts `-MsixInstallEvidencePath`.
- Final operator packets and multi-device kits now include the MSIX install evidence scripts.
- `write-release-candidate-manifest.ps1` now writes manifest/checksum files through temp files plus retry before replacement. This prevents concurrent `show-final-release-handoff-status.ps1` and `write-release-go-no-go.ps1` runs from failing on a locked `release-candidate-manifest.json`.

Reason:

- The previous multi-device route smoke proved peer registration/routing from the primary machine, but it did not preserve a machine-readable proof that the second Windows PC installed the current MSIX package with the expected alias/startup contract and no legacy startup or PATH conflicts.
- Public release readiness now requires that install proof separately from multi-device route proof.

Release state:

- This does not close the public release gate.
- Public release is now blocked on four external evidence classes: MSIX install, multi-device, support mailbox, and Store release approval.

Smoke verification:

- Synthetic valid MSIX install evidence verified with `verify-msix-install-evidence.ps1`.
- `record-msix-install-evidence.ps1` smoke wrote only to `.local-build\msix-install-record-smoke`.
- `complete-final-operator-gates.ps1` smoke accepted `-MsixInstallEvidencePath` and `-MsixInstallOutputRoot`, writing only to `.local-build\msix-install-complete-smoke`.
- The smoke paths are intentionally not auto-detected by `write-release-go-no-go.ps1`, so the real release gate remains unsatisfied until real second-PC evidence is recorded.
