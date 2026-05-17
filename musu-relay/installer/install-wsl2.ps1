# install-wsl2.ps1 — V23.2 Workstream B4b (wiki/372 §5)
#
# Windows-side PowerShell installer for musu-backend.tar (built by B4a).
# Turns a clean Windows 10 2004+/Win11 host into a running musu-gateway
# in 12 steps. Implements the canonical V23 §0.5 3-tier install flow.
#
# Critic Findings honored (wiki/372 §14):
#   C1 HIGH  — gateway-main.ts at src/gateway/main.ts (NOT installer/);
#              compiled to dist/gateway/main.js by `npm run build`; baked
#              into tar by B4a's `cp -r dist/gateway`. Step 7 only patches
#              the OpenRC service file (no shim copy needed).
#   C2 HIGH  — α-path orphan cleanup (steps 7-9 in try/catch; on throw,
#              `wsl --unregister musu` to restore clean state). Pre-check
#              for existing 'musu' distro + -ForceReinstall flag.
#   C3 HIGH  — Refuse un-elevated -TunnelToken. Elevation hop drops the
#              token; elevated child step 5 prompts via Read-Host -AsSecure-
#              String. No temp-file pattern (Invoke-MusuElevationHop removed).
#   C5 MED   — OpenRC service file replaced via atomic tmp+mv (no `sed -i`).
#   C6 MED   — gateway.env written atomic via tmp+mv (umask 077, chmod 0600,
#              chown root:root before rename).
#   C7 MED   — Failure dumps stay LOCAL; no auto-upload (no
#              Send-MusuPendingFailureDump call in step 12).
#   C8 MED   — Tar SHA-256 mismatch error prints installer version + expected
#              vs actual + recovery instruction.
#   C9 MED   — Scheduled Task uses VISIBLE console (no -WindowStyle Hidden).
#              Max 3 retries before self-unregister + final dump.
#   C11 LOW  — Double-unknown elevated → assume wsl2-off-feature-off
#              (handled inside check-prereqs.ps1).
#   C12 LOW  — Step 5.5 conditional `Add-MpPreference -ExclusionPath`
#              for Defender.
#   C14 INFO — install_completed POST emitted by src/gateway/main.ts (NOT
#              by this script).
#
# Operator usage (happy path):
#   .\install-wsl2.ps1 -TunnelToken <hex>   (run from elevated PowerShell)
#
# Recovery:
#   .\install-wsl2.ps1 -ForceReinstall     (overwrite existing 'musu' distro)
#   .\uninstall.ps1 -Reset                 (full clean, also clears install_id)

#Requires -Version 5.1

[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $false)][string]$TunnelToken,
    [string]$HostClass = "",
    [switch]$AllowUnknownBiosVt,
    [switch]$ResumeAfterReboot,
    [string]$StateFile = "",
    [string]$TarPath = "",
    [string]$SigningBase = "https://signaling.musu.pro",
    [string]$MusuProBase = "https://musu.pro",
    [switch]$ForceReinstall,
    # V23.3 B2 (wiki/390 / Critic C-B2-M4): caller-side opt-out for the
    # unauth install_attempt telemetry POST. When set, all 10 trigger
    # sites short-circuit before calling Send-MusuInstallAttempt. The
    # env-var MUSU_INSTALL_ATTEMPT_DISABLED=1 is the equivalent ops
    # hatch inside Send-MusuInstallAttempt itself; either suffices. The
    # local Save-MusuFailureDump write remains unconditional in both
    # modes (durable record stays local).
    [switch]$NoTelemetry
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"

# ── Constants ──────────────────────────────────────────────────────────────

# C8: Operator pins this constant at release time; "<UNSET>" accepts sidecar
# fallback for dev builds.
$ExpectedTarHash  = "<UNSET>"
$InstallerVersion = "B4b-dev"   # set to "B4b-rev<git-sha>" at release tag

# ── Import shared helpers ──────────────────────────────────────────────────

$ModulePath = Join-Path $PSScriptRoot "Musu-Common.psm1"
if (-not (Test-Path $ModulePath)) {
    throw "Missing Musu-Common.psm1 in $PSScriptRoot"
}
Import-Module $ModulePath -Force -DisableNameChecking

$script:StartTime = Get-Date
$script:TarHashSource = "unknown"
$script:UserId = ""
$script:HostClass = ""
$script:InstallId = ""
$script:PrereqResult = $null

