[CmdletBinding()]
param(
    [switch]$AllowRemoteRegistryWarnings,
    [switch]$RequireBrainToken,
    [switch]$SelfTestRemoteUsable,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$checks = New-Object System.Collections.Generic.List[object]

function Write-Step([string]$Message) {
    if (-not $Json) {
        Write-Host ""
        Write-Host "==> $Message"
    }
}

function Add-Check {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [ValidateSet("pass", "warn", "fail")]
        [Parameter(Mandatory = $true)][string]$Status,
        [Parameter(Mandatory = $true)][string]$Message
    )

    $checks.Add([pscustomobject]@{
        name = $Name
        status = $Status
        message = $Message
    }) | Out-Null
}

function Add-CheckFromCondition {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][bool]$Condition,
        [Parameter(Mandatory = $true)][string]$PassMessage,
        [Parameter(Mandatory = $true)][string]$FailMessage
    )

    Add-Check -Name $Name -Status ($(if ($Condition) { "pass" } else { "fail" })) -Message ($(if ($Condition) { $PassMessage } else { $FailMessage }))
}

function Invoke-MusuJson {
    param([Parameter(Mandatory = $true)][string[]]$Arguments)

    $output = & musu @Arguments 2>&1
    $exitCode = $LASTEXITCODE
    $text = ($output | Out-String).Trim()
    if ($exitCode -ne 0) {
        throw "musu $($Arguments -join ' ') failed with exit code ${exitCode}: $text"
    }
    try {
        return $text | ConvertFrom-Json
    }
    catch {
        throw "musu $($Arguments -join ' ') did not return JSON: $text"
    }
}

function Get-PropertyValue {
    param(
        $Object,
        [Parameter(Mandatory = $true)][string]$Name,
        $Default = $null
    )

    if (-not $Object) {
        return $Default
    }
    $property = $Object.PSObject.Properties[$Name]
    if (-not $property -or $null -eq $property.Value) {
        return $Default
    }
    return $property.Value
}

function Test-RemoteUsableUrl {
    param([AllowEmptyString()][string]$Url)

    if ([string]::IsNullOrWhiteSpace($Url)) {
        return $false
    }
    $uri = $null
    if (-not [System.Uri]::TryCreate($Url, [System.UriKind]::Absolute, [ref]$uri)) {
        return $false
    }
    if ($uri.Scheme -notin @("http", "https")) {
        return $false
    }
    if ($uri.Port -eq 0) {
        return $false
    }
    $hostName = $uri.Host.Trim()
    if ($hostName.StartsWith("[") -and $hostName.EndsWith("]")) {
        $hostName = $hostName.Substring(1, $hostName.Length - 2)
    }
    $hostName = $hostName.TrimEnd(".").ToLowerInvariant()
    if ([string]::IsNullOrWhiteSpace($hostName) -or $hostName -eq "localhost") {
        return $false
    }
    $ip = $null
    if ([System.Net.IPAddress]::TryParse($hostName, [ref]$ip)) {
        if ($ip.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork) {
            $ipv4 = $ip.ToString()
            if ($ipv4 -eq "0.0.0.0" -or $ipv4.StartsWith("127.")) {
                return $false
            }
            return $true
        }
        if ($ip.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetworkV6) {
            if ($ip.IsIPv4MappedToIPv6) {
                $mapped = $ip.MapToIPv4().ToString()
                if ($mapped -eq "0.0.0.0" -or $mapped.StartsWith("127.")) {
                    return $false
                }
                return $true
            }
            if ($ip.Equals([System.Net.IPAddress]::IPv6Loopback) -or $ip.Equals([System.Net.IPAddress]::IPv6Any)) {
                return $false
            }
            return $true
        }
    }
    return $true
}

function Test-RemoteUsableAddr {
    param([AllowEmptyString()][string]$Addr)

    if ([string]::IsNullOrWhiteSpace($Addr)) {
        return $false
    }
    return Test-RemoteUsableUrl -Url ("http://{0}" -f $Addr)
}

