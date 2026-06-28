[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("ttl", "boot")]
    [string]$SnapshotKind,

    [Parameter(Mandatory = $true)]
    [ValidateSet("before", "after")]
    [string]$Stage,

    [string]$Version,
    [string]$MusuHome,
    [string]$OutputRoot,
    [string]$OutputPath,
    [string]$TargetNodeName,
    [int]$HeartbeatTtlSec = 60,
    [int]$BootPrunedManualPeerCount = -1,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path

function Get-DefaultMusuHome {
    if (-not [string]::IsNullOrWhiteSpace($env:MUSU_HOME)) {
        return [System.IO.Path]::GetFullPath($env:MUSU_HOME)
    }
    return [System.IO.Path]::GetFullPath((Join-Path $HOME ".musu"))
}

function Read-JsonFileOrNull {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        return $null
    }
    return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
}

function Read-ManualPeersToml {
    param([Parameter(Mandatory = $true)][string]$Path)

    $peers = New-Object System.Collections.Generic.List[object]
    if (-not (Test-Path -LiteralPath $Path)) {
        return $peers.ToArray()
    }

    $current = $null
    foreach ($line in (Get-Content -LiteralPath $Path)) {
        $trimmed = ([string]$line).Trim()
        if ($trimmed -eq "[[peers]]") {
            if ($null -ne $current) {
                $peers.Add([pscustomobject]$current) | Out-Null
            }
            $current = [ordered]@{
                addr = $null
                name = $null
                added_at = $null
            }
            continue
        }

        if ($null -eq $current -or $trimmed.StartsWith("#") -or $trimmed.Length -eq 0) {
            continue
        }

        if ($trimmed -match '^(addr|name|added_at)\s*=\s*"(.*)"\s*$') {
            $current[$matches[1]] = $matches[2]
        }
    }

    if ($null -ne $current) {
        $peers.Add([pscustomobject]$current) | Out-Null
    }
    return $peers.ToArray()
}

function Split-EndpointAddr {
    param([string]$Addr)

    if ([string]::IsNullOrWhiteSpace($Addr)) {
        return $null
    }

    $trimmed = $Addr.Trim()
    $uri = $null
    if ([System.Uri]::TryCreate($trimmed, [System.UriKind]::Absolute, [ref]$uri) -and -not [string]::IsNullOrWhiteSpace($uri.Host)) {
        $uriPort = if ($uri.Port -ge 0) { [int]$uri.Port } else { $null }
        return [pscustomobject]@{
            host = $uri.Host
            port = $uriPort
        }
    }

    if ($trimmed -match '[/\\]') {
        return $null
    }

    $hostPart = $trimmed
    $port = $null
    if ($hostPart.StartsWith("[") -and $hostPart.Contains("]")) {
        $end = $hostPart.IndexOf("]")
        $rest = $hostPart.Substring($end + 1)
        $hostOnly = $hostPart.Substring(1, $end - 1)
        if ($rest -match '^:(\d+)$') {
            $parsedPort = 0
            if (-not [int]::TryParse($matches[1], [ref]$parsedPort)) {
                return $null
            }
            $port = $parsedPort
        } elseif (-not [string]::IsNullOrWhiteSpace($rest)) {
            return $null
        }
        $hostPart = $hostOnly
    } else {
        $firstColon = $hostPart.IndexOf(":")
        $lastColon = $hostPart.LastIndexOf(":")
        if ($firstColon -eq $lastColon -and $firstColon -gt 0) {
            $portText = $hostPart.Substring($firstColon + 1)
            if ($portText -notmatch '^\d+$') {
                return $null
            }
            $parsedPort = 0
            if (-not [int]::TryParse($portText, [ref]$parsedPort)) {
                return $null
            }
            $port = $parsedPort
            $hostPart = $hostPart.Substring(0, $firstColon)
        }
    }

    return [pscustomobject]@{
        host = $hostPart
        port = $port
    }
}