# ── V23.3 B2 (wiki/390) — telemetry call helper ────────────────────────────
#
# Wraps Send-MusuInstallAttempt with two safeguards used at every trigger
# site:
#   - Respects -NoTelemetry (Critic C-B2-M4 ship-with-switch).
#   - Defensively probes $script:PrereqResult.probes.{os_version,bios_vt}
#     before passing them along — they may be absent on early-fail paths
#     (e.g. site 1 fires inside step 3 where probes ran, but other sites
#     fire after a state-file resume where PrereqResult is still $null).
# Per wiki/390 §7.3, all sites should follow this exact shape; centralizing
# avoids drift between sites.
function _Invoke-MusuInstallAttemptTelemetry {
    param(
        [Parameter(Mandatory = $true)][string]$Step,
        [Parameter(Mandatory = $true)][string]$ErrorClass,
        [Parameter(Mandatory = $true)][int]$ElapsedMs
    )
    if ($NoTelemetry) { return }
    $tmOsVer = ""
    $tmBiosVt = ""
    if ($script:PrereqResult -and
        $script:PrereqResult.PSObject.Properties["probes"]) {
        if ($script:PrereqResult.probes.PSObject.Properties["os_version"]) {
            $tmOsVer = [string]$script:PrereqResult.probes.os_version
        }
        if ($script:PrereqResult.probes.PSObject.Properties["bios_vt"]) {
            $tmBiosVt = [string]$script:PrereqResult.probes.bios_vt
        }
    }
    Send-MusuInstallAttempt `
        -InstallId $script:InstallId `
        -Step $Step `
        -ErrorClass $ErrorClass `
        -ElapsedMs $ElapsedMs `
        -OsVersion $tmOsVer `
        -BiosVt $tmBiosVt `
        -HostClass $script:HostClass `
        -InstallerVersion $InstallerVersion `
        -SigningBase $SigningBase
}

# Default TarPath
if (-not $TarPath) {
    $TarPath = Join-Path $env:ProgramData "musu\staging\musu-backend.tar"
}

# Default StateFile
if (-not $StateFile) {
    $StateFile = Get-MusuStateFile
}

# ── Step 1 — install_id reuse + elevation check ────────────────────────────

Write-MusuInfo "Step 1/12: install_id + elevation"

$script:InstallId = New-MusuInstallId
Write-MusuInfo "install_id $($script:InstallId.Substring(0, 8))..."

$isElevated = Test-MusuElevation

# Critic HIGH #3 (C3): refuse un-elevated -TunnelToken outright. The
# un-elevated parent's command line is readable via `Get-Process | Select
# CommandLine`. Force operator to either (a) re-launch elevated with the
# token, or (b) re-launch un-elevated WITHOUT the token so the elevated
# child prompts via Read-Host -AsSecureString.
if (-not $isElevated -and $TunnelToken) {
    throw @"
For security, do not pass -TunnelToken on the un-elevated command line.
Other processes can read it via Get-Process | Select CommandLine.

Either:
  (a) re-launch this script from an elevated PowerShell prompt with -TunnelToken
  (b) re-launch without -TunnelToken (the elevated child will prompt interactively)
"@
}

if (-not $isElevated) {
    # Self-elevate via Start-Process -Verb RunAs. Args minus -TunnelToken
    # (refused above when un-elevated, so guaranteed absent here).
    Write-MusuInfo "Not elevated; relaunching elevated via UAC"
    $argList = @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", $MyInvocation.MyCommand.Path
    )
    foreach ($k in $PSBoundParameters.Keys) {
        if ($k -eq "TunnelToken") { continue }
        $v = $PSBoundParameters[$k]
        if ($v -is [System.Management.Automation.SwitchParameter]) {
            if ($v.IsPresent) { $argList += "-$k" }
        } else {
            $argList += "-$k"
            $argList += "$v"
        }
    }
    Start-Process powershell.exe -Verb RunAs -ArgumentList $argList -Wait
    exit 0
}

# ── Step 2 — Run check-prereqs.ps1 ─────────────────────────────────────────

Write-MusuInfo "Step 2/12: prereq probe"
$prereqScript = Join-Path $PSScriptRoot "check-prereqs.ps1"
if (-not (Test-Path $prereqScript)) {
    throw "check-prereqs.ps1 missing alongside install-wsl2.ps1"
}
$prereqJson = & $prereqScript -OutputFormat Json -IncludeAvProbe | Out-String
$script:PrereqResult = $prereqJson | ConvertFrom-Json

if ($HostClass) {
    Write-MusuInfo "operator-asserted host_class=$HostClass overrides probe $($script:PrereqResult.host_class)"
    $script:HostClass = $HostClass
} else {
    $script:HostClass = $script:PrereqResult.host_class
}
Write-MusuInfo "Detected host_class: $($script:HostClass)"

# If AllowUnknownBiosVt and probe said no-bios-vt-simulated due to unknown,
# promote to wsl2-off-feature-off path.
if ($AllowUnknownBiosVt -and $script:HostClass -eq "no-bios-vt-simulated" -and
    $script:PrereqResult.probes.bios_vt -eq "unknown") {
    Write-MusuWarn "-AllowUnknownBiosVt: treating unknown BIOS-VT as 'yes'"
    if ($script:PrereqResult.probes.wsl_feature -eq "enabled") {
        if ($script:PrereqResult.probes.wsl2_active -eq "wsl2") {
            $script:HostClass = "wsl2-already-on"
        } else {
            $script:HostClass = "wsl2-off-feature-on"
        }
    } else {
        $script:HostClass = "wsl2-off-feature-off"
    }
    Write-MusuInfo "Promoted host_class: $($script:HostClass)"
}

# ── Step 3 — Branch on tier ────────────────────────────────────────────────

