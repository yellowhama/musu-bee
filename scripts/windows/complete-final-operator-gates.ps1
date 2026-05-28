[CmdletBinding()]
param(
    [string]$MultiDeviceEvidencePath,
    [string]$ExpectedRouteOutput = "MUSU_REMOTE_ROUTE_OK",
    [switch]$AllowStatusOnly,
    [string]$SupportEmail = "support@musu.pro",
    [string]$SupportFromAddress,
    [string]$SupportReceivedBy,
    [string]$SupportVerificationId,
    [string]$SupportSentAt,
    [string]$SupportReceivedAt,
    [string]$SupportNotes = "",
    [string]$PublicMetadataBaseUrl = "https://musu.pro",
    [switch]$SkipPublicMetadata,
    [switch]$FailOnNotReady,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

function Invoke-JsonScript {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [string[]]$Arguments = @()
    )

    $output = & powershell -NoProfile -ExecutionPolicy Bypass -File $FilePath @Arguments 2>&1
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
    if ([string]::IsNullOrWhiteSpace($SupportFromAddress) -or [string]::IsNullOrWhiteSpace($SupportReceivedBy)) {
        throw "Support evidence recording requires both -SupportFromAddress and -SupportReceivedBy."
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

$manifestOutput = & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $scriptDir "write-release-candidate-manifest.ps1") 2>&1
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
