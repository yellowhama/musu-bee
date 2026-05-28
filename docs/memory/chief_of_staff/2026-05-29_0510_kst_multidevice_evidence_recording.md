# CoS Memory Note - Multi-Device Evidence Recording (2026-05-29 05:10 KST)

Facts:

- `scripts/windows/record-multidevice-evidence.ps1` now records returned second-PC evidence into the release repo.
- The recorder first runs `verify-multidevice-evidence.ps1`; failed evidence is refused.
- Committed release evidence is stored as `docs\evidence\multidevice\<VERSION>\*.evidence.json`.
- Verification and Markdown summary sidecars are written next to the raw evidence, but the release audit only treats `*.evidence.json` as committed proof.
- `scripts/windows/audit-desktop-release-readiness.ps1` now checks committed `*.evidence.json` first, then raw local `.local-build\multi-device\*.json`.
- The latest second-PC kit is `.local-build\multi-device-test-kit\musu-multidevice-1.15.0-rc.1-20260529-051149.zip`; it includes the evidence recorder and no private `.pfx` signing material.

Decision:

- Do not flip public desktop release readiness from false to true based on verifier sidecars or synthetic fixtures.
- Only real second-PC smoke evidence may be recorded under `docs\evidence\multidevice\1.15.0-rc.1`.
- Until that real evidence lands, the current truthful state remains: runtime package ready, desktop shell ready, multi-device proof pending.

Canonical docs:

- `docs/MULTI_DEVICE_RELEASE_TEST_PLAN_1_15_0_RC1_2026_05_29.md`
- `docs/DESKTOP_RELEASE_READINESS_AUDIT_2026_05_29.md`
- `docs/BETA_RELEASE_CHECKLIST_1_15_0_RC1.md`
