[CmdletBinding()]
param(
    [string]$BaseUrl = "https://musu.pro",
    [string]$ExpectedSupportEmail,
    [string[]]$ExpectedNameservers = @("ns1.vercel-dns.com", "ns2.vercel-dns.com"),
    [int]$TimeoutSec = 20,
    [switch]$SkipDnsDiagnostics,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
. (Join-Path $scriptDir "release-config.ps1")

if ([string]::IsNullOrWhiteSpace($ExpectedSupportEmail)) {
    $ExpectedSupportEmail = Get-MusuReleaseSupportEmail -RepoRoot $repoRoot
}
$expectedReleaseVersion = (Get-Content -LiteralPath (Join-Path $repoRoot "VERSION") -Raw).Trim()
$expectedReleaseMetadataText = "MUSU public release metadata: $expectedReleaseVersion"

$checks = New-Object System.Collections.Generic.List[object]
$pages = New-Object System.Collections.Generic.List[object]
$publicConfigEvidence = $null
$dnsDiagnostics = $null

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
        $statusCode = $null
        try {
            if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
                $statusCode = [int]$_.Exception.Response.StatusCode
            }
        }
        catch {
            $statusCode = $null
        }
        if ($null -ne $statusCode) {
            return [pscustomobject]@{
                StatusCode = $statusCode
                Content = ""
            }
        }
        Add-Check -Name $Url -Status "fail" -Message "GET failed: $($_.Exception.Message)"
        return $null
    }
}

function Get-Sha256Hex([string]$Text) {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
        $hash = $sha.ComputeHash($bytes)
        return ([BitConverter]::ToString($hash) -replace "-", "").ToLowerInvariant()
    }
    finally {
        $sha.Dispose()
    }
}

function Get-ContentSnippet([string]$Text) {
    $normalized = ([regex]::Replace($Text, "\s+", " ")).Trim()
    if ($normalized.Length -le 240) {
        return $normalized
    }
    return $normalized.Substring(0, 240)
}

function Normalize-DnsName([string]$Value) {
    if ([string]::IsNullOrWhiteSpace($Value)) {
        return ""
    }
    return $Value.Trim().TrimEnd(".").ToLowerInvariant()
}

function Resolve-DnsValues {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Type,
        [Parameter(Mandatory = $true)][string]$Property
    )

    try {
        return @(
            Resolve-DnsName -Name $Name -Type $Type -ErrorAction Stop |
                Where-Object { $_.Type -eq $Type -and $_.PSObject.Properties[$Property] } |
                ForEach-Object { [string]$_.$Property } |
                Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
                Sort-Object -Unique
        )
    }
    catch {
        return @()
    }
}

