[CmdletBinding()]
param(
    [string]$BaseUrl = "https://musu.pro",
    [string[]]$ExpectedNameservers = @("ns1.vercel-dns.com", "ns2.vercel-dns.com"),
    [string[]]$ExpectedVercelApexA = @("76.76.21.21"),
    [string]$ExpectedWwwCname = "cname.vercel-dns-0.com",
    [int]$TimeoutSec = 12,
    [string]$VercelToken = $env:VERCEL_TOKEN,
    [switch]$RunVercelInspect,
    [string]$CloudflareApiToken = $env:CLOUDFLARE_API_TOKEN,
    [switch]$VerifyCloudflareToken,
    [switch]$ConfirmCloudflareApply,
    [string]$OutputPath,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
$generatedAt = [datetimeoffset]::Now

function Normalize-DnsName {
    param([string]$Value)

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

function Get-ProviderGuess {
    param([string[]]$Nameservers)

    $normalized = @($Nameservers | ForEach-Object { Normalize-DnsName -Value $_ })
    if (@($normalized | Where-Object { $_ -like "*.cloudflare.com" }).Count -gt 0) {
        return "cloudflare"
    }
    if (@($normalized | Where-Object { $_ -like "*.vercel-dns.com" }).Count -gt 0) {
        return "vercel"
    }
    if ($normalized.Count -gt 0) {
        return "third_party"
    }
    return "unknown"
}

function Test-TlsHandshake {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$ConnectHost,
        [Parameter(Mandatory = $true)][string]$ServerName,
        [int]$Port = 443,
        [int]$TimeoutSeconds = 8
    )

    $tcp = $null
    $ssl = $null
    try {
        $tcp = [System.Net.Sockets.TcpClient]::new()
        $async = $tcp.BeginConnect($ConnectHost, $Port, $null, $null)
        try {
            if (-not $async.AsyncWaitHandle.WaitOne([TimeSpan]::FromSeconds($TimeoutSeconds))) {
                $tcp.Close()
                return [pscustomobject]@{
                    name = $Name
                    ok = $false
                    failure_kind = "tcp_connect_timeout"
                    connect_host = $ConnectHost
                    server_name = $ServerName
                    port = $Port
                    timeout_sec = $TimeoutSeconds
                    error = "TCP connect timed out."
                    tls_protocol = $null
                    certificate_subject = $null
                    certificate_thumbprint = $null
                }
            }
            $tcp.EndConnect($async)
        }
        finally {
            if ($async -and $async.AsyncWaitHandle) {
                $async.AsyncWaitHandle.Close()
            }
        }

        $callback = [System.Net.Security.RemoteCertificateValidationCallback]{
            param($sender, $certificate, $chain, $sslPolicyErrors)
            return ($sslPolicyErrors -eq [System.Net.Security.SslPolicyErrors]::None)
        }
        $ssl = [System.Net.Security.SslStream]::new($tcp.GetStream(), $false, $callback)
        $ssl.AuthenticateAsClient($ServerName)

        $certSubject = $null
        $certThumbprint = $null
        if ($ssl.RemoteCertificate) {
            $cert = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new($ssl.RemoteCertificate)
            try {
                $certSubject = $cert.Subject
                $certThumbprint = $cert.Thumbprint
            }
            finally {
                $cert.Dispose()
            }
        }

        return [pscustomobject]@{
            name = $Name
            ok = $true
            failure_kind = $null
            connect_host = $ConnectHost
            server_name = $ServerName
            port = $Port
            timeout_sec = $TimeoutSeconds
            error = $null
            tls_protocol = [string]$ssl.SslProtocol
            certificate_subject = $certSubject
            certificate_thumbprint = $certThumbprint
        }
    }
    catch {
        return [pscustomobject]@{
            name = $Name
            ok = $false
            failure_kind = "tls_handshake_failed"
            connect_host = $ConnectHost
            server_name = $ServerName
            port = $Port
            timeout_sec = $TimeoutSeconds
            error = $_.Exception.Message
            tls_protocol = $null
            certificate_subject = $null
            certificate_thumbprint = $null
        }
    }
    finally {
        if ($ssl) {
            $ssl.Dispose()
        }
        if ($tcp) {
            $tcp.Dispose()
        }
    }
}

function Invoke-JsonCommand {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [int]$Depth = 16
    )

    if (-not (Test-Path -LiteralPath $FilePath)) {
        return [pscustomobject]@{
            ran = $false
            exit_code = $null
            ok = $false
            parse_ok = $false
            error = "script_not_found"
            json = $null
            output_tail = ""
        }
    }

    $raw = & powershell -NoProfile -ExecutionPolicy Bypass -File $FilePath @Arguments 2>&1
    $exitCode = $LASTEXITCODE
    $text = ($raw | Out-String).Trim()
    $parsed = $null
    $parseOk = $false
    $parseError = $null
    try {
        if (-not [string]::IsNullOrWhiteSpace($text)) {
            $parsed = $text | ConvertFrom-Json
            $parseOk = $true
        }
    }
    catch {
        $parseError = $_.Exception.Message
    }

    $tail = $text
    if ($tail.Length -gt 1200) {
        $tail = $tail.Substring($tail.Length - 1200)
    }

    $okValue = $false
    if ($parseOk -and $parsed -and $parsed.PSObject.Properties["ok"]) {
        $okValue = [bool]$parsed.ok
    }

    return [pscustomobject]@{
        ran = $true
        exit_code = $exitCode
        ok = $okValue
        parse_ok = $parseOk
        error = $parseError
        json = $parsed
        output_tail = if ($parseOk) { "" } else { $tail }
    }
}

