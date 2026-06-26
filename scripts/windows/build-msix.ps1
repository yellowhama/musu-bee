[CmdletBinding()]
param(
    [ValidateSet("release", "debug")]
    [string]$Configuration = "release",
    [ValidateSet("x64", "x86", "arm64", "neutral")]
    [string]$Architecture = "x64",
    [ValidateSet("local-sideload-manual", "store-reviewed-immediate-registration")]
    [string]$StartupContract = "local-sideload-manual",
    # Store-assigned product identity (Partner Center, app 9NJ645MQ04T3).
    # The package manifest MUST carry these exact values or Store ingestion
    # rejects the upload. For local sideload, the packaging tool's
    # --generate-cert derives a self-signed cert from this manifest Publisher,
    # so manifest Publisher and cert subject stay aligned; the Store re-signs on
    # ingestion (the self-signed package is NOT the Store-accepted signature).
    [string]$IdentityName = "blossompark.musu",
    [string]$Publisher = "CN=74D9382E-D574-4DD1-BEDD-9ECCBB92D36E",
    [string]$DisplayName = "MUSU",
    [string]$PublisherDisplayName = "blossompark",
    [string]$Description = "MUSU desktop shell for the local AI operations runtime",
    [string]$ApplicationExecutable = "musu-desktop.exe",
    [string]$RuntimeExecutable = "musu.exe",
    # musu-startup.exe is a logic-free Service-mode SHIM (not the bridge itself —
    # the bridge runtime lives in `musu.exe startup`). It exists only because the
    # MSIX windows.startupTask is exe-path-only and can't pass `startup` to
    # musu.exe. Built from the same crate (zero version skew). See
    # musu-rs/src/bin/musu-startup.rs + ARCHITECTURE_BINARIES_PROCESSES_PACKAGING.
    [string]$StartupExecutable = "musu-startup.exe",
    # Go knowledge-engine chip bundled as a sidecar. The Go source remains in
    # the external musu-brain repo; this script only stages the built exe.
    [string]$BrainExecutable = "musu-brain.exe",
    [string]$Version,
    # Base URL the published .appinstaller + .msix are hosted at. App Installer
    # re-fetches the .appinstaller from this exact URL on its update interval, so
    # it MUST be a durable origin. Defaults to the fixed-tag public GitHub release
    # (`desktop-latest`) musu.pro already links to — the tag stays put while the
    # artifacts are overwritten per build, so the URL never rots. The hosted MSIX
    # filename is fixed (musu-desktop-x64.msix) to match musu-pro's
    # DESKTOP_DOWNLOAD_URL; only the .appinstaller's Version field changes per
    # release, which is what drives the update.
    [string]$AppInstallerBaseUrl = "https://github.com/yellowhama/musu-bee/releases/download/desktop-latest",
    # The MSIX filename as HOSTED (may differ from the locally-built, version-
    # suffixed artifact name). musu-pro links to this exact name.
    [string]$HostedMsixFileName = "musu-desktop-x64.msix",
    # How often App Installer checks the hosted .appinstaller for a newer Version.
    [int]$UpdateCheckHours = 24,
    [string]$StageDir,
    [string]$OutputDir,
    [string]$CertPath,
    [string]$CertPassword = "password",
    [string]$SourceIconPath,
    [switch]$GenerateCert,
    [switch]$InstallCert,
    [switch]$SkipBuild,
    [switch]$KeepStage,
    [switch]$DryRun,
    # Auto-bump is ON BY DEFAULT: every real build increments VERSION's prerelease
    # counter (rc.N → rc.N+1) so the MSIX 4th segment rises and App Installer
    # actually auto-updates. The fix for "every build shipped 1.15.0.0 so
    # auto-update never fired." Pass -NoBump to opt out (e.g. to re-cut the exact
    # same version). Bump is always skipped for -DryRun, -SkipBuild, and explicit
    # -Version (see below).
    [switch]$NoBump,
    # Escape hatch for the version-coherence gate (Cargo.toml/tauri.conf.json/
    # publicRelease.ts must equal the VERSION base). Use only when intentionally
    # building with a known drift; the gate exists so a package never embeds a
    # version that lies about what was built.
    [switch]$SkipVersionCheck,
    # Memory-safe builds are ON BY DEFAULT: cargo compiles one crate at a time
    # (CARGO_BUILD_JOBS=1) with a larger compiler stack (RUST_MIN_STACK) so the
    # release LTO of the large lib.rs (~7.5k lines) does not exhaust RAM/paging
    # and crash rustc with STATUS_STACK_BUFFER_OVERRUN / "out of memory". Pass
    # -FastBuild on a machine with ample RAM to restore parallel codegen.
    [switch]$FastBuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step([string]$Message) {
    Write-Host "==> $Message"
}

function Assert-CommandAvailable([string]$CommandName, [string]$InstallHint) {
    if ($DryRun) {
        return
    }
    if (-not (Get-Command $CommandName -ErrorAction SilentlyContinue)) {
        throw "$CommandName is not installed. $InstallHint"
    }
}

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter()][string[]]$ArgumentList = @(),
        [Parameter()][string]$WorkingDirectory,
        # Per-invocation environment overrides (e.g. memory limits for cargo).
        # Restored to their prior values in finally so the parent env is clean.
        [Parameter()][hashtable]$Environment = @{}
    )

    $rendered = ($ArgumentList | ForEach-Object {
        if ($_ -match "\s") { '"' + $_ + '"' } else { $_ }
    }) -join " "

    if ($DryRun) {
        if ($WorkingDirectory) {
            Write-Host "[dry-run] pushd $WorkingDirectory"
        }
        foreach ($k in $Environment.Keys) {
            Write-Host ("[dry-run] `$env:{0} = {1}" -f $k, $Environment[$k])
        }
        Write-Host "[dry-run] $FilePath $rendered"
        if ($WorkingDirectory) {
            Write-Host "[dry-run] popd"
        }
        return
    }

    if ($WorkingDirectory) {
        Push-Location $WorkingDirectory
    }

    # Snapshot then apply env overrides; finally restores to avoid leaking
    # memory-limit vars into the rest of the build (e.g. the Tauri npm step).
    $savedEnv = @{}
    foreach ($k in $Environment.Keys) {
        $savedEnv[$k] = [Environment]::GetEnvironmentVariable($k)
        Set-Item -LiteralPath ("Env:{0}" -f $k) -Value ([string]$Environment[$k])
    }

    try {
        & $FilePath @ArgumentList
        if ($LASTEXITCODE -ne 0) {
            throw "command failed with exit code ${LASTEXITCODE}: $FilePath $rendered"
        }
    }
    finally {
        foreach ($k in $Environment.Keys) {
            if ($null -eq $savedEnv[$k]) {
                Remove-Item -LiteralPath ("Env:{0}" -f $k) -ErrorAction SilentlyContinue
            } else {
                Set-Item -LiteralPath ("Env:{0}" -f $k) -Value $savedEnv[$k]
            }
        }
        if ($WorkingDirectory) {
            Pop-Location
        }
    }
}

