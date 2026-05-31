[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$EvidencePath,
    [string]$Version,
    [string]$OutputRoot,
    [string]$ExpectedRouteOutput = "MUSU_REMOTE_ROUTE_OK",
    [switch]$AllowStatusOnly,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path

function Get-JsonPropertyString {
    param(
        [Parameter(Mandatory = $true)]$Object,
        [Parameter(Mandatory = $true)][string]$Name
    )

    $property = $Object.PSObject.Properties[$Name]
    if (-not $property) {
        return ""
    }
    return [string]$property.Value
}

if ([string]::IsNullOrWhiteSpace($Version)) {
    $Version = (Get-Content -LiteralPath (Join-Path $repoRoot "VERSION") -Raw).Trim()
}
if ([string]::IsNullOrWhiteSpace($OutputRoot)) {
    $OutputRoot = Join-Path $repoRoot ("docs\evidence\multidevice\{0}" -f $Version)
}

if (-not (Test-Path -LiteralPath $EvidencePath)) {
    throw "Evidence file not found: $EvidencePath"
}

$verifyScript = Join-Path $scriptDir "verify-multidevice-evidence.ps1"
$verifyArgs = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", $verifyScript,
    "-EvidencePath", (Resolve-Path -LiteralPath $EvidencePath).Path,
    "-ExpectedVersion", $Version,
    "-ExpectedRouteOutput", $ExpectedRouteOutput,
    "-Json"
)
if ($AllowStatusOnly) {
    $verifyArgs += "-AllowStatusOnly"
}

$verifyText = (& powershell @verifyArgs 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0) {
    throw "Multi-device evidence did not verify.`n$verifyText"
}
$verification = $verifyText | ConvertFrom-Json

$evidence = Get-Content -LiteralPath $EvidencePath -Raw | ConvertFrom-Json
$completedAtText = Get-JsonPropertyString -Object $evidence -Name "completed_at"
$completedAt = if (-not [string]::IsNullOrWhiteSpace($completedAtText)) {
    try {
        [datetimeoffset]::Parse($completedAtText)
    }
    catch {
        Get-Date
    }
}
else {
    Get-Date
}

$stamp = $completedAt.ToString("yyyyMMdd-HHmmss")
$remoteNameText = Get-JsonPropertyString -Object $evidence -Name "remote_name"
$remoteName = if ([string]::IsNullOrWhiteSpace($remoteNameText)) {
    "remote"
}
else {
    $remoteNameText
}
$safeRemoteName = $remoteName -replace "[^A-Za-z0-9._-]", "_"
$baseName = "$stamp-$safeRemoteName"

New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null

$rawPath = Join-Path $OutputRoot "$baseName.evidence.json"
$verificationPath = Join-Path $OutputRoot "$baseName.verification.json"
$summaryPath = Join-Path $OutputRoot "$baseName.summary.md"

Copy-Item -LiteralPath $EvidencePath -Destination $rawPath -Force
$verification | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $verificationPath -Encoding UTF8

$rawHash = Get-FileHash -Algorithm SHA256 -LiteralPath $rawPath
$verificationHash = Get-FileHash -Algorithm SHA256 -LiteralPath $verificationPath

$summary = @"
# MUSU Multi-Device Evidence

- Version: $Version
- Verified: $($verification.ok)
- Remote: $($verification.remote_name) <$($verification.remote_addr)>
- Route checked: $($verification.route_checked)
- Route kind: $($verification.route_kind)
- Evidence: $([System.IO.Path]::GetFileName($rawPath))
- Evidence SHA256: $($rawHash.Hash.ToLowerInvariant())
- Verification: $([System.IO.Path]::GetFileName($verificationPath))
- Verification SHA256: $($verificationHash.Hash.ToLowerInvariant())
- Recorded at: $((Get-Date).ToString("o"))

This file records the second-PC release smoke evidence used by
scripts\windows\audit-desktop-release-readiness.ps1.
"@
$summary | Set-Content -LiteralPath $summaryPath -Encoding UTF8

$result = [pscustomobject]@{
    ok = $true
    version = $Version
    output_root = (Resolve-Path -LiteralPath $OutputRoot).Path
    evidence_path = (Resolve-Path -LiteralPath $rawPath).Path
    evidence_sha256 = $rawHash.Hash.ToLowerInvariant()
    verification_path = (Resolve-Path -LiteralPath $verificationPath).Path
    verification_sha256 = $verificationHash.Hash.ToLowerInvariant()
    summary_path = (Resolve-Path -LiteralPath $summaryPath).Path
    remote_addr = [string]$verification.remote_addr
    remote_name = [string]$verification.remote_name
    route_checked = [bool]$verification.route_checked
    route_kind = if ($verification.PSObject.Properties["route_kind"]) { [string]$verification.route_kind } else { $null }
}

if ($Json) {
    $result | ConvertTo-Json -Depth 6
}
else {
    $result
}
