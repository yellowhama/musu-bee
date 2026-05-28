[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$EvidencePath,
    [string]$Version,
    [string]$OutputRoot,
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
    $OutputRoot = Join-Path $repoRoot ("docs\evidence\single-machine\{0}" -f $Version)
}
if (-not (Test-Path -LiteralPath $EvidencePath)) {
    throw "Evidence file not found: $EvidencePath"
}

$verifyScript = Join-Path $scriptDir "verify-single-machine-evidence.ps1"
$verifyText = (& powershell -NoProfile -ExecutionPolicy Bypass -File $verifyScript -EvidencePath (Resolve-Path -LiteralPath $EvidencePath).Path -Json 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0) {
    throw "Single-machine evidence did not verify.`n$verifyText"
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

$machineText = Get-JsonPropertyString -Object $evidence -Name "machine"
$machine = if ([string]::IsNullOrWhiteSpace($machineText)) { "machine" } else { $machineText }
$safeMachine = $machine -replace "[^A-Za-z0-9._-]", "_"
$stamp = $completedAt.ToString("yyyyMMdd-HHmmss")
$baseName = "$stamp-$safeMachine"

New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null

$rawPath = Join-Path $OutputRoot "$baseName.evidence.json"
$verificationPath = Join-Path $OutputRoot "$baseName.verification.json"
$summaryPath = Join-Path $OutputRoot "$baseName.summary.md"

Copy-Item -LiteralPath $EvidencePath -Destination $rawPath -Force
$verification | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $verificationPath -Encoding UTF8

$rawHash = Get-FileHash -Algorithm SHA256 -LiteralPath $rawPath
$verificationHash = Get-FileHash -Algorithm SHA256 -LiteralPath $verificationPath

$summary = @"
# MUSU Single-Machine Evidence

- Version: $Version
- Verified: $($verification.ok)
- Git commit: $($verification.git_commit)
- Dashboard task id: $($verification.dashboard_task_id)
- Bridge URL: $($verification.bridge_url)
- CLI route checked: $($verification.cli_route_checked)
- Evidence: $([System.IO.Path]::GetFileName($rawPath))
- Evidence SHA256: $($rawHash.Hash.ToLowerInvariant())
- Verification: $([System.IO.Path]::GetFileName($verificationPath))
- Verification SHA256: $($verificationHash.Hash.ToLowerInvariant())
- Recorded at: $((Get-Date).ToString("o"))

This file records the single-machine release smoke evidence used by
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
    git_commit = [string]$verification.git_commit
    dashboard_task_id = [string]$verification.dashboard_task_id
    bridge_url = [string]$verification.bridge_url
    cli_route_checked = [bool]$verification.cli_route_checked
}

if ($Json) {
    $result | ConvertTo-Json -Depth 6
}
else {
    $result
}
