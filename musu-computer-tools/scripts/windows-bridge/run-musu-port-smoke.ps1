param(
  [string]$VsInstallPath = "",
  [string]$CargoPath = "",
  [string]$TargetDir = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$workspaceRoot = Split-Path -Parent $repoRoot
$musuPortRoot = Join-Path $workspaceRoot "musu-port"
$targetScript = Join-Path $musuPortRoot "scripts\run-windows-smoke.ps1"

if (-not (Test-Path -LiteralPath $targetScript)) {
  throw "musu-port Windows smoke script not found: $targetScript"
}

Set-Location $musuPortRoot

$forwardParams = @{}
if (-not [string]::IsNullOrWhiteSpace($VsInstallPath)) {
  $forwardParams["VsInstallPath"] = $VsInstallPath
}
if (-not [string]::IsNullOrWhiteSpace($CargoPath)) {
  $forwardParams["CargoPath"] = $CargoPath
}
if (-not [string]::IsNullOrWhiteSpace($TargetDir)) {
  $forwardParams["TargetDir"] = $TargetDir
}

& $targetScript @forwardParams

$exitCode = if ($null -ne $LASTEXITCODE) { [int]$LASTEXITCODE } else { 0 }
exit $exitCode