if (-not $ResumeAfterReboot) {
    switch ($script:HostClass) {

        "no-bios-vt-simulated" {
            Write-MusuErr @"
BIOS-VT is OFF or undetectable. musu cannot run without hardware virtualization.

To enable BIOS-VT:
  1. Reboot into your BIOS/UEFI (vendor-specific key: F2/F10/F12/Del)
  2. Find 'Intel VT-x' / 'AMD-V' / 'SVM Mode' / 'Virtualization Technology'
  3. Set to Enabled, save, exit
  4. Re-run this script

If you're certain BIOS-VT is on but probing says 'unknown' (some OEM laptops
report incorrectly), re-run with -AllowUnknownBiosVt.
"@
            $elapsed = [int]((Get-Date) - $script:StartTime).TotalMilliseconds
            Save-MusuFailureDump `
                -Step "bios_vt_off" -ErrorClass "hard_blocker_bios" `
                -InstallId $script:InstallId `
                -HostState @{
                    bios_vt = $script:PrereqResult.probes.bios_vt
                    host_class = $script:HostClass
                } `
                -ElapsedMs $elapsed
            # V23.3 B2 (wiki/390 §7.2 site #1 — bios_vt_off).
            _Invoke-MusuInstallAttemptTelemetry `
                -Step "bios_vt_off" -ErrorClass "hard_blocker_bios" `
                -ElapsedMs $elapsed
            exit 1
        }

        "wsl2-off-feature-off" {
            if ($PSCmdlet.ShouldProcess(
                "VirtualMachinePlatform + WSL", "Enable Windows features (DISM)")) {

                Write-MusuInfo "Step 3/12: DISM enable WSL features (reboot required)"
                & dism.exe /online /enable-feature `
                    /featurename:VirtualMachinePlatform /all /norestart
                if ($LASTEXITCODE -ne 0) {
                    $elapsed = [int]((Get-Date) - $script:StartTime).TotalMilliseconds
                    Save-MusuFailureDump `
                        -Step "wsl_feature" -ErrorClass "permission" `
                        -InstallId $script:InstallId `
                        -ElapsedMs $elapsed
                    # V23.3 B2 (wiki/390 §7.2 site #2 — wsl_feature DISM
                    # VirtualMachinePlatform fail).
                    _Invoke-MusuInstallAttemptTelemetry `
                        -Step "wsl_feature" -ErrorClass "permission" `
                        -ElapsedMs $elapsed
                    throw "dism enable VirtualMachinePlatform failed: exit $LASTEXITCODE"
                }
                & dism.exe /online /enable-feature `
                    /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
                if ($LASTEXITCODE -ne 0) {
                    $elapsed = [int]((Get-Date) - $script:StartTime).TotalMilliseconds
                    Save-MusuFailureDump `
                        -Step "wsl_feature" -ErrorClass "permission" `
                        -InstallId $script:InstallId `
                        -ElapsedMs $elapsed
                    # V23.3 B2 (wiki/390 §7.2 site #3 — wsl_feature DISM
                    # WSL feature fail).
                    _Invoke-MusuInstallAttemptTelemetry `
                        -Step "wsl_feature" -ErrorClass "permission" `
                        -ElapsedMs $elapsed
                    throw "dism enable WSL failed: exit $LASTEXITCODE"
                }
                Write-MusuOk "WSL features enabled (pending reboot)"

                # Save state for resume
                $state = @{
                    install_id        = $script:InstallId
                    stage_completed   = "wsl_feature_enabled_pending_reboot"
                    elevated_user     = $env:USERNAME
                    tar_path          = (Resolve-Path $TarPath -ErrorAction SilentlyContinue).Path
                    tunnel_token_hash = if ($TunnelToken) {
                        Get-MusuStringHash -InputString $TunnelToken
                    } else { "" }
                    host_class        = $script:HostClass
                    signing_base      = $SigningBase
                    musu_pro_base     = $MusuProBase
                    saved_at_utc      = (Get-Date).ToUniversalTime().ToString("o")
                    retry_count       = 0
                }
                Save-MusuState -State $state -StateFile $StateFile
                Register-MusuResumeTask -ScriptPath $MyInvocation.MyCommand.Path -StateFile $StateFile

                Write-MusuOk "Will reboot now. Installer auto-resumes after logon."
                Restart-Computer -Confirm -Force
                exit 0
            }
        }

        "wsl2-off-feature-on" {
            Write-MusuInfo "Step 3/12: wsl --install --no-distribution --no-launch"
            & wsl.exe --install --no-distribution --no-launch
            if ($LASTEXITCODE -ne 0) {
                $elapsed = [int]((Get-Date) - $script:StartTime).TotalMilliseconds
                Save-MusuFailureDump `
                    -Step "wsl_feature" -ErrorClass "permission" `
                    -InstallId $script:InstallId `
                    -ElapsedMs $elapsed
                # V23.3 B2 (wiki/390 §7.2 site #4 — wsl_feature
                # `wsl --install` fail).
                _Invoke-MusuInstallAttemptTelemetry `
                    -Step "wsl_feature" -ErrorClass "permission" `
                    -ElapsedMs $elapsed
                throw "wsl --install failed: exit $LASTEXITCODE"
            }
            Write-MusuOk "wsl --install succeeded"
        }

        "wsl2-off-feature-unknown" {
            # Should not reach here since check-prereqs probed elevated already
            # (step 1 forces elevation). Treat as wsl2-off-feature-off fallback
            # per §4.3 row 4 C11 LOW resolution.
            Write-MusuWarn "wsl_feature still unknown post-elevation; treating as off"
            $script:HostClass = "wsl2-off-feature-off"
            # Recurse-like: simulate by falling through; safer to just continue
            # straight to DISM path which we won't re-execute here. The right
            # behavior is to re-invoke ourselves; for simplicity, fall through
            # to step 4 and let DISM-less path produce a downstream error if
            # WSL really is missing. In practice the C11 fallback resolves to
            # wsl2-off-feature-off in step 2 already.
        }

        "wsl2-already-on" {
            Write-MusuInfo "Step 3/12: WSL2 already on; proceeding to import"
        }

        "fresh-win-vm" {
            Write-MusuInfo "Step 3/12: -HostClass fresh-win-vm; treating as feature-off"
            # Same DISM path as wsl2-off-feature-off, but skip BIOS-VT probe.
            # Recursion would be cleaner; for now require operator to
            # pre-enable features (B4c experimental tier).
            Write-MusuWarn "fresh-win-vm tier expects pre-enabled features. Skipping DISM."
        }

        default {
            throw "Unknown host_class: $($script:HostClass)"
        }
    }
}

# ── Step 3.5 — Resume continuity (read state file) ────────────────────────

if ($ResumeAfterReboot) {
    Write-MusuInfo "Resuming after reboot from $StateFile"
    $state = Read-MusuState -StateFile $StateFile
    if (-not $state) {
        Write-MusuErr "Resume requested but state file missing: $StateFile"
        Unregister-MusuResumeTask
        exit 1
    }

    # C9 max-retry: increment counter; if >= 3, self-unregister + final dump.
    $retry = 0
    if ($state.PSObject.Properties["retry_count"]) {
        $retry = [int]$state.retry_count
    }
    if ($retry -ge 3) {
        Write-MusuErr "Resume retry count exhausted ($retry); self-unregistering Scheduled Task"
        Save-MusuFailureDump `
            -Step "resume_retry_exhausted" -ErrorClass "timeout" `
            -InstallId $state.install_id `
            -ElapsedMs 0
        # V23.3 B2 (wiki/390 §7.2 site #10 — resume_retry_exhausted /
        # MANDATORY per Critic C-B2-M3). PrereqResult is NOT loaded on
        # resume paths (no step-2 re-run); the helper's defensive
        # PrereqResult check handles the $null case and just omits
        # os_version / bios_vt. We pass $state.install_id explicitly
        # because $script:InstallId is not yet set at this point in the
        # resume flow.
        if (-not $NoTelemetry) {
            Send-MusuInstallAttempt `
                -InstallId $state.install_id `
                -Step "resume_retry_exhausted" -ErrorClass "timeout" `
                -ElapsedMs 0 `
                -HostClass ([string]$state.host_class) `
                -InstallerVersion $InstallerVersion `
                -SigningBase $SigningBase
        }
        Unregister-MusuResumeTask
        if (Test-Path $StateFile) { Remove-Item -Force $StateFile }
        exit 1
    }
    $state.retry_count = $retry + 1
    # Save updated retry count immediately (so a crash before step 12 still counts)
    $stateHash = @{}
    foreach ($p in $state.PSObject.Properties) { $stateHash[$p.Name] = $p.Value }
    Save-MusuState -State $stateHash -StateFile $StateFile

    $script:InstallId = $state.install_id
    $script:HostClass = $state.host_class
    if ($state.tar_path) { $TarPath = $state.tar_path }
    if ($state.signing_base) { $SigningBase = $state.signing_base }
    if ($state.musu_pro_base) { $MusuProBase = $state.musu_pro_base }

    Write-MusuOk "Resumed at retry $($state.retry_count)/3"
}

