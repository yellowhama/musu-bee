[CmdletBinding()]
param(
    [string]$SupportEmail = "support@musu.pro",
    [Parameter(Mandatory = $true)][string]$FromAddress,
    [Parameter(Mandatory = $true)][string]$ReceivedBy,
    [Parameter(Mandatory = $true)][string]$VerificationId,
    [datetimeoffset]$SentAt = [datetimeoffset]::Now,
    [datetimeoffset]$ReceivedAt = [datetimeoffset]::Now,
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
    $OutputRoot = Join-Path $repoRoot ("docs\evidence\support-mailbox\{0}" -f $Version)
}
if ([string]::IsNullOrWhiteSpace($VerificationId) -or $VerificationId -notmatch "^musu-[A-Za-z0-9._-]{16,}$") {
    throw "VerificationId must be an explicit MUSU verification token that starts with 'musu-' and has at least 16 token characters."
}

New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null

$stamp = $ReceivedAt.ToString("yyyyMMdd-HHmmss")
$safeEmail = $SupportEmail -replace "[^A-Za-z0-9._-]", "_"
$baseName = "$stamp-$safeEmail"
$evidencePath = Join-Path $OutputRoot "$baseName.evidence.json"
$verificationPath = Join-Path $OutputRoot "$baseName.verification.json"
$summaryPath = Join-Path $OutputRoot "$baseName.summary.md"

$evidence = [pscustomobject]@{
    schema = "musu.support_mailbox_evidence.v1"
    ok = $true
    version = $Version
    support_email = $SupportEmail
    verification_id = $VerificationId
    from_address = $FromAddress
    received_by = $ReceivedBy
    sent_at = $SentAt.ToString("o")
    received_at = $ReceivedAt.ToString("o")
    recorded_at = (Get-Date).ToString("o")
    operator_machine = $env:COMPUTERNAME
    operator_user = $env:USERNAME
    notes = $Notes
}

$evidence | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $evidencePath -Encoding UTF8

$verifyScript = Join-Path $scriptDir "verify-support-mailbox-evidence.ps1"
$verifyText = (& powershell -NoProfile -ExecutionPolicy Bypass -File $verifyScript -EvidencePath $evidencePath -ExpectedSupportEmail $SupportEmail -ExpectedVersion $Version -Json 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0) {
    throw "Support mailbox evidence did not verify.`n$verifyText"
}
$verification = $verifyText | ConvertFrom-Json
$verification | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $verificationPath -Encoding UTF8

$evidenceHash = Get-FileHash -Algorithm SHA256 -LiteralPath $evidencePath
$verificationHash = Get-FileHash -Algorithm SHA256 -LiteralPath $verificationPath

$summary = @"
# MUSU Support Mailbox Evidence

- Version: $Version
- Verified: $($verification.ok)
- Support mailbox: $SupportEmail
- Verification ID: $VerificationId
- From: $FromAddress
- Received by: $ReceivedBy
- Sent at: $($SentAt.ToString("o"))
- Received at: $($ReceivedAt.ToString("o"))
- Evidence: $([System.IO.Path]::GetFileName($evidencePath))
- Evidence SHA256: $($evidenceHash.Hash.ToLowerInvariant())
- Verification: $([System.IO.Path]::GetFileName($verificationPath))
- Verification SHA256: $($verificationHash.Hash.ToLowerInvariant())
- Recorded at: $((Get-Date).ToString("o"))

This file records operator-verified delivery to support@musu.pro for
the Microsoft Store submission gate.
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
    support_email = $SupportEmail
    verification_id = $VerificationId
}

if ($Json) {
    $result | ConvertTo-Json -Depth 6
}
else {
    $result
}
