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
$driveName = "MUSUWB"
$originalLocation = (Get-Location).Path

if (-not (Test-Path -LiteralPath $targetScript)) {
  throw "musu-port Windows smoke script not found: $targetScript"
}

try {
  if (Get-PSDrive -Name $driveName -ErrorAction SilentlyContinue) {
    Remove-PSDrive -Name $driveName -Force
  }

  New-PSDrive -Name $driveName -PSProvider FileSystem -Root $musuPortRoot | Out-Null
  Set-Location "$driveName`:"

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

  & ".\scripts\run-windows-smoke.ps1" @forwardParams
  $exitCode = if ($null -ne $LASTEXITCODE) { [int]$LASTEXITCODE } else { 0 }
  exit $exitCode
} finally {
  Set-Location $originalLocation
  if (Get-PSDrive -Name $driveName -ErrorAction SilentlyContinue) {
    Remove-PSDrive -Name $driveName -Force
  }
}