# ── Step 4 — Verify tar SHA-256 ────────────────────────────────────────────

Write-MusuInfo "Step 4/12: tar SHA-256 verify"
if (-not (Test-Path $TarPath)) {
    $elapsed = [int]((Get-Date) - $script:StartTime).TotalMilliseconds
    Save-MusuFailureDump `
        -Step "tar_hash_mismatch" -ErrorClass "tampered_artifact" `
        -InstallId $script:InstallId
    # V23.3 B2 (wiki/390 §7.2 site #5a — tar_hash_mismatch / missing tar).
    _Invoke-MusuInstallAttemptTelemetry `
        -Step "tar_hash_mismatch" -ErrorClass "tampered_artifact" `
        -ElapsedMs $elapsed
    throw "TarPath not found: $TarPath"
}
$actualHash = (Get-FileHash -Path $TarPath -Algorithm SHA256).Hash.ToLower()

if ($ExpectedTarHash -eq "<UNSET>") {
    $sidecar = "$TarPath.sha256"
    if (-not (Test-Path $sidecar)) {
        $msg = @"
tar SHA-256 verification cannot proceed.
  Installer version: $InstallerVersion
  Expected: baked constant is <UNSET> AND sidecar $sidecar absent.
  Recovery: rebuild musu-backend.tar with build-musu-backend.ps1 (which
            emits a .sha256 sidecar), OR pin a release-time hash by editing
            this script's `$ExpectedTarHash` constant.
"@
        $elapsed = [int]((Get-Date) - $script:StartTime).TotalMilliseconds
        Save-MusuFailureDump `
            -Step "tar_hash_mismatch" -ErrorClass "tampered_artifact" `
            -InstallId $script:InstallId `
            -ElapsedMs $elapsed `
            -TarHashSource "missing"
        # V23.3 B2 (wiki/390 §7.2 site #5b — tar_hash_mismatch / missing
        # sidecar).
        _Invoke-MusuInstallAttemptTelemetry `
            -Step "tar_hash_mismatch" -ErrorClass "tampered_artifact" `
            -ElapsedMs $elapsed
        throw $msg
    }
    $expected = (Get-Content $sidecar -Raw).Trim().ToLower()
    $script:TarHashSource = "sidecar"
} else {
    $expected = $ExpectedTarHash.ToLower()
    $script:TarHashSource = "baked"
}

