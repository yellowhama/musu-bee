# Chief of Staff Memory - Release Gate PowerShell Host Hardening - 2026-06-03

Durable decision: release-gate JSON runners must not hard-code
`powershell.exe` when the parent session is PowerShell 7.

Root cause: `write-release-go-no-go.ps1` launched child verifiers through
`System.Diagnostics.ProcessStartInfo` with `FileName = "powershell.exe"`.
That Windows PowerShell child could inherit a PowerShell 7-first
`PSModulePath`, making `Get-FileHash` unavailable in
`verify-store-submission-bundle.ps1`. The Store bundle verifier then failed
inside `audit-desktop-release-readiness.ps1`, producing a false
`runtime-package` blocker even though direct readiness audit passed.

Fix: release gate helpers now resolve the current PowerShell executable and
reuse it for child verifiers. `verify-store-submission-bundle.ps1` also ensures
`Get-FileHash` is available before checksum verification.

Freshness follow-up: `verify-single-machine-evidence.ps1`,
`verify-runtime-cpu-scenario-matrix.ps1`, and `write-release-go-no-go.ps1` now
classify `complete-final-operator-gates.ps1` and
`verify-store-submission-bundle.ps1` as status-only release tooling so this
gate-only hardening does not stale current runtime evidence.

Validation: ProcessStartInfo reproduction under `powershell.exe` now reports
Store bundle `ok=true`, `fail_count=0`; readiness audit reports
`runtime_package_ready=true`; release verifier regressions pass `18/18`;
dirty-tree go/no-go reports `local_artifacts_ready=true` and no
`runtime-package` blocker.

Release interpretation: this removes a false negative only. Public release
remains No-Go until second-PC route/CPU/matrix, two-machine CPU budgets,
support mailbox, Store/Partner Center, and live hosted P2P relay transport
evidence are complete.
