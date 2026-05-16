# check-prereqs.ps1 — V23.2 Workstream B4b (wiki/372 §4)
#
# Read-only, side-effect-free host probe. Returns a JSON object describing
# host state + the classified b4c_host_class enum. Callable independently
# by B4c experimenters for pre-install host classification.
#
# Six probes per §4.1 (all wrapped in try/catch → 'unknown'):
#   1. BIOS-VT (Win32_Processor → ComputerInfo → systeminfo fallback triad)
#   2. WSL feature state (Get-WindowsOptionalFeature VirtualMachinePlatform)
#   3. WSL2 active (wsl --status + wsl --version regex)
#   4. Group Policy (HKLM Policies\Microsoft\Windows\WSL)
#   5. AV exclusion (Defender Get-MpPreference; non-Defender silent)
#   6. OS version + build + language
#
# Classifies into one of 6 b4c_host_class values per §4.2 decision tree.
# C11 LOW fallback: double-unknown elevated → assume wsl2-off-feature-off
# tagged feature_state_assumed_off=true.

#Requires -Version 5.1

[CmdletBinding()]
param(
    [ValidateSet("Json", "Text")][string]$OutputFormat = "Json",
    [switch]$IncludeAvProbe
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Continue"   # probes are best-effort; do NOT halt

# ── Probe 1: BIOS-VT (triad fallback) ──────────────────────────────────────

function Probe-BiosVt {
    # Attempt 1: Win32_Processor.VirtualizationFirmwareEnabled
    try {
        $proc = Get-CimInstance Win32_Processor -ErrorAction Stop |
            Select-Object -First 1
        if ($null -ne $proc -and $null -ne $proc.VirtualizationFirmwareEnabled) {
            if ($proc.VirtualizationFirmwareEnabled) { return "yes" }
            else { return "no" }
        }
    } catch {
        # fall through to attempt 2
    }

    # Attempt 2: Get-ComputerInfo.HyperVRequirementVirtualizationFirmwareEnabled
    try {
        $info = Get-ComputerInfo -ErrorAction Stop
        $val = $info.HyperVRequirementVirtualizationFirmwareEnabled
        if ($null -ne $val) {
            if ($val) { return "yes" } else { return "no" }
        }
    } catch {
        # fall through to attempt 3
    }

    # Attempt 3: systeminfo regex (en + ko)
    try {
        $sysinfo = systeminfo 2>$null | Out-String
        # English: "Virtualization Enabled In Firmware: Yes/No"
        if ($sysinfo -match 'Virtualization Enabled In Firmware:\s+(Yes|No)') {
            if ($Matches[1] -eq "Yes") { return "yes" } else { return "no" }
        }
        # Korean: "펌웨어에서 가상화 사용: 예/아니요"
        if ($sysinfo -match '펌웨어에서 가상화 사용:\s+(예|아니요)') {
            if ($Matches[1] -eq "예") { return "yes" } else { return "no" }
        }
    } catch {
        # fall through to unknown
    }

    return "unknown"
}

# ── Probe 2: WSL feature state ─────────────────────────────────────────────

function Probe-WslFeature {
    # Get-WindowsOptionalFeature requires elevation to query reliably.
    # On non-elevated invocation, the cmdlet may throw; treat as 'unknown'.
    try {
        $feat = Get-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform `
            -ErrorAction Stop
        if ($feat.State -eq "Enabled") { return "enabled" }
        else { return "disabled" }
    } catch {
        return "unknown"
    }
}

# ── Probe 3: WSL2 active ───────────────────────────────────────────────────

function Probe-Wsl2Active {
    # `wsl --status` returns non-zero if WSL is not installed at all.
    $statusOut = & wsl.exe --status 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) {
        return "not_installed"
    }
    # `wsl --version` is the modern (Win10 22H2+ / Win11) command. On older
    # builds it may not exist; presence of a version line indicates wsl2.
    $verOut = & wsl.exe --version 2>&1 | Out-String
    if ($verOut -match 'WSL version:\s*(\d+)\.(\d+)\.(\d+)') {
        return "wsl2"
    }
    # `wsl --status` contains the line "Default Version: 2" on wsl2 hosts
    # without `wsl --version`.
    if ($statusOut -match 'Default Version:\s*2') {
        return "wsl2"
    }
    if ($statusOut -match 'Default Version:\s*1') {
        return "wsl1"
    }
    return "not_installed"
}

# ── Probe 4: Group Policy ──────────────────────────────────────────────────

function Probe-GroupPolicy {
    try {
        $key = Get-ItemProperty -Path "HKLM:\SOFTWARE\Policies\Microsoft\Windows\WSL" `
            -ErrorAction Stop
        if ($null -ne $key.AllowWSL -and $key.AllowWSL -eq 0) {
            return "blocked"
        }
    } catch {
        # Key absent → no GPO restriction at this path. Note: AppLocker on
        # wsl.exe lives under a DIFFERENT key and is out of scope per C10.
    }
    return "allowed"
}

# ── Probe 5: AV exclusion (Defender only) ──────────────────────────────────

function Probe-AvExclusion {
    if (-not $IncludeAvProbe) {
        return "unknown"
    }
    try {
        $pref = Get-MpPreference -ErrorAction Stop
        $exclusions = @($pref.ExclusionPath)
        $wslPath = Join-Path $env:LOCALAPPDATA "musu\wsl"
        # Case-insensitive substring match — exclusions may be a parent dir.
        foreach ($e in $exclusions) {
            if ($null -ne $e -and $wslPath.ToLower().StartsWith($e.ToLower())) {
                return "wsl_excluded"
            }
        }
        return "wsl_not_excluded"
    } catch {
        return "unknown"
    }
}

# ── Probe 6: OS version / build / language ─────────────────────────────────

function Probe-OsInfo {
    $result = [ordered]@{
        os_version = "unknown"
        os_build   = 0
        os_lang    = 0
    }
    try {
        $os = Get-CimInstance Win32_OperatingSystem -ErrorAction Stop
        if ($null -ne $os.Version) { $result.os_version = $os.Version }
        if ($null -ne $os.BuildNumber) {
            $result.os_build = [int]$os.BuildNumber
        }
        if ($null -ne $os.OSLanguage) {
            $result.os_lang = [int]$os.OSLanguage
        }
    } catch {
        # Best-effort; default unknown values stand.
    }
    return $result
}

# ── Run all probes ─────────────────────────────────────────────────────────

$biosVt    = Probe-BiosVt
$wslFeat   = Probe-WslFeature
$wsl2Active = Probe-Wsl2Active
$gpo        = Probe-GroupPolicy
$av         = Probe-AvExclusion
$osInfo     = Probe-OsInfo

# Elevation status (probes that need it: WSL feature)
$identity   = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal  = New-Object Security.Principal.WindowsPrincipal($identity)
$isElevated = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

# Whether feature_state is assumed off (C11 LOW fallback flag)
$featureStateAssumedOff = $false

# ── Classify into b4c_host_class per §4.2 decision tree ────────────────────

function Classify-HostClass {
    param(
        [string]$BiosVt,
        [string]$WslFeat,
        [string]$Wsl2Active,
        [bool]$Elevated
    )
    # Start: BIOS-VT
    if ($BiosVt -eq "no") {
        return @{ host_class = "no-bios-vt-simulated"; elevation_required = $false }
    }
    if ($BiosVt -eq "unknown") {
        # Caller may pass -AllowUnknownBiosVt to install-wsl2 to override;
        # check-prereqs cannot anticipate that. Classify as no-bios-vt for
        # safety; install-wsl2's switch flips on operator opt-in.
        return @{ host_class = "no-bios-vt-simulated"; elevation_required = $false }
    }

    # BIOS-VT is yes → branch on wsl_feature
    switch ($WslFeat) {
        "disabled" {
            return @{ host_class = "wsl2-off-feature-off"; elevation_required = $false }
        }
        "unknown" {
            if ($Elevated) {
                # C11 LOW fallback: probed elevated, STILL unknown (rare —
                # third-party security software, Hyper-V disabled, etc.).
                # Assume disabled, treat as wsl2-off-feature-off, tag flag.
                $script:featureStateAssumedOff = $true
                return @{ host_class = "wsl2-off-feature-off"; elevation_required = $false }
            } else {
                # Need re-probe elevated to differentiate enabled/disabled.
                return @{ host_class = "wsl2-off-feature-unknown"; elevation_required = $true }
            }
        }
        "enabled" {
            # Feature on → branch on wsl2_active
            switch ($Wsl2Active) {
                "wsl2" {
                    return @{ host_class = "wsl2-already-on"; elevation_required = $false }
                }
                "wsl1" {
                    return @{ host_class = "wsl2-off-feature-on"; elevation_required = $false }
                }
                "not_installed" {
                    return @{ host_class = "wsl2-off-feature-on"; elevation_required = $false }
                }
                default {
                    return @{ host_class = "wsl2-off-feature-on"; elevation_required = $false }
                }
            }
        }
        default {
            return @{ host_class = "wsl2-off-feature-off"; elevation_required = $false }
        }
    }
}

$classification = Classify-HostClass `
    -BiosVt $biosVt `
    -WslFeat $wslFeat `
    -Wsl2Active $wsl2Active `
    -Elevated $isElevated

# ── Build output ───────────────────────────────────────────────────────────

$out = [ordered]@{
    schema_version                   = 1
    probed_at_utc                    = (Get-Date).ToUniversalTime().ToString("o")
    host_class                       = $classification.host_class
    elevation_required_to_classify   = $classification.elevation_required
    elevated_at_probe                = $isElevated
    feature_state_assumed_off        = $featureStateAssumedOff
    probes                           = [ordered]@{
        bios_vt        = $biosVt
        wsl_feature    = $wslFeat
        wsl2_active    = $wsl2Active
        group_policy   = $gpo
        av_exclusion   = $av
        os_version     = $osInfo.os_version
        os_build       = $osInfo.os_build
        os_lang        = $osInfo.os_lang
    }
}

if ($OutputFormat -eq "Json") {
    $out | ConvertTo-Json -Depth 6
} else {
    # Text mode — human-readable summary.
    Write-Host "musu prereq check (schema v$($out.schema_version))"
    Write-Host "  host_class:                   $($out.host_class)"
    Write-Host "  elevation_required_to_classify: $($out.elevation_required_to_classify)"
    Write-Host "  elevated_at_probe:            $($out.elevated_at_probe)"
    Write-Host "  feature_state_assumed_off:    $($out.feature_state_assumed_off)"
    Write-Host "  probes:"
    foreach ($k in $out.probes.Keys) {
        Write-Host ("    {0,-15} {1}" -f $k, $out.probes[$k])
    }
}