if ($actualHash -ne $expected) {
    # C8: error prints installer version + expected vs actual + recovery.
    $msg = @"
tar SHA-256 mismatch.
  Installer version: $InstallerVersion
  Expected:          $expected   (source: $script:TarHashSource)
  Actual:            $actualHash
  TarPath:           $TarPath

Recovery: verify you downloaded the matching tar+installer pair. If this is
a dev build, regenerate musu-backend.tar.sha256 by running
`(Get-FileHash $TarPath -Algorithm SHA256).Hash.ToLower() | Set-Content $TarPath.sha256`.
"@
    $elapsed = [int]((Get-Date) - $script:StartTime).TotalMilliseconds
    Save-MusuFailureDump `
        -Step "tar_hash_mismatch" -ErrorClass "tampered_artifact" `
        -InstallId $script:InstallId `
        -ElapsedMs $elapsed `
        -TarHashSource $script:TarHashSource
    # V23.3 B2 (wiki/390 §7.2 site #5c — tar_hash_mismatch / hash
    # mismatch).
    _Invoke-MusuInstallAttemptTelemetry `
        -Step "tar_hash_mismatch" -ErrorClass "tampered_artifact" `
        -ElapsedMs $elapsed
    throw $msg
}
Write-MusuOk "tar SHA-256 verified (source: $script:TarHashSource)"

# ── Step 5 — Acquire tunnel_token + user_id ───────────────────────────────

Write-MusuInfo "Step 5/12: tunnel_token + user_id"
if (-not $TunnelToken) {
    # Elevation hop dropped the token; prompt now (Read-Host -AsSecureString
    # is console-visible, never logged in CommandLine — C3 HIGH resolution).
    $secureToken = Read-Host -Prompt "Enter musu.pro tunnel token" -AsSecureString
    $TunnelToken = [System.Net.NetworkCredential]::new("", $secureToken).Password
}

if (-not $TunnelToken) {
    throw "tunnel_token not supplied"
}

# Step 5.5 — AV exclusion (C12 LOW)
$avState = $null
if ($script:PrereqResult -and
    $script:PrereqResult.PSObject.Properties["probes"] -and
    $script:PrereqResult.probes.PSObject.Properties["av_exclusion"]) {
    $avState = $script:PrereqResult.probes.av_exclusion
}
if ($avState -eq "wsl_not_excluded") {
    Write-MusuInfo "Step 5.5/12: adding Defender exclusion for $env:LOCALAPPDATA\musu\wsl"
    try {
        Add-MpPreference -ExclusionPath (Join-Path $env:LOCALAPPDATA "musu\wsl") -ErrorAction Stop
        Write-MusuOk "Defender exclusion added"
    } catch {
        Write-MusuWarn "Defender exclusion add failed: $($_.Exception.Message) (continuing)"
    }
}