if ($SelfTestRemoteUsable) {
    $urlCases = @(
        @{ url = "http://127.0.0.1:8070"; expected = $false },
        @{ url = "http://0.0.0.0:8070"; expected = $false },
        @{ url = "http://[::1]:8070"; expected = $false },
        @{ url = "http://[::ffff:127.0.0.1]:8070"; expected = $false },
        @{ url = "http://[::ffff:0.0.0.0]:8070"; expected = $false },
        @{ url = "http://192.168.1.20:8070"; expected = $true },
        @{ url = "https://peer.example.test"; expected = $true }
    )
    foreach ($case in $urlCases) {
        $actual = Test-RemoteUsableUrl -Url $case.url
        Add-CheckFromCondition `
            -Name "remote_usable_url:$($case.url)" `
            -Condition ($actual -eq [bool]$case.expected) `
            -PassMessage "expected=$($case.expected), actual=$actual" `
            -FailMessage "expected=$($case.expected), actual=$actual"
    }

    $addrCases = @(
        @{ addr = "[::ffff:127.0.0.1]:8070"; expected = $false },
        @{ addr = "[::ffff:0.0.0.0]:8070"; expected = $false },
        @{ addr = "192.168.1.20:8070"; expected = $true }
    )
    foreach ($case in $addrCases) {
        $actual = Test-RemoteUsableAddr -Addr $case.addr
        Add-CheckFromCondition `
            -Name "remote_usable_addr:$($case.addr)" `
            -Condition ($actual -eq [bool]$case.expected) `
            -PassMessage "expected=$($case.expected), actual=$actual" `
            -FailMessage "expected=$($case.expected), actual=$actual"
    }

    $failCount = @($checks | Where-Object { $_.status -eq "fail" }).Count
    $result = @{
        schema = "musu.fleet_audit_remote_usable_selftest.v1"
        ok = ($failCount -eq 0)
        fail_count = $failCount
        checks = @($checks.ToArray())
    }
    if ($Json) {
        $result | ConvertTo-Json -Depth 6
    }
    else {
        $result
    }
    if ($failCount -gt 0) {
        exit 1
    }
    exit 0
}

function Get-JsonFile {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        return $null
    }
    try {
        return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
    }
    catch {
        return $null
    }
}

function Test-RestrictedAcl {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        return [pscustomobject]@{
            exists = $false
            ok = $false
            summary = "missing"
        }
    }

    $acl = Get-Acl -LiteralPath $Path
    $owner = [string]$acl.Owner
    $bad = @()
    foreach ($entry in @($acl.Access)) {
        $identity = [string]$entry.IdentityReference
        $allowed = (
            $identity -eq $owner -or
            $identity -match '\\Administrators$' -or
            $identity -match '^(NT AUTHORITY\\SYSTEM|SYSTEM)$'
        )
        if (-not $allowed) {
            $bad += $identity
        }
    }

    return [pscustomobject]@{
        exists = $true
        ok = ($bad.Count -eq 0)
        summary = $(if ($bad.Count -eq 0) { "restricted" } else { "unexpected identities: $($bad -join ', ')" })
    }
}

Write-Step "Collecting installed MUSU state"
$packageStatus = Invoke-MusuJson -Arguments @("package-status")
$doctor = Invoke-MusuJson -Arguments @("doctor", "--json")
$status = Invoke-MusuJson -Arguments @("status", "--json")
$nodesDefault = Invoke-MusuJson -Arguments @("nodes", "--json")
$nodes = Invoke-MusuJson -Arguments @("nodes", "--json", "--include-unusable")

$fleet = $status.fleet
$thisNode = $fleet.this_node
$peers = @($fleet.peers)
$cloudSelf = @($nodes.nodes | Where-Object { $_.is_this_pc -eq $true }) | Select-Object -First 1
$remoteCloudWarnings = @($nodes.nodes | Where-Object { $_.is_this_pc -ne $true -and $_.public_url_remote_usable -ne $true })
$defaultRemoteCloudWarnings = @($nodesDefault.nodes | Where-Object { $_.is_this_pc -ne $true -and $_.public_url_remote_usable -ne $true })

Add-CheckFromCondition `
    -Name "package_identity" `
    -Condition ([string]$packageStatus.distribution -eq "store-msix" -and [bool]$packageStatus.has_package_identity) `
    -PassMessage "MUSU is running from the store-msix package identity." `
    -FailMessage "MUSU is not running from the expected store-msix package identity."

Add-CheckFromCondition `
    -Name "local_bridge_reachable" `
    -Condition ([string]$doctor.bridge.status -eq "ok" -and [int]$doctor.bridge.health_http_status -eq 200) `
    -PassMessage "Local bridge health is reachable." `
    -FailMessage "Local bridge is not healthy."

Add-CheckFromCondition `
    -Name "bridge_bind_recorded" `
    -Condition (-not [string]::IsNullOrWhiteSpace([string]$doctor.bridge.service_registry_bind_addr)) `
    -PassMessage "doctor exposes the raw service_registry_bind_addr: $($doctor.bridge.service_registry_bind_addr)" `
    -FailMessage "doctor did not expose service_registry_bind_addr."

