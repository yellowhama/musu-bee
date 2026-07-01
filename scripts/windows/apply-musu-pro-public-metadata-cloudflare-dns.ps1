[CmdletBinding()]
param(
    [string]$BaseUrl = "https://musu.pro",
    [string]$ZoneName,
    [string]$ZoneId = $env:CLOUDFLARE_ZONE_ID,
    [string[]]$ExpectedVercelApexA = @("76.76.21.21"),
    [string]$ExpectedWwwCname = "cname.vercel-dns-0.com",
    [string]$CloudflareApiToken = $env:CLOUDFLARE_API_TOKEN,
    [int]$TimeoutSec = 20,
    [switch]$ConfirmApply,
    [string]$OutputPath,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$generatedAt = [datetimeoffset]::Now

function Normalize-DnsName {
    param([string]$Value)

    if ([string]::IsNullOrWhiteSpace($Value)) {
        return ""
    }
    return $Value.Trim().TrimEnd(".").ToLowerInvariant()
}

function New-Operation {
    param(
        [Parameter(Mandatory = $true)][string]$Action,
        [Parameter(Mandatory = $true)][string]$Type,
        [Parameter(Mandatory = $true)][string]$Name,
        [string]$Content = "",
        [string]$RecordId = "",
        [string]$Reason = ""
    )

    return [pscustomobject]@{
        action = $Action
        type = $Type
        name = Normalize-DnsName -Value $Name
        content = $Content
        record_id = $RecordId
        proxied = $false
        ttl = 1
        reason = $Reason
    }
}

function Invoke-CloudflareApi {
    param(
        [Parameter(Mandatory = $true)][string]$Method,
        [Parameter(Mandatory = $true)][string]$Path,
        [object]$Body = $null,
        [Parameter(Mandatory = $true)][string]$Token
    )

    if ([string]::IsNullOrWhiteSpace($Token)) {
        throw "Cloudflare API token is required."
    }

    $uri = "https://api.cloudflare.com/client/v4$Path"
    $headers = @{ Authorization = "Bearer $Token" }
    $args = @{
        Method = $Method
        Uri = $uri
        Headers = $headers
        TimeoutSec = $TimeoutSec
    }
    if ($null -ne $Body) {
        $args.ContentType = "application/json"
        $args.Body = ($Body | ConvertTo-Json -Depth 12)
    }

    try {
        $response = Invoke-RestMethod @args
        if ($response -and $response.PSObject.Properties["success"] -and -not [bool]$response.success) {
            $messages = @()
            if ($response.PSObject.Properties["errors"] -and $response.errors) {
                $messages = @($response.errors | ForEach-Object { [string]$_.message })
            }
            throw ("Cloudflare API returned success=false: {0}" -f ($messages -join "; "))
        }
        return $response
    }
    catch {
        $message = $_.Exception.Message
        if (-not [string]::IsNullOrWhiteSpace($Token)) {
            $message = $message.Replace($Token, "<redacted>")
        }
        throw $message
    }
}

function Get-CloudflareZone {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [string]$Id,
        [Parameter(Mandatory = $true)][string]$Token
    )

    if (-not [string]::IsNullOrWhiteSpace($Id)) {
        $encodedId = [uri]::EscapeDataString($Id)
        $response = Invoke-CloudflareApi -Method "GET" -Path "/zones/$encodedId" -Token $Token
        return $response.result
    }

    $encodedName = [uri]::EscapeDataString($Name)
    $zones = Invoke-CloudflareApi -Method "GET" -Path "/zones?name=$encodedName&status=active&per_page=50" -Token $Token
    $matches = @($zones.result | Where-Object { (Normalize-DnsName -Value ([string]$_.name)) -eq (Normalize-DnsName -Value $Name) })
    if ($matches.Count -ne 1) {
        throw ("Expected exactly one active Cloudflare zone named {0}; found {1}." -f $Name, $matches.Count)
    }
    return $matches[0]
}

