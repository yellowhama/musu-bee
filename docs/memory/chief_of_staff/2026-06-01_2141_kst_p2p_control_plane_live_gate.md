# 2026-06-01 21:41 KST - P2P Control-Plane Live Gate

The objective requires `musu.pro` to act as the P2P setup control-plane, not a
vague future note. I added a release evidence gate for live hosted P2P
control-plane verification.

Changes:

- Added `scripts/windows/record-p2p-control-plane-evidence.ps1`.
- Added `scripts/windows/verify-p2p-control-plane-evidence.ps1`.
- Wired the verifier into `scripts/windows/write-release-go-no-go.ps1` as
  `p2p_control_plane_verified`.
- Added the scripts to final operator packet generation/verification and the
  desktop release readiness script coverage.

Recorded evidence:

- `docs/evidence/p2p-control-plane/1.15.0-rc.1/20260601-214149-musu.pro.evidence.json`
- `docs/evidence/p2p-control-plane/1.15.0-rc.1/20260601-214149-musu.pro.verification.json`
- `docs/evidence/p2p-control-plane/1.15.0-rc.1/20260601-214149-musu.pro.summary.md`

Result:

- `musu relay status --json` proves logged-in `https://musu.pro` control-plane
  wiring is present.
- `musu relay leases --json` still fails release verification because the live
  production route is not accepting the runtime token:
  `ok=false`, `owner_scope_verified=false`, `owner_scoped=false`, and
  `p2p_control_auth_not_configured`.
- `write-release-go-no-go.ps1` now adds a `p2p-control-plane` blocker until
  production `MUSU_P2P_CONTROL_TOKEN_SHA256S` or equivalent scoped auth is
  configured and passing owner-scoped relay lease evidence is recorded.
- This is explicitly a live `musu.pro` production env/deploy task, not a
  local-only desktop task.

Next action:

- Configure production `MUSU_P2P_CONTROL_TOKEN_SHA256S` using
  `scripts/windows/show-p2p-control-token-hash.ps1 -Json`, then rerun
  `record-p2p-control-plane-evidence.ps1` without `-AllowUnverified`.
- Indexer sync after this gate recorded 1203 files and 2213 symbols.
