[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$ProductName,
    [string]$PartnerCenterProductId = "",
    [Parameter(Mandatory = $true)][string]$SubmissionId,
    [Parameter(Mandatory = $true)][string]$CertificationStatus,
    [Parameter(Mandatory = $true)][string]$RestrictedCapabilityStatus,
    [Parameter(Mandatory = $true)][string]$RecordedBy,
    [datetimeoffset]$SubmittedAt = [datetimeoffset]::Now,
    [datetimeoffset]$CertificationCompletedAt = [datetimeoffset]::Now,
    [datetimeoffset]$RestrictedCapabilityCompletedAt = [datetimeoffset]::Now,
    [string]$PublishedAt = "",
    [string]$Notes = "",
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
    $OutputRoot = Join-Path $repoRoot ("docs\evidence\store-release\{0}" -f $Version)
}

New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null

$recordedAt = [datetimeoffset]::Now
$stamp = $recordedAt.ToString("yyyyMMdd-HHmmss")
$safeProductName = $ProductName -replace "[^A-Za-z0-9._-]", "_"
$baseName = "$stamp-$safeProductName"
$evidencePath = Join-Path $OutputRoot "$baseName.evidence.json"
$verificationPath = Join-Path $OutputRoot "$baseName.verification.json"
$summaryPath = Join-Path $OutputRoot "$baseName.summary.md"

$evidence = [pscustomobject]@{
    schema = "musu.store_release_gate_evidence.v1"
    ok = $true
    version = $Version
    product_name = $ProductName
    partner_center_product_id = $PartnerCenterProductId
    submission_id = $SubmissionId
    certification_status = $CertificationStatus
    restricted_capability_status = $RestrictedCapabilityStatus
    submitted_at = $SubmittedAt.ToString("o")
    certification_completed_at = $CertificationCompletedAt.ToString("o")
    restricted_capability_completed_at = $RestrictedCapabilityCompletedAt.ToString("o")
    published_at = $PublishedAt
    recorded_at = $recordedAt.ToString("o")
    recorded_by = $RecordedBy
    operator_machine = $env:COMPUTERNAME
    operator_user = $env:USERNAME
    notes = $Notes
}

$evidence | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $evidencePath -Encoding UTF8

$verifyScript = Join-Path $scriptDir "verify-store-release-evidence.ps1"
$verifyText = (& powershell -NoProfile -ExecutionPolicy Bypass -File $verifyScript -EvidencePath $evidencePath -ExpectedVersion $Version -Json 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0) {
    throw "Store release evidence did not verify.`n$verifyText"
}
$verification = $verifyText | ConvertFrom-Json
$verification | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $verificationPath -Encoding UTF8

$evidenceHash = Get-FileHash -Algorithm SHA256 -LiteralPath $evidencePath
$verificationHash = Get-FileHash -Algorithm SHA256 -LiteralPath $verificationPath

$summary = @"
# MUSU Store Release Evidence

- Version: $Version
- Verified: $($verification.ok)
- Product name: $ProductName
- Partner Center product ID: $PartnerCenterProductId
- Submission ID: $SubmissionId
- Certification status: $CertificationStatus
- Restricted capability status: $RestrictedCapabilityStatus
- Submitted at: $($SubmittedAt.ToString("o"))
- Certification completed at: $($CertificationCompletedAt.ToString("o"))
- Restricted capability completed at: $($RestrictedCapabilityCompletedAt.ToString("o"))
- Published at: $PublishedAt
- Recorded by: $RecordedBy
- Evidence: $([System.IO.Path]::GetFileName($evidencePath))
- Evidence SHA256: $($evidenceHash.Hash.ToLowerInvariant())
- Verification: $([System.IO.Path]::GetFileName($verificationPath))
- Verification SHA256: $($verificationHash.Hash.ToLowerInvariant())
- Recorded at: $($recordedAt.ToString("o"))

This file records Partner Center submission, Microsoft certification, and
restricted startup capability approval evidence for the public desktop
release gate.
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
    product_name = $ProductName
    submission_id = $SubmissionId
    certification_status = $CertificationStatus
    restricted_capability_status = $RestrictedCapabilityStatus
}

if ($Json) {
    $result | ConvertTo-Json -Depth 6
}
else {
    $result
}
