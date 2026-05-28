# CoS Memory Note - Release Candidate Manifest (2026-05-29 05:00 KST)

Facts:

- `scripts/windows/write-release-candidate-manifest.ps1` now generates a release candidate manifest.
- Output path: `.local-build\release-candidates\1.15.0-rc.1\release-candidate-manifest.json`.
- Companion checksums: `.local-build\release-candidates\1.15.0-rc.1\SHA256SUMS.txt`.
- Manifest scope includes local-sideload MSIX, Store-reviewed MSIX, public `.cer`, Store submission bundle, Tauri MSI/NSIS, latest multi-device test kit, git state, and release readiness audit output.
- Private `.pfx` signing material is excluded by default.

Current readiness:

- Runtime/MSIX package ready: true.
- Desktop shell ready: true.
- Multi-device verified: false until second-PC evidence JSON passes `verify-multidevice-evidence.ps1`.

Canonical docs:

- `docs/BETA_RELEASE_CHECKLIST_1_15_0_RC1.md`
- `docs/DESKTOP_RELEASE_READINESS_AUDIT_2026_05_29.md`
- `docs/RELEASE_1_15_0_RC1_QUAL_AUDIT_ROADMAP_2026_05_29.md`
