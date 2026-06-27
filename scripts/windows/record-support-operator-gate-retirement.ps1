[CmdletBinding()]
param(
    [string]$Version,
    [string]$BaseUrl = "https://musu.pro",
    [string]$OutputRoot,
    [string]$RetirementDocPath = "docs/SUPPORT_OPERATOR_GATE_RETIREMENT_2026_06_28.md",
    [string]$Notes = "",
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
. (Join-Path $scriptDir "release-config.ps1")

if ([string]::IsNullOrWhiteSpace($Version)) {
    $Version = (Get-Content -LiteralPath (Join-Path $repoRoot "VERSION") -Raw).Trim()
}
if ([string]::IsNullOrWhiteSpace($OutputRoot)) {
    $OutputRoot = Join-Path $repoRoot ("docs\evidence\support-operator-gate-retirement\{0}" -f $Version)
}

$supportEmail = Get-MusuReleaseSupportEmail -RepoRoot $repoRoot
$retirementDocFullPath = Join-Path $repoRoot $RetirementDocPath
if (-not (Test-Path -LiteralPath $retirementDocFullPath)) {
    throw "Support operator gate retirement document not found: $retirementDocFullPath"
}

$metadataScript = Join-Path $scriptDir "verify-store-public-metadata.ps1"
$metadataText = (& powershell -NoProfile -ExecutionPolicy Bypass -File $metadataScript -BaseUrl $BaseUrl -ExpectedSupportEmail $supportEmail -Json 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0) {
    throw "Public support metadata verification failed; cannot record support operator gate retirement.`n$metadataText"
}
$publicMetadata = $metadataText | ConvertFrom-Json
if (-not [bool]$publicMetadata.ok) {
    throw "Public support metadata verification returned ok=false; cannot record support operator gate retirement."
}

New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null

$generatedAt = [datetimeoffset]::Now
$stamp = $generatedAt.ToString("yyyyMMdd-HHmmss")
$baseName = "$stamp-support-operator-gate-retirement"
$evidencePath = Join-Path $OutputRoot "$baseName.support-operator-gate-retirement.json"
$verificationPath = Join-Path $OutputRoot "$baseName.support-operator-gate-retirement-verification.json"
$summaryPath = Join-Path $OutputRoot "$baseName.summary.md"

$evidence = [pscustomobject]@{
    schema = "musu.support_operator_gate_retirement.v1"
    ok = $true
    version = $Version
    generated_at = $generatedAt.ToString("o")
    support_email = $supportEmail
    decision = "retire_historical_mailbox_delivery_gate"
    retirement_scope = "support_mailbox_delivery_evidence_only"
    support_mailbox_delivery_evidence_required = $false
    support_availability_retired = $false
    support_routes_required = $true
    public_support_metadata_required = $true
    retirement_doc_path = $RetirementDocPath
    replacement_controls = [pscustomobject]@{
        public_support_page = $true
        public_privacy_page = $true
        public_config_support_email = $true
        release_metadata_current = $true
        support_email_kept = $true
    }
    public_metadata_verification = $publicMetadata
    operator_machine = $env:COMPUTERNAME
    operator_user = $env:USERNAME
    notes = $Notes
}

$evidence | ConvertTo-Json -Depth 14 | Set-Content -LiteralPath $evidencePath -Encoding UTF8

$verifyScript = Join-Path $scriptDir "verify-support-operator-gate-retirement.ps1"
$verifyText = (& powershell -NoProfile -ExecutionPolicy Bypass -File $verifyScript -EvidencePath $evidencePath -ExpectedSupportEmail $supportEmail -ExpectedVersion $Version -Json 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0) {
    throw "Support operator gate retirement evidence did not verify.`n$verifyText"
}
$verification = $verifyText | ConvertFrom-Json
$verification | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $verificationPath -Encoding UTF8

$evidenceHash = Get-FileHash -Algorithm SHA256 -LiteralPath $evidencePath
$verificationHash = Get-FileHash -Algorithm SHA256 -LiteralPath $verificationPath

$summary = @"
# MUSU Support Operator Gate Retirement

- Version: $Version
- Verified: $($verification.ok)
- Support email: $supportEmail
- Scope: support_mailbox_delivery_evidence_only
- Public metadata base URL: $BaseUrl
- Retirement document: $RetirementDocPath
- Evidence: $([System.IO.Path]::GetFileName($evidencePath))
- Evidence SHA256: $($evidenceHash.Hash.ToLowerInvariant())
- Verification: $([System.IO.Path]::GetFileName($verificationPath))
- Verification SHA256: $($verificationHash.Hash.ToLowerInvariant())
- Recorded at: $($generatedAt.ToString("o"))

This evidence retires only the historical external mailbox delivery proof. It
does not retire support availability, the configured support email, or the
public support metadata routes.
"@
$summary | Set-Content -LiteralPath $summaryPath -Encoding UTF8

$result = [pscustomobject]@{
    ok = $true
    version = $Version
    output_root = (Resolve-Path -LiteralPath $OutputRoot).Path
    evidence_path = (Resolve-Path -LiteralPath $evidencePath).Path
    evidence_sha256 = $evidenceHash.Hash.ToLowerInvariant()
    verification_path = (Resolve-Path -LiteralPath $verificationPath).Path
    verification_sha256 = $verificationHash.Hash.ToLowerInvariant()
    summary_path = (Resolve-Path -LiteralPath $summaryPath).Path
    support_email = $supportEmail
    public_metadata_base_url = $BaseUrl
}

if ($Json) {
    $result | ConvertTo-Json -Depth 8
}
else {
    $result
}