function Test-RemoteUsableAddr {
    param([string]$Addr)

    $endpoint = Split-EndpointAddr -Addr $Addr
    if ($null -eq $endpoint) {
        return $false
    }

    $hostPart = ([string]$endpoint.host).Trim().TrimEnd(".")
    if ([string]::IsNullOrWhiteSpace($hostPart) -or $hostPart.Equals("localhost", [System.StringComparison]::OrdinalIgnoreCase)) {
        return $false
    }
    if ($null -ne $endpoint.port -and ([int]$endpoint.port -le 0 -or [int]$endpoint.port -gt 65535)) {
        return $false
    }

    $ip = $null
    if ([System.Net.IPAddress]::TryParse($hostPart, [ref]$ip)) {
        $normalizedIp = $ip
        if ($ip.IsIPv4MappedToIPv6) {
            $normalizedIp = $ip.MapToIPv4()
        }
        if ([System.Net.IPAddress]::IsLoopback($normalizedIp)) {
            return $false
        }
        if ($normalizedIp.Equals([System.Net.IPAddress]::Any) -or $normalizedIp.Equals([System.Net.IPAddress]::IPv6Any)) {
            return $false
        }
    }

    return $true
}

function Get-PropValue {
    param($Object, [Parameter(Mandatory = $true)][string]$Name)

    if ($null -ne $Object -and $null -ne $Object.PSObject.Properties[$Name]) {
        return $Object.PSObject.Properties[$Name].Value
    }
    return $null
}

function Get-NodeRouteAddrs {
    param($Node)

    $addrs = New-Object System.Collections.Generic.List[string]
    $primary = [string](Get-PropValue -Object $Node -Name "addr")
    if (Test-RemoteUsableAddr -Addr $primary) {
        $addrs.Add($primary) | Out-Null
    }

    $meta = Get-PropValue -Object $Node -Name "meta"
    $candidateEndpoints = Get-PropValue -Object $meta -Name "candidate_endpoints"
    foreach ($candidate in @($candidateEndpoints)) {
        $kind = [string](Get-PropValue -Object $candidate -Name "kind")
        if ($kind -in @("relay", "failed")) {
            continue
        }

        $candidateAddr = if ($kind -eq "direct_quic") {
            $publicAddr = [string](Get-PropValue -Object $candidate -Name "public_addr")
            if (-not [string]::IsNullOrWhiteSpace($publicAddr)) { $publicAddr } else { [string](Get-PropValue -Object $candidate -Name "addr") }
        }
        else {
            [string](Get-PropValue -Object $candidate -Name "addr")
        }

        if ((Test-RemoteUsableAddr -Addr $candidateAddr) -and -not $addrs.Contains($candidateAddr)) {
            $addrs.Add($candidateAddr) | Out-Null
        }
    }

    return $addrs.ToArray()
}

function Get-RegistryCandidateMap {
    param($Cache)

    $map = @{}
    foreach ($node in @($Cache.nodes)) {
        $name = [string](Get-PropValue -Object $node -Name "name")
        if ([string]::IsNullOrWhiteSpace($name)) {
            continue
        }
        $addrs = @(Get-NodeRouteAddrs -Node $node)
        if ($addrs.Count -eq 0) {
            continue
        }
        if (-not $map.ContainsKey($name)) {
            $map[$name] = New-Object System.Collections.Generic.HashSet[string]
        }
        foreach ($addr in $addrs) {
            [void]$map[$name].Add($addr)
        }
    }
    return ,$map
}

