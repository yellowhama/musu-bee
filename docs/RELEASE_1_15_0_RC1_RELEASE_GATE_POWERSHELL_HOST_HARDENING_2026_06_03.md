# MUSU 1.15.0-rc.1 Release Gate PowerShell Host Hardening - 2026-06-03

## Summary

The release go/no-go gate no longer reports a false `runtime-package`
blocker when it is launched from PowerShell 7.

The root cause was the go/no-go JSON runner hard-coding `powershell.exe`
through `System.Diagnostics.ProcessStartInfo`. When launched from PowerShell 7,
that Windows PowerShell child could inherit a PowerShell 7-first module path.
In that state, the Store submission bundle verifier could fail to autoload
`Get-FileHash`, causing `audit-desktop-release-readiness.ps1` to report
`runtime_package_ready=false` even though the MSIX package artifacts were valid.

## Changed Scripts

- `scripts\windows\write-release-go-no-go.ps1`
- `scripts\windows\audit-desktop-release-readiness.ps1`
- `scripts\windows\verify-store-submission-bundle.ps1`
- `scripts\windows\complete-final-operator-gates.ps1`
- `scripts\windows\record-external-release-gate-recheck.ps1`
- `scripts\windows\show-final-release-handoff-status.ps1`
- `scripts\windows\test-release-evidence-verifiers.ps1`
- `scripts\windows\verify-single-machine-evidence.ps1`
- `scripts\windows\verify-runtime-cpu-scenario-matrix.ps1`

## Gate Behavior

Release-gate helper scripts now resolve and reuse the current PowerShell
executable instead of forcing `powershell.exe`. On the current operator machine,
that means child verifiers run under PowerShell 7 when the parent gate is
PowerShell 7.

`verify-store-submission-bundle.ps1` also explicitly ensures `Get-FileHash`
is available before checksum verification. This makes the checksum gate robust
even if Windows PowerShell is started with a module path that does not autoload
`Microsoft.PowerShell.Utility` correctly.

The single-machine, runtime CPU matrix, and go/no-go freshness allowlists now
also treat `complete-final-operator-gates.ps1` and
`verify-store-submission-bundle.ps1` as status-only release tooling. That keeps
current runtime evidence valid across this gate-only hardening commit.

## Validation

- PowerShell parser passed for all changed scripts.
- `git diff --check` passed.
- ProcessStartInfo reproduction using `powershell.exe` now verifies the Store
  submission bundle with `ok=true` and `fail_count=0`.
- `audit-desktop-release-readiness.ps1 -Json` reports:
  - `runtime_package_ready=true`
  - `msix_desktop_entrypoint_ready=true`
  - `desktop_shell_ready=true`
  - `single_machine_verified=true`
  - `multi_device_verified=false`
  - `fail_count=1`
- `test-release-evidence-verifiers.ps1 -Json` passed `18/18`.
- Dirty-tree go/no-go reports:
  - `local_artifacts_ready=true`
  - `runtime_package_ready=true`
  - `desktop_shell_ready=true`
  - `single_machine_verified=true`
  - `multi_device_verified=false`
  - `runtime_idle_cpu_verified=false`
  - `runtime_cpu_scenario_matrix_verified=false`
  - `p2p_control_plane_verified=false`

## Release Interpretation

This fixes a release-gate false negative. It does not make the public desktop
release ready.

The expected clean-tree public No-Go blockers remain:

- real second-PC multi-device evidence
- runtime idle CPU evidence on two machines
- runtime CPU scenario matrix evidence on two machines
- `musu@musu.pro` support mailbox evidence
- Partner Center / Store release evidence
- live `musu.pro` P2P control-plane evidence with owner-scoped relay leases and
  proven relay payload transport