# Step 5.7 — Validate token via musu.pro
Write-MusuInfo "Step 5.7/12: POST /api/v1/nodes/validate"
$validateBody = @{ token = $TunnelToken } | ConvertTo-Json -Compress
try {
    $resp = Invoke-RestMethod -Uri "$MusuProBase/api/v1/nodes/validate" `
        -Method POST -ContentType "application/json" -Body $validateBody `
        -UseBasicParsing -TimeoutSec 30
} catch {
    $elapsed = [int]((Get-Date) - $script:StartTime).TotalMilliseconds
    Save-MusuFailureDump `
        -Step "validate_token" -ErrorClass "network" `
        -InstallId $script:InstallId `
        -ElapsedMs $elapsed
    # V23.3 B2 (wiki/390 §7.2 site #6a — validate_token / network).
    _Invoke-MusuInstallAttemptTelemetry `
        -Step "validate_token" -ErrorClass "network" `
        -ElapsedMs $elapsed
    throw "musu.pro /validate POST failed: $($_.Exception.Message)"
}

if (-not $resp.valid) {
    $elapsed = [int]((Get-Date) - $script:StartTime).TotalMilliseconds
    Save-MusuFailureDump `
        -Step "validate_token" -ErrorClass "invalid_token" `
        -InstallId $script:InstallId `
        -ElapsedMs $elapsed
    # V23.3 B2 (wiki/390 §7.2 site #6b — validate_token / invalid_token).
    _Invoke-MusuInstallAttemptTelemetry `
        -Step "validate_token" -ErrorClass "invalid_token" `
        -ElapsedMs $elapsed
    throw "musu.pro /validate refused tunnel_token"
}
if (-not $resp.user_id) {
    $elapsed = [int]((Get-Date) - $script:StartTime).TotalMilliseconds
    Save-MusuFailureDump `
        -Step "validate_token" -ErrorClass "musu_pro_b2_not_deployed" `
        -InstallId $script:InstallId `
        -ElapsedMs $elapsed
    # V23.3 B2 (wiki/390 §7.2 site #6c — validate_token /
    # musu_pro_b2_not_deployed).
    _Invoke-MusuInstallAttemptTelemetry `
        -Step "validate_token" -ErrorClass "musu_pro_b2_not_deployed" `
        -ElapsedMs $elapsed
    throw "musu.pro /validate did not return user_id (B2 not deployed?)"
}
$script:UserId = $resp.user_id
Write-MusuOk "Resolved user_id $($script:UserId.Substring(0, 8))..."

# ── Step 6 — wsl --import with ACL hardening + C2 pre-check ────────────────

Write-MusuInfo "Step 6/12: wsl --import musu"
$ImportDir = Join-Path $env:LOCALAPPDATA "musu\wsl"
New-Item -ItemType Directory -Force -Path $ImportDir | Out-Null
# C2 HIGH: ACL — only SYSTEM + current user.
icacls $ImportDir /inheritance:r `
    /grant:r "SYSTEM:(OI)(CI)F" `
    /grant:r "${env:USERNAME}:(OI)(CI)F" `
    | Out-Null

# Pre-check: refuse if 'musu' distro already exists, unless -ForceReinstall (C2)
$existing = & wsl.exe -l --quiet 2>$null | ForEach-Object { $_.Trim() } | Where-Object { $_ -eq "musu" }
if ($existing -and -not $ForceReinstall) {
    $elapsed = [int]((Get-Date) - $script:StartTime).TotalMilliseconds
    Save-MusuFailureDump `
        -Step "wsl_import" -ErrorClass "v21_collision" `
        -InstallId $script:InstallId `
        -ElapsedMs $elapsed
    # V23.3 B2 (wiki/390 §7.2 site #7a — wsl_import / v21_collision).
    _Invoke-MusuInstallAttemptTelemetry `
        -Step "wsl_import" -ErrorClass "v21_collision" `
        -ElapsedMs $elapsed
    throw "A 'musu' WSL distro already exists. Run uninstall.ps1 first, or re-run install-wsl2.ps1 with -ForceReinstall to overwrite (destroys K8s state inside)."
}
if ($existing -and $ForceReinstall) {
    Write-MusuWarn "-ForceReinstall: unregistering existing 'musu' distro"
    & wsl.exe --unregister musu 2>$null | Out-Null
}

& wsl.exe --import musu $ImportDir $TarPath --version 2
if ($LASTEXITCODE -ne 0) {
    $elapsed = [int]((Get-Date) - $script:StartTime).TotalMilliseconds
    Save-MusuFailureDump `
        -Step "wsl_import" -ErrorClass "import_failed" `
        -InstallId $script:InstallId `
        -ElapsedMs $elapsed
    # V23.3 B2 (wiki/390 §7.2 site #7b — wsl_import / import_failed).
    _Invoke-MusuInstallAttemptTelemetry `
        -Step "wsl_import" -ErrorClass "import_failed" `
        -ElapsedMs $elapsed
    throw "wsl --import failed: exit $LASTEXITCODE"
}
Write-MusuOk "wsl --import musu succeeded"

# ── Step 6.5 — α-path orphan cleanup wrapper (C2 HIGH) ────────────────────

# Steps 7, 8, 9 are inside this try/catch. If ANY of them throws, unregister
# the just-imported distro so the next install starts from a clean state.
try {

    # ── Step 7 — Atomic OpenRC service file replace (C5 MED) ───────────────

    Write-MusuInfo "Step 7/12: replace /etc/init.d/musu-gateway"
    # V23.3 B7 (wiki/379 §2 B7): sources the canonical openrc-musu-gateway.conf
    # (b4b drop-in deleted in V23.3 B7; canonical now points at main.js).
    $gwSrc = Join-Path $PSScriptRoot "openrc-musu-gateway.conf"
    if (-not (Test-Path $gwSrc)) {
        throw "openrc-musu-gateway.conf missing at $gwSrc"
    }
    # Read with UTF-8, strip CR so the file is LF-only inside the distro.
    $gwContent = (Get-Content $gwSrc -Raw -Encoding UTF8) -replace "`r`n", "`n"
    # Pipe content via wsl stdin into sh -c 'cat > tmp && chmod && mv'.
    $gwContent | & wsl.exe -d musu -- sh -c `
        "cat > /etc/init.d/musu-gateway.tmp && chmod 0755 /etc/init.d/musu-gateway.tmp && mv /etc/init.d/musu-gateway.tmp /etc/init.d/musu-gateway"
    if ($LASTEXITCODE -ne 0) {
        throw "OpenRC service file replace failed: exit $LASTEXITCODE"
    }
    Write-MusuOk "OpenRC service file replaced atomically"

    # ── Step 8 — Write /etc/musu/gateway.env atomically (C6 MED) ───────────

    Write-MusuInfo "Step 8/12: write /etc/musu/gateway.env"
    # Resolve OS version + probe extras (for gateway-main's install_completed)
    $osVer = "unknown"
    if ($script:PrereqResult -and
        $script:PrereqResult.PSObject.Properties["probes"] -and
        $script:PrereqResult.probes.PSObject.Properties["os_version"]) {
        $osVer = $script:PrereqResult.probes.os_version
    }
    $biosVt = "unknown"
    if ($script:PrereqResult -and
        $script:PrereqResult.PSObject.Properties["probes"] -and
        $script:PrereqResult.probes.PSObject.Properties["bios_vt"]) {
        $biosVt = $script:PrereqResult.probes.bios_vt
    }
    $envContent = @"
MUSU_SIGNALING_URL=$SigningBase
MUSU_TELEMETRY_BASE=$SigningBase/v1/telemetry
MUSU_TUNNEL_TOKEN=$TunnelToken
MUSU_USER_ID=$($script:UserId)
MUSU_INSTALL_ID=$($script:InstallId)
MUSU_ACCOUNT_KEY_PATH=/etc/musu/account_key
MUSU_HOST_CLASS=$($script:HostClass)
MUSU_TAR_HASH_SOURCE=$($script:TarHashSource)
MUSU_WIN_OS_VERSION=$osVer
MUSU_BIOS_VT=$biosVt
MUSU_INSTALL_STARTED_AT_UTC=$($script:StartTime.ToUniversalTime().ToString("o"))
"@
    # Strip CR
    $envContent = $envContent -replace "`r`n", "`n"
    # Atomic write via tmp+mv (C6 MED): umask 077 → cat > .tmp → chmod →
    # chown → mv. Partial-write windows cannot leak the tunnel_token.
    $envContent | & wsl.exe -d musu -- sh -c `
        "umask 077 && cat > /etc/musu/gateway.env.tmp && chmod 0600 /etc/musu/gateway.env.tmp && chown root:root /etc/musu/gateway.env.tmp && mv /etc/musu/gateway.env.tmp /etc/musu/gateway.env"
    if ($LASTEXITCODE -ne 0) {
        throw "gateway.env write failed: exit $LASTEXITCODE"
    }
    Write-MusuOk "gateway.env written (0600 root:root)"

    # ── Step 9 — Generate account_key + pipe to musu-write-key ─────────────

    Write-MusuInfo "Step 9/12: POST /v1/telemetry/issue_install_key"
    $issueBody = @{
        tunnel_token    = $TunnelToken
        musu_install_id = $script:InstallId
    } | ConvertTo-Json -Compress

    try {
        $issueResp = Invoke-RestMethod -Uri "$SigningBase/v1/telemetry/issue_install_key" `
            -Method POST -ContentType "application/json" -Body $issueBody `
            -UseBasicParsing -TimeoutSec 30
    } catch {
        throw "/issue_install_key POST failed: $($_.Exception.Message)"
    }
    if (-not $issueResp.account_key) {
        throw "/issue_install_key did not return account_key"
    }
    $accountKey = $issueResp.account_key
    if ($accountKey -notmatch '^[0-9a-f]{64}$') {
        throw "/issue_install_key returned malformed account_key (not 64 lowercase hex)"
    }

    # Write to a temp file with restrictive ACL, then pipe content into
    # musu-write-key. Defense-in-depth — the temp file lives on disk for
    # ~10ms (icacls grants only current user + SYSTEM; finally{} guarantees
    # removal).
    $keyTmp = [System.IO.Path]::GetTempFileName()
    try {
        [System.IO.File]::WriteAllText(
            $keyTmp, $accountKey, [System.Text.UTF8Encoding]::new($false))
        icacls $keyTmp /inheritance:r `
            /grant:r "${env:USERNAME}:F" `
            /grant:r "SYSTEM:F" `
            | Out-Null
        # Pipe content into musu-write-key. The B4a helper is CRLF-tolerant
        # per wiki/371 audit-fix M2.
        Get-Content $keyTmp -Raw -Encoding UTF8 |
            & wsl.exe -d musu -- /usr/local/bin/musu-write-key
        if ($LASTEXITCODE -ne 0) {
            throw "musu-write-key exit $LASTEXITCODE"
        }
    } finally {
        if (Test-Path $keyTmp) {
            Remove-Item -Force $keyTmp -ErrorAction SilentlyContinue
        }
    }
    Write-MusuOk "account_key written to /etc/musu/account_key (0600 root:root)"

} catch {
    # C2 HIGH: α-path orphan cleanup.
    Write-MusuErr "Install failed during steps 7-9: $($_.Exception.Message)"
    Write-MusuWarn "Unregistering 'musu' distro to clean orphan state"
    & wsl.exe --unregister musu 2>$null | Out-Null
    $elapsed = [int]((Get-Date) - $script:StartTime).TotalMilliseconds
    Save-MusuFailureDump `
        -Step "alpha_bootstrap" -ErrorClass "rolled_back" `
        -InstallId $script:InstallId `
        -ElapsedMs $elapsed
    # V23.3 B2 (wiki/390 §7.2 site #8 — alpha_bootstrap / rolled_back).
    # Single emit covers all 7-9 sub-failures (the catch block is the
    # collective failure boundary; sub-site granularity already in the
    # exception message preserved for local Save-MusuFailureDump).
    _Invoke-MusuInstallAttemptTelemetry `
        -Step "alpha_bootstrap" -ErrorClass "rolled_back" `
        -ElapsedMs $elapsed
    throw
}

# ── Step 10 — Kick OpenRC default runlevel (starts musu-init) ──────────────

Write-MusuInfo "Step 10/12: openrc default (starts musu-init → K3s → gateway)"
# musu-init is symlinked under /etc/runlevels/default/ by B4a. `openrc default`
# triggers the runlevel which starts musu-init → which starts K3s, waits for
# account_key (already present from step 9), then starts musu-gateway.
& wsl.exe -d musu -- sh -c 'openrc default && echo MUSU_INIT_KICK_OK' | Out-String
if ($LASTEXITCODE -ne 0) {
    $elapsed = [int]((Get-Date) - $script:StartTime).TotalMilliseconds
    Save-MusuFailureDump `
        -Step "k3s_start" -ErrorClass "permission" `
        -InstallId $script:InstallId `
        -ElapsedMs $elapsed
    # V23.3 B2 (wiki/390 §7.2 site #9a — k3s_start / permission).
    _Invoke-MusuInstallAttemptTelemetry `
        -Step "k3s_start" -ErrorClass "permission" `
        -ElapsedMs $elapsed
    throw "openrc default failed: exit $LASTEXITCODE"
}

