[CmdletBinding()]
param(
    [string]$MsixInstallEvidencePath,
    [string]$MsixInstallOutputRoot,
    [string]$MultiDeviceEvidencePath,
    [string]$ExpectedRouteOutput = "MUSU_REMOTE_ROUTE_OK",
    [switch]$AllowStatusOnly,
    [string]$SupportEmail,
    [string]$SupportFromAddress,
    [string]$SupportReceivedBy,
    [string]$SupportVerificationId,
    [string]$SupportSentAt,
    [string]$SupportReceivedAt,
    [string]$SupportNotes = "",
    [string]$StoreProductName = "MUSU",
    [string]$StoreProductNameReservedAt,
    [string]$StorePartnerCenterProductId = "",
    [string]$StoreSubmissionId,
    [string]$StoreCertificationStatus,
    [string]$StoreRestrictedCapabilityStatus,
    [string]$StoreRecordedBy,
    [string]$StoreSubmittedAt,
    [string]$StoreCertificationCompletedAt,
    [string]$StoreRestrictedCapabilityCompletedAt,
    [string]$StorePublishedAt,
    [string]$StoreNotes = "",
    [string]$StoreOutputRoot,
    [string]$PublicMetadataBaseUrl = "https://musu.pro",
    [switch]$SkipPublicMetadata,
    [switch]$FailOnNotReady,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
. (Join-Path $scriptDir "release-config.ps1")

if ([string]::IsNullOrWhiteSpace($SupportEmail)) {
    $SupportEmail = Get-MusuReleaseSupportEmail -RepoRoot $repoRoot
}

function Get-CurrentPowerShellExecutable {
    $currentProcessPath = $null
    try {
        $currentProcessPath = [System.Diagnostics.Process]::GetCurrentProcess().MainModule.FileName
    }
    catch {
        $currentProcessPath = $null
    }

    if (-not [string]::IsNullOrWhiteSpace($currentProcessPath) -and (Test-Path -LiteralPath $currentProcessPath)) {
        return $currentProcessPath
    }

    $edition = if ($PSVersionTable.ContainsKey("PSEdition")) { [string]$PSVersionTable.PSEdition } else { "" }
    if ($edition -eq "Core") {
        return "pwsh"
    }
    return "powershell.exe"
}

$powerShellExecutable = Get-CurrentPowerShellExecutable

function Invoke-JsonScript {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [string[]]$Arguments = @()
    )

    $output = & $powerShellExecutable -NoProfile -ExecutionPolicy Bypass -File $FilePath @Arguments 2>&1
    $exitCode = $LASTEXITCODE
    $text = ($output | Out-String).Trim()

    if ($exitCode -ne 0) {
        throw "Script failed with exit code ${exitCode}: $FilePath`n$text"
    }
    if ([string]::IsNullOrWhiteSpace($text)) {
        throw "Script returned empty output: $FilePath"
    }

    try {
        return ($text | ConvertFrom-Json)
    }
    catch {
        throw "Script did not return parseable JSON: $FilePath`n$text"
    }
}

$records = New-Object System.Collections.Generic.List[object]

if (-not [string]::IsNullOrWhiteSpace($MsixInstallEvidencePath)) {
    $msixArgs = @("-EvidencePath", $MsixInstallEvidencePath, "-Json")
    if (-not [string]::IsNullOrWhiteSpace($MsixInstallOutputRoot)) {
        $msixArgs += @("-OutputRoot", $MsixInstallOutputRoot)
    }
    $msixRecord = Invoke-JsonScript `
        -FilePath (Join-Path $scriptDir "record-msix-install-evidence.ps1") `
        -Arguments $msixArgs

    $records.Add([pscustomobject]@{
        type = "msix-install"
        ok = [bool]$msixRecord.ok
        result = $msixRecord
    }) | Out-Null
}