function Get-TtlSnapshot {
    param(
        [Parameter(Mandatory = $true)]$Cache,
        [Parameter(Mandatory = $true)][bool]$CacheAvailable,
        [Parameter(Mandatory = $true)][string]$StageValue,
        [Parameter(Mandatory = $true)][int]$TtlSec,
        [string]$TargetName
    )

    $now = [datetimeoffset]::UtcNow
    $staleRows = New-Object System.Collections.Generic.List[object]
    $rows = New-Object System.Collections.Generic.List[object]
    foreach ($node in @($Cache.nodes)) {
        $name = [string](Get-PropValue -Object $node -Name "name")
        if (-not [string]::IsNullOrWhiteSpace($TargetName) -and $name -ne $TargetName) {
            continue
        }

        $lastHeartbeatRaw = Get-PropValue -Object $node -Name "last_heartbeat"
        $lastHeartbeat = $null
        $ageSec = $null
        $stale = $true
        if ($null -ne $lastHeartbeatRaw -and -not [string]::IsNullOrWhiteSpace([string]$lastHeartbeatRaw)) {
            $lastHeartbeat = [datetimeoffset]::Parse([string]$lastHeartbeatRaw)
            $ageSec = [int][Math]::Floor(($now - $lastHeartbeat).TotalSeconds)
            $stale = ($ageSec -gt $TtlSec)
        }

        $row = [pscustomobject]@{
            node_id = [string](Get-PropValue -Object $node -Name "node_id")
            name = $name
            addr = [string](Get-PropValue -Object $node -Name "addr")
            last_heartbeat = if ($null -eq $lastHeartbeat) { $null } else { $lastHeartbeat.ToString("o") }
            age_sec = $ageSec
            stale = [bool]$stale
            route_addrs = @(Get-NodeRouteAddrs -Node $node)
        }
        $rows.Add($row) | Out-Null
        if ($stale) {
            $staleRows.Add($row) | Out-Null
        }
    }

    $lastSeenValues = @($staleRows.ToArray() | Where-Object { $null -ne $_.last_heartbeat } | ForEach-Object { [datetimeoffset]::Parse([string]$_.last_heartbeat) } | Sort-Object)
    $oldestStaleLastSeen = if ($lastSeenValues.Count -gt 0) { $lastSeenValues[0].ToString("o") } else { $null }
    $staleRowCount = $staleRows.Count

    return [pscustomobject]@{
        schema = "musu.v34_ttl_snapshot.v1"
        captured_at = $now.ToString("o")
        snapshot_kind = "ttl"
        stage = $StageValue
        cache_available = [bool]$CacheAvailable
        heartbeat_ttl_sec = [int]$TtlSec
        target_node_name = if ([string]::IsNullOrWhiteSpace($TargetName)) { $null } else { $TargetName }
        stale_row_injected = [bool]($staleRowCount -gt 0)
        stale_row_count = [int]$staleRowCount
        stale_row_last_seen_at = $oldestStaleLastSeen
        registry_current_excludes_stale_rows = [bool]($staleRowCount -eq 0)
        expired_rows_hidden = [bool]($staleRowCount -eq 0)
        rows = @($rows.ToArray())
    }
}

function Get-BootSnapshot {
    param(
        [Parameter(Mandatory = $true)]$Cache,
        [Parameter(Mandatory = $true)][bool]$CacheAvailable,
        [Parameter(Mandatory = $true)]$ManualPeers,
        [Parameter(Mandatory = $true)][string]$StageValue,
        [Parameter(Mandatory = $true)][int]$PrunedCount
    )

    $registry = if ($CacheAvailable) { Get-RegistryCandidateMap -Cache $Cache } else { @{} }
    $classified = New-Object System.Collections.Generic.List[object]
    $stalePresent = $false
    $lanOnlyPresent = $false
    $sameNameCurrentPresent = $false

    foreach ($peer in @($ManualPeers)) {
        $name = [string](Get-PropValue -Object $peer -Name "name")
        $addr = [string](Get-PropValue -Object $peer -Name "addr")
        $classification = "nameless"
        $candidateAddrs = @()
        if (-not [string]::IsNullOrWhiteSpace($name) -and $registry.ContainsKey($name)) {
            $candidateSet = $registry[$name]
            $candidateAddrs = @($candidateSet | ForEach-Object { [string]$_ })
            if ($candidateAddrs -contains $addr) {
                $classification = "same_name_current_candidate"
                $sameNameCurrentPresent = $true
            }
            else {
                $classification = "stale_same_name_manual_peer"
                $stalePresent = $true
            }
        }
        elseif (-not [string]::IsNullOrWhiteSpace($name)) {
            $classification = "lan_only_manual_peer"
            $lanOnlyPresent = $true
        }
        else {
            $lanOnlyPresent = $true
        }

        $classified.Add([pscustomobject]@{
            addr = $addr
            name = if ([string]::IsNullOrWhiteSpace($name)) { $null } else { $name }
            added_at = Get-PropValue -Object $peer -Name "added_at"
            classification = $classification
            registry_candidate_addrs = @($candidateAddrs)
        }) | Out-Null
    }

    $manualPeerCount = @($ManualPeers).Count

    return [pscustomobject]@{
        schema = "musu.v34_boot_snapshot.v1"
        captured_at = ([datetimeoffset]::UtcNow).ToString("o")
        snapshot_kind = "boot"
        stage = $StageValue
        cache_available = [bool]$CacheAvailable
        manual_peer_count = [int]$manualPeerCount
        pruned_manual_peer_count = [int]$PrunedCount
        stale_manual_peer_present = [bool]$stalePresent
        lan_only_manual_peer_present = [bool]$lanOnlyPresent
        same_name_current_candidate_present = [bool]$sameNameCurrentPresent
        manual_peers = @($classified.ToArray())
    }
}

