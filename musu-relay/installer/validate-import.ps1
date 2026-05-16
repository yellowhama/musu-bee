# musu-backend.tar validation harness — V23.2 Workstream B4a (wiki/370)
#
# Single source of truth for B4a + B4c measurement. Performs:
#   1. SHA-256 of the tar (always); gates pass/fail vs -ExpectedSha256.
#   2. wsl --unregister (clean slate) → wsl --import as $DistroName.
#   3. Pre-seed dummy /etc/musu/account_key so musu-init's "await key" phase
#      doesn't block this measurement (B4b will do real key write at install).
#   4. Run /usr/local/bin/musu-init with MUSU_K3S_READY_TIMEOUT_SEC bounded.
#   5. Probe `pgrep -f "/usr/local/bin/k3s server"` for k3s_pid_seen.
#   6. Poll `kubectl get nodes -o json` for Ready (within timeout).
#   7. After settle: parse `free -m` for idle_ram_mb_used; cat /etc/musu-version.
#   8. Write validation-result.json. Cleanup wsl --unregister unless
#      -KeepOnSuccess AND status == "ready".
#
# Output schema is locked in wiki/370 §7.2 and reserved for B4c extension.
#
# Critic Findings honored (wiki/370 §13):
#   C2 HIGH — Step 3 pre-seeds dummy account_key (gateway start path isolated).
#   C4 HIGH — Always computes tar_sha256; -ExpectedSha256 gates pass/fail.
#   C8 MED  — K3sReadyTimeoutSec default 180s (was 60s). k3s_pid_seen field
#             distinguishes "never_started" from "timeout".
#   C9 MED  — -KeepOnSuccess switch preserves the distro for interactive
#             debugging when k3s_ready_status == "ready".
#   C10 MED — b4c_host_class enum locked in schema doc (this script doesn't
#             write the field, just reserves the name).
#
# Usage:
#   .\validate-import.ps1 -TarPath .\musu-backend.tar
#   .\validate-import.ps1 -TarPath .\musu-backend.tar -ExpectedSha256 (Get-Content .\musu-backend.tar.sha256 -Raw).Trim()
#   .\validate-import.ps1 -TarPath .\musu-backend.tar -KeepOnSuccess

[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$TarPath,
    [string]$DistroName = "musu-test",
    [string]$ImportDir = "$env:TEMP\musu-test-import",
    [int]$K3sReadyTimeoutSec = 180,
    [string]$ExpectedSha256 = "",
    [switch]$AcceptDegraded,
    [switch]$KeepOnSuccess
)

$ErrorActionPreference = "Stop"
$result = [ordered]@{}

# ── tar identity ───────────────────────────────────────────────────────────
if (-not (Test-Path $TarPath)) {
    Write-Error "TarPath not found: $TarPath"
    exit 1
}
$result.tar_path       = (Resolve-Path $TarPath).Path
$result.tar_size_bytes = (Get-Item $TarPath).Length
$result.tar_sha256     = (Get-FileHash -Path $TarPath -Algorithm SHA256).Hash.ToLower()

if ($ExpectedSha256) {
    $expected = $ExpectedSha256.Trim().ToLower()
    if ($result.tar_sha256 -ne $expected) {
        $result.tar_sha256_status = "mismatch"
        $result.tar_sha256_expected = $expected
        if (-not $AcceptDegraded) {
            $result | ConvertTo-Json -Depth 6 | Set-Content -Path "validation-result.json" -Encoding UTF8
            Write-Error "tar_sha256 mismatch: expected $expected, got $($result.tar_sha256). Wrote validation-result.json. Re-run with -AcceptDegraded to continue anyway."
            exit 1
        }
    } else {
        $result.tar_sha256_status = "match"
    }
} else {
    $result.tar_sha256_status = "unverified"
}

# ── host context ───────────────────────────────────────────────────────────
try { $result.host_os = (Get-CimInstance Win32_OperatingSystem).Caption } catch { $result.host_os = "unknown" }
try { $result.host_wsl_status = (& wsl.exe --status 2>&1 | Out-String) } catch { $result.host_wsl_status = "wsl --status failed" }
$result.started_at_utc = (Get-Date).ToUniversalTime().ToString("o")