function Get-PublicMetadataDnsDiagnostics {
    param(
        [Parameter(Mandatory = $true)][string]$Base,
        [string[]]$ExpectedNs
    )

    $hostName = ""
    try {
        $hostName = ([uri]$Base).Host
    }
    catch {
        return [pscustomobject]@{
            host = ""
            ok = $false
            error = "base_url_parse_failed"
            expected_nameservers = @($ExpectedNs)
            current_nameservers = @()
            missing_expected_nameservers = @()
            unexpected_nameservers = @()
            nameserver_check_applicable = $false
            nameserver_matches_expected = $false
            provider_guess = "unknown"
            a_records = @()
            aaaa_records = @()
        }
    }

    $normalizedExpected = @(
        $ExpectedNs |
            ForEach-Object { Normalize-DnsName -Value ([string]$_) } |
            Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
            Sort-Object -Unique
    )
    $currentNs = @(
        Resolve-DnsValues -Name $hostName -Type "NS" -Property "NameHost" |
            ForEach-Object { Normalize-DnsName -Value $_ } |
            Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
            Sort-Object -Unique
    )
    $aRecords = @(Resolve-DnsValues -Name $hostName -Type "A" -Property "IPAddress")
    $aaaaRecords = @(Resolve-DnsValues -Name $hostName -Type "AAAA" -Property "IPAddress")
    $nameserverCheckApplicable = ($hostName -eq "musu.pro" -or $hostName.EndsWith(".musu.pro"))
    $missingExpected = @($normalizedExpected | Where-Object { $currentNs -notcontains $_ })
    $unexpected = @($currentNs | Where-Object { $normalizedExpected -notcontains $_ })
    $matchesExpected = (
        $nameserverCheckApplicable -and
        $normalizedExpected.Count -gt 0 -and
        $missingExpected.Count -eq 0 -and
        $unexpected.Count -eq 0
    )
    $providerGuess = "unknown"
    if (@($currentNs | Where-Object { $_ -like "*.cloudflare.com" }).Count -gt 0) {
        $providerGuess = "cloudflare"
    }
    elseif (@($currentNs | Where-Object { $_ -like "*.vercel-dns.com" }).Count -gt 0) {
        $providerGuess = "vercel"
    }
    elseif ($currentNs.Count -gt 0) {
        $providerGuess = "third_party"
    }

    return [pscustomobject]@{
        host = $hostName
        ok = $true
        error = $null
        expected_nameservers = @($normalizedExpected)
        current_nameservers = @($currentNs)
        missing_expected_nameservers = @($missingExpected)
        unexpected_nameservers = @($unexpected)
        nameserver_check_applicable = [bool]$nameserverCheckApplicable
        nameserver_matches_expected = [bool]$matchesExpected
        provider_guess = $providerGuess
        a_records = @($aRecords)
        aaaa_records = @($aaaaRecords)
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
        $pages.Add([pscustomobject]@{
            name = $Name
            url = $Url
            ok = $false
            failure_kind = "request_failed"
            status_code = $null
            content_length = 0
            content_sha256 = $null
            required_text = $RequiredText
            missing_text = $RequiredText
            matched_text = @()
            content_snippet = ""
        }) | Out-Null
        return
    }

    $statusCode = [int]$response.StatusCode
    $content = [string]$response.Content
    $matchedText = New-Object System.Collections.Generic.List[string]
    $missingText = New-Object System.Collections.Generic.List[string]

    if ($statusCode -ge 200 -and $statusCode -lt 300) {
        Add-Check -Name "$Name status" -Status "pass" -Message "$Url returned HTTP $statusCode."
    }
    else {
        Add-Check -Name "$Name status" -Status "fail" -Message "$Url returned HTTP $statusCode."
        $pages.Add([pscustomobject]@{
            name = $Name
            url = $Url
            ok = $false
            failure_kind = "http_not_success"
            status_code = $statusCode
            content_length = $content.Length
            content_sha256 = Get-Sha256Hex -Text $content
            required_text = $RequiredText
            missing_text = $RequiredText
            matched_text = @()
            content_snippet = Get-ContentSnippet -Text $content
        }) | Out-Null
        return
    }

    foreach ($text in $RequiredText) {
        if ($content.Contains($text)) {
            $matchedText.Add($text) | Out-Null
            Add-Check -Name "$Name content: $text" -Status "pass" -Message "$Name contains expected text '$text'."
        }
        else {
            $missingText.Add($text) | Out-Null
            Add-Check -Name "$Name content: $text" -Status "fail" -Message "$Name did not contain expected text '$text'."
        }
    }

    $pageOk = ($missingText.Count -eq 0)
    $pages.Add([pscustomobject]@{
        name = $Name
        url = $Url
        ok = [bool]$pageOk
        failure_kind = if ($pageOk) { $null } else { "content_mismatch" }
        status_code = $statusCode
        content_length = $content.Length
        content_sha256 = Get-Sha256Hex -Text $content
        required_text = $RequiredText
        missing_text = $missingText.ToArray()
        matched_text = $matchedText.ToArray()
        content_snippet = Get-ContentSnippet -Text $content
    }) | Out-Null
}

function Test-PublicConfig {
    param(
        [Parameter(Mandatory = $true)][string]$Url,
        [Parameter(Mandatory = $true)][hashtable]$RequiredFields
    )

    $response = Read-Url -Url $Url
    if (-not $response) {
        return [pscustomobject]@{
            url = $Url
            ok = $false
            failure_kind = "request_failed"
            status_code = $null
            content_length = 0
            content_sha256 = $null
            missing_fields = @($RequiredFields.Keys)
            mismatched_fields = @()
            matched_fields = @()
            content_snippet = ""
        }
    }

    $statusCode = [int]$response.StatusCode
    $content = [string]$response.Content
    if ($statusCode -lt 200 -or $statusCode -ge 300) {
        Add-Check -Name "public-config status" -Status "fail" -Message "$Url returned HTTP $statusCode."
        return [pscustomobject]@{
            url = $Url
            ok = $false
            failure_kind = "http_not_success"
            status_code = $statusCode
            content_length = $content.Length
            content_sha256 = Get-Sha256Hex -Text $content
            missing_fields = @($RequiredFields.Keys)
            mismatched_fields = @()
            matched_fields = @()
            content_snippet = Get-ContentSnippet -Text $content
        }
    }

    Add-Check -Name "public-config status" -Status "pass" -Message "$Url returned HTTP $statusCode."

    $parsed = $null
    try {
        $parsed = $content | ConvertFrom-Json
    }
    catch {
        Add-Check -Name "public-config JSON" -Status "fail" -Message "$Url did not return parseable JSON."
        return [pscustomobject]@{
            url = $Url
            ok = $false
            failure_kind = "json_parse_failed"
            status_code = $statusCode
            content_length = $content.Length
            content_sha256 = Get-Sha256Hex -Text $content
            missing_fields = @($RequiredFields.Keys)
            mismatched_fields = @()
            matched_fields = @()
            content_snippet = Get-ContentSnippet -Text $content
        }
    }

    $missingFields = New-Object System.Collections.Generic.List[string]
    $mismatchedFields = New-Object System.Collections.Generic.List[object]
    $matchedFields = New-Object System.Collections.Generic.List[string]

    foreach ($field in $RequiredFields.Keys) {
        $expected = [string]$RequiredFields[$field]
        if (-not $parsed.PSObject.Properties[$field]) {
            $missingFields.Add([string]$field) | Out-Null
            Add-Check -Name "public-config field: $field" -Status "fail" -Message "public-config is missing '$field'."
            continue
        }

        $actual = [string]$parsed.$field
        if ($actual -ne $expected) {
            $mismatchedFields.Add([pscustomobject]@{
                name = [string]$field
                expected = $expected
                actual = $actual
            }) | Out-Null
            Add-Check -Name "public-config field: $field" -Status "fail" -Message "public-config '$field' was '$actual', expected '$expected'."
        }
        else {
            $matchedFields.Add([string]$field) | Out-Null
            Add-Check -Name "public-config field: $field" -Status "pass" -Message "public-config '$field' matches expected value."
        }
    }

    $configOk = ($missingFields.Count -eq 0 -and $mismatchedFields.Count -eq 0)
    return [pscustomobject]@{
        url = $Url
        ok = [bool]$configOk
        failure_kind = if ($configOk) { $null } else { "public_config_mismatch" }
        status_code = $statusCode
        content_length = $content.Length
        content_sha256 = Get-Sha256Hex -Text $content
        missing_fields = $missingFields.ToArray()
        mismatched_fields = $mismatchedFields.ToArray()
        matched_fields = $matchedFields.ToArray()
        content_snippet = Get-ContentSnippet -Text $content
    }
}

