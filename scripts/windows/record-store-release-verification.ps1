[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$ProductName,
    [bool]$ProductNameReserved = $true,
    [Parameter(Mandatory = $true)][string]$ProductNameReservedAt,
    [string]$PartnerCenterProductId = "",
    [Parameter(Mandatory = $true)][string]$SubmissionId,
    [Parameter(Mandatory = $true)][string]$CertificationStatus,
    [Parameter(Mandatory = $true)][string]$RestrictedCapabilityStatus,
    [Parameter(Mandatory = $true)][string]$RecordedBy,
    [datetimeoffset]$SubmittedAt = [datetimeoffset]::Now,
    [datetimeoffset]$CertificationCompletedAt = [datetimeoffset]::Now,
    [datetimeoffset]$RestrictedCapabilityCompletedAt = [datetimeoffset]::Now,
    [string]$PublishedAt = "",
    [Parameter(Mandatory = $true)][string]$StoreSignedInstallEvidencePath,
    [Parameter(Mandatory = $true)][string]$StoreDesktopEntrypointEvidencePath,
    [ValidateSet("microsoft_store")]
    [string]$StoreInstallSource = "microsoft_store",
    [Parameter(Mandatory = $true)][string]$StoreInstallObservedAt,
    [Parameter(Mandatory = $true)][string]$StoreLaunchObservedAt,
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
if ([string]::IsNullOrWhiteSpace($ProductNameReservedAt)) {
    throw "ProductNameReservedAt is required. Record the actual Partner Center product-name reservation timestamp; do not infer it from submission time."
}
$resolvedProductNameReservedAt = [datetimeoffset]::Parse($ProductNameReservedAt)
$resolvedStoreInstallObservedAt = [datetimeoffset]::Parse($StoreInstallObservedAt)
$resolvedStoreLaunchObservedAt = [datetimeoffset]::Parse($StoreLaunchObservedAt)
if ($resolvedStoreLaunchObservedAt -lt $resolvedStoreInstallObservedAt) {
    throw "StoreLaunchObservedAt must be at or after StoreInstallObservedAt."
}

$stamp = $recordedAt.ToString("yyyyMMdd-HHmmss")
$safeProductName = $ProductName -replace "[^A-Za-z0-9._-]", "_"
$baseName = "$stamp-$safeProductName"
$evidencePath = Join-Path $OutputRoot "$baseName.evidence.json"
$verificationPath = Join-Path $OutputRoot "$baseName.verification.json"
$summaryPath = Join-Path $OutputRoot "$baseName.summary.md"

function Read-EvidenceJsonWithHash {
    param([Parameter(Mandatory = $true)][string]$Path)

    $resolved = (Resolve-Path -LiteralPath $Path).Path
    $json = Get-Content -LiteralPath $resolved -Raw | ConvertFrom-Json
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $resolved).Hash.ToLowerInvariant()
    [pscustomobject]@{
        path = $resolved
        sha256 = $hash
        json = $json
    }
}

function Invoke-JsonScriptOrThrow {
    param(
        [Parameter(Mandatory = $true)][string]$ScriptPath,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [Parameter(Mandatory = $true)][string]$Name
    )

    $text = (& powershell -NoProfile -ExecutionPolicy Bypass -File $ScriptPath @Arguments 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -ne 0) {
        throw "$Name did not verify.`n$text"
    }
    return ($text | ConvertFrom-Json)
}

$storeSignedInstall = Read-EvidenceJsonWithHash -Path $StoreSignedInstallEvidencePath
$storeDesktopEntrypoint = Read-EvidenceJsonWithHash -Path $StoreDesktopEntrypointEvidencePath