function Normalize-Version([string]$RawVersion) {
    # MSIX needs a 4-segment numeric version (Major.Minor.Build.Revision) and the
    # 4th segment is what drives App Installer auto-update (it updates only when
    # the version RISES). We must NOT collapse a prerelease counter to .0 — that's
    # the bug that froze every build at 1.15.0.0. Map the prerelease number into
    # the 4th segment so 1.15.0-rc.1 → 1.15.0.1, rc.2 → 1.15.0.2, etc., giving a
    # monotonic auto-update signal per rc.
    $trimmed = $RawVersion.Trim()
    $split = $trimmed.Split("+", 2)[0]            # drop build metadata (+...)
    $coreAndPre = $split.Split("-", 2)
    $core = $coreAndPre[0]
    $pre = if ($coreAndPre.Count -eq 2) { $coreAndPre[1] } else { "" }

    $parts = $core.Split(".")
    foreach ($part in $parts) {
        if ($part -notmatch "^\d+$") {
            throw "Version '$trimmed' must reduce to numeric segments for MSIX."
        }
    }

    # Extract a numeric counter from the prerelease tag (e.g. "rc.1" → 1, "beta3" → 3).
    $preNum = 0
    if ($pre -and ($pre -match "(\d+)")) {
        $preNum = [int]$Matches[1]
    }

    if ($parts.Count -eq 4) {
        # Already fully specified (e.g. an explicit -Version 1.15.0.1).
        return $core
    }
    if ($parts.Count -eq 3) {
        # 3 segments + prerelease counter → 4th segment carries the rc number.
        return "$core.$preNum"
    }
    throw "Version '$trimmed' must have 3 or 4 numeric segments for MSIX."
}

