# Chief of Staff Memory - Release Gate PowerShell Host Index Refresh - 2026-06-03

Index refresh after release gate PowerShell host hardening used the explicit
packaged WindowsApps alias:

`& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`

Expected final indexed corpus after this memory is `1640` files and `2283`
symbols.

Search terms: `GOAL v404`, `wiki/598 index refresh`, `release gate PowerShell
host hardening`, `Get-CurrentPowerShellExecutable`, `Get-FileHash`,
`PSModulePath`, `verify-store-submission-bundle.ps1`,
`complete-final-operator-gates.ps1`, `runtime_package_ready=true`,
`local_artifacts_ready=true`, and `ProcessStartInfo`.
