#Requires -Version 5.1
<#
.SYNOPSIS
    MUSU — one-line installer for Windows.
.DESCRIPTION
    Downloads the pre-built musu binary from GitHub Releases.
    Falls back to building from source (Rust) if no binary is available.

    Usage:
        irm https://raw.githubusercontent.com/yellowhama/Musu/main/install.ps1 | iex
        # or:
        powershell -ExecutionPolicy Bypass -File install.ps1
.NOTES
    Requires: PowerShell 5.1+, internet access. No external dependencies.
#>

$ErrorActionPreference = "Stop"

# ── Repo / release config ───────────────────────────────────────────────────
$Repo         = "yellowhama/Musu"
$ReleaseBase  = "https://github.com/$Repo/releases/latest/download"
$CloneUrl     = "https://github.com/$Repo.git"

# ── Output helpers ───────────────────────────────────────────────────────────
function Write-Step   { param($msg) Write-Host "  -> " -NoNewline -ForegroundColor Cyan;   Write-Host $msg }
function Write-Ok     { param($msg) Write-Host "  OK " -NoNewline -ForegroundColor Green;  Write-Host $msg }
function Write-Warn   { param($msg) Write-Host "  !! " -NoNewline -ForegroundColor Yellow; Write-Host $msg }
function Write-Err    { param($msg) Write-Host "  XX " -NoNewline -ForegroundColor Red;    Write-Host $msg; exit 1 }

# ── Logo ─────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "    +======================================+" -ForegroundColor DarkYellow
Write-Host "    |                                      |" -ForegroundColor DarkYellow
Write-Host "    |   " -NoNewline -ForegroundColor DarkYellow; Write-Host "M U S U" -NoNewline -ForegroundColor Yellow; Write-Host "                          |" -ForegroundColor DarkYellow
Write-Host "    |                                      |" -ForegroundColor DarkYellow
Write-Host "    |     " -NoNewline -ForegroundColor DarkYellow; Write-Host "Run your own AI company." -NoNewline -ForegroundColor White; Write-Host "     |" -ForegroundColor DarkYellow
Write-Host "    |                                      |" -ForegroundColor DarkYellow
Write-Host "    +======================================+" -ForegroundColor DarkYellow
Write-Host ""

# ── Detect architecture ─────────────────────────────────────────────────────
$Arch = if ([Environment]::Is64BitOperatingSystem) { "x86_64" } else { "x86" }
$Suffix = "windows-$Arch"
$BinaryName = "musu-$Suffix.exe"
$DownloadUrl = "$ReleaseBase/$BinaryName"

Write-Step "Detected: Windows $Arch"

# ── Paths ────────────────────────────────────────────────────────────────────
$MusuHome    = Join-Path $env:USERPROFILE ".musu"
$MusuBinDir  = Join-Path $MusuHome "bin"
$MusuBin     = Join-Path $MusuBinDir "musu.exe"

# Ensure directories exist
New-Item -ItemType Directory -Path $MusuBinDir -Force | Out-Null

# ── Step 1: Try downloading pre-built binary ─────────────────────────────────
$Downloaded = $false

Write-Step "Downloading $BinaryName..."
try {
    # Use TLS 1.2+ (required by GitHub)
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13

    $TmpFile = Join-Path $env:TEMP "musu-installer-$([guid]::NewGuid().ToString('N')).exe"

    # Follow redirects (GitHub releases redirect to S3)
    $WebClient = New-Object System.Net.WebClient
    $WebClient.DownloadFile($DownloadUrl, $TmpFile)

    # Sanity: check file size (real binary should be > 1MB)
    $FileSize = (Get-Item $TmpFile).Length
    if ($FileSize -gt 1MB) {
        $Downloaded = $true
        Write-Ok "Binary downloaded ($([math]::Round($FileSize / 1MB, 1)) MB)"
    } else {
        Write-Warn "Downloaded file too small ($FileSize bytes) - not a valid binary"
        Remove-Item $TmpFile -Force -ErrorAction SilentlyContinue
    }
} catch {
    Write-Warn "Pre-built binary not available: $($_.Exception.Message)"
    Write-Warn "Falling back to source build..."
}