function Assert-VersionSourcesCoherent {
    # VERSION is the authoritative source the build reads + auto-bumps. Five other
    # files restate the same version and historically drifted (musu-rs\Cargo.toml/
    # src-tauri\Cargo.toml/tauri.conf.json/publicRelease.ts froze at rc.1/GA while
    # VERSION reached rc.6). src-tauri\Cargo.toml was a blind spot until V33 (it was
    # kept in lockstep by hand but never gate-checked). V34 adds the Go knowledge
    # chip pin as the fifth product-version source so the sidecar cannot drift
    # silently from the shipped MUSU version.
    # We do NOT rewrite those files here — PowerShell regex on source files risks
    # encoding corruption (see CLAUDE.md). Instead, read + compare and fail fast
    # with an actionable message so a human fixes the stated source before shipping
    # a package whose embedded version lies about what was built.
    param([string]$ExpectedVersion, [string]$RepoRoot)

    $checks = @(
        @{ Name = "Cargo.toml";              Path = (Join-Path $RepoRoot "musu-rs\Cargo.toml");                      Regex = '(?m)^version\s*=\s*"([^"]+)"' },
        @{ Name = "src-tauri\Cargo.toml";    Path = (Join-Path $RepoRoot "musu-bee\src-tauri\Cargo.toml");           Regex = '(?m)^version\s*=\s*"([^"]+)"' },
        @{ Name = "tauri.conf.json";         Path = (Join-Path $RepoRoot "musu-bee\src-tauri\tauri.conf.json");      Regex = '"version"\s*:\s*"([^"]+)"' },
        @{ Name = "publicRelease.ts";        Path = (Join-Path $RepoRoot "musu-bee\src\lib\publicRelease.ts");        Regex = 'PUBLIC_RELEASE_VERSION\s*=\s*"([^"]+)"' },
        @{ Name = "musu-brain.pin.json";     Path = (Join-Path $RepoRoot "musu-bee\src-tauri\musu-brain.pin.json");  Regex = '"product_version"\s*:\s*"([^"]+)"' }
    )
    $mismatches = @()
    foreach ($c in $checks) {
        if (-not (Test-Path -LiteralPath $c.Path)) {
            $mismatches += "  - $($c.Name): file not found at $($c.Path)"
            continue
        }
        $content = Get-Content -LiteralPath $c.Path -Raw
        if ($content -match $c.Regex) {
            $found = $Matches[1]
            if ($found -ne $ExpectedVersion) {
                $mismatches += "  - $($c.Name): '$found' (expected '$ExpectedVersion')"
            }
        } else {
            $mismatches += "  - $($c.Name): could not locate a version string"
        }
    }

    # Extra check: DESKTOP_SETUP_EXE_URL in publicRelease.ts hardcodes the NSIS
    # artifact filename MUSU_<numeric>_x64-setup.exe. Tauri's NSIS bundler strips
    # the prerelease tag, so the filename carries only major.minor.patch. This URL
    # is NOT one of the three version-string checks above (it's a filename, not a
    # version literal), so it would silently 404 on the next numeric-version
    # graduation if left unguarded. Verify its numeric prefix matches the
    # major.minor.patch of the expected version.
    $publicReleasePath = Join-Path $RepoRoot "musu-bee\src\lib\publicRelease.ts"
    $expectedNumeric = ($ExpectedVersion -split "-", 2)[0].Trim()
    if (Test-Path -LiteralPath $publicReleasePath) {
        $prContent = Get-Content -LiteralPath $publicReleasePath -Raw
        if ($prContent -match 'MUSU_(\d+\.\d+\.\d+)_x64-setup\.exe') {
            $urlNumeric = $Matches[1]
            if ($urlNumeric -ne $expectedNumeric) {
                $mismatches += "  - publicRelease.ts DESKTOP_SETUP_EXE_URL: 'MUSU_$urlNumeric' (expected 'MUSU_$expectedNumeric')"
            }
        }
        # If the URL constant isn't present or uses a different shape, skip — only
        # flag an actual numeric mismatch, not absence.
    }

    if ($mismatches.Count -gt 0) {
        throw @"
Version sources drifted from VERSION ($ExpectedVersion):
$($mismatches -join "`n")
Fix the stated file(s) to match VERSION, then rebuild. (Edit by hand or in an
editor — this script deliberately does NOT rewrite source files to avoid
encoding corruption.)
"@
    }
    Write-Step "Version coherence OK: Cargo.toml / src-tauri\Cargo.toml / tauri.conf.json / publicRelease.ts / musu-brain.pin.json all = $ExpectedVersion"
}

function Resolve-RustHostTuple {
    param([string]$Architecture)

    $rustc = Get-Command rustc -ErrorAction SilentlyContinue
    if ($rustc) {
        $tuple = (& $rustc.Source --print host-tuple 2>$null)
        if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($tuple)) {
            return $tuple.Trim()
        }
    }

    switch ($Architecture) {
        "x64" { return "x86_64-pc-windows-msvc" }
        "x86" { return "i686-pc-windows-msvc" }
        "arm64" { return "aarch64-pc-windows-msvc" }
        default { throw "Cannot infer Rust host tuple for Architecture '$Architecture'. Install rustc or pass a concrete architecture." }
    }
}