$registryPath = Join-Path $env:USERPROFILE ".musu\services\bridge.json"
$registry = Get-JsonFile -Path $registryPath
Add-CheckFromCondition `
    -Name "bridge_registry_matches_doctor" `
    -Condition ($registry -and [string]$registry.addr -eq [string]$doctor.bridge.service_registry_bind_addr) `
    -PassMessage "bridge.json addr matches doctor bind addr." `
    -FailMessage "bridge.json addr does not match doctor bind addr."

Add-CheckFromCondition `
    -Name "self_advertised_url_remote_usable" `
    -Condition ([bool]$doctor.bridge.advertised_public_url_remote_usable -and (Test-RemoteUsableUrl -Url ([string]$doctor.bridge.advertised_public_url))) `
    -PassMessage "Self advertised URL is usable by other PCs: $($doctor.bridge.advertised_public_url)" `
    -FailMessage "Self advertised URL is not remote usable: $($doctor.bridge.advertised_public_url) $($doctor.bridge.advertised_public_url_warning)"

Add-CheckFromCondition `
    -Name "cloud_self_public_url_remote_usable" `
    -Condition ($cloudSelf -and [bool]$cloudSelf.public_url_remote_usable -and (Test-RemoteUsableUrl -Url ([string]$cloudSelf.public_url))) `
    -PassMessage "Cloud self public_url is remote usable: $($cloudSelf.public_url)" `
    -FailMessage "Cloud self public_url is missing or unusable."

Add-CheckFromCondition `
    -Name "nodes_default_hides_unusable_remote_rows" `
    -Condition ($defaultRemoteCloudWarnings.Count -eq 0) `
    -PassMessage "musu nodes default output excludes remote-unusable registry rows." `
    -FailMessage "musu nodes default output still exposes remote-unusable rows: $((@($defaultRemoteCloudWarnings) | ForEach-Object { "$($_.node_name)=$($_.public_url)" }) -join ', ')"

$directHealthy = 0
if ($thisNode -and [bool]$thisNode.healthy) {
    $directHealthy += 1
}
foreach ($peer in $peers) {
    $reachableVia = [string](Get-PropertyValue -Object $peer -Name "reachable_via" -Default "direct")
    if ([bool]$peer.healthy -and $reachableVia -ne "relay") {
        $directHealthy += 1
    }
}
$relayHealthyPeers = @($peers | Where-Object {
    [bool]$_.healthy -and [string](Get-PropertyValue -Object $_ -Name "reachable_via" -Default "") -eq "relay"
})
Add-CheckFromCondition `
    -Name "online_nodes_direct_only" `
    -Condition ([int]$fleet.online_nodes -eq $directHealthy -and $relayHealthyPeers.Count -eq 0) `
    -PassMessage "online_nodes counts direct/healthy nodes only: $($fleet.online_nodes)" `
    -FailMessage "online_nodes=$($fleet.online_nodes), directHealthy=$directHealthy, relayHealthyPeers=$($relayHealthyPeers.Count)"

$cachePath = Join-Path $env:USERPROFILE ".musu\nodes.cache.json"
$cache = Get-JsonFile -Path $cachePath
$badCacheRows = @()
if ($cache -and $cache.PSObject.Properties["nodes"]) {
    foreach ($row in @($cache.nodes)) {
        $candidateUrl = [string](Get-PropertyValue -Object $row -Name "public_url" -Default "")
        $candidateMeta = Get-PropertyValue -Object $row -Name "meta" -Default $null
        $candidateMetaUrl = [string](Get-PropertyValue -Object $candidateMeta -Name "public_url" -Default "")
        $candidateAddr = [string](Get-PropertyValue -Object $row -Name "addr" -Default "")
        if (-not [string]::IsNullOrWhiteSpace($candidateUrl) -and -not (Test-RemoteUsableUrl -Url $candidateUrl)) {
            $badCacheRows += $candidateUrl
        }
        if (-not [string]::IsNullOrWhiteSpace($candidateMetaUrl) -and -not (Test-RemoteUsableUrl -Url $candidateMetaUrl)) {
            $badCacheRows += "meta.public_url=$candidateMetaUrl"
        }
        if (-not [string]::IsNullOrWhiteSpace($candidateAddr) -and -not (Test-RemoteUsableAddr -Addr $candidateAddr)) {
            $badCacheRows += $candidateAddr
        }
    }
}
Add-CheckFromCondition `
    -Name "resolver_cache_excludes_unusable_remote_urls" `
    -Condition ($badCacheRows.Count -eq 0) `
    -PassMessage "nodes.cache.json does not contain loopback/wildcard remote candidates." `
    -FailMessage "nodes.cache.json still contains unusable remote candidates: $($badCacheRows -join ', ')"