$msixInstallVerifier = Join-Path $scriptDir "verify-msix-install-evidence.ps1"
$storeSignedInstallVerification = Invoke-JsonScriptOrThrow `
    -ScriptPath $msixInstallVerifier `
    -Arguments @(
        "-EvidencePath", $storeSignedInstall.path,
        "-ExpectedVersion", $Version,
        "-ExpectedStartupContract", "store-reviewed-immediate-registration",
        "-AliasShadowingMode", "fail",
        "-Json"
    ) `
    -Name "Store-signed MSIX install evidence"

$entryInstalled = if ($storeDesktopEntrypoint.json -and $storeDesktopEntrypoint.json.PSObject.Properties["installed"]) {
    $storeDesktopEntrypoint.json.installed
} else {
    $null
}
$entrypointOk = (
    [string]$storeDesktopEntrypoint.json.schema -eq "musu.msix_desktop_entrypoint_audit.v1" -and
    [bool]$storeDesktopEntrypoint.json.ok -and
    [string]$storeDesktopEntrypoint.json.version -eq $Version -and
    [string]$storeDesktopEntrypoint.json.startup_contract -eq "store-reviewed-immediate-registration" -and
    [bool]$storeDesktopEntrypoint.json.require_installed_package -and
    [string]$storeDesktopEntrypoint.json.expected_application_executable -eq "musu-desktop.exe" -and
    $entryInstalled -and
    [bool]$entryInstalled.start_menu_entry -and
    [string]$entryInstalled.application_executable -eq "musu-desktop.exe" -and
    [bool]$entryInstalled.startup_contract_matches_artifact -and
    [bool]$entryInstalled.contains_expected_application_executable
)
if (-not $entrypointOk) {
    throw "Store desktop entrypoint evidence must be a passing installed store-reviewed-immediate-registration audit for musu-desktop.exe."
}

$evidence = [pscustomobject]@{
    schema = "musu.store_release_gate_evidence.v1"
    ok = $true
    version = $Version
    product_name = $ProductName
    product_name_reserved = [bool]$ProductNameReserved
    product_name_reserved_at = $resolvedProductNameReservedAt.ToString("o")
    partner_center_product_id = $PartnerCenterProductId
    submission_id = $SubmissionId
    certification_status = $CertificationStatus
    restricted_capability_status = $RestrictedCapabilityStatus
    submitted_at = $SubmittedAt.ToString("o")
    certification_completed_at = $CertificationCompletedAt.ToString("o")
    restricted_capability_completed_at = $RestrictedCapabilityCompletedAt.ToString("o")
    published_at = $PublishedAt
    store_install_source = $StoreInstallSource
    store_install_observed_at = $resolvedStoreInstallObservedAt.ToString("o")
    store_launch_observed_at = $resolvedStoreLaunchObservedAt.ToString("o")
    store_signed_install_evidence_path = $storeSignedInstall.path
    store_signed_install_evidence_sha256 = $storeSignedInstall.sha256
    store_signed_install_evidence = $storeSignedInstall.json
    store_signed_install_verification = $storeSignedInstallVerification
    store_desktop_entrypoint_evidence_path = $storeDesktopEntrypoint.path
    store_desktop_entrypoint_evidence_sha256 = $storeDesktopEntrypoint.sha256
    store_desktop_entrypoint_evidence = $storeDesktopEntrypoint.json
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
- Product name reserved: $ProductNameReserved
- Product name reserved at: $($resolvedProductNameReservedAt.ToString("o"))
- Partner Center product ID: $PartnerCenterProductId
- Submission ID: $SubmissionId
- Certification status: $CertificationStatus
- Restricted capability status: $RestrictedCapabilityStatus
- Submitted at: $($SubmittedAt.ToString("o"))
- Certification completed at: $($CertificationCompletedAt.ToString("o"))
- Restricted capability completed at: $($RestrictedCapabilityCompletedAt.ToString("o"))
- Published at: $PublishedAt
- Store install source: $StoreInstallSource
- Store install observed at: $($resolvedStoreInstallObservedAt.ToString("o"))
- Store launch observed at: $($resolvedStoreLaunchObservedAt.ToString("o"))
- Store signed install evidence: $([System.IO.Path]::GetFileName($storeSignedInstall.path))
- Store signed install evidence SHA256: $($storeSignedInstall.sha256)
- Store desktop entrypoint evidence: $([System.IO.Path]::GetFileName($storeDesktopEntrypoint.path))
- Store desktop entrypoint evidence SHA256: $($storeDesktopEntrypoint.sha256)
- Recorded by: $RecordedBy
- Evidence: $([System.IO.Path]::GetFileName($evidencePath))
- Evidence SHA256: $($evidenceHash.Hash.ToLowerInvariant())
- Verification: $([System.IO.Path]::GetFileName($verificationPath))
- Verification SHA256: $($verificationHash.Hash.ToLowerInvariant())
- Recorded at: $($recordedAt.ToString("o"))

This file records Partner Center submission, Microsoft certification, and
restricted startup capability approval evidence for the public desktop release
gate. Product name reservation is recorded separately in the same evidence so
the Partner Center identity step remains auditable.
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
    product_name_reserved = [bool]$ProductNameReserved
    submission_id = $SubmissionId
    certification_status = $CertificationStatus
    restricted_capability_status = $RestrictedCapabilityStatus
    store_install_source = $StoreInstallSource
    store_signed_install_evidence_path = (Resolve-Path -LiteralPath $storeSignedInstall.path).Path
    store_desktop_entrypoint_evidence_path = (Resolve-Path -LiteralPath $storeDesktopEntrypoint.path).Path
}

if ($Json) {
    $result | ConvertTo-Json -Depth 6
}
else {
    $result
}