function Assert-BrainSidecarBuildInfo {
    param([string]$BrainExePath, [string]$PinPath)

    if (-not (Test-Path -LiteralPath $PinPath)) {
        throw "musu-brain pin file not found at $PinPath"
    }
    $pin = Get-Content -LiteralPath $PinPath -Raw | ConvertFrom-Json
    $info = & go version -m $BrainExePath 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "go version -m failed for $BrainExePath`n$($info -join "`n")"
    }

    $moduleOk = $false
    $revision = $null
    $modified = $null
    foreach ($line in $info) {
        if ($line -match "^\s*mod\s+(\S+)\s+") {
            $moduleOk = ($Matches[1] -eq [string]$pin.module_path)
        }
        if ($line -match "^\s*build\s+vcs\.revision=(.+)$") {
            $revision = $Matches[1].Trim()
        }
        if ($line -match "^\s*build\s+vcs\.modified=(.+)$") {
            $modified = $Matches[1].Trim()
        }
    }

    if (-not $moduleOk) {
        throw "musu-brain sidecar module does not match pin module_path '$($pin.module_path)'"
    }
    if ($revision -ne [string]$pin.vcs_revision) {
        throw "musu-brain sidecar revision '$revision' does not match pin '$($pin.vcs_revision)'"
    }
    if ($modified -ne "false") {
        throw "musu-brain sidecar was built from a dirty Go repo (vcs.modified=$modified)"
    }
    Write-Step "Musu Brain sidecar build info OK: $($pin.module_path)@$revision"
}

function Resolve-OptionalPath([string]$PathValue) {
    if ([string]::IsNullOrWhiteSpace($PathValue)) {
        return $null
    }
    if ($DryRun -and -not (Test-Path -LiteralPath $PathValue)) {
        return $PathValue
    }
    return (Resolve-Path -LiteralPath $PathValue).Path
}

function Get-ManifestPath([string]$PackageDir) {
    $candidates = @(
        (Join-Path $PackageDir "Package.appxmanifest"),
        (Join-Path $PackageDir "appxmanifest.xml")
    )
    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate) {
            return $candidate
        }
    }
    return (Join-Path $PackageDir "Package.appxmanifest")
}

function New-ManifestContent {
    param(
        [string]$PackageIdentity,
        [string]$PackagePublisher,
        [string]$PackageVersion,
        [string]$PackageArchitecture,
        [string]$AppDisplayName,
        [string]$AppPublisherDisplayName,
        [string]$AppDescription,
        [string]$ApplicationExecutable,
        [string]$RuntimeExecutable,
        [string]$StartupExecutable,
        [string]$StartupContract
    )

    $uap4Namespace = ""
    $rescap5Namespace = ""
    $ignorableNamespaces = "uap uap3 desktop rescap win32dep"
    $startupTaskExtraAttribute = ""
    $extraCapability = ""

    if ($StartupContract -eq "store-reviewed-immediate-registration") {
        $uap4Namespace = '  xmlns:uap4="http://schemas.microsoft.com/appx/manifest/uap/windows10/4"'
        $rescap5Namespace = '  xmlns:rescap5="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities/5"'
        $ignorableNamespaces = "uap uap3 uap4 desktop rescap rescap5 win32dep"
        $startupTaskExtraAttribute = 'rescap5:ImmediateRegistration="true"'
        $extraCapability = '    <uap4:CustomCapability Name="Microsoft.nonUserConfigurableStartupTasks_8wekyb3d8bbwe" />'
    }

    @"
<?xml version="1.0" encoding="utf-8"?>
<Package
  xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
  xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
  xmlns:uap3="http://schemas.microsoft.com/appx/manifest/uap/windows10/3"
  xmlns:desktop="http://schemas.microsoft.com/appx/manifest/desktop/windows10"
  xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
  xmlns:win32dep="http://schemas.microsoft.com/appx/manifest/desktop/windows10/win32dependencies"
$uap4Namespace
$rescap5Namespace
  IgnorableNamespaces="$ignorableNamespaces">
  <Identity
    Name="$PackageIdentity"
    Publisher="$PackagePublisher"
    Version="$PackageVersion"
    ProcessorArchitecture="$PackageArchitecture" />
  <Properties>
    <DisplayName>$AppDisplayName</DisplayName>
    <PublisherDisplayName>$AppPublisherDisplayName</PublisherDisplayName>
    <Description>$AppDescription</Description>
    <Logo>Assets\StoreLogo.png</Logo>
  </Properties>
  <Dependencies>
    <TargetDeviceFamily
      Name="Windows.Desktop"
      MinVersion="10.0.17763.0"
      MaxVersionTested="10.0.26100.0" />
    <win32dep:ExternalDependency
      Name="Microsoft.WebView2"
      Publisher="CN=Microsoft Windows, O=Microsoft Corporation, L=Redmond, S=Washington, C=US"
      MinVersion="1.0.0.0" />
  </Dependencies>
  <Resources>
    <Resource Language="en-us" />
  </Resources>
  <Applications>
    <Application
      Id="MUSU"
      Executable="$ApplicationExecutable"
      EntryPoint="Windows.FullTrustApplication">
      <uap:VisualElements
        DisplayName="$AppDisplayName"
        Description="$AppDescription"
        BackgroundColor="transparent"
        Square150x150Logo="Assets\Square150x150Logo.png"
        Square44x44Logo="Assets\Square44x44Logo.png"
        AppListEntry="default">
        <uap:DefaultTile Wide310x150Logo="Assets\Wide310x150Logo.png" />
        <uap:SplashScreen Image="Assets\SplashScreen.png" />
      </uap:VisualElements>
      <Extensions>
        <uap3:Extension
          Category="windows.appExecutionAlias"
          Executable="$RuntimeExecutable"
          EntryPoint="Windows.FullTrustApplication">
          <uap3:AppExecutionAlias>
            <desktop:ExecutionAlias Alias="$RuntimeExecutable" />
          </uap3:AppExecutionAlias>
        </uap3:Extension>
        <desktop:Extension
          Category="windows.startupTask"
          Executable="$StartupExecutable"
          EntryPoint="Windows.FullTrustApplication">
          <desktop:StartupTask
            TaskId="MusuBridgeStartup"
            Enabled="true"
            $startupTaskExtraAttribute
            DisplayName="$AppDisplayName Bridge" />
        </desktop:Extension>
      </Extensions>
    </Application>
  </Applications>
  <Capabilities>
    <rescap:Capability Name="runFullTrust" />
$extraCapability
  </Capabilities>
</Package>
"@
}

function New-AppInstallerContent {
    param(
        [string]$AppInstallerUri,   # absolute URL where THIS .appinstaller is hosted
        [string]$MsixUri,           # absolute URL of the MainPackage .msix
        [string]$PackageIdentity,   # must match manifest <Identity Name=...>
        [string]$PackagePublisher,  # must EXACTLY match manifest Publisher / cert subject
        [string]$PackageVersion,    # 4-segment; App Installer updates when this rises
        [string]$PackageArchitecture,
        [int]$UpdateCheckHours
    )

    # AppInstaller 2021 schema. The Version on the root <AppInstaller> and on
    # <MainPackage> must match the package being shipped. Publisher MUST be
    # byte-identical to the MSIX <Identity Publisher> (= cert subject) or Windows
    # rejects the update with a publisher-mismatch error.
    #
    # UpdateSettings:
    #   OnLaunch HoursBetweenUpdateChecks — poll cadence; UpdateBlocksActivation
    #     false (default) so a pending update never blocks the user from launching.
    #   AutomaticBackgroundTask — Windows checks for updates in the background too.
    #   ForceUpdateFromAnyVersion — allows moving across any version delta (incl.
    #     re-installs of the same fixed-tag artifact during the dev-preview phase).
    @"
<?xml version="1.0" encoding="utf-8"?>
<AppInstaller
    xmlns="http://schemas.microsoft.com/appx/appinstaller/2021"
    Uri="$AppInstallerUri"
    Version="$PackageVersion">
  <MainPackage
      Name="$PackageIdentity"
      Publisher="$PackagePublisher"
      Version="$PackageVersion"
      ProcessorArchitecture="$PackageArchitecture"
      Uri="$MsixUri" />
  <UpdateSettings>
    <OnLaunch HoursBetweenUpdateChecks="$UpdateCheckHours" UpdateBlocksActivation="false" />
    <AutomaticBackgroundTask />
    <ForceUpdateFromAnyVersion>true</ForceUpdateFromAnyVersion>
  </UpdateSettings>
</AppInstaller>
"@
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
$musuRsDir = Join-Path $repoRoot "musu-rs"
$musuBeeDir = Join-Path $repoRoot "musu-bee"
$tauriDir = Join-Path $musuBeeDir "src-tauri"
. (Join-Path $scriptDir "msix-common.ps1")

if (-not $SkipBuild) {
    Assert-CommandAvailable -CommandName "cargo" -InstallHint "Install Rust and ensure cargo is on PATH."
    Assert-CommandAvailable -CommandName "npm" -InstallHint "Install Node.js/npm and ensure npm is on PATH."
    Assert-CommandAvailable -CommandName "go" -InstallHint "Install Go and ensure go is on PATH for the Musu Brain sidecar build."
}
Assert-CommandAvailable -CommandName "winapp" -InstallHint "Install Microsoft WinApp CLI with: winget install -e --id Microsoft.WinAppCLI --source winget"

# Auto-bump (ON by default): increment the prerelease counter in VERSION so each
# release rises (rc.1 → rc.2 → …) and App Installer auto-update actually fires.
# Skipped for -NoBump, -DryRun, -SkipBuild, or an explicit -Version (those don't
# produce a new shippable build that needs a new number).
#
# The bump is COMPUTED here but only WRITTEN to disk AFTER a successful build
# (see "Commit the bumped VERSION" below). A failed build must not mutate VERSION
# — otherwise a crash mid-compile leaves the file ahead of any shipped artifact,
# and the next attempt double-bumps. $Version (used by packaging) carries the
# bumped value in-memory so this build targets the right number regardless.
$versionPath = Join-Path $repoRoot "VERSION"
$shouldBump = -not $NoBump -and -not $Version -and -not $DryRun -and -not $SkipBuild
$pendingVersionWrite = $null
if ($shouldBump) {
    $raw = (Get-Content -LiteralPath $versionPath -Raw).Trim()
    if ($raw -match "^(?<core>\d+\.\d+\.\d+)-(?<tag>[a-zA-Z]+)\.(?<n>\d+)$") {
        $bumped = "{0}-{1}.{2}" -f $Matches.core, $Matches.tag, ([int]$Matches.n + 1)
    } elseif ($raw -match "^(?<core>\d+\.\d+\.)(?<patch>\d+)$") {
        $bumped = "{0}{1}" -f $Matches.core, ([int]$Matches.patch + 1)
    } else {
        throw "Cannot auto-bump VERSION '$raw' (expected X.Y.Z-tag.N or X.Y.Z)."
    }
    $pendingVersionWrite = $bumped
    Write-Step "Auto-bump computed VERSION $raw → $bumped (written after build succeeds)"
}

if (-not $Version) {
    # Prefer the in-memory bumped value so the build targets the new number; fall
    # back to the on-disk VERSION when not bumping.
    $effectiveRaw = if ($pendingVersionWrite) { $pendingVersionWrite } else { (Get-Content -LiteralPath $versionPath -Raw) }
    $Version = Normalize-Version $effectiveRaw

    # Coherence gate (only when version derives from VERSION, not an explicit
    # -Version override): the three restated sources must equal the version this
    # build will actually EMBED. In bump mode the MSIX is packaged at the bumped
    # number ($pendingVersionWrite) while CARGO_PKG_VERSION comes from Cargo.toml;
    # if we compared against the pre-bump base, the sources could lag the MSIX by
    # one rc and /health would report a different version than the installed
    # package announces (a version-identity split). So compare against the bumped
    # value when bumping: this forces the operator to advance Cargo.toml/
    # tauri.conf.json/publicRelease.ts to the bumped rc BEFORE the bump build, so
    # MSIX and CARGO_PKG_VERSION always agree. Non-bump builds compare against the
    # on-disk VERSION as-is.
    if (-not $SkipVersionCheck) {
        $expectedSourceVersion = if ($pendingVersionWrite) {
            $pendingVersionWrite
        } else {
            (Get-Content -LiteralPath $versionPath -Raw).Trim()
        }
        Assert-VersionSourcesCoherent -ExpectedVersion $expectedSourceVersion -RepoRoot $repoRoot
    }
} else {
    $Version = Normalize-Version $Version
}

if (-not $StageDir) {
    $StageDir = Join-Path $repoRoot ".local-build\msix\stage"
}
if (-not $OutputDir) {
    $OutputDir = Join-Path $repoRoot ".local-build\msix\output"
}
if (-not $SourceIconPath) {
    $defaultIcon = Join-Path $repoRoot "musu-bee\src-tauri\icons\icon.png"
    if (Test-Path -LiteralPath $defaultIcon) {
        $SourceIconPath = $defaultIcon
    }
}

$contractSuffix = Get-StartupContractArtifactSuffix $StartupContract
$packageDir = Join-Path $StageDir ("musu-{0}" -f $contractSuffix)
$musuExe = Join-Path $musuRsDir "target\$Configuration\$RuntimeExecutable"
$startupExe = Join-Path $musuRsDir "target\$Configuration\$StartupExecutable"
$desktopExe = Join-Path $tauriDir "target\$Configuration\$ApplicationExecutable"
$rustHostTuple = Resolve-RustHostTuple -Architecture $Architecture
$brainSidecarExe = Join-Path $tauriDir ("binaries\musu-brain-{0}.exe" -f $rustHostTuple)
$brainPinPath = Join-Path $tauriDir "musu-brain.pin.json"
$generatedCertPath = Join-Path $OutputDir ("{0}_cert.pfx" -f $IdentityName)

# Memory-safe build env (default ON; -FastBuild restores parallel codegen).
# CARGO_BUILD_JOBS=1 → one rustc at a time so two release-LTO crates don't peak
# RAM simultaneously. RUST_MIN_STACK=64MiB → headroom for the large lib.rs so
# rustc doesn't blow its thread stack (STATUS_STACK_BUFFER_OVERRUN). Applied
# only to the build commands and restored afterwards by Invoke-Checked.
$buildEnv = @{}
if (-not $FastBuild) {
    $buildEnv["CARGO_BUILD_JOBS"] = "1"
    $buildEnv["RUST_MIN_STACK"] = "67108864"
}

if (-not $SkipBuild) {
    if ($FastBuild) {
        Write-Step "Building packaged runtime executables (FastBuild: parallel codegen)"
    } else {
        Write-Step "Building packaged runtime executables (memory-safe: 1 job, 64MiB stack)"
    }
    $buildArgs = @("build", "--bin", "musu", "--bin", "musu-startup")
    if ($Configuration -eq "release") {
        $buildArgs += "--release"
    }
    Invoke-Checked -FilePath "cargo" -ArgumentList $buildArgs -WorkingDirectory $musuRsDir -Environment $buildEnv

    Write-Step "Building Tauri desktop executable"
    $desktopBuildArgs = @("run", "tauri", "--", "build", "--no-bundle")
    if ($Configuration -eq "debug") {
        $desktopBuildArgs += "--debug"
    }
    Invoke-Checked -FilePath "npm" -ArgumentList $desktopBuildArgs -WorkingDirectory $musuBeeDir -Environment $buildEnv
}

if (-not $DryRun -and -not (Test-Path -LiteralPath $musuExe)) {
    throw "$RuntimeExecutable not found at $musuExe"
}
if (-not $DryRun -and -not (Test-Path -LiteralPath $startupExe)) {
    throw "$StartupExecutable not found at $startupExe"
}
if (-not $DryRun -and -not (Test-Path -LiteralPath $desktopExe)) {
    throw "$ApplicationExecutable not found at $desktopExe"
}
if (-not $DryRun -and -not (Test-Path -LiteralPath $brainSidecarExe)) {
    throw "$BrainExecutable sidecar not found at $brainSidecarExe (run npm run build:tauri-sidecars or a full build first)"
}
if (-not $DryRun) {
    Assert-BrainSidecarBuildInfo -BrainExePath $brainSidecarExe -PinPath $brainPinPath
}

# Commit the bumped VERSION only after the build succeeded AND all three
# executables exist. Any failure above throws before this line, so VERSION stays
# untouched and the next attempt re-bumps from the same base (no double-bump, no
# orphan version ahead of the last shipped artifact).
if ($pendingVersionWrite) {
    Set-Content -LiteralPath $versionPath -Value $pendingVersionWrite -NoNewline
    Write-Step "VERSION committed → $pendingVersionWrite"
}

$resolvedIcon = Resolve-OptionalPath $SourceIconPath
$resolvedCert = Resolve-OptionalPath $CertPath
# Key stability: prefer the canonical signing key so every build (regardless of
# -OutputDir) signs with the SAME certificate. Without this, -GenerateCert minted
# a fresh key per build, breaking .appinstaller auto-update (publisher/thumbprint
# mismatch). The pfx lives under .local-build/signing/ (gitignored), so it is
# durable locally but never committed. -CertPath still overrides; if the
# canonical key is absent and -GenerateCert is set, a new key is minted and
# saved here as the canonical one for all future builds.
$canonicalCertPath = Join-Path $repoRoot ".local-build\signing\blossompark.musu.pfx"
if (-not $resolvedCert -and (Test-Path -LiteralPath $canonicalCertPath)) {
    $resolvedCert = (Resolve-Path -LiteralPath $canonicalCertPath).Path
    Write-Step "Using canonical signing certificate ($canonicalCertPath)"
}
if (-not $resolvedCert -and (Test-Path -LiteralPath $generatedCertPath)) {
    $resolvedCert = (Resolve-Path -LiteralPath $generatedCertPath).Path
}

Write-Step "Preparing MSIX stage directory"
if ($DryRun) {
    Write-Host "[dry-run] reset $packageDir"
} else {
    if (Test-Path -LiteralPath $packageDir) {
        Remove-Item -LiteralPath $packageDir -Recurse -Force
    }
    New-Item -ItemType Directory -Path $packageDir -Force | Out-Null
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
    Copy-Item -LiteralPath $musuExe -Destination (Join-Path $packageDir $RuntimeExecutable)
    Copy-Item -LiteralPath $startupExe -Destination (Join-Path $packageDir $StartupExecutable)
    Copy-Item -LiteralPath $desktopExe -Destination (Join-Path $packageDir $ApplicationExecutable)
    Copy-Item -LiteralPath $brainSidecarExe -Destination (Join-Path $packageDir $BrainExecutable)
}

Write-Step "Generating MSIX assets with WinApp CLI"
Invoke-Checked -FilePath "winapp" -ArgumentList @(
    "manifest",
    "generate",
    ".",
    "--executable",
    (".\{0}" -f $ApplicationExecutable),
    "--package-name",
    $IdentityName,
    "--publisher-name",
    $Publisher,
    "--if-exists",
    "overwrite"
) -WorkingDirectory $packageDir

$manifestPath = Get-ManifestPath -PackageDir $packageDir

Write-Step "Writing package manifest"
$manifestContent = New-ManifestContent `
    -PackageIdentity $IdentityName `
    -PackagePublisher $Publisher `
    -PackageVersion $Version `
    -PackageArchitecture $Architecture `
    -AppDisplayName $DisplayName `
    -AppPublisherDisplayName $PublisherDisplayName `
    -AppDescription $Description `
    -ApplicationExecutable $ApplicationExecutable `
    -RuntimeExecutable $RuntimeExecutable `
    -StartupExecutable $StartupExecutable `
    -StartupContract $StartupContract

if ($DryRun) {
    Write-Host "[dry-run] write manifest to $manifestPath"
} else {
    Set-Content -LiteralPath $manifestPath -Value $manifestContent -Encoding UTF8
}

if ($resolvedIcon) {
    Write-Step "Updating package assets from source icon"
    Invoke-Checked -FilePath "winapp" -ArgumentList @(
        "manifest",
        "update-assets",
        $resolvedIcon,
        "--manifest",
        $manifestPath
    ) -WorkingDirectory $packageDir
}

$outputMsix = Join-Path $OutputDir ("musu_{0}_{1}_{2}.msix" -f $Version, $Architecture, $contractSuffix)
$legacyOutputMsix = Join-Path $OutputDir ("musu_{0}_{1}.msix" -f $Version, $Architecture)
$packArgs = @(
    "pack",
    $packageDir,
    "--manifest",
    $manifestPath,
    "--executable",
    $ApplicationExecutable,
    "--output",
    $outputMsix
)

if ($resolvedCert) {
    Write-Step "Reusing existing signing certificate"
    $packArgs += @("--cert", $resolvedCert, "--cert-password", $CertPassword)
} elseif ($GenerateCert) {
    Write-Step "Generating new signing certificate"
    $packArgs += @("--generate-cert")
    if ($InstallCert) {
        $packArgs += @("--install-cert")
    }
} elseif (-not $DryRun) {
    # No signing path resolved: the canonical key is absent AND -GenerateCert was
    # not passed AND no -CertPath was given. Without this guard, winapp pack would
    # run with neither --cert nor --generate-cert and silently produce an unsigned
    # (or build-failing) package, breaking the .appinstaller publisher/thumbprint
    # contract. Fail loud instead. (DryRun is exempt — it never packs.)
    throw ("No signing certificate resolved. Provide -CertPath, pass -GenerateCert " +
        "to mint one, or restore the canonical key at $canonicalCertPath. " +
        "Refusing to pack an unsigned MSIX (would break auto-update publisher trust).")
}

Write-Step "Packing MSIX"
Invoke-Checked -FilePath "winapp" -ArgumentList $packArgs -WorkingDirectory $repoRoot

# Persist a freshly-minted key as the canonical signing key so all future builds
# reuse it (stable .appinstaller auto-update). Only when we just generated one
# (no pre-existing cert was reused) and the canonical slot is still empty.
if (-not $DryRun -and -not $resolvedCert -and $GenerateCert -and `
        (Test-Path -LiteralPath $generatedCertPath) -and `
        -not (Test-Path -LiteralPath $canonicalCertPath)) {
    $canonicalDir = Split-Path -Parent $canonicalCertPath
    New-Item -ItemType Directory -Force -Path $canonicalDir | Out-Null
    Copy-Item -LiteralPath $generatedCertPath -Destination $canonicalCertPath -Force
    Write-Step "Saved newly-generated key as canonical ($canonicalCertPath)"
}

if (-not $KeepStage -and -not $DryRun) {
    Write-Step "Cleaning stage directory"
    Remove-Item -LiteralPath $packageDir -Recurse -Force
}

if (-not $DryRun -and $legacyOutputMsix -ne $outputMsix -and (Test-Path -LiteralPath $legacyOutputMsix)) {
    Write-Step "Removing legacy unsuffixed MSIX artifact"
    Remove-Item -LiteralPath $legacyOutputMsix -Force
}

# .appinstaller — the Windows-native auto-update manifest. App Installer polls the
# hosted copy of THIS file and silently updates when its Version exceeds the
# installed one (MSIX self-update via auto_update.rs is blocked by design; this is
# the supported path). Publisher/Name/Version/Arch are taken from the SAME values
# the manifest used, so they can never drift. Uri fields point at the durable
# hosting base (default = the fixed-tag GitHub release musu.pro links to).
#
# ONLY for the local-sideload-manual contract (audit 2026-06-11 HIGH): the
# store-reviewed contract MSIX is re-signed by Microsoft and updated THROUGH the
# Store — shipping an .appinstaller alongside it (or hosting it under the sideload
# name) is a publisher/signature-mismatch hazard. Auto-update via .appinstaller is
# a sideload-only concept here.
$appInstallerEmitted = $false
if ($StartupContract -eq "local-sideload-manual") {
    $releaseCacheBuster = "rc=$Version"
    $appInstallerUri = "${AppInstallerBaseUrl}/musu.appinstaller?$releaseCacheBuster"
    $hostedMsixUri = "${AppInstallerBaseUrl}/${HostedMsixFileName}?$releaseCacheBuster"
    $appInstallerPath = Join-Path $OutputDir "musu.appinstaller"
    # The .appinstaller references the FIXED hosted name. Emit a copy of the
    # version-suffixed MSIX under that exact name (audit 2026-06-11 MEDIUM) so the
    # artifact that ships IS the one referenced — no manual rename step that, if
    # forgotten, makes App Installer 404 at update time and silently stop updating.
    $hostedMsixPath = Join-Path $OutputDir $HostedMsixFileName
    $appInstallerContent = New-AppInstallerContent `
        -AppInstallerUri $appInstallerUri `
        -MsixUri $hostedMsixUri `
        -PackageIdentity $IdentityName `
        -PackagePublisher $Publisher `
        -PackageVersion $Version `
        -PackageArchitecture $Architecture `
        -UpdateCheckHours $UpdateCheckHours

    Write-Step "Writing .appinstaller auto-update manifest (+ hosted-named MSIX copy)"
    if ($DryRun) {
        Write-Host "[dry-run] write .appinstaller to $appInstallerPath"
        Write-Host "[dry-run]   AppInstaller Uri: $appInstallerUri"
        Write-Host "[dry-run]   MainPackage Uri:  $hostedMsixUri"
        Write-Host "[dry-run] copy $outputMsix -> $hostedMsixPath"
    } else {
        # UTF-8 WITHOUT BOM — App Installer's XML parser rejects a leading BOM.
        [System.IO.File]::WriteAllText(
            $appInstallerPath,
            $appInstallerContent,
            (New-Object System.Text.UTF8Encoding($false))
        )
        Copy-Item -LiteralPath $outputMsix -Destination $hostedMsixPath -Force
    }
    $appInstallerEmitted = $true
}

Write-Host ""
Write-Host "MSIX packaging flow prepared successfully."
Write-Host "Stage directory: $packageDir"
Write-Host "Manifest:        $manifestPath"
Write-Host "Output package:  $outputMsix"
if ($appInstallerEmitted) {
    Write-Host ".appinstaller:   $appInstallerPath"
    Write-Host "Hosted MSIX copy: $hostedMsixPath ($HostedMsixFileName)"
    Write-Host "  AppInstaller URL (host here): $appInstallerUri"
    Write-Host "  MainPackage URL: $hostedMsixUri"
} else {
    Write-Host ".appinstaller:   (skipped — auto-update is sideload-only; this is the '$StartupContract' contract)"
}
Write-Host "Startup contract: $StartupContract"
if ($appInstallerEmitted) {
    Write-Host ""
    Write-Host "To publish auto-update: upload BOTH $HostedMsixFileName AND"
    Write-Host "musu.appinstaller to $AppInstallerBaseUrl, then have users install via the"
    Write-Host ".appinstaller (double-click or Add-AppxPackage -AppInstallerFile <url>)."
}
