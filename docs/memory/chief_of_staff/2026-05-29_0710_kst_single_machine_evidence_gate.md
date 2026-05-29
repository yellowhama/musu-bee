# CoS Memory Note - Single-Machine Evidence Gate (2026-05-29 07:10 KST)

Facts:

- `scripts/windows/smoke-single-machine-beta.ps1` now writes `musu.single_machine_smoke_evidence.v1` JSON under `.local-build/single-machine/` by default.
- Added `scripts/windows/verify-single-machine-evidence.ps1`.
- Added `scripts/windows/record-single-machine-evidence.ps1`.
- Fresh smoke evidence was recorded under `docs/evidence/single-machine/1.15.0-rc.1/`.
- Evidence file: `20260529-070403-HUGH_SECOND.evidence.json`.
- Verification file: `20260529-070403-HUGH_SECOND.verification.json`.
- Dashboard task id: `b772a958-ded9-4cb1-a180-98ca75c9b91f`.
- Dashboard output: `MUSU_RELEASE_SMOKE_OK_20260529_0705`.
- CLI route output contained `MUSU_CLI_ROUTE_OK_20260529_0705`.

Decision:

- Assistant-side single-computer test is now machine-verifiable, not just narrated in docs.
- `audit-desktop-release-readiness.ps1` now reports `single_machine_verified=true`.
- Remaining public desktop release blockers are still second-PC multi-device evidence and `musu@musu.pro` delivery evidence.

Canonical docs:

- `docs/BETA_RELEASE_CHECKLIST_1_15_0_RC1.md`
- `docs/RELEASE_FINAL_OPERATOR_GATES_2026_05_29.md`