# ── Step 11 — Wait for gateway readiness ───────────────────────────────────

Write-MusuInfo "Step 11/12: waiting for musu-gateway readiness (120s timeout)"
$readyDeadline = (Get-Date).AddSeconds(120)
$ready = $false
while ((Get-Date) -lt $readyDeadline) {
    # Probe the gateway log for the connect-resolved line emitted by
    # src/gateway/main.ts (C14 INFO).
    $logOut = & wsl.exe -d musu -- sh -c 'tail -100 /var/log/musu-gateway.log 2>/dev/null' 2>$null | Out-String
    if ($logOut -match '\[gateway-main\] connect\(\) resolved' -or
        $logOut -match '\[gateway\] welcomed as peer=') {
        $ready = $true
        break
    }
    Start-Sleep -Seconds 2
}
if (-not $ready) {
    $elapsed = [int]((Get-Date) - $script:StartTime).TotalMilliseconds
    Save-MusuFailureDump `
        -Step "musu_relay_start" -ErrorClass "gateway_timeout" `
        -InstallId $script:InstallId `
        -ElapsedMs $elapsed
    # V23.3 B2 (wiki/390 §7.2 site #9b — musu_relay_start /
    # gateway_timeout).
    _Invoke-MusuInstallAttemptTelemetry `
        -Step "musu_relay_start" -ErrorClass "gateway_timeout" `
        -ElapsedMs $elapsed
    throw "musu-gateway did not connect to signaling within 120s"
}
Write-MusuOk "musu-gateway connected to signaling"

# ── Step 12 — Cleanup staging + Scheduled Task ─────────────────────────────

Write-MusuInfo "Step 12/12: cleanup"
$stagingTar = Join-Path $env:ProgramData "musu\staging\musu-backend.tar"
if (Test-Path $stagingTar) {
    Remove-Item -Force $stagingTar -ErrorAction SilentlyContinue
}

Unregister-MusuResumeTask

if (Test-Path $StateFile) {
    Remove-Item -Force $StateFile -ErrorAction SilentlyContinue
}

# C7 MED: NO Send-MusuPendingFailureDump. Failure dumps stay on local disk
# for operator-initiated support collection; no silent auto-upload.

$elapsed = [int]((Get-Date) - $script:StartTime).TotalMilliseconds
Write-MusuOk "Install complete in ${elapsed}ms. musu-gateway running."
Write-MusuInfo "install_completed telemetry emitted by gateway-main (inside WSL)"
exit 0
