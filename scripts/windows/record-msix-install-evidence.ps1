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

if ([string]::IsNullOrWhiteSpace($Version)) {
    $Version = (Get-Content -LiteralPath (Join-Path $repoRoot "VERSION") -Raw).Trim()
}
if ([string]::IsNullOrWhiteSpace($OutputRoot)) {
    $OutputRoot = Join-Path $repoRoot ("docs\evidence\msix-install\{0}" -f $Version)
}
if (-not (Test-Path -LiteralPath $EvidencePath)) {
    throw "MSIX install evidence file not found: $EvidencePath"
}

$verifyScript = Join-Path $scriptDir "verify-msix-install-evidence.ps1"
$verifyText = (& powershell -NoProfile -ExecutionPolicy Bypass -File $verifyScript -EvidencePath $EvidencePath -ExpectedVersion $Version -Json 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0) {
    throw "MSIX install evidence did not verify.`n$verifyText"
}
$verification = $verifyText | ConvertFrom-Json
$evidence = Get-Content -LiteralPath $EvidencePath -Raw | ConvertFrom-Json

$recordedAtText = [string]$evidence.recorded_at
$recordedAt = if (-not [string]::IsNullOrWhiteSpace($recordedAtText)) {
    try {
        [datetimeoffset]::Parse($recordedAtText)
    }
    catch {
        Get-Date
    }
}
else {
    Get-Date
}

$machine = if ([string]::IsNullOrWhiteSpace([string]$evidence.operator_machine)) {
    "machine"
}
else {
    [string]$evidence.operator_machine
}
$safeMachine = $machine -replace "[^A-Za-z0-9._-]", "_"
$baseName = "{0}-{1}" -f $recordedAt.ToString("yyyyMMdd-HHmmss"), $safeMachine

New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null
$rawPath = Join-Path $OutputRoot "$baseName.evidence.json"
$verificationPath = Join-Path $OutputRoot "$baseName.verification.json"
$summaryPath = Join-Path $OutputRoot "$baseName.summary.md"

Copy-Item -LiteralPath $EvidencePath -Destination $rawPath -Force
$verification | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $verificationPath -Encoding UTF8

$rawHash = Get-FileHash -Algorithm SHA256 -LiteralPath $rawPath
$verificationHash = Get-FileHash -Algorithm SHA256 -LiteralPath $verificationPath

$summary = @"
# MUSU MSIX Install Evidence

- Version: $Version
- Verified: $($verification.ok)
- Startup contract: $($verification.startup_contract)
- Package: $($verification.package_full_name)
- Install location: $($verification.install_location)
- Evidence: $([System.IO.Path]::GetFileName($rawPath))
- Evidence SHA256: $($rawHash.Hash.ToLowerInvariant())
- Verification: $([System.IO.Path]::GetFileName($verificationPath))
- Verification SHA256: $($verificationHash.Hash.ToLowerInvariant())
- Recorded at: $((Get-Date).ToString("o"))

This file records a Windows MSIX install proof for the release gate. It is
separate from the multi-device route smoke so package install, alias, startup
contract, and legacy-conflict state remain auditable.
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
    startup_contract = [string]$verification.startup_contract
    package_full_name = [string]$verification.package_full_name
}

if ($Json) {
    $result | ConvertTo-Json -Depth 6
}
else {
    $result
}
