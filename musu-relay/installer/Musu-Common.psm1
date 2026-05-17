# Musu-Common.psm1 — V23.2 Workstream B4b (wiki/372 §3)
#
# Shared helpers imported by check-prereqs.ps1, install-wsl2.ps1, uninstall.ps1.
#
# Critic Findings honored (wiki/372 §14):
#   C3 HIGH — `Invoke-MusuElevationHop` is DELIBERATELY ABSENT. The elevation
#             hop in install-wsl2.ps1 step 1 uses `Start-Process -Verb RunAs`
#             with args minus -TunnelToken (which is refused if passed un-
#             elevated). No temp-file pattern, no token leak window.
#   C7 MEDIUM — `Send-MusuPendingFailureDump` is DELIBERATELY ABSENT. Failure
#             dumps stay on local disk for operator-initiated support
#             collection; no auto-upload (no /v1/telemetry/install_failed
#             endpoint exists in B4b anyway). Upload + explicit-consent UX
#             deferred to V23.3.
#   C9 MEDIUM — `Register-MusuResumeTask` registers a Scheduled Task with a
#             VISIBLE console window (no `-WindowStyle Hidden`) so any
#             Read-Host prompt for tunnel_token re-supply is visible.

#Requires -Version 5.1

Set-StrictMode -Version 2.0

# ── Output helpers (colored, prefixed) ───────────────────────────────────────

function Write-MusuOk {
    param([string]$Message)
    Write-Host "[musu-install] OK  $Message" -ForegroundColor Green
}

function Write-MusuWarn {
    param([string]$Message)
    Write-Host "[musu-install] !   $Message" -ForegroundColor Yellow
}

function Write-MusuErr {
    param([string]$Message)
    Write-Host "[musu-install] X   $Message" -ForegroundColor Red
}

function Write-MusuInfo {
    param([string]$Message)
    Write-Host "[musu-install]     $Message"
}

# ── install_id reuse (Researcher H10, Critic C4 MEDIUM resolution) ──────────

function New-MusuInstallId {
    <#
    .SYNOPSIS
    Read existing install_id from %LOCALAPPDATA%\musu\install_id, or generate
    a fresh one (32 hex chars, Guid "N" format) and persist it.

    .DESCRIPTION
    Reused across re-installs (per-Windows-user-on-host) so telemetry rows
    coalesce under one musu_install_id. Operator runs `uninstall.ps1 -Reset`
    to clear it for fresh telemetry-lineage.
    #>
    $installIdFile = Join-Path $env:LOCALAPPDATA "musu\install_id"
    if (Test-Path $installIdFile) {
        $existing = (Get-Content $installIdFile -Raw -ErrorAction Stop).Trim()
        # Validate shape: 32 lowercase hex chars
        if ($existing -match '^[0-9a-f]{32}$') {
            return $existing
        }
        Write-MusuWarn "Existing install_id at $installIdFile malformed; regenerating"
    }
    $newId = [Guid]::NewGuid().ToString("N")
    $parent = Split-Path $installIdFile -Parent
    if (-not (Test-Path $parent)) {
        New-Item -ItemType Directory -Force -Path $parent | Out-Null
    }
    Set-Content -Path $installIdFile -Value $newId -Encoding UTF8 -NoNewline
    return $newId
}

# ── Resume state file (Scheduled Task → resume continuity) ──────────────────

function Get-MusuStateFile {
    return (Join-Path $env:ProgramData "musu\install-state.json")
}

# ── Elevation check ─────────────────────────────────────────────────────────