$base = $BaseUrl.TrimEnd("/")
$privacyUrl = Join-Url -Base $base -Path "/privacy"
$supportUrl = Join-Url -Base $base -Path "/support"
$publicConfigUrl = Join-Url -Base $base -Path "/api/public-config"

if (-not $SkipDnsDiagnostics) {
    $dnsDiagnostics = Get-PublicMetadataDnsDiagnostics -Base $base -ExpectedNs $ExpectedNameservers
}

Test-Page -Name "privacy" -Url $privacyUrl -RequiredText @(
    "MUSU Privacy Policy",
    "Data MUSU may process",
    $ExpectedSupportEmail,
    $expectedReleaseMetadataText
)

Test-Page -Name "support" -Url $supportUrl -RequiredText @(
    "MUSU Support",
    "Include this diagnostic evidence",
    $ExpectedSupportEmail,
    $expectedReleaseMetadataText
)

$publicConfigEvidence = Test-PublicConfig -Url $publicConfigUrl -RequiredFields @{
    schema = "musu.public_config.v1"
    releaseVersion = $expectedReleaseVersion
    publicReleaseMetadata = $expectedReleaseMetadataText
    supportEmail = $ExpectedSupportEmail
    privacyUrl = $privacyUrl
    supportUrl = $supportUrl
}

$failCount = @($checks | Where-Object { $_.status -eq "fail" }).Count
$failureKinds = @(
    $pages | Where-Object { -not $_.ok } | ForEach-Object { $_.failure_kind }
    if ($publicConfigEvidence -and -not [bool]$publicConfigEvidence.ok) { $publicConfigEvidence.failure_kind }
) | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) } | Select-Object -Unique

$requestFailed = @($failureKinds | Where-Object { [string]$_ -eq "request_failed" }).Count -gt 0
$dnsNameserverMismatch = (
    $dnsDiagnostics -and
    $dnsDiagnostics.PSObject.Properties["nameserver_check_applicable"] -and
    [bool]$dnsDiagnostics.nameserver_check_applicable -and
    $dnsDiagnostics.PSObject.Properties["nameserver_matches_expected"] -and
    -not [bool]$dnsDiagnostics.nameserver_matches_expected
)
if ($requestFailed -and $dnsNameserverMismatch) {
    $failureKinds = @(@($failureKinds) + "dns_nameserver_mismatch") | Select-Object -Unique
}

$result = [pscustomobject]@{
    schema = "musu.store_public_metadata_verification.v2"
    checked_at = [datetimeoffset]::Now.ToString("o")
    ok = ($failCount -eq 0)
    base_url = $base
    privacy_url = $privacyUrl
    support_url = $supportUrl
    expected_support_email = $ExpectedSupportEmail
    expected_release_version = $expectedReleaseVersion
    expected_release_metadata_text = $expectedReleaseMetadataText
    fail_count = $failCount
    failure_kinds = $failureKinds
    pages = $pages.ToArray()
    public_config = $publicConfigEvidence
    dns_diagnostics = $dnsDiagnostics
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
