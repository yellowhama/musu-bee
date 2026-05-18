# bench-windows.ps1 — V23.4 T2-Z / F-A1c-10 (wiki/443)
#
# Windows-host-side peer to bridge-bench.sh. Measures the latency cost that
# the install-wsl2.ps1 + netsh portproxy path adds on top of the in-cluster
# bridge latency (which bridge-bench.sh already covers):
#
#   1. vEthernet adapter latency: localhost -> WSL2 distro IP via the WSL2
#      vNIC. Isolates the hypervisor virtual-switch cost.
#   2. portmap DNAT overhead: localhost:9900 -> netsh portproxy -> WSL2:9900.
#      Subtract (1) to isolate the DNAT round-trip cost.
#   3. install-wsl2.ps1 Step 5.9 rendezvous-role detection timing: how long
#      the state.json read + role decision takes. Cheap but bounded so the
#      installer never gets surprised by a slow PowerShell startup.
#
# Output: JSON to stdout. Schema field naming convention mirrors
# bridge-bench.sh musu-bridge-bench-v2 (snake_case, ms-suffixed, *_median /
# *_p99). Consumers can stitch this report alongside bridge-bench.sh output
# under a single payload by appending payload_sha256 verification.
#
# Usage:
#   .\bench-windows.ps1 [-Runs 30] [-OutFile bench-windows.json]
#
# Exit codes:
#   0  bench completed; JSON on stdout (or -OutFile)
#   1  preflight failed (WSL2 not running / portproxy missing / no musu distro)

[CmdletBinding()]
param(
    [int]$Runs = 30,
    [string]$OutFile,
    [int]$Port = 9900
)

$ErrorActionPreference = "Stop"

function Get-WslIp {
    $raw = & wsl.exe -d musu -- sh -c "hostname -I" 2>$null
    if (-not $raw) { return $null }
    foreach ($tok in ($raw -split '\s+')) {
        if ($tok -match '^\d+\.\d+\.\d+\.\d+$') { return $tok }
    }
    return $null
}

function Measure-TcpConnectMs {
    param([string]$Host, [int]$Port, [int]$TimeoutMs = 2000)
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $task = $client.ConnectAsync($Host, $Port)
        if (-not $task.Wait($TimeoutMs)) {
            $sw.Stop()
            return @{ ok = $false; ms = -1; err = "timeout" }
        }
        $sw.Stop()
        return @{ ok = $true; ms = [int]$sw.ElapsedMilliseconds; err = $null }
    } catch {
        $sw.Stop()
        return @{ ok = $false; ms = -1; err = $_.Exception.Message }
    } finally {
        try { $client.Close() } catch {}
    }
}

function Get-Percentile {
    param([int[]]$Samples, [double]$P)
    if (-not $Samples -or $Samples.Length -eq 0) { return $null }
    $sorted = $Samples | Sort-Object
    $idx = [int][math]::Floor($P * ($sorted.Length - 1))
    return $sorted[$idx]
}

# ── Preflight ────────────────────────────────────────────────────────────
$wslIp = Get-WslIp
if (-not $wslIp) {
    Write-Error "Could not resolve WSL2 'musu' distro IP. Is the distro running? Try: wsl -d musu -- echo ok"
    exit 1
}

$portproxyOut = & netsh.exe interface portproxy show v4tov4 2>&1 | Out-String
$portproxyPresent = $portproxyOut -match "\b${Port}\b"

# ── Bench 1: vEthernet adapter latency (WSL IP direct) ───────────────────
$vethSamples = @()
for ($i = 0; $i -lt $Runs; $i++) {
    $r = Measure-TcpConnectMs -Host $wslIp -Port $Port
    if ($r.ok) { $vethSamples += $r.ms }
}

# ── Bench 2: portmap DNAT overhead (localhost via portproxy) ─────────────
$portmapSamples = @()
if ($portproxyPresent) {
    for ($i = 0; $i -lt $Runs; $i++) {
        $r = Measure-TcpConnectMs -Host "127.0.0.1" -Port $Port
        if ($r.ok) { $portmapSamples += $r.ms }
    }
}

