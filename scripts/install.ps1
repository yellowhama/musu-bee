# musu-bridge installer — Windows native (no WSL)
# Equivalent to scripts/install.sh, mapped to PowerShell + Task Scheduler.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts\install.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\install.ps1 -Service
#   powershell -ExecutionPolicy Bypass -File scripts\install.ps1 -Service -Start
#
# Idempotent: already-installed steps are skipped. Safe to re-run.

[CmdletBinding()]
param(
    [switch]$Service,
    [switch]$Start
)

$ErrorActionPreference = "Stop"

# ── Paths ────────────────────────────────────────────────────────────────────
$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root        = Split-Path -Parent $ScriptDir
$MusuHome    = Join-Path $env:USERPROFILE ".musu"
$Venv        = Join-Path $Root "musu-bridge\.venv"
$BridgeEnv   = Join-Path $MusuHome "bridge.env"
$EnvExample  = Join-Path $ScriptDir "systemd\bridge.env.example"
$NodesToml   = Join-Path $MusuHome "nodes.toml"
$BeeDir      = Join-Path $Root "musu-bee"

# ── Output helpers ───────────────────────────────────────────────────────────
function Write-Ok($msg)   { Write-Host "[install] OK  $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "[install] !   $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "[install] X   $msg" -ForegroundColor Red; exit 1 }
function Write-Info($msg) { Write-Host "[install]     $msg" }

Write-Host ""
Write-Host "[install] === musu-bridge install (Windows) ==="
Write-Host "[install]     repo: $Root"
Write-Host "[install]     musu: $MusuHome"
Write-Host ""

# ── Step 1: Check Python 3.12+ ───────────────────────────────────────────────
$pythonCmd = Get-Command python -ErrorAction SilentlyContinue
if (-not $pythonCmd) {
    Write-Err "python not found. Install: winget install Python.Python.3.12"
}
$pyVersionRaw = & python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"
$pyMajor, $pyMinor = $pyVersionRaw.Split('.')
if ([int]$pyMajor -lt 3 -or ([int]$pyMajor -eq 3 -and [int]$pyMinor -lt 12)) {
    Write-Err "Python $pyVersionRaw < 3.12 required. Install: winget install Python.Python.3.12"
}
Write-Info "Step 1: Python $pyVersionRaw found"

# ── Step 2: Create %USERPROFILE%\.musu\ ──────────────────────────────────────
if (-not (Test-Path $MusuHome)) {
    New-Item -ItemType Directory -Path $MusuHome -Force | Out-Null
    # Restrict access to current user only (~chmod 700)
    icacls $MusuHome /inheritance:r /grant:r "${env:USERNAME}:(OI)(CI)F" | Out-Null
    Write-Ok "$MusuHome created"
} else {
    Write-Info "Step 2: $MusuHome already exists"
}
New-Item -ItemType Directory -Path (Join-Path $MusuHome "db") -Force | Out-Null

# ── Step 3: Create venv + install deps ───────────────────────────────────────
$venvPython = Join-Path $Venv "Scripts\python.exe"
if (-not (Test-Path $venvPython)) {
    Write-Info "Step 3: creating venv..."
    & python -m venv $Venv
    Write-Ok "venv created: $Venv"

    Write-Info "       installing musu-core..."
    & (Join-Path $Venv "Scripts\pip.exe") install --quiet -e (Join-Path $Root "musu-core")
    Write-Ok "musu-core installed"

    Write-Info "       installing musu-bridge..."
    & (Join-Path $Venv "Scripts\pip.exe") install --quiet -e (Join-Path $Root "musu-bridge")
    Write-Ok "musu-bridge installed"
} else {
    Write-Info "Step 3: venv already exists — skipping deps"
}

