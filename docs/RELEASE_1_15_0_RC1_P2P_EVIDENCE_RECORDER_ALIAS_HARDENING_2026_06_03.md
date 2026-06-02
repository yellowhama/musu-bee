# MUSU 1.15.0-rc.1 P2P Evidence Recorder Alias Hardening

Date: 2026-06-03 04:41 KST

## Summary

`scripts\windows\record-p2p-control-plane-evidence.ps1` now resolves the MUSU
executable in release-safe order:

1. explicit `-MusuExe`
2. installed packaged WindowsApps alias
3. repo debug binary
4. first `musu.exe` on PATH

This prevents hosted P2P release evidence from accidentally using the repo debug
binary or another PATH-shadowing CLI when the packaged MSIX alias is installed.

The recorder now writes these fields into evidence and command output:

- `musu_exe`
- `musu_exe_source`

## Validation

Command:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\record-p2p-control-plane-evidence.ps1 -AllowUnverified -Json
```

Result:

- evidence:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-044110-musu.pro.evidence.json`
- verification:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-044110-musu.pro.verification.json`
- summary:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-044110-musu.pro.summary.md`
- `musu_exe=C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`
- `musu_exe_source=windowsapps_alias`

The P2P gate still correctly fails:

- `ok=false`
- relay leases ok: `false`
- owner scope verified: `false`
- live blocker: `p2p_relay_lease_kv_not_configured`

This confirms the remaining P2P blocker is production KV/Upstash owner-scoped
lease storage, not local evidence binary selection.

`write-release-go-no-go.ps1 -ScriptTimeoutSeconds 120` still reports:

- `local_artifacts_ready=True`
- `single_machine_verified=True`
- runtime idle CPU `1/2 [HUGH_SECOND]`
- runtime CPU matrix `1/2 [HUGH_SECOND]`
- `p2p_control_plane_verified=False`

The temporary `git` blocker is expected before commit.

## Code Audit

The source change is release-tooling only. It does not affect runtime behavior,
desktop process ownership, or packaged application code.

Freshness allowlists in these scripts now include P2P recorder/verifier tooling
so current primary CPU evidence is not invalidated by this non-runtime change:

- `scripts\windows\write-release-go-no-go.ps1`
- `scripts\windows\verify-single-machine-evidence.ps1`
- `scripts\windows\verify-runtime-cpu-scenario-matrix.ps1`

## Remaining Work

The next real P2P unblock remains:

1. provision KV/Upstash production storage for `musu.pro`
2. deploy/reload `musu.pro`
3. rerun `record-p2p-control-plane-evidence.ps1` without `-AllowUnverified`
4. verify owner-scoped relay lease queries with `relay_default_data_path=false`