if (-not [string]::IsNullOrWhiteSpace($MultiDeviceEvidencePath)) {
    $multiArgs = @(
        "-EvidencePath", $MultiDeviceEvidencePath,
        "-ExpectedRouteOutput", $ExpectedRouteOutput,
        "-Json"
    )
    if ($AllowStatusOnly) {
        $multiArgs += "-AllowStatusOnly"
    }

    $multiRecord = Invoke-JsonScript `
        -FilePath (Join-Path $scriptDir "record-multidevice-evidence.ps1") `
        -Arguments $multiArgs

    $records.Add([pscustomobject]@{
        type = "multi-device"
        ok = [bool]$multiRecord.ok
        result = $multiRecord
    }) | Out-Null
}

$supportFieldsProvided = @(
    $SupportFromAddress,
    $SupportReceivedBy,
    $SupportVerificationId,
    $SupportSentAt,
    $SupportReceivedAt,
    $SupportNotes
) | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) }

if (@($supportFieldsProvided).Count -gt 0) {
    if ([string]::IsNullOrWhiteSpace($SupportFromAddress) `
        -or [string]::IsNullOrWhiteSpace($SupportReceivedBy) `
        -or [string]::IsNullOrWhiteSpace($SupportVerificationId)) {
        throw "Support evidence recording requires -SupportFromAddress, -SupportReceivedBy, and -SupportVerificationId."
    }

    $supportArgs = @(
        "-SupportEmail", $SupportEmail,
        "-FromAddress", $SupportFromAddress,
        "-ReceivedBy", $SupportReceivedBy,
        "-Json"
    )
    if (-not [string]::IsNullOrWhiteSpace($SupportVerificationId)) {
        $supportArgs += @("-VerificationId", $SupportVerificationId)
    }
    if (-not [string]::IsNullOrWhiteSpace($SupportSentAt)) {
        $supportArgs += @("-SentAt", $SupportSentAt)
    }
    if (-not [string]::IsNullOrWhiteSpace($SupportReceivedAt)) {
        $supportArgs += @("-ReceivedAt", $SupportReceivedAt)
    }
    if (-not [string]::IsNullOrWhiteSpace($SupportNotes)) {
        $supportArgs += @("-Notes", $SupportNotes)
    }

    $supportRecord = Invoke-JsonScript `
        -FilePath (Join-Path $scriptDir "record-support-mailbox-verification.ps1") `
        -Arguments $supportArgs

    $records.Add([pscustomobject]@{
        type = "support-mailbox"
        ok = [bool]$supportRecord.ok
        result = $supportRecord
    }) | Out-Null
}

$storeFieldsProvided = @(
    $StorePartnerCenterProductId,
    $StoreSubmissionId,
    $StoreCertificationStatus,
    $StoreRestrictedCapabilityStatus,
    $StoreRecordedBy,
    $StoreProductNameReservedAt,
    $StoreSubmittedAt,
    $StoreCertificationCompletedAt,
    $StoreRestrictedCapabilityCompletedAt,
    $StorePublishedAt,
    $StoreNotes
) | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) }