# ── Step 2: Fallback — build from source ─────────────────────────────────────
if (-not $Downloaded) {
    Write-Step "Building from source (this may take a few minutes)..."

    # Check for cargo
    $CargoCmd = Get-Command cargo -ErrorAction SilentlyContinue
    if (-not $CargoCmd) {
        $RustupCmd = Get-Command rustup -ErrorAction SilentlyContinue
        if ($RustupCmd) {
            Write-Step "rustup found but cargo not in PATH — running rustup default stable..."
            & rustup default stable
        } else {
            Write-Step "Installing Rust via rustup..."
            $RustupInit = Join-Path $env:TEMP "rustup-init.exe"
            try {
                $WebClient = New-Object System.Net.WebClient
                $WebClient.DownloadFile("https://win.rustup.rs/x86_64", $RustupInit)
            } catch {
                Write-Err "Failed to download rustup-init.exe: $($_.Exception.Message)"
            }
            & $RustupInit -y --default-toolchain stable --profile minimal
            Remove-Item $RustupInit -Force -ErrorAction SilentlyContinue

            # Refresh PATH for this session
            $CargoPath = Join-Path $env:USERPROFILE ".cargo\bin"
            if ($env:PATH -notlike "*$CargoPath*") {
                $env:PATH = "$CargoPath;$env:PATH"
            }
        }
    }

    $CargoCmd = Get-Command cargo -ErrorAction SilentlyContinue
    if (-not $CargoCmd) {
        Write-Err "cargo still not found after rustup install. Add %USERPROFILE%\.cargo\bin to PATH and retry."
    }
    $RustcVersion = & rustc --version
    Write-Ok "Rust toolchain ready ($RustcVersion)"

    # Check for git
    $GitCmd = Get-Command git -ErrorAction SilentlyContinue
    if (-not $GitCmd) {
        Write-Err "git not found. Install: winget install Git.Git"
    }

    # Clone and build
    $CloneDir = Join-Path $env:TEMP "musu-build-$([guid]::NewGuid().ToString('N'))"
    Write-Step "Cloning $CloneUrl..."
    & git clone --depth 1 $CloneUrl $CloneDir
    if ($LASTEXITCODE -ne 0) { Write-Err "git clone failed" }

    Write-Step "Running cargo build --release (this may take 2-5 minutes)..."
    Push-Location (Join-Path $CloneDir "musu-rs")
    try {
        & cargo build --release
        if ($LASTEXITCODE -ne 0) { Write-Err "cargo build failed" }
    } finally {
        Pop-Location
    }

    $TmpFile = Join-Path $CloneDir "musu-rs\target\release\musu.exe"
    if (-not (Test-Path $TmpFile)) {
        Write-Err "Build succeeded but musu.exe not found at expected path"
    }
    Write-Ok "Build complete"

    # Clean up clone dir after copying (deferred to after install)
    $CleanupDir = $CloneDir
}

# ── Step 3: Install binary ───────────────────────────────────────────────────
Write-Step "Installing to $MusuBin..."

# Stop any running musu process to avoid file-lock errors
$RunningMusu = Get-Process -Name "musu" -ErrorAction SilentlyContinue
if ($RunningMusu) {
    Write-Warn "Stopping running musu process..."
    $RunningMusu | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500
}

Copy-Item $TmpFile $MusuBin -Force
Write-Ok "Binary installed: $MusuBin"

# Clean up temp files
if ($Downloaded) {
    Remove-Item $TmpFile -Force -ErrorAction SilentlyContinue
}
if ($CleanupDir) {
    Remove-Item $CleanupDir -Recurse -Force -ErrorAction SilentlyContinue
}

# ── Step 4: Add to PATH ─────────────────────────────────────────────────────
$UserPath = [Environment]::GetEnvironmentVariable("PATH", "User")
if ($UserPath -notlike "*$MusuBinDir*") {
    Write-Step "Adding $MusuBinDir to user PATH..."
    [Environment]::SetEnvironmentVariable("PATH", "$MusuBinDir;$UserPath", "User")
    # Also update current session
    $env:PATH = "$MusuBinDir;$env:PATH"
    Write-Ok "Added to PATH (restart your terminal for it to take effect everywhere)"
} else {
    Write-Ok "$MusuBinDir already in PATH"
}

# ── Step 5: Run musu install ─────────────────────────────────────────────────
Write-Step "Running musu install..."
try {
    & $MusuBin install
    if ($LASTEXITCODE -eq 0) {
        Write-Ok "Config seeded"
    } else {
        Write-Warn "musu install returned exit code $LASTEXITCODE - check output above"
    }
} catch {
    Write-Warn "musu install failed: $($_.Exception.Message)"
}

# ── Done ─────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  OK " -NoNewline -ForegroundColor Green
Write-Host "MUSU installed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "  Binary:  $MusuBin"
Write-Host "  Config:  $MusuHome\"
Write-Host ""
Write-Host "  Get started:"
Write-Host "    musu bridge" -ForegroundColor DarkGray -NoNewline; Write-Host "           - start the bridge server"
Write-Host "    musu doctor" -ForegroundColor DarkGray -NoNewline; Write-Host "           - check system health"
Write-Host "    musu --help" -ForegroundColor DarkGray -NoNewline; Write-Host "           - see all commands"
Write-Host ""
Write-Host "  Docs:    https://github.com/$Repo#readme"
Write-Host ""
