# 2026-06-03 P2P Evidence Recorder Alias Hardening

`record-p2p-control-plane-evidence.ps1` now resolves the MUSU executable in
release-safe order:

1. explicit `-MusuExe`
2. packaged WindowsApps alias
3. repo debug binary
4. PATH `musu.exe`

It records `musu_exe` and `musu_exe_source` in live evidence and command output.

Validation:

- default recorder command generated
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-044110-musu.pro.evidence.json`
- output reports
  `musu_exe=C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`
- output reports `musu_exe_source=windowsapps_alias`
- verification remains `ok=false`, `fail_count=4`
- live blocker remains `p2p_relay_lease_kv_not_configured`

Freshness allowlists in `write-release-go-no-go.ps1`,
`verify-single-machine-evidence.ps1`, and
`verify-runtime-cpu-scenario-matrix.ps1` now include P2P recorder/verifier
tooling. `write-release-go-no-go.ps1 -ScriptTimeoutSeconds 120` still reports
`local_artifacts_ready=True` and `single_machine_verified=True` while P2P remains
false.
