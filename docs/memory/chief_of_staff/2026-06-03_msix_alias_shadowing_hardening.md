# 2026-06-03 MSIX Alias Shadowing Hardening

The MSIX release tools now distinguish true PATH alias shadowing from other
visible `musu.exe` binaries.

Changed:

- `msix-common.ps1` records alias order, WindowsApps alias presence/discovery,
  first alias path, alternate alias sources, and true alias shadowing.
- `check-msix-legacy-conflicts.ps1` emits `windowsapps_alias_invocation`,
  `first_alias_path`, `alternate_alias_sources`, and `alias_remediation`.
- `capture-msix-install-evidence.ps1` records the same fields in
  `musu.msix_install_evidence.v1`.
- `verify-installed-msix-package.ps1` prints the explicit packaged invocation
  and alternate alias count.
- release freshness allowlists now include MSIX evidence/status scripts and
  `msix-common.ps1` as tooling-only changes.

Validation:

- `check-msix-legacy-conflicts.ps1 -Json` reports true local shadowing:
  `C:\Users\empty\.cargo\bin\musu.exe` before the WindowsApps alias.
- `verify-installed-msix-package.ps1` confirms the installed MSIX package,
  manifest, Start menu entry, alias contract, and artifact contract match.
- `capture-msix-install-evidence.ps1 -Json` records alias order and remediation.
- `audit-desktop-release-readiness.ps1 -Json` now reports
  `runtime_package_ready=True`.
- `write-release-go-no-go.ps1 -ScriptTimeoutSeconds 120` reports
  `local_artifacts_ready=True`; public release remains No-Go on second-PC,
  CPU 2/2, support mailbox, Store, and live P2P control-plane evidence.

The operator can explicitly invoke the packaged app with:

`& "C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe"`

Do not delete developer binaries as a release automation step. Move WindowsApps
earlier in PATH only when the operator intentionally wants packaged `musu` to be
the default CLI.