if (@($storeFieldsProvided).Count -gt 0) {
    if ([string]::IsNullOrWhiteSpace($StoreProductName) `
        -or [string]::IsNullOrWhiteSpace($StoreSubmissionId) `
        -or [string]::IsNullOrWhiteSpace($StoreCertificationStatus) `
        -or [string]::IsNullOrWhiteSpace($StoreRestrictedCapabilityStatus) `
        -or [string]::IsNullOrWhiteSpace($StoreRecordedBy) `
        -or [string]::IsNullOrWhiteSpace($StoreProductNameReservedAt)) {
        throw "Store release evidence recording requires -StoreProductName, -StoreProductNameReservedAt, -StoreSubmissionId, -StoreCertificationStatus, -StoreRestrictedCapabilityStatus, and -StoreRecordedBy."
    }

    $storeArgs = @(
        "-ProductName", $StoreProductName,
        "-ProductNameReservedAt", $StoreProductNameReservedAt,
        "-SubmissionId", $StoreSubmissionId,
        "-CertificationStatus", $StoreCertificationStatus,
        "-RestrictedCapabilityStatus", $StoreRestrictedCapabilityStatus,
        "-RecordedBy", $StoreRecordedBy,
        "-Json"
    )
    if (-not [string]::IsNullOrWhiteSpace($StorePartnerCenterProductId)) {
        $storeArgs += @("-PartnerCenterProductId", $StorePartnerCenterProductId)
    }
    if (-not [string]::IsNullOrWhiteSpace($StoreSubmittedAt)) {
        $storeArgs += @("-SubmittedAt", $StoreSubmittedAt)
    }
    if (-not [string]::IsNullOrWhiteSpace($StoreCertificationCompletedAt)) {
        $storeArgs += @("-CertificationCompletedAt", $StoreCertificationCompletedAt)
    }
    if (-not [string]::IsNullOrWhiteSpace($StoreRestrictedCapabilityCompletedAt)) {
        $storeArgs += @("-RestrictedCapabilityCompletedAt", $StoreRestrictedCapabilityCompletedAt)
    }
    if (-not [string]::IsNullOrWhiteSpace($StorePublishedAt)) {
        $storeArgs += @("-PublishedAt", $StorePublishedAt)
    }
    if (-not [string]::IsNullOrWhiteSpace($StoreNotes)) {
        $storeArgs += @("-Notes", $StoreNotes)
    }
    if (-not [string]::IsNullOrWhiteSpace($StoreOutputRoot)) {
        $storeArgs += @("-OutputRoot", $StoreOutputRoot)
    }

    $storeRecord = Invoke-JsonScript `
        -FilePath (Join-Path $scriptDir "record-store-release-verification.ps1") `
        -Arguments $storeArgs

    $records.Add([pscustomobject]@{
        type = "store-release"
        ok = [bool]$storeRecord.ok
        result = $storeRecord
    }) | Out-Null
}

$manifestOutput = & $powerShellExecutable -NoProfile -ExecutionPolicy Bypass -File (Join-Path $scriptDir "write-release-candidate-manifest.ps1") 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "Release candidate manifest generation failed.`n$(($manifestOutput | Out-String).Trim())"
}

$goNoGoArgs = @("-Json")
if ($SkipPublicMetadata) {
    $goNoGoArgs += "-SkipPublicMetadata"
}
else {
    $goNoGoArgs += @("-PublicMetadataBaseUrl", $PublicMetadataBaseUrl)
}

$goNoGo = Invoke-JsonScript `
    -FilePath (Join-Path $scriptDir "write-release-go-no-go.ps1") `
    -Arguments $goNoGoArgs

$result = [pscustomobject]@{
    schema = "musu.complete_final_operator_gates.v1"
    generated_at = (Get-Date).ToString("o")
    recorded = $records.ToArray()
    ready_for_public_desktop_release = [bool]$goNoGo.ready_for_public_desktop_release
    msix_install_verified = [bool]$goNoGo.msix_install_verified
    store_release_verified = [bool]$goNoGo.store_release_verified
    blockers = $goNoGo.blockers
    warnings = $goNoGo.warnings
    go_no_go = $goNoGo
}

if ($Json) {
    $result | ConvertTo-Json -Depth 10
}
else {
    "MUSU complete final operator gates"
    "ready_for_public_desktop_release: $($result.ready_for_public_desktop_release)"
    "msix_install_verified: $($result.msix_install_verified)"
    "store_release_verified: $($result.store_release_verified)"
    ""
    "Recorded evidence"
    if ($records.Count -eq 0) {
        "- none supplied"
    }
    else {
        $records | Format-Table type, ok -Wrap
    }
    ""
    "Blockers"
    if (@($goNoGo.blockers).Count -eq 0) {
        "- none"
    }
    else {
        $goNoGo.blockers | Format-Table area, message -Wrap
    }
}

if ($FailOnNotReady -and -not [bool]$goNoGo.ready_for_public_desktop_release) {
    exit 1
}