if ([string]::IsNullOrWhiteSpace($Version)) {
    $Version = (Get-Content -LiteralPath (Join-Path $repoRoot "VERSION") -Raw).Trim()
}
if ([string]::IsNullOrWhiteSpace($MusuHome)) {
    $MusuHome = Get-DefaultMusuHome
}
$MusuHome = [System.IO.Path]::GetFullPath($MusuHome)

if ([string]::IsNullOrWhiteSpace($OutputRoot)) {
    $OutputRoot = Join-Path $repoRoot (".local-build\v34-source-snapshots\{0}" -f $Version)
}
$OutputRoot = [System.IO.Path]::GetFullPath($OutputRoot)
New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $fileKind = if ($SnapshotKind -eq "ttl") { "TTL" } else { "BOOT" }
    $fileStage = $Stage.ToUpperInvariant()
    $OutputPath = Join-Path $OutputRoot ("V34_{0}_{1}.json" -f $fileKind, $fileStage)
}
$OutputPath = [System.IO.Path]::GetFullPath($OutputPath)
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutputPath) | Out-Null

$cachePath = Join-Path $MusuHome "nodes.cache.json"
$manualPeersPath = Join-Path $MusuHome "manual_peers.toml"
$cache = Read-JsonFileOrNull -Path $cachePath
$cacheAvailable = ($null -ne $cache)
if ($null -eq $cache) {
    $cache = [pscustomobject]@{
        nodes = @()
        fetched_at = $null
        registry_url = $null
    }
}
$manualPeers = @(Read-ManualPeersToml -Path $manualPeersPath)

if ($SnapshotKind -eq "ttl") {
    $snapshot = Get-TtlSnapshot -Cache $cache -CacheAvailable $cacheAvailable -StageValue $Stage -TtlSec $HeartbeatTtlSec -TargetName $TargetNodeName
}
else {
    $prunedCount = if ($Stage -eq "after") {
        if ($BootPrunedManualPeerCount -lt 0) {
            throw "Boot after snapshot capture requires -BootPrunedManualPeerCount so the after snapshot can bind to the source artifact recorder."
        }
        $BootPrunedManualPeerCount
    }
    else {
        0
    }
    $snapshot = Get-BootSnapshot -Cache $cache -CacheAvailable $cacheAvailable -ManualPeers $manualPeers -StageValue $Stage -PrunedCount $prunedCount
}

$snapshot | Add-Member -NotePropertyName "version" -NotePropertyValue $Version
$snapshot | Add-Member -NotePropertyName "musu_home" -NotePropertyValue $MusuHome
$snapshot | Add-Member -NotePropertyName "cache_path" -NotePropertyValue $cachePath
$snapshot | Add-Member -NotePropertyName "manual_peers_path" -NotePropertyValue $manualPeersPath

$snapshot | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $OutputPath -Encoding UTF8
$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $OutputPath).Hash.ToLowerInvariant()

$result = [pscustomobject]@{
    ok = $true
    fail_count = 0
    schema = "musu.v34_source_snapshot_capture.v1"
    generated_at = ([datetimeoffset]::UtcNow).ToString("o")
    version = $Version
    snapshot_kind = $SnapshotKind
    stage = $Stage
    output_path = $OutputPath
    output_sha256 = $hash
    snapshot = $snapshot
}

if ($Json) {
    $result | ConvertTo-Json -Depth 30
}
else {
    "ok: true"
    "snapshot_path: $OutputPath"
    "snapshot_sha256: $hash"
}
