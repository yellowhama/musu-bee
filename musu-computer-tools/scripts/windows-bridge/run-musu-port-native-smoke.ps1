param(
  [Parameter(Mandatory = $true)]
  [string]$ExePath,
  [string]$DeviceId = "windows-native-smoke",
  [int]$Port = 0,
  [int]$BackendPort = 0,
  [int]$ProbePort = 0,
  [string]$DataRoot = "",
  [string]$DiscoveryProvider = "windows"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$workspaceRoot = Split-Path -Parent $repoRoot
$musuPortRoot = Join-Path $workspaceRoot "musu-port"
$targetScript = Join-Path $musuPortRoot "scripts\windows-native-smoke.ps1"

if (-not (Test-Path -LiteralPath $targetScript)) {
  throw "musu-port Windows native smoke script not found: $targetScript"
}

Set-Location $musuPortRoot

$forwardParams = @{
  ExePath = $ExePath
}

if (-not [string]::IsNullOrWhiteSpace($DeviceId)) {
  $forwardParams["DeviceId"] = $DeviceId
}
if ($Port -gt 0) {
  $forwardParams["Port"] = $Port
}
if ($BackendPort -gt 0) {
  $forwardParams["BackendPort"] = $BackendPort
}
if ($ProbePort -gt 0) {
  $forwardParams["ProbePort"] = $ProbePort
}
if (-not [string]::IsNullOrWhiteSpace($DataRoot)) {
  $forwardParams["DataRoot"] = $DataRoot
}
if (-not [string]::IsNullOrWhiteSpace($DiscoveryProvider)) {
  $forwardParams["DiscoveryProvider"] = $DiscoveryProvider
}

& $targetScript @forwardParams

$exitCode = if ($null -ne $LASTEXITCODE) { [int]$LASTEXITCODE } else { 0 }
exit $exitCode
