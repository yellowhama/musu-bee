# CoS Memory Note - Multi-Device Test Kit Ready (2026-05-29 04:45 KST)

Facts:

- `scripts/windows/prepare-multidevice-test-kit.ps1` now builds a second-PC test zip.
- Latest generated kit: `.local-build\multi-device-test-kit\musu-multidevice-1.15.0-rc.1-20260529-044952.zip`.
- The kit includes the current local-sideload MSIX, public `.cer`, install/verify scripts, multi-device smoke script, runbook, checksums, and optional Tauri shell bundles.
- The kit intentionally excludes `.pfx` private signing material.
- `scripts/windows/smoke-multidevice-beta.ps1` now auto-detects installed `musu.exe` and writes evidence JSON under `.local-build\multi-device\`.
- `scripts/windows/verify-multidevice-evidence.ps1` validates returned evidence and is wired into the release readiness audit.
- MSIX install/readiness scripts now support public `.cer` certificate trust, not only local `.pfx`.

Decision:

- The second-PC test no longer requires cloning the repo on the other machine.
- Multi-device release readiness is still not proven until the kit is run on the user's second Windows PC and the evidence JSON is recorded.

Canonical docs:

- `docs/MULTI_DEVICE_RELEASE_TEST_PLAN_1_15_0_RC1_2026_05_29.md`
- `docs/BETA_RELEASE_CHECKLIST_1_15_0_RC1.md`