# ── Bench 3: rendezvous-role detection timing (state.json read + role) ──
# Synthesize the Step 5.9 decision against an ephemeral state.json that
# mirrors the real installer's shape; we only measure the read + parse +
# branch, NOT the install side-effects.
$stateTmp = [System.IO.Path]::GetTempFileName()
@{
    rendezvous_role = "rendezvous"
    rendezvous_url = "http://${wslIp}:${Port}"
    install_id = ([guid]::NewGuid().ToString())
} | ConvertTo-Json -Compress | Set-Content -Path $stateTmp -Encoding UTF8

$roleSamples = @()
for ($i = 0; $i -lt $Runs; $i++) {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        $st = Get-Content $stateTmp -Raw -Encoding UTF8 | ConvertFrom-Json
        $priorRole = if ($st.PSObject.Properties["rendezvous_role"]) { [string]$st.rendezvous_role } else { $null }
        $isRendezvous = ($priorRole -eq "rendezvous")
        # touch the decision so the JIT doesn't elide the branch
        $null = $isRendezvous
    } catch {}
    $sw.Stop()
    $roleSamples += [int]$sw.ElapsedMilliseconds
}
Remove-Item -Force $stateTmp -ErrorAction SilentlyContinue

# ── Render report (schema mirrors musu-bridge-bench-v2 field naming) ─────
$report = [ordered]@{
    schema           = "musu-bench-windows-v1"
    wiki_id          = 443
    sub_ws           = "v23.4-z4-b"
    metadata = [ordered]@{
        bench_version  = "v23.4-z4-windows-schema-v1"
        bench_ts_utc   = (Get-Date).ToUniversalTime().ToString("o")
        os_caption     = (Get-CimInstance -ClassName Win32_OperatingSystem -ErrorAction SilentlyContinue).Caption
        os_build       = (Get-CimInstance -ClassName Win32_OperatingSystem -ErrorAction SilentlyContinue).BuildNumber
        wsl_distro_ip  = $wslIp
        portproxy_present = $portproxyPresent
    }
    veth_latency_ms = [ordered]@{
        n_samples = $vethSamples.Count
        p50_ms    = if ($vethSamples.Count) { Get-Percentile -Samples $vethSamples -P 0.50 } else { $null }
        p95_ms    = if ($vethSamples.Count) { Get-Percentile -Samples $vethSamples -P 0.95 } else { $null }
        p99_ms    = if ($vethSamples.Count) { Get-Percentile -Samples $vethSamples -P 0.99 } else { $null }
    }
    portmap_overhead_ms = [ordered]@{
        n_samples = $portmapSamples.Count
        p50_ms    = if ($portmapSamples.Count) { Get-Percentile -Samples $portmapSamples -P 0.50 } else { $null }
        p95_ms    = if ($portmapSamples.Count) { Get-Percentile -Samples $portmapSamples -P 0.95 } else { $null }
        p99_ms    = if ($portmapSamples.Count) { Get-Percentile -Samples $portmapSamples -P 0.99 } else { $null }
    }
    rendezvous_role_detect_ms = [ordered]@{
        n_samples = $roleSamples.Count
        p50_ms    = Get-Percentile -Samples $roleSamples -P 0.50
        p95_ms    = Get-Percentile -Samples $roleSamples -P 0.95
        p99_ms    = Get-Percentile -Samples $roleSamples -P 0.99
    }
}

# Stitch payload_sha256 over the JSON (sorted keys via -Compress is approximation;
# downstream tools should hash the literal stdout payload to verify).
$json = $report | ConvertTo-Json -Depth 6
$sha = [System.BitConverter]::ToString(
    [System.Security.Cryptography.SHA256]::Create().ComputeHash(
        [System.Text.Encoding]::UTF8.GetBytes($json))).Replace("-", "").ToLower()
$report["payload_sha256"] = $sha

$finalJson = $report | ConvertTo-Json -Depth 6
if ($OutFile) {
    Set-Content -Path $OutFile -Value $finalJson -Encoding UTF8
    Write-Host "bench-windows: report written to $OutFile (sha256=$sha)"
} else {
    $finalJson
}