# Audit-fix M3: wrap the entire wsl-touching body in try/finally so that any
# unhandled exception (mid-run unregister, CIM failure, etc.) still produces
# validation-result.json AND cleans up the WSL registration. Without this, an
# exception between import and the explicit final cleanup leaves a registered
# distro behind and no result file.
try {

# ── 1. Clean slate ─────────────────────────────────────────────────────────
Write-Host "[1/5] Clean slate: unregister '$DistroName' + clear ImportDir"
& wsl.exe --unregister $DistroName 2>$null | Out-Null
if (Test-Path $ImportDir) {
    Remove-Item -Recurse -Force $ImportDir -ErrorAction SilentlyContinue
}
New-Item -ItemType Directory -Force -Path $ImportDir | Out-Null

# ── 2. Import ──────────────────────────────────────────────────────────────
Write-Host "[2/5] wsl --import $DistroName"
$importStart = Get-Date
try {
    & wsl.exe --import $DistroName $ImportDir $TarPath --version 2
    if ($LASTEXITCODE -ne 0) { throw "wsl --import exited $LASTEXITCODE" }
    $result.import_status = "ok"
    $result.import_error  = $null
} catch {
    $result.import_status = "failed"
    $result.import_error  = $_.Exception.Message
    $result.import_time_ms = $null
    # Audit-fix M3: Windows can leave a partial registration even when --import
    # exits non-zero. Defensive unregister before we bail. The finally block
    # also unregisters, but doing it here makes the intent clearer at the
    # failure site (and double-unregister is harmless — `2>$null`).
    & wsl.exe --unregister $DistroName 2>$null | Out-Null
    if (-not $AcceptDegraded) {
        # Audit-fix M3: finally block handles JSON write + unregister.
        Write-Error "wsl --import failed: $($_.Exception.Message)."
        exit 1
    }
}
$result.import_time_ms = ((Get-Date) - $importStart).TotalMilliseconds

# ── 2.b Pre-seed dummy account_key (Critic C2 HIGH) ───────────────────────
# musu-init blocks on /etc/musu/account_key by default. We pre-seed a dummy
# so this validation script measures K3s+gateway boot time, not B4b's PS flow.
Write-Host "[2.b/5] Pre-seed dummy /etc/musu/account_key (isolates measurement from B4b)"
& wsl.exe -d $DistroName -- sh -c "printf 'b4a-validation-dummy-key' > /etc/musu/account_key && chmod 0600 /etc/musu/account_key" | Out-Null

# ── 3. Run musu-init + poll K3s Ready ──────────────────────────────────────
Write-Host "[3/5] Run musu-init (K3sReadyTimeoutSec=$K3sReadyTimeoutSec)"
$k3sStart   = Get-Date
$deadline   = $k3sStart.AddSeconds($K3sReadyTimeoutSec)
$readyOutput = $null
$k3sPidSeen  = $false

try {
    # Fire musu-init. MUSU_KEY_WAIT_TIMEOUT_SEC=5 means if the dummy key step
    # above somehow failed, musu-init exits 2 fast instead of blocking forever.
    $initOutput = & wsl.exe -d $DistroName -- env "MUSU_K3S_READY_TIMEOUT_SEC=$K3sReadyTimeoutSec" "MUSU_KEY_WAIT_TIMEOUT_SEC=5" /usr/local/bin/musu-init 2>&1 | Out-String
    $result.musu_init_output = $initOutput

    # Probe whether K3s actually started a process (distinguishes "never
    # started" from "started but never Ready" — Critic C8 MED).
    $pidProbe = & wsl.exe -d $DistroName -- pgrep -f "/usr/local/bin/k3s server" 2>$null
    if ($LASTEXITCODE -eq 0 -and $pidProbe) { $k3sPidSeen = $true }

    while ((Get-Date) -lt $deadline) {
        $kubectl = & wsl.exe -d $DistroName -- kubectl --kubeconfig /etc/rancher/k3s/k3s.yaml get nodes -o json 2>$null | Out-String
        if ($kubectl -and ($kubectl -match '"status"\s*:\s*"True"')) {
            $readyOutput = $kubectl
            break
        }
        Start-Sleep -Seconds 2
    }
} catch {
    $result.k3s_error = $_.Exception.Message
}
$result.k3s_pid_seen = [bool]$k3sPidSeen

if ($readyOutput) {
    $result.k3s_ready_ms      = ((Get-Date) - $k3sStart).TotalMilliseconds
    $result.kubectl_get_nodes = $readyOutput
    $result.k3s_ready_status  = "ready"
} else {
    $result.k3s_ready_ms      = $null
    $result.kubectl_get_nodes = $null
    if ($k3sPidSeen) {
        $result.k3s_ready_status = "timeout"
    } else {
        $result.k3s_ready_status = "never_started"
    }

    if (-not $AcceptDegraded) {
        # Audit-fix M3: finally block handles finished_at_utc, JSON write,
        # and wsl --unregister (KeepOnSuccess is gated on status=ready).
        Write-Error "K3s never became Ready ($($result.k3s_ready_status)). Re-run with -AcceptDegraded -KeepOnSuccess for interactive debugging."
        exit 1
    }
}

# ── 4. Idle RAM measurement ────────────────────────────────────────────────
Write-Host "[4/5] Settle 5s then parse free -m for idle_ram_mb_used"
Start-Sleep -Seconds 5
$freeOutput = & wsl.exe -d $DistroName -- free -m 2>&1 | Out-String
$result.idle_ram_output_raw = $freeOutput
# busybox 1.36+ (Alpine 3.19 ships 1.36.1) matches coreutils column order:
# Mem: total used free shared buff/cache available
if ($freeOutput -match 'Mem:\s+(\d+)\s+(\d+)') {
    $result.idle_ram_mb_used = [int]$Matches[2]
}

# ── 4.b /etc/musu-version provenance (Critic C4 HIGH) ─────────────────────
$musuVersion = & wsl.exe -d $DistroName -- cat /etc/musu-version 2>$null | Out-String
$result.musu_version_raw = $musuVersion
# V23.3 B6 (wiki/392 §4.1 S6c): prefer git_desc (new, surfaces dirty-tree
# marker), fall back to git_sha (preserved for main.ts:171 telemetry).
if ($musuVersion -match '(?m)^git_desc=(.+)$') { $result.musu_version_id = $Matches[1].Trim() }
elseif ($musuVersion -match '(?m)^git_sha=(.+)$') { $result.musu_version_id = $Matches[1].Trim() }
else { $result.musu_version_id = "unknown" }

# ── 5. Summary (success path) ─────────────────────────────────────────────
# Result-file write + cleanup happen unconditionally in finally below
# (audit-fix M3). Only the human-readable summary lives in the success path.
Write-Host "[5/5] Validation complete (result.json written by finally block)"
Write-Host ""
Write-Host "─────────────────────────────────────────────────────────────────"
Write-Host "  tar_size_bytes:    $($result.tar_size_bytes)"
Write-Host "  tar_sha256:        $($result.tar_sha256)"
Write-Host "  tar_sha256_status: $($result.tar_sha256_status)"
Write-Host "  import_status:     $($result.import_status)"
Write-Host "  k3s_pid_seen:      $($result.k3s_pid_seen)"
Write-Host "  k3s_ready_status:  $($result.k3s_ready_status)"
Write-Host "  k3s_ready_ms:      $($result.k3s_ready_ms)"
Write-Host "  idle_ram_mb_used:  $($result.idle_ram_mb_used)"
Write-Host "─────────────────────────────────────────────────────────────────"

} finally {
    # Audit-fix M3: unconditional result-file write + cleanup. Runs even on
    # unhandled exception. Wrapped in inner try so a Set-Content failure
    # doesn't prevent the wsl --unregister cleanup below.
    $result.finished_at_utc = (Get-Date).ToUniversalTime().ToString("o")
    try {
        $result | ConvertTo-Json -Depth 6 | Set-Content -Path "validation-result.json" -Encoding UTF8 -Force
    } catch {
        Write-Host "WARNING: failed to write validation-result.json in finally: $($_.Exception.Message)"
    }

    # Preserve distro ONLY when explicitly requested AND k3s reached ready.
    # Any other path (timeout / never_started / exception / -AcceptDegraded
    # passthrough that didn't reach ready) unregisters to avoid orphans.
    $keepIt = $KeepOnSuccess -and ($result.k3s_ready_status -eq "ready")
    if ($keepIt) {
        Write-Host "-KeepOnSuccess and status=ready: preserving '$DistroName' for interactive debugging."
        Write-Host "    wsl -d $DistroName"
        Write-Host "When done: wsl --unregister $DistroName"
    } else {
        & wsl.exe --unregister $DistroName 2>$null | Out-Null
    }
}