$keyAcl = Test-RestrictedAcl -Path (Join-Path $env:USERPROFILE ".musu\tls\key.pem")
$meshAcl = Test-RestrictedAcl -Path (Join-Path $env:USERPROFILE ".musu\private_mesh.toml")
$brainTokenPath = Join-Path $env:USERPROFILE ".musu\brain\runtime\musu-ingest.token"
$brainTokenAcl = Test-RestrictedAcl -Path $brainTokenPath
Add-CheckFromCondition `
    -Name "tls_key_acl_restricted" `
    -Condition ([bool]$keyAcl.ok) `
    -PassMessage "tls/key.pem ACL is restricted." `
    -FailMessage "tls/key.pem ACL is not restricted: $($keyAcl.summary)"
Add-CheckFromCondition `
    -Name "private_mesh_acl_restricted" `
    -Condition ([bool]$meshAcl.ok) `
    -PassMessage "private_mesh.toml ACL is restricted." `
    -FailMessage "private_mesh.toml ACL is not restricted: $($meshAcl.summary)"
if ([bool]$brainTokenAcl.exists) {
    Add-CheckFromCondition `
        -Name "brain_ingest_token_acl_restricted" `
        -Condition ([bool]$brainTokenAcl.ok) `
        -PassMessage "brain runtime/musu-ingest.token ACL is restricted." `
        -FailMessage "brain runtime/musu-ingest.token ACL is not restricted: $($brainTokenAcl.summary)"
}
elseif ($RequireBrainToken) {
    Add-Check `
        -Name "brain_ingest_token_acl_restricted" `
        -Status "fail" `
        -Message "brain runtime/musu-ingest.token is missing; launch the packaged desktop first-run path, then rerun without skipping the brain gate."
}
else {
    Add-Check `
        -Name "brain_ingest_token_acl_restricted" `
        -Status "pass" `
        -Message "brain runtime/musu-ingest.token is not present; ACL gate skipped because -RequireBrainToken was not set."
}

if ($remoteCloudWarnings.Count -gt 0) {
    $message = ($remoteCloudWarnings | ForEach-Object { "$($_.node_name)=$($_.public_url)" }) -join ", "
    Add-Check `
        -Name "remote_cloud_registry_rows" `
        -Status ($(if ($AllowRemoteRegistryWarnings) { "warn" } else { "fail" })) `
        -Message "Remote cloud registry still contains unusable public_url rows: $message"
}
else {
    Add-Check -Name "remote_cloud_registry_rows" -Status "pass" -Message "No remote cloud registry row has an unusable public_url."
}

$failCount = @($checks | Where-Object { $_.status -eq "fail" }).Count
$warnCount = @($checks | Where-Object { $_.status -eq "warn" }).Count
$checkArray = @($checks.ToArray())
$ok = ($failCount -eq 0)
$packageFullName = [string]$packageStatus.package_full_name
$bridgeBindAddr = [string]$doctor.bridge.service_registry_bind_addr
$advertisedPublicUrl = [string]$doctor.bridge.advertised_public_url
$selfNodeName = [string]$thisNode.name
$totalNodes = [int]$fleet.total_nodes
$onlineNodes = [int]$fleet.online_nodes
$remoteCloudWarningCount = [int]$remoteCloudWarnings.Count
$evidence = [pscustomobject]@{
    schema = "musu.fleet_audit_contract.v1"
    generated_at = (Get-Date).ToUniversalTime().ToString("o")
    ok = $ok
    fail_count = $failCount
    warn_count = $warnCount
    allow_remote_registry_warnings = [bool]$AllowRemoteRegistryWarnings
    package_full_name = $packageFullName
    bridge_bind_addr = $bridgeBindAddr
    advertised_public_url = $advertisedPublicUrl
    self_node = $selfNodeName
    total_nodes = $totalNodes
    online_nodes = $onlineNodes
    direct_healthy_nodes = $directHealthy
    remote_cloud_warning_count = $remoteCloudWarningCount
    brain_token_required = [bool]$RequireBrainToken
    brain_token_present = [bool]$brainTokenAcl.exists
    checks = $checkArray
}

if ($Json) {
    $evidence | ConvertTo-Json -Depth 8
}
else {
    Write-Step "Fleet audit contract"
    $evidence | Format-List
}

if ($failCount -gt 0) {
    exit 1
}