function Get-CloudflareDnsRecords {
    param(
        [Parameter(Mandatory = $true)][string]$ResolvedZoneId,
        [Parameter(Mandatory = $true)][string]$Token
    )

    $records = New-Object System.Collections.Generic.List[object]
    $page = 1
    do {
        $response = Invoke-CloudflareApi `
            -Method "GET" `
            -Path ("/zones/{0}/dns_records?per_page=100&page={1}" -f [uri]::EscapeDataString($ResolvedZoneId), $page) `
            -Token $Token
        foreach ($record in @($response.result)) {
            $records.Add($record) | Out-Null
        }
        $totalPages = 1
        if ($response.PSObject.Properties["result_info"] -and $response.result_info -and $response.result_info.PSObject.Properties["total_pages"]) {
            $totalPages = [int]$response.result_info.total_pages
        }
        $page += 1
    } while ($page -le $totalPages)

    return @($records)
}

function Get-PlannedOperations {
    param(
        [Parameter(Mandatory = $true)][object[]]$Records,
        [Parameter(Mandatory = $true)][string]$ApexHost,
        [Parameter(Mandatory = $true)][string]$WwwHost,
        [Parameter(Mandatory = $true)][string[]]$ExpectedApexARecords,
        [Parameter(Mandatory = $true)][string]$ExpectedCname
    )

    $operations = New-Object System.Collections.Generic.List[object]
    $apex = Normalize-DnsName -Value $ApexHost
    $www = Normalize-DnsName -Value $WwwHost
    $expectedA = @($ExpectedApexARecords | ForEach-Object { [string]$_ } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Sort-Object -Unique)
    $expectedCname = Normalize-DnsName -Value $ExpectedCname
    $normalizedRecords = @($Records | ForEach-Object {
        $name = Normalize-DnsName -Value ([string]$_.name)
        [pscustomobject]@{
            raw = $_
            id = [string]$_.id
            name = $name
            type = [string]$_.type
            content = if ($_.PSObject.Properties["content"] -and $null -ne $_.content) { [string]$_.content } else { "" }
        }
    })

    $apexA = @($normalizedRecords | Where-Object { $_.name -eq $apex -and $_.type -eq "A" })
    $apexAByContent = @{}
    foreach ($record in $apexA) {
        if (-not $apexAByContent.ContainsKey($record.content)) {
            $apexAByContent[$record.content] = New-Object System.Collections.Generic.List[object]
        }
        $apexAByContent[$record.content].Add($record) | Out-Null
    }

    foreach ($expected in $expectedA) {
        $matching = if ($apexAByContent.ContainsKey($expected)) { @($apexAByContent[$expected]) } else { @() }
        if ($matching.Count -eq 0) {
            $wrongCandidate = @($apexA | Where-Object { $expectedA -notcontains $_.content } | Select-Object -First 1)
            if ($wrongCandidate.Count -gt 0) {
                $operations.Add((New-Operation -Action "patch" -Type "A" -Name $apex -Content $expected -RecordId $wrongCandidate[0].id -Reason "replace unexpected apex A with Vercel apex A")) | Out-Null
            }
            else {
                $operations.Add((New-Operation -Action "create" -Type "A" -Name $apex -Content $expected -Reason "create missing Vercel apex A")) | Out-Null
            }
        }
        elseif ($matching.Count -gt 1) {
            foreach ($duplicate in @($matching | Select-Object -Skip 1)) {
                $operations.Add((New-Operation -Action "delete" -Type "A" -Name $apex -Content $duplicate.content -RecordId $duplicate.id -Reason "remove duplicate apex A")) | Out-Null
            }
        }
    }

    foreach ($record in $apexA) {
        if ($expectedA -notcontains $record.content) {
            $alreadyPatched = @($operations | Where-Object { $_.action -eq "patch" -and $_.record_id -eq $record.id }).Count -gt 0
            if (-not $alreadyPatched) {
                $operations.Add((New-Operation -Action "delete" -Type "A" -Name $apex -Content $record.content -RecordId $record.id -Reason "remove non-Vercel apex A")) | Out-Null
            }
        }
    }

    foreach ($record in @($normalizedRecords | Where-Object { $_.name -eq $apex -and ($_.type -eq "AAAA" -or $_.type -eq "HTTPS") })) {
        $operations.Add((New-Operation -Action "delete" -Type $record.type -Name $apex -Content $record.content -RecordId $record.id -Reason "remove apex record that conflicts with Vercel external DNS path")) | Out-Null
    }

    $wwwRecords = @($normalizedRecords | Where-Object { $_.name -eq $www -and ($_.type -eq "A" -or $_.type -eq "AAAA" -or $_.type -eq "CNAME") })
    $wwwCname = @($wwwRecords | Where-Object { $_.type -eq "CNAME" })
    $validCname = @($wwwCname | Where-Object { (Normalize-DnsName -Value $_.content) -eq $expectedCname })
    if ($validCname.Count -eq 0) {
        $patchCandidate = @($wwwCname | Select-Object -First 1)
        if ($patchCandidate.Count -gt 0) {
            $operations.Add((New-Operation -Action "patch" -Type "CNAME" -Name $www -Content $expectedCname -RecordId $patchCandidate[0].id -Reason "replace www CNAME with Vercel CNAME")) | Out-Null
        }
        else {
            $operations.Add((New-Operation -Action "create" -Type "CNAME" -Name $www -Content $expectedCname -Reason "create missing Vercel www CNAME")) | Out-Null
        }
    }
    elseif ($validCname.Count -gt 1) {
        foreach ($duplicate in @($validCname | Select-Object -Skip 1)) {
            $operations.Add((New-Operation -Action "delete" -Type "CNAME" -Name $www -Content $duplicate.content -RecordId $duplicate.id -Reason "remove duplicate www CNAME")) | Out-Null
        }
    }

    foreach ($record in $wwwRecords) {
        $isDesiredCname = ($record.type -eq "CNAME" -and (Normalize-DnsName -Value $record.content) -eq $expectedCname)
        $alreadyPatched = @($operations | Where-Object { $_.action -eq "patch" -and $_.record_id -eq $record.id }).Count -gt 0
        if (-not $isDesiredCname -and -not $alreadyPatched) {
            $operations.Add((New-Operation -Action "delete" -Type $record.type -Name $www -Content $record.content -RecordId $record.id -Reason "remove www record that conflicts with Vercel CNAME")) | Out-Null
        }
    }

    return @($operations)
}

function Invoke-DnsOperation {
    param(
        [Parameter(Mandatory = $true)]$Operation,
        [Parameter(Mandatory = $true)][string]$ResolvedZoneId,
        [Parameter(Mandatory = $true)][string]$Token
    )

    $zone = [uri]::EscapeDataString($ResolvedZoneId)
    if ($Operation.action -eq "delete") {
        $recordId = [uri]::EscapeDataString($Operation.record_id)
        $response = Invoke-CloudflareApi -Method "DELETE" -Path "/zones/$zone/dns_records/$recordId" -Token $Token
        return [pscustomobject]@{
            action = $Operation.action
            type = $Operation.type
            name = $Operation.name
            record_id = $Operation.record_id
            success = [bool]$response.success
        }
    }

    $body = [ordered]@{
        type = $Operation.type
        name = $Operation.name
        content = $Operation.content
        ttl = 1
        proxied = $false
    }

    if ($Operation.action -eq "create") {
        $response = Invoke-CloudflareApi -Method "POST" -Path "/zones/$zone/dns_records" -Body $body -Token $Token
    }
    elseif ($Operation.action -eq "patch") {
        $recordId = [uri]::EscapeDataString($Operation.record_id)
        $response = Invoke-CloudflareApi -Method "PATCH" -Path "/zones/$zone/dns_records/$recordId" -Body $body -Token $Token
    }
    else {
        throw ("Unsupported operation action: {0}" -f $Operation.action)
    }

    return [pscustomobject]@{
        action = $Operation.action
        type = $Operation.type
        name = $Operation.name
        content = $Operation.content
        record_id = if ($response.result -and $response.result.PSObject.Properties["id"]) { [string]$response.result.id } else { $Operation.record_id }
        success = [bool]$response.success
    }
}

$hostName = ""
try {
    $hostName = ([uri]$BaseUrl).Host
}
catch {
    throw "BaseUrl must be an absolute URL: $BaseUrl"
}
if ([string]::IsNullOrWhiteSpace($hostName)) {
    throw "BaseUrl must include a host: $BaseUrl"
}
if ([string]::IsNullOrWhiteSpace($ZoneName)) {
    $ZoneName = $hostName
}
$wwwHost = if ($hostName -eq "musu.pro") { "www.musu.pro" } else { "www.$hostName" }

$failureKind = $null
$errorMessage = $null
$zone = $null
$records = @()
$operations = @()
$appliedOperations = @()
$canApply = $false
$dryRun = (-not [bool]$ConfirmApply)

try {
    if ([string]::IsNullOrWhiteSpace($CloudflareApiToken)) {
        $failureKind = "cloudflare_token_missing"
        $errorMessage = "Set CLOUDFLARE_API_TOKEN or pass -CloudflareApiToken. No DNS mutation was attempted."
    }
    else {
        $zone = Get-CloudflareZone -Name $ZoneName -Id $ZoneId -Token $CloudflareApiToken
        $records = @(Get-CloudflareDnsRecords -ResolvedZoneId ([string]$zone.id) -Token $CloudflareApiToken)
        $operations = @(Get-PlannedOperations -Records $records -ApexHost $hostName -WwwHost $wwwHost -ExpectedApexARecords $ExpectedVercelApexA -ExpectedCname $ExpectedWwwCname)
        $canApply = $true

        if ($ConfirmApply) {
            foreach ($operation in $operations) {
                $appliedOperations += Invoke-DnsOperation -Operation $operation -ResolvedZoneId ([string]$zone.id) -Token $CloudflareApiToken
            }
        }
    }
}
catch {
    $failureKind = "cloudflare_apply_failed"
    $errorMessage = $_.Exception.Message
    if (-not [string]::IsNullOrWhiteSpace($CloudflareApiToken)) {
        $errorMessage = $errorMessage.Replace($CloudflareApiToken, "<redacted>")
    }
}

$verificationCommands = @(
    "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\plan-musu-pro-public-metadata-dns-repair.ps1 -BaseUrl $BaseUrl -RunVercelInspect -Json",
    "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\verify-store-public-metadata.ps1 -BaseUrl $BaseUrl -Json",
    "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\write-release-go-no-go.ps1 -Json"
)

$result = [ordered]@{
    schema = "musu.public_metadata_cloudflare_dns_apply.v1"
    generated_at = $generatedAt.ToString("o")
    ok = ($null -eq $failureKind)
    base_url = $BaseUrl
    host = $hostName
    zone_name = $ZoneName
    zone_id = if ($zone -and $zone.PSObject.Properties["id"]) { [string]$zone.id } else { "" }
    www_host = $wwwHost
    expected_apex_a_records = @($ExpectedVercelApexA)
    expected_www_cname = $ExpectedWwwCname
    mutation_requires_confirm_apply = $true
    will_mutate_external_dns = ([bool]$ConfirmApply -and [bool]$canApply -and @($operations).Count -gt 0)
    apply_requested = [bool]$ConfirmApply
    applied = ([bool]$ConfirmApply -and [bool]$canApply -and $null -eq $failureKind)
    dry_run = [bool]$dryRun
    can_apply = [bool]$canApply
    failure_kind = $failureKind
    error = $errorMessage
    operation_count = @($operations).Count
    operations = @($operations)
    applied_operation_count = @($appliedOperations).Count
    applied_operations = @($appliedOperations)
    verification_commands = $verificationCommands
    official_reference_urls = @(
        "https://developers.cloudflare.com/api/resources/dns/subresources/records/methods/create/",
        "https://developers.cloudflare.com/api/resources/dns/subresources/records/methods/edit/",
        "https://developers.cloudflare.com/api/resources/dns/subresources/records/methods/delete/",
        "https://vercel.com/docs/domains/working-with-domains/managing-dns-records"
    )
    notes = "Default mode is dry-run. The script mutates Cloudflare DNS only when -ConfirmApply is passed. It touches only apex A/AAAA/HTTPS and www A/AAAA/CNAME records for the selected zone."
}

$jsonText = $result | ConvertTo-Json -Depth 24
if (-not [string]::IsNullOrWhiteSpace($OutputPath)) {
    $outputDir = Split-Path -Parent $OutputPath
    if (-not [string]::IsNullOrWhiteSpace($outputDir)) {
        New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
    }
    Set-Content -LiteralPath $OutputPath -Value $jsonText -Encoding UTF8
}

if ($Json) {
    $jsonText
}
else {
    [pscustomobject]$result | Format-List
}

if ($ConfirmApply -and $null -ne $failureKind) {
    exit 1
}
exit 0
