[CmdletBinding()]
param(
    [string]$BaseUrl = "https://musu.pro",
    [string]$ExpectedSupportEmail = "support@musu.pro",
    [int]$TimeoutSec = 20,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$checks = New-Object System.Collections.Generic.List[object]

function Add-Check {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [ValidateSet("pass", "fail")]
        [Parameter(Mandatory = $true)][string]$Status,
        [Parameter(Mandatory = $true)][string]$Message
    )

    $checks.Add([pscustomobject]@{
        name = $Name
        status = $Status
        message = $Message
    }) | Out-Null
}

function Join-Url([string]$Base, [string]$Path) {
    $trimmedBase = $Base.TrimEnd("/")
    $trimmedPath = $Path.TrimStart("/")
    return "$trimmedBase/$trimmedPath"
}

function Read-Url([string]$Url) {
    try {
        return Invoke-WebRequest -Uri $Url -Method Get -UseBasicParsing -TimeoutSec $TimeoutSec
    }
    catch {
        Add-Check -Name $Url -Status "fail" -Message "GET failed: $($_.Exception.Message)"
        return $null
    }
}

function Test-Page {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Url,
        [Parameter(Mandatory = $true)][string[]]$RequiredText
    )

    $response = Read-Url -Url $Url
    if (-not $response) {
        return
    }

    $statusCode = [int]$response.StatusCode
    if ($statusCode -ge 200 -and $statusCode -lt 300) {
        Add-Check -Name "$Name status" -Status "pass" -Message "$Url returned HTTP $statusCode."
    }
    else {
        Add-Check -Name "$Name status" -Status "fail" -Message "$Url returned HTTP $statusCode."
        return
    }

    $content = [string]$response.Content
    foreach ($text in $RequiredText) {
        if ($content.Contains($text)) {
            Add-Check -Name "$Name content: $text" -Status "pass" -Message "$Name contains expected text '$text'."
        }
        else {
            Add-Check -Name "$Name content: $text" -Status "fail" -Message "$Name did not contain expected text '$text'."
        }
    }
}

$base = $BaseUrl.TrimEnd("/")
$privacyUrl = Join-Url -Base $base -Path "/privacy"
$supportUrl = Join-Url -Base $base -Path "/support"

Test-Page -Name "privacy" -Url $privacyUrl -RequiredText @(
    "MUSU Privacy Policy",
    "Data MUSU may process",
    $ExpectedSupportEmail
)

Test-Page -Name "support" -Url $supportUrl -RequiredText @(
    "MUSU Support",
    "Include this diagnostic evidence",
    $ExpectedSupportEmail
)

$failCount = @($checks | Where-Object { $_.status -eq "fail" }).Count
$result = [pscustomobject]@{
    ok = ($failCount -eq 0)
    base_url = $base
    privacy_url = $privacyUrl
    support_url = $supportUrl
    expected_support_email = $ExpectedSupportEmail
    fail_count = $failCount
    checks = $checks.ToArray()
}

if ($Json) {
    $result | ConvertTo-Json -Depth 6
}
else {
    "MUSU Store public metadata verification"
    "ok: $($result.ok)"
    "base_url: $($result.base_url)"
    "privacy_url: $($result.privacy_url)"
    "support_url: $($result.support_url)"
    ""
    $checks | Format-Table name, status, message -Wrap
}

if (-not $result.ok) {
    exit 1
}