function Invoke-VercelInspect {
    param(
        [Parameter(Mandatory = $true)][string]$Domain,
        [string]$Token
    )

    if (-not $RunVercelInspect) {
        return [pscustomobject]@{
            ran = $false
            reason = "RunVercelInspect_not_set"
            command = "vercel domains inspect $Domain --token `$env:VERCEL_TOKEN"
            exit_code = $null
            output_tail = ""
        }
    }

    $args = @("-y", "vercel@54.7.1", "domains", "inspect", $Domain)
    if (-not [string]::IsNullOrWhiteSpace($Token)) {
        $args += @("--token", $Token)
    }

    $raw = & npx @args 2>&1
    $exitCode = $LASTEXITCODE
    $text = ($raw | Out-String).Trim()
    if (-not [string]::IsNullOrWhiteSpace($Token)) {
        $text = $text -replace [regex]::Escape($Token), "<redacted>"
    }
    if ($text.Length -gt 2400) {
        $text = $text.Substring($text.Length - 2400)
    }

    return [pscustomobject]@{
        ran = $true
        reason = $null
        command = "vercel domains inspect $Domain --token `$env:VERCEL_TOKEN"
        exit_code = $exitCode
        output_tail = $text
    }
}

function Get-CloudflareTokenStatus {
    param([string]$Token)

    if (-not $VerifyCloudflareToken) {
        return [pscustomobject]@{
            checked = $false
            reason = "VerifyCloudflareToken_not_set"
            valid = $null
            error = $null
        }
    }
    if ([string]::IsNullOrWhiteSpace($Token)) {
        return [pscustomobject]@{
            checked = $true
            reason = "token_missing"
            valid = $false
            error = "CLOUDFLARE_API_TOKEN was not provided."
        }
    }

    try {
        $headers = @{ Authorization = "Bearer $Token" }
        $response = Invoke-RestMethod -Method Get -Uri "https://api.cloudflare.com/client/v4/user/tokens/verify" -Headers $headers -TimeoutSec $TimeoutSec
        return [pscustomobject]@{
            checked = $true
            reason = $null
            valid = [bool]$response.success
            error = $null
        }
    }
    catch {
        return [pscustomobject]@{
            checked = $true
            reason = "token_verify_failed"
            valid = $false
            error = $_.Exception.Message
        }
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

$wwwHost = if ($hostName -eq "musu.pro") { "www.musu.pro" } else { "www.$hostName" }
$expectedNs = @(
    $ExpectedNameservers |
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
$missingExpectedNs = @($expectedNs | Where-Object { $currentNs -notcontains $_ })
$unexpectedNs = @($currentNs | Where-Object { $expectedNs -notcontains $_ })
$nameserverMatchesExpected = ($expectedNs.Count -gt 0 -and $missingExpectedNs.Count -eq 0 -and $unexpectedNs.Count -eq 0)

$apexA = @(Resolve-DnsValues -Name $hostName -Type "A" -Property "IPAddress")
$apexAaaa = @(Resolve-DnsValues -Name $hostName -Type "AAAA" -Property "IPAddress")
$wwwCname = @(
    Resolve-DnsValues -Name $wwwHost -Type "CNAME" -Property "NameHost" |
        ForEach-Object { Normalize-DnsName -Value $_ } |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
        Sort-Object -Unique
)
$wwwA = @(Resolve-DnsValues -Name $wwwHost -Type "A" -Property "IPAddress")
$expectedA = @($ExpectedVercelApexA | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) } | ForEach-Object { [string]$_ } | Sort-Object -Unique)
$missingExpectedA = @($expectedA | Where-Object { $apexA -notcontains $_ })
$unexpectedA = @($apexA | Where-Object { $expectedA -notcontains $_ })
$apexAMatchesExpected = ($expectedA.Count -gt 0 -and $missingExpectedA.Count -eq 0 -and $unexpectedA.Count -eq 0)
$expectedWww = Normalize-DnsName -Value $ExpectedWwwCname
$wwwCnameMatchesExpected = (-not [string]::IsNullOrWhiteSpace($expectedWww) -and $wwwCname -contains $expectedWww)

$apexTls = Test-TlsHandshake -Name "apex_tls" -ConnectHost $hostName -ServerName $hostName -TimeoutSeconds $TimeoutSec
$wwwTls = Test-TlsHandshake -Name "www_tls" -ConnectHost $wwwHost -ServerName $wwwHost -TimeoutSeconds $TimeoutSec
$edgeTlsResults = New-Object System.Collections.Generic.List[object]
foreach ($edgeIp in $expectedA) {
    $edgeTlsResults.Add((Test-TlsHandshake -Name "vercel_edge_apex_tls" -ConnectHost $edgeIp -ServerName $hostName -TimeoutSeconds $TimeoutSec)) | Out-Null
}
$vercelEdgeTlsOk = (@($edgeTlsResults | Where-Object { [bool]$_.ok }).Count -gt 0)

$metadataVerifierPath = Join-Path $scriptDir "verify-store-public-metadata.ps1"
$metadataVerification = Invoke-JsonCommand `
    -FilePath $metadataVerifierPath `
    -Arguments @("-BaseUrl", $BaseUrl, "-TimeoutSec", [string]$TimeoutSec, "-Json")

$failureKinds = @()
if ($metadataVerification.parse_ok -and $metadataVerification.json -and $metadataVerification.json.PSObject.Properties["failure_kinds"]) {
    $failureKinds = @($metadataVerification.json.failure_kinds | ForEach-Object { [string]$_ })
}

$vercelInspect = Invoke-VercelInspect -Domain $hostName -Token $VercelToken
$cloudflareTokenStatus = Get-CloudflareTokenStatus -Token $CloudflareApiToken

$needsDnsRepair = (-not $nameserverMatchesExpected -or -not $apexAMatchesExpected -or -not $wwwCnameMatchesExpected)
$needsTlsRepair = (-not [bool]$apexTls.ok -or -not [bool]$vercelEdgeTlsOk)
$metadataOk = ($metadataVerification.parse_ok -and [bool]$metadataVerification.ok)

$actions = New-Object System.Collections.Generic.List[object]
if ($needsDnsRepair) {
    $actions.Add([pscustomobject]@{
        priority = 1
        name = "repair_dns_authority_and_records"
        reason = "Current DNS does not match the expected Vercel public metadata path."
        manual_steps = @(
            "Run: vercel domains inspect $hostName --token `$env:VERCEL_TOKEN",
            "Choose one DNS authority path before editing records: switch the registrar nameservers to Vercel DNS, or keep Cloudflare/third-party DNS and configure Vercel's exact external records.",
            "If switching to Vercel DNS, migrate required MX/TXT/mail records first, then set nameservers to $($expectedNs -join ', ').",
            "If keeping Cloudflare/third-party DNS, set apex A to $($expectedA -join ', '), remove conflicting apex A/AAAA/HTTPS records unless Vercel explicitly requires them, and set $wwwHost CNAME to $ExpectedWwwCname or the exact value from vercel domains inspect.",
            "Wait for DNS propagation, then rerun this planner and verify-store-public-metadata.ps1."
        )
    }) | Out-Null
}
if ($needsTlsRepair) {
    $actions.Add([pscustomobject]@{
        priority = 2
        name = "repair_apex_tls_certificate_path"
        reason = "Canonical apex HTTPS or direct Vercel edge SNI TLS failed."
        manual_steps = @(
            "After DNS repair, check that Vercel reports the domain as valid and assigned to the musu-pro project.",
            "If using Cloudflare proxying, confirm Cloudflare SSL/TLS mode and certificate issuance do not terminate the apex before Vercel can serve the domain.",
            "Keep $BaseUrl as the canonical host and avoid relying on $wwwHost if it only redirects back to a failing apex."
        )
    }) | Out-Null
}
$actions.Add([pscustomobject]@{
    priority = 3
    name = "verify_release_metadata_after_repair"
    reason = "The Store/public metadata lane closes only when the canonical verifier passes."
    manual_steps = @(
        "Run: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\verify-store-public-metadata.ps1 -BaseUrl $BaseUrl -Json",
        "Run: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\write-release-go-no-go.ps1 -Json",
        "Commit the passing evidence only after the verifier is green."
    )
}) | Out-Null

$result = [ordered]@{
    schema = "musu.public_metadata_dns_repair_plan.v1"
    generated_at = $generatedAt.ToString("o")
    ok = $true
    base_url = $BaseUrl
    host = $hostName
    www_host = $wwwHost
    release_blocker_present = (-not $metadataOk)
    ready_for_public_metadata_verifier = ($metadataOk -or (-not $needsDnsRepair -and -not $needsTlsRepair))
    will_mutate_external_dns = $false
    apply_requested = [bool]$ConfirmCloudflareApply
    apply_supported = $false
    can_apply = $false
    apply_note = "This planner never mutates DNS/provider state. ConfirmCloudflareApply is accepted only to make accidental mutation intent visible in the JSON."
    dns_state = [pscustomobject]@{
        provider_guess = Get-ProviderGuess -Nameservers $currentNs
        expected_nameservers = @($expectedNs)
        current_nameservers = @($currentNs)
        nameserver_matches_expected = [bool]$nameserverMatchesExpected
        missing_expected_nameservers = @($missingExpectedNs)
        unexpected_nameservers = @($unexpectedNs)
        expected_apex_a_records = @($expectedA)
        current_apex_a_records = @($apexA)
        current_apex_aaaa_records = @($apexAaaa)
        apex_a_matches_expected = [bool]$apexAMatchesExpected
        missing_expected_apex_a_records = @($missingExpectedA)
        unexpected_apex_a_records = @($unexpectedA)
        expected_www_cname = $ExpectedWwwCname
        current_www_cname_records = @($wwwCname)
        current_www_a_records = @($wwwA)
        www_cname_matches_expected = [bool]$wwwCnameMatchesExpected
    }
    tls_state = [pscustomobject]@{
        apex_tls = $apexTls
        www_tls = $wwwTls
        vercel_edge_apex_tls = $edgeTlsResults.ToArray()
        vercel_edge_apex_tls_ok = [bool]$vercelEdgeTlsOk
    }
    public_metadata_verification = [pscustomobject]@{
        ran = [bool]$metadataVerification.ran
        exit_code = $metadataVerification.exit_code
        parse_ok = [bool]$metadataVerification.parse_ok
        ok = [bool]$metadataVerification.ok
        failure_kinds = @($failureKinds)
    }
    vercel_inspect = $vercelInspect
    cloudflare = [pscustomobject]@{
        token_status = $cloudflareTokenStatus
        mutation_supported = $false
    }
    recommended_actions = $actions.ToArray()
    verification_commands = @(
        "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\plan-musu-pro-public-metadata-dns-repair.ps1 -BaseUrl $BaseUrl -Json",
        "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\verify-store-public-metadata.ps1 -BaseUrl $BaseUrl -Json",
        "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\write-release-go-no-go.ps1 -Json"
    )
    official_reference_urls = @(
        "https://vercel.com/docs/domains/working-with-domains/add-a-domain",
        "https://vercel.com/docs/domains/working-with-domains/managing-dns-records"
    )
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

exit 0