# ── Step 4: Seed ~/.musu/bridge.env ──────────────────────────────────────────
if (-not (Test-Path $BridgeEnv)) {
    Write-Info "Step 4: creating bridge.env..."
    Copy-Item $EnvExample $BridgeEnv
    icacls $BridgeEnv /inheritance:r /grant:r "${env:USERNAME}:F" | Out-Null

    # Auto-generate MUSU_BRIDGE_TOKEN via .NET RNGCryptoServiceProvider
    $bytes = New-Object 'byte[]' 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $token = ($bytes | ForEach-Object { $_.ToString('x2') }) -join ''
    (Get-Content $BridgeEnv) -replace '^MUSU_BRIDGE_TOKEN=.*', "MUSU_BRIDGE_TOKEN=$token" | Set-Content $BridgeEnv

    # Add BRIDGE_HOST for remote access
    Add-Content $BridgeEnv "`n# Remote access binding (added by install.ps1)`nBRIDGE_HOST=0.0.0.0"

    Write-Ok "bridge.env created (token auto-generated)"
    Write-Warn "To enable musu.pro peer discovery, set MUSU_TOKEN in $BridgeEnv"
} else {
    Write-Info "Step 4: bridge.env already exists — skipping"
    $existing = Get-Content $BridgeEnv -ErrorAction SilentlyContinue
    if ($existing -match '^MUSU_BRIDGE_TOKEN=$') {
        $bytes = New-Object 'byte[]' 32
        [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
        $token = ($bytes | ForEach-Object { $_.ToString('x2') }) -join ''
        ($existing) -replace '^MUSU_BRIDGE_TOKEN=.*', "MUSU_BRIDGE_TOKEN=$token" | Set-Content $BridgeEnv
        Write-Ok "MUSU_BRIDGE_TOKEN auto-generated"
    }
}

# ── Step 5: Init ~/.musu/nodes.toml (auto-detect via node_identity.py) ───────
if (-not (Test-Path $NodesToml)) {
    Write-Info "Step 5: detecting node identity..."
    $bridgeDir = Join-Path $Root "musu-bridge"
    $nodeInfoRaw = & $venvPython -c @"
import sys; sys.path.insert(0, r'$bridgeDir')
from node_identity import detect_node_identity
d = detect_node_identity()
print(d.get('hostname',''))
print(d.get('os','windows'))
print(d.get('gpu',''))
print(d.get('tailscale_ip',''))
print(d.get('machine',''))
"@ 2>$null

    if ($nodeInfoRaw) {
        $lines      = $nodeInfoRaw -split "`r?`n"
        $nodeName   = $lines[0]
        $nodeOs     = if ($lines[1]) { $lines[1] } else { "windows" }
        $nodeGpu    = $lines[2]
        $nodeTsIp   = $lines[3]
        $nodeMachine= $lines[4]
    } else {
        $nodeName    = $env:COMPUTERNAME
        $nodeOs      = "windows"
        $nodeGpu     = ""
        $nodeTsIp    = ""
        $nodeMachine = "$($env:COMPUTERNAME)-pc"
    }
    if (-not $nodeName) { $nodeName = $env:COMPUTERNAME }
    $tailUrl = if ($nodeTsIp) { "http://${nodeTsIp}:8070" } else { "http://127.0.0.1:8070" }

    $tomlContent = @"

[mesh]
self = "$nodeName"
worker_port = 9700
health_interval_sec = 30

[[mesh.nodes]]
name = "$nodeName"
machine = "$nodeMachine"
os = "$nodeOs"
tailscale_ip = "$nodeTsIp"
url = "$tailUrl"
gpu = "$nodeGpu"
"@
    Set-Content -Path $NodesToml -Value $tomlContent -Encoding UTF8
    Write-Ok "nodes.toml initialized (self=$nodeName, gpu=$($nodeGpu -or 'none'), ts=$($nodeTsIp -or 'none'))"
} else {
    Write-Info "Step 5: nodes.toml already exists — skipping"
}

# ── Step 5b: Seed agents with auto-detected CLI ─────────────────────────────
Write-Info "Step 5b: seeding agents..."
$bridgeDir = Join-Path $Root "musu-bridge"
$coreSrcDir = Join-Path $Root "musu-core\src"
$seedCode = @"
import sys, os
sys.path.insert(0, r'$bridgeDir')
sys.path.insert(0, r'$coreSrcDir')
os.chdir(r'$Root')
from seed_agents import seed
from musu_core.backends.local import LocalBackend
from musu_core.config import get_config
cfg = get_config()
db_path = cfg.db_path
from pathlib import Path
Path(db_path).parent.mkdir(parents=True, exist_ok=True)
backend = LocalBackend(db_path)
try:
    seed(backend)
finally:
    backend.close()
"@
# Windows PowerShell 5.1 treats native stderr as a terminating error under
# $ErrorActionPreference="Stop". seed_agents logs to stderr by design, so
# temporarily relax the policy for this one invocation and rely on the
# exit code as the actual success signal.
$prevPref = $ErrorActionPreference
$ErrorActionPreference = "Continue"
& $venvPython -c $seedCode 2>&1 | ForEach-Object { Write-Host "        $_" }
$seedExit = $LASTEXITCODE
$ErrorActionPreference = $prevPref
if ($seedExit -ne 0) { Write-Err "seed_agents failed (exit $seedExit)" }
Write-Ok "agents seeded with auto-detected CLI"

# ── Step 6: Build musu-bee ────────────────────────────────────────────────────
if ((Test-Path $BeeDir) -and (-not (Test-Path (Join-Path $BeeDir ".next")))) {
    Write-Info "Step 6: building musu-bee (first time)..."
    $pnpmCmd = Get-Command pnpm -ErrorAction SilentlyContinue
    $npmCmd  = Get-Command npm  -ErrorAction SilentlyContinue
    if ($pnpmCmd -or $npmCmd) {
        Push-Location $BeeDir
        $buildExit = 1
        try {
            # Relax error preference because pnpm/npm write progress to stderr
            # under PS 5.1, which would otherwise terminate the script.
            $prevPref = $ErrorActionPreference
            $ErrorActionPreference = "Continue"
            if ($pnpmCmd) {
                & pnpm install --silent 2>&1 | Out-Null
                & pnpm build 2>&1 | Out-Null
            } else {
                & npm install --silent 2>&1 | Out-Null
                & npm run build --silent 2>&1 | Out-Null
            }
            $buildExit = $LASTEXITCODE
            $ErrorActionPreference = $prevPref
        } finally {
            Pop-Location
        }
        # Trust the artifact, not the exit code: .next is the real success signal.
        if ((Test-Path (Join-Path $BeeDir ".next")) -and ($buildExit -eq 0)) {
            Write-Ok "musu-bee build complete"
        } else {
            Write-Warn "musu-bee build failed — UI unavailable (no .next produced). Install Node.js 20+ via: winget install OpenJS.NodeJS"
        }
    } else {
        Write-Warn "node not found — skipping musu-bee build. Install: winget install OpenJS.NodeJS"
    }
} else {
    Write-Info "Step 6: musu-bee build already exists — skipping"
}

# ── Step 7: Register Scheduled Task (--Service) ──────────────────────────────
if ($Service) {
    Write-Info "Step 7: registering musu-bridge Scheduled Task..."

    $startScript = Join-Path $ScriptDir "start-bridge.ps1"
    if (-not (Test-Path $startScript)) {
        # Create a minimal start wrapper if missing. install.sh has start-bridge.sh
        # but Windows needs a PowerShell variant — keep it tiny.
        @"
# Auto-generated by install.ps1 — minimal bridge launcher for Task Scheduler.
`$ErrorActionPreference = "Stop"
`$Root = "$Root"
`$Venv = "$Venv"
`$BridgeDir = Join-Path `$Root "musu-bridge"
# Load env file
`$envFile = Join-Path `$env:USERPROFILE ".musu\bridge.env"
if (Test-Path `$envFile) {
    Get-Content `$envFile | ForEach-Object {
        if (`$_ -match '^\s*([A-Z_][A-Z0-9_]*)=(.*)') {
            [Environment]::SetEnvironmentVariable(`$Matches[1], `$Matches[2], 'Process')
        }
    }
}
Set-Location `$BridgeDir
& (Join-Path `$Venv "Scripts\python.exe") -m server
"@ | Out-String | ForEach-Object {
            # Write with UTF-8 BOM so Windows PowerShell 5.1 reads the
            # multi-byte characters in this file (em-dash, ✓) as UTF-8
            # rather than ANSI, which would corrupt parser state.
            [System.IO.File]::WriteAllText($startScript, $_, [System.Text.UTF8Encoding]::new($true))
        }
        Write-Ok "created scripts\start-bridge.ps1 (Windows variant)"
    }

    # Remove existing task if any (idempotent)
    Unregister-ScheduledTask -TaskName "musu-bridge" -Confirm:$false -ErrorAction SilentlyContinue

    $action    = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$startScript`""
    $trigger   = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
    $settings  = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
    # LogonType remains Interactive — see PHASE3 plan / wiki entry for
    # context. We initially tried S4U so that Stop-ScheduledTask could
    # work without admin elevation, but S4U registration itself requires
    # the "Replace a process level token" privilege which non-admins do
    # not hold. The realistic fix is to use Stop-ScheduledTask + Start-
    # ScheduledTask (which DO work without admin under Interactive), and
    # accept that direct Stop-Process on the bridge PID still requires
    # elevation.
    $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive

    Register-ScheduledTask -TaskName "musu-bridge" -Action $action -Trigger $trigger -Settings $settings -Principal $principal | Out-Null
    Write-Ok "Scheduled Task 'musu-bridge' registered (auto-start on logon)"
} else {
    Write-Info "Step 7: Scheduled Task registration skipped (no -Service flag)"
}

# ── Done ──────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Ok "=== install complete ==="
Write-Host ""
Write-Host "  config:  $BridgeEnv"
$tokenLine = (Get-Content $BridgeEnv | Where-Object { $_ -match '^MUSU_BRIDGE_TOKEN=' } | Select-Object -First 1)
if ($tokenLine) {
    $tokenPreview = ($tokenLine -split '=', 2)[1].Substring(0, [Math]::Min(16, ($tokenLine -split '=', 2)[1].Length))
    Write-Host "  token:   $tokenPreview..."
}
Write-Host ""

if (-not $Start) {
    Write-Host "  Start the bridge:"
    Write-Host "    powershell -ExecutionPolicy Bypass -File scripts\start-bridge.ps1"
    if ($Service) {
        Write-Host "    or:  Start-ScheduledTask -TaskName musu-bridge"
    }
    Write-Host ""
}

if ($Service) {
    Write-Host "  Reload bridge after a code change (no admin needed):"
    Write-Host "    powershell -ExecutionPolicy Bypass -File scripts\restart-bridge.ps1"
    Write-Host ""
}

# ── Start bridge immediately (-Start) ────────────────────────────────────────
if ($Start) {
    Write-Host ""
    Write-Info "Starting bridge..."

    if ($Service) {
        Start-ScheduledTask -TaskName "musu-bridge"
        Start-Sleep -Seconds 4
    } else {
        $startScript = Join-Path $ScriptDir "start-bridge.ps1"
        $logDir = Join-Path $Root "logs"
        New-Item -ItemType Directory -Path $logDir -Force | Out-Null
        $logFile = Join-Path $logDir "bridge-install-start.log"
        Start-Process -FilePath "powershell.exe" `
            -ArgumentList "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$startScript`"" `
            -RedirectStandardOutput $logFile -RedirectStandardError "$logFile.err" `
            -WindowStyle Hidden
        Start-Sleep -Seconds 5
    }

    $bridgePort = if ($env:BRIDGE_PORT) { $env:BRIDGE_PORT } else { "8070" }
    $workerPort = if ($env:MUSU_WORKER_PORT) { $env:MUSU_WORKER_PORT } else { "9700" }
    try {
        $resp = Invoke-WebRequest -Uri "http://127.0.0.1:$bridgePort/health" -TimeoutSec 5 -UseBasicParsing
        if ($resp.StatusCode -eq 200) {
            Write-Ok "bridge is running ✓"
            $resp.Content | Write-Host
            # Worker check
            try {
                $w = Invoke-WebRequest -Uri "http://127.0.0.1:$workerPort/health" -TimeoutSec 3 -UseBasicParsing
                if ($w.StatusCode -eq 200) { Write-Ok "worker is running ✓" }
            } catch { Write-Warn "worker health check failed (port $workerPort)" }
            # Agents
            try {
                $a = Invoke-WebRequest -Uri "http://127.0.0.1:$bridgePort/api/agents" -TimeoutSec 5 -UseBasicParsing
                $agentCount = ($a.Content | ConvertFrom-Json).Count
                if ($agentCount -gt 0) {
                    Write-Ok "agents ready: $agentCount agents seeded"
                } else {
                    Write-Warn "no agents found"
                }
            } catch { Write-Warn "agents endpoint check failed" }
            # CLI
            $cli = @("claude","gemini","codex") | Where-Object { Get-Command $_ -ErrorAction SilentlyContinue }
            if ($cli) {
                Write-Ok "AI CLI: $($cli[0]) detected"
            } else {
                Write-Warn "No AI CLI found (claude/gemini/codex). Agents won't execute."
                Write-Host "    Install Claude Code: https://docs.anthropic.com/en/docs/claude-code"
            }
        }
    } catch {
        Write-Warn "health check failed. Logs:"
        Write-Host "  Get-Content -Tail 50 `"$Root\logs\bridge-install-start.log`""
        if ($Service) {
            Write-Host "  or check Task Scheduler History for 'musu-bridge'"
        }
        exit 1
    }
}

# ── Final summary ────────────────────────────────────────────────────────────
Write-Host ""
Write-Ok "=== MUSU is ready ==="
Write-Host ""
Write-Host "  What you can do now:"
Write-Host "    musu do `"describe this project`"   - run a task on your agents"
Write-Host "    musu doctor                        - check system health"
Write-Host "    musu nodes list                    - see connected machines"
Write-Host "    musu nodes add <ip>                - add another machine"
Write-Host ""
Write-Host "  NOTE: HTTPS (Caddy) is not auto-configured on Windows."
Write-Host "        See docs/PRODUCTION.md for IIS/Caddy reverse proxy setup."
Write-Host ""