function Test-MusuElevation {
    <#
    .SYNOPSIS
    Returns $true if the current PowerShell session is elevated (Administrator
    role), $false otherwise.
    #>
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# ── WSL exec wrapper ────────────────────────────────────────────────────────

function Invoke-WslExec {
    <#
    .SYNOPSIS
    Run a shell command inside the musu WSL distro with exit-code checking.

    .DESCRIPTION
    Wraps `wsl.exe -d musu -- sh -c <cmd>`. Throws on non-zero exit. Captures
    stderr alongside stdout via 2>&1 redirection.

    .PARAMETER Command
    POSIX shell snippet to run inside the distro.

    .PARAMETER DistroName
    Override the distro name (default "musu").

    .PARAMETER NoThrow
    If set, return the exit code instead of throwing. Caller inspects.
    #>
    param(
        [Parameter(Mandatory = $true)][string]$Command,
        [string]$DistroName = "musu",
        [switch]$NoThrow
    )
    $output = & wsl.exe -d $DistroName -- sh -c $Command 2>&1
    $exit = $LASTEXITCODE
    if ($exit -ne 0 -and -not $NoThrow) {
        throw "wsl -d $DistroName -- sh -c '$Command' exit=$exit output=$output"
    }
    return [pscustomobject]@{
        ExitCode = $exit
        Output   = ($output | Out-String).TrimEnd()
    }
}

# ── Local failure dump (Critic C7 MEDIUM — local only, NO auto-upload) ──────

function Save-MusuFailureDump {
    <#
    .SYNOPSIS
    Persist an install failure to %LOCALAPPDATA%\musu\install-failure.json.
    Local file only — no upload (C7 MEDIUM resolution).

    .DESCRIPTION
    Schema per wiki/372 §7. Sensitive fields (tunnel_token, account_key,
    user_id) are NEVER included.

    .PARAMETER Step
    Failure step name (one of the §7 step_failed enum values).

    .PARAMETER ErrorClass
    Failure class (one of the §7 step_error_class enum values).

    .PARAMETER InstallId
    The install_id this dump corresponds to.

    .PARAMETER HostState
    Optional hashtable of probe results to attach.

    .PARAMETER ElapsedMs
    Optional elapsed time before failure, in milliseconds.

    .PARAMETER TarHashSource
    Optional 'baked' | 'sidecar'.
    #>
    param(
        [Parameter(Mandatory = $true)][string]$Step,
        [Parameter(Mandatory = $true)][string]$ErrorClass,
        [string]$InstallId = "",
        [hashtable]$HostState = $null,
        [int]$ElapsedMs = 0,
        [string]$TarHashSource = ""
    )
    $dumpFile = Join-Path $env:LOCALAPPDATA "musu\install-failure.json"
    $parent = Split-Path $dumpFile -Parent
    if (-not (Test-Path $parent)) {
        New-Item -ItemType Directory -Force -Path $parent | Out-Null
    }

    $dump = [ordered]@{
        install_id                = $InstallId
        schema_version            = 1
        failure_step              = $Step
        failure_class             = $ErrorClass
        host_state                = $HostState
        timestamp_utc             = (Get-Date).ToUniversalTime().ToString("o")
        elapsed_ms_before_failure = $ElapsedMs
        tar_hash_source           = $TarHashSource
        user_consent_to_upload    = $false   # locked false (C7)
    }
    # Best-effort write; do NOT throw on failure (we're already in a failure
    # path and don't want to mask the original error).
    try {
        $dump | ConvertTo-Json -Depth 6 | Set-Content -Path $dumpFile -Encoding UTF8 -Force
    } catch {
        Write-MusuWarn "Failed to write failure dump to $dumpFile : $($_.Exception.Message)"
    }
}

# ── V23.3 B2 (wiki/390) — install_attempt telemetry helper ─────────────────

function Send-MusuInstallAttempt {
    <#
    .SYNOPSIS
    Best-effort POST to musu-relay's unauthenticated
    /v1/telemetry/install_attempt endpoint. NEVER throws; NEVER logs the
    response body. Designed to wrap Save-MusuFailureDump call sites
    without changing their throw semantics.

    .DESCRIPTION
    Unauth POST per V23.3 B2 (wiki/390). Pre-bootstrap installer
    failure telemetry — runs even when the host has no account_key.
    Rate-limited server-side (20 POSTs/hr per install_id + source_ip).

    Two opt-out paths exist (Critic C-B2-M4 resolution):
      1. -NoTelemetry switch on install-wsl2.ps1 (caller-side; wraps the
         call sites in `if (-not $NoTelemetry) { ... }`).
      2. MUSU_INSTALL_ATTEMPT_DISABLED=1 env-var honored as the FIRST
         line of this helper (silent no-op return). The env-var is the
         "ops disable without code change" hatch.

    The local Save-MusuFailureDump write at Musu-Common.psm1:133-193
    remains unconditionally — the durable record stays local in both
    modes.

    .PARAMETER InstallId
    The 32-hex musu_install_id from New-MusuInstallId.

    .PARAMETER Step
    Failure step name (matches Save-MusuFailureDump -Step values).

    .PARAMETER ErrorClass
    Failure class (matches Save-MusuFailureDump -ErrorClass values).

    .PARAMETER ElapsedMs
    Milliseconds elapsed before failure.

    .PARAMETER OsVersion
    Optional Windows OS version string.

    .PARAMETER BiosVt
    Optional 'yes'|'no'|'unknown'.

    .PARAMETER HostClass
    Optional host_class string.

    .PARAMETER InstallerVersion
    Optional installer version string (from $InstallerVersion constant).

    .PARAMETER SigningBase
    The signaling URL base (required). Pass install-wsl2.ps1's
    $SigningBase parameter so dev/test against a local musu-relay works.

    .OUTPUTS
    None. Best-effort fire-and-forget.
    #>
    param(
        [Parameter(Mandatory = $true)][string]$InstallId,
        [Parameter(Mandatory = $true)][string]$Step,
        [Parameter(Mandatory = $true)][string]$ErrorClass,
        [Parameter(Mandatory = $true)][int]$ElapsedMs,
        [string]$OsVersion = "",
        [string]$BiosVt = "",
        [string]$HostClass = "",
        [string]$InstallerVersion = "",
        [Parameter(Mandatory = $true)][string]$SigningBase
    )

    # C-B2-M4 opt-out hatch — silent no-op when env-var is set. MUST be
    # the FIRST line of the function body so it bypasses ALL downstream
    # logic (network, validation, ConvertTo-Json) — the operator's
    # intent is "no POST under any circumstance".
    if ($env:MUSU_INSTALL_ATTEMPT_DISABLED -eq "1") {
        return
    }

    # Validate install_id shape locally; if malformed, do NOT POST
    # (server will 400 anyway and a malformed id usually means we
    # haven't loaded New-MusuInstallId yet — emitting would be a bug).
    if ($InstallId -notmatch '^[0-9a-f]{32}$') {
        return
    }

    $body = [ordered]@{
        musu_install_id = $InstallId
        step            = $Step
        error_class     = $ErrorClass
        elapsed_ms      = $ElapsedMs
    }
    if ($OsVersion)        { $body['os_version']        = $OsVersion }
    if ($BiosVt)           { $body['bios_vt']           = $BiosVt }
    if ($HostClass)        { $body['host_class']        = $HostClass }
    if ($InstallerVersion) { $body['installer_version'] = $InstallerVersion }

    $json = $body | ConvertTo-Json -Compress
    try {
        Invoke-RestMethod `
            -Uri "$SigningBase/v1/telemetry/install_attempt" `
            -Method Post `
            -ContentType "application/json" `
            -Body $json `
            -UseBasicParsing `
            -TimeoutSec 10 `
            -ErrorAction Stop | Out-Null
    } catch {
        # Best-effort. Network down, server 4xx/5xx, DNS fail, cert
        # error — all swallowed. Failure dump on local disk
        # (Save-MusuFailureDump) is the durable record.
    }
}

# ── Hash helper (for tunnel_token_hash in state file — NOT raw token) ──────

function Get-MusuStringHash {
    <#
    .SYNOPSIS
    Return SHA-256 hex of an arbitrary string. Used for tunnel_token_hash
    in the resume state file so the raw token never touches disk.
    #>
    param([Parameter(Mandatory = $true)][string]$InputString)
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($InputString)
        $hash = $sha256.ComputeHash($bytes)
        return ($hash | ForEach-Object { $_.ToString("x2") }) -join ""
    } finally {
        $sha256.Dispose()
    }
}

# ── State persistence (Scheduled Task resume) ───────────────────────────────

function Save-MusuState {
    <#
    .SYNOPSIS
    Serialize a hashtable to the state file as JSON, UTF-8, no BOM.
    #>
    param(
        [Parameter(Mandatory = $true)][hashtable]$State,
        [Parameter(Mandatory = $true)][string]$StateFile
    )
    $parent = Split-Path $StateFile -Parent
    if (-not (Test-Path $parent)) {
        New-Item -ItemType Directory -Force -Path $parent | Out-Null
    }
    $json = $State | ConvertTo-Json -Depth 6
    Set-Content -Path $StateFile -Value $json -Encoding UTF8 -Force
}

function Read-MusuState {
    <#
    .SYNOPSIS
    Read and parse the state file. Returns $null if absent.
    #>
    param([Parameter(Mandatory = $true)][string]$StateFile)
    if (-not (Test-Path $StateFile)) {
        return $null
    }
    $json = Get-Content -Path $StateFile -Raw -Encoding UTF8
    return ($json | ConvertFrom-Json)
}

# ── Scheduled Task helpers (C9 — VISIBLE console, max 3 retries) ───────────

function Register-MusuResumeTask {
    <#
    .SYNOPSIS
    Register the musu-install-resume Scheduled Task for post-reboot continuation.

    .DESCRIPTION
    Action launches install-wsl2.ps1 with -ResumeAfterReboot + -StateFile.
    Trigger fires at logon of the current user. Window is VISIBLE (C9
    MEDIUM resolution — no -WindowStyle Hidden) so any Read-Host prompts
    for tunnel_token re-supply are reachable. Max 3 restart attempts via
    -RestartCount; the script itself self-unregisters after success OR
    after 3 failed attempts via state-file retry counter.

    .PARAMETER ScriptPath
    Absolute path to install-wsl2.ps1.

    .PARAMETER StateFile
    Absolute path to install-state.json (default Get-MusuStateFile).
    #>
    param(
        [Parameter(Mandatory = $true)][string]$ScriptPath,
        [string]$StateFile = ""
    )
    if (-not $StateFile) { $StateFile = Get-MusuStateFile }

    # Idempotent removal of any prior registration.
    Unregister-MusuResumeTask

    $argString = "-NoProfile -ExecutionPolicy Bypass -File `"$ScriptPath`" -ResumeAfterReboot -StateFile `"$StateFile`""
    # C9: NO -WindowStyle Hidden. Console must be visible so Read-Host prompts
    # for tunnel_token re-supply on resume are reachable by the operator.
    $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $argString

    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

    # RestartCount 2 means up to 3 total attempts. The script self-unregisters
    # after success OR after the state-file retry counter reaches 3 (whichever
    # is first).
    $settings = New-ScheduledTaskSettingsSet `
        -StartWhenAvailable `
        -DontStopIfGoingOnBatteries `
        -AllowStartIfOnBatteries `
        -RestartCount 2 `
        -RestartInterval (New-TimeSpan -Minutes 1)

    $principal = New-ScheduledTaskPrincipal `
        -UserId $env:USERNAME `
        -LogonType Interactive `
        -RunLevel Highest

    Register-ScheduledTask `
        -TaskName "musu-install-resume" `
        -Action $action `
        -Trigger $trigger `
        -Settings $settings `
        -Principal $principal `
        | Out-Null
}

function Unregister-MusuResumeTask {
    <#
    .SYNOPSIS
    Idempotent removal of the musu-install-resume Scheduled Task.
    #>
    Unregister-ScheduledTask -TaskName "musu-install-resume" `
        -Confirm:$false -ErrorAction SilentlyContinue
}

Export-ModuleMember -Function @(
    "Write-MusuOk",
    "Write-MusuWarn",
    "Write-MusuErr",
    "Write-MusuInfo",
    "New-MusuInstallId",
    "Get-MusuStateFile",
    "Test-MusuElevation",
    "Invoke-WslExec",
    "Save-MusuFailureDump",
    "Send-MusuInstallAttempt",
    "Get-MusuStringHash",
    "Save-MusuState",
    "Read-MusuState",
    "Register-MusuResumeTask",
    "Unregister-MusuResumeTask"
)
