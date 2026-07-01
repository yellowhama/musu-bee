[CmdletBinding()]
<#
.SYNOPSIS
  Post-deploy canary: verify every desktop-release URL that musu-pro links to
  resolves and matches the current package version on the live GitHub release.

.DESCRIPTION
  Publishing the desktop artifacts to the `desktop-latest` release is a MANUAL
  step (see musu-bee/src/lib/publicRelease.ts) — no CI uploads them. So a single
  forgotten `gh release upload` silently breaks installs/auto-update: the
  .appinstaller 404s at update time, or the one-line installer can't fetch the
  cert/script. This script is the drift guard that comment prescribes.

  It parses the canonical URLs straight out of publicRelease.ts (so it can never
  drift from what the site actually links), issues a HEAD request to each, then
  fetches the hosted .appinstaller and verifies its AppInstaller/MainPackage
  Version fields against the repo VERSION. It also fetches the hosted
  Install-MUSU.ps1 and certificate to verify the installer script targets the
  same public release, pins the certificate that is actually hosted, and is the
  same file as the local canonical script. It also verifies the hosted
  Uninstall-MUSU.ps1 matches the local canonical script. If a local hosted-name
  MSIX exists, the canary also compares the live
  Content-Length with that local artifact.

  CI deploy jobs can pass -SkipLocalArtifactLengthChecks when they intentionally
  do not build desktop artifacts. That mode still verifies live URL reachability,
  appinstaller package version, hosted Install-MUSU.ps1 release pin/hash,
  uninstaller hash, and certificate thumbprint before allowing the site deploy.

  This catches the dangerous case where every URL returns 200 but users still
  install the previous RC because the fixed `desktop-latest` assets were not
  clobber-uploaded after a local rebuild.

.EXAMPLE
  pwsh scripts/windows/canary-desktop-release.ps1
  # → one line per asset, PASS/FAIL summary, exit 0 if all 200.
#>
param(
    [string]$PublicReleasePath,
    [string]$VersionPath,
    [string]$OutputDir,
    [string]$InstallScriptPath,
    [string]$UninstallScriptPath,
    [string]$RepairFleetScriptPath,
    [string]$SetupExePath,
    [switch]$SkipLocalArtifactLengthChecks,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Join-PathParts {
    param(
        [Parameter(Mandatory = $true)][string]$Base,
        [Parameter(Mandatory = $true)][string[]]$Parts
    )

    $path = $Base
    foreach ($part in $Parts) {
        $path = Join-Path $path $part
    }
    return $path
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-PathParts -Base $scriptDir -Parts @("..", ".."))).Path
if (-not $PublicReleasePath) {
    $PublicReleasePath = Join-PathParts -Base $repoRoot -Parts @("musu-bee", "src", "lib", "publicRelease.ts")
}
if (-not $VersionPath) {
    $VersionPath = Join-Path $repoRoot "VERSION"
}
if (-not $OutputDir) {
    $OutputDir = Join-PathParts -Base $repoRoot -Parts @(".local-build", "msix", "output")
}
if (-not $InstallScriptPath) {
    $InstallScriptPath = Join-PathParts -Base $repoRoot -Parts @("scripts", "windows", "Install-MUSU.ps1")
}
if (-not $UninstallScriptPath) {
    $UninstallScriptPath = Join-PathParts -Base $repoRoot -Parts @("scripts", "windows", "Uninstall-MUSU.ps1")
}
if (-not $RepairFleetScriptPath) {
    $RepairFleetScriptPath = Join-PathParts -Base $repoRoot -Parts @("scripts", "windows", "repair-fleet-node-public-url.ps1")
}
if (-not $SetupExePath) {
    $SetupExePath = $null
}
if (-not (Test-Path -LiteralPath $PublicReleasePath)) {
    throw "publicRelease.ts not found at $PublicReleasePath"
}
if (-not (Test-Path -LiteralPath $VersionPath)) {
    throw "VERSION not found at $VersionPath"
}
if (-not (Test-Path -LiteralPath $InstallScriptPath)) {
    throw "Install-MUSU.ps1 not found at $InstallScriptPath"
}
if (-not (Test-Path -LiteralPath $UninstallScriptPath)) {
    throw "Uninstall-MUSU.ps1 not found at $UninstallScriptPath"
}
if (-not (Test-Path -LiteralPath $RepairFleetScriptPath)) {
    throw "repair-fleet-node-public-url.ps1 not found at $RepairFleetScriptPath"
}

function Convert-PublicVersionToPackageVersion {
    param([Parameter(Mandatory = $true)][string]$PublicVersion)

    if ($PublicVersion -match '^(\d+)\.(\d+)\.(\d+)-rc\.(\d+)$') {
        return "$($Matches[1]).$($Matches[2]).$($Matches[3]).$($Matches[4])"
    }
    if ($PublicVersion -match '^(\d+)\.(\d+)\.(\d+)$') {
        return "$($Matches[1]).$($Matches[2]).$($Matches[3]).0"
    }
    throw "Unsupported public VERSION format: $PublicVersion"
}

function Convert-ContentToText {
    param([Parameter(Mandatory = $true)]$Content)

    if ($Content -is [byte[]]) {
        return [System.Text.Encoding]::UTF8.GetString($Content)
    }
    return [string]$Content
}

function Get-HeaderValue {
    param(
        [Parameter(Mandatory = $true)]$Headers,
        [Parameter(Mandatory = $true)][string]$Name
    )

    $value = $Headers[$Name]
    if ($null -eq $value) {
        return $null
    }
    if ($value -is [array]) {
        return $value[0]
    }
    return $value
}

function Get-RegexGroup {
    param(
        [Parameter(Mandatory = $true)][string]$Text,
        [Parameter(Mandatory = $true)][string]$Pattern
    )

    $m = [regex]::Match($Text, $Pattern)
    if (-not $m.Success) {
        return $null
    }
    return $m.Groups[1].Value
}

function Get-LocalFileSnapshot {
    param([Parameter(Mandatory = $true)][string]$Path)

    $item = Get-Item -LiteralPath $Path
    return [pscustomobject]@{
        path = $item.FullName
        length = [int64]$item.Length
        sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $item.FullName).Hash.ToLowerInvariant()
    }
}

function Get-HostedFileSnapshot {
    param([Parameter(Mandatory = $true)][string]$Url)

    $tmp = $null
    try {
        $tmp = New-TemporaryFile
        Invoke-WebRequest -UseBasicParsing -Uri $Url -Method Get -MaximumRedirection 5 `
            -TimeoutSec 30 -OutFile $tmp.FullName
        $bytes = [System.IO.File]::ReadAllBytes($tmp.FullName)
        return [pscustomobject]@{
            length = [int64]$bytes.Length
            sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $tmp.FullName).Hash.ToLowerInvariant()
            text = [System.Text.Encoding]::UTF8.GetString($bytes)
        }
    } finally {
        if ($tmp -and (Test-Path -LiteralPath $tmp.FullName)) {
            Remove-Item -LiteralPath $tmp.FullName -Force -ErrorAction SilentlyContinue
        }
    }
}

$src = Get-Content -LiteralPath $PublicReleasePath -Raw
$publicVersion = (Get-Content -LiteralPath $VersionPath -Raw).Trim()
$expectedPackageVersion = Convert-PublicVersionToPackageVersion -PublicVersion $publicVersion

# Resolve the release base (a template literal: `${...}/...`). Extract the literal
# string the base const is assigned, then the suffix each URL appends.
$baseMatch = [regex]::Match($src, 'DESKTOP_RELEASE_BASE\s*=\s*\r?\n?\s*"([^"]+)"')
if (-not $baseMatch.Success) {
    throw "Could not parse DESKTOP_RELEASE_BASE from publicRelease.ts"
}
$base = $baseMatch.Groups[1].Value

# Each exported URL is `${DESKTOP_RELEASE_BASE}/<suffix>`; capture the suffix.
$urlMatches = [regex]::Matches(
    $src,
    'export const (DESKTOP_[A-Z_]+URL)\s*=\s*`\$\{DESKTOP_RELEASE_BASE\}/([^`]+)`'
)
if ($urlMatches.Count -eq 0) {
    throw "Could not parse any DESKTOP_*_URL from publicRelease.ts"
}

$targets = @()
foreach ($m in $urlMatches) {
    $targets += [pscustomobject]@{
        Name = $m.Groups[1].Value
        Url  = "$base/$($m.Groups[2].Value)"
    }
}

$remoteResults = @()
if (-not $Json) {
    Write-Host "Canary: $($targets.Count) desktop-release URLs from $PublicReleasePath"
    Write-Host "Expected package version: $expectedPackageVersion (from VERSION $publicVersion)"
    Write-Host ""
}

$failures = 0
foreach ($t in $targets) {
    $status = $null
    $len = $null
    try {
        # HEAD via Invoke-WebRequest. GitHub release asset URLs 302→S3; follow it.
        $resp = Invoke-WebRequest -UseBasicParsing -Uri $t.Url -Method Head -MaximumRedirection 5 `
            -TimeoutSec 30
        $status = [int]$resp.StatusCode
        $len = Get-HeaderValue -Headers $resp.Headers -Name "Content-Length"
    } catch {
        $status = "ERR: $($_.Exception.Message)"
    }
    $ok = ($status -eq 200)
    if (-not $ok) { $failures++ }
    $mark = if ($ok) { "PASS" } else { "FAIL" }
    $remoteResults += [pscustomobject]@{
        name = $t.Name
        url = $t.Url
        status = $status
        content_length = $len
        ok = $ok
    }
    if (-not $Json) {
        Write-Host ("  [{0}] {1,-26} {2,-6} len={3}  {4}" -f $mark, $t.Name, $status, $len, $t.Url)
    }
}

$appInstallerTarget = $targets | Where-Object { $_.Name -eq "DESKTOP_APPINSTALLER_URL" } | Select-Object -First 1
$msixTarget = $targets | Where-Object { $_.Name -eq "DESKTOP_MSIX_URL" } | Select-Object -First 1
$installScriptTarget = $targets | Where-Object { $_.Name -eq "DESKTOP_INSTALL_SCRIPT_URL" } | Select-Object -First 1
$uninstallScriptTarget = $targets | Where-Object { $_.Name -eq "DESKTOP_UNINSTALL_SCRIPT_URL" } | Select-Object -First 1
$repairFleetScriptTarget = $targets | Where-Object { $_.Name -eq "DESKTOP_REPAIR_FLEET_SCRIPT_URL" } | Select-Object -First 1
$certTarget = $targets | Where-Object { $_.Name -eq "DESKTOP_CERT_URL" } | Select-Object -First 1
$setupExeTarget = $targets | Where-Object { $_.Name -eq "DESKTOP_SETUP_EXE_URL" } | Select-Object -First 1
$appInstallerCheck = [pscustomobject]@{
    ok = $false
    expected_package_version = $expectedPackageVersion
    appinstaller_version = $null
    main_package_version = $null
    error = $null
}
if ($null -eq $appInstallerTarget) {
    $failures++
    $appInstallerCheck.error = "DESKTOP_APPINSTALLER_URL not found in publicRelease.ts"
} else {
    try {
        $res = Invoke-WebRequest -UseBasicParsing -Uri $appInstallerTarget.Url -Method Get -MaximumRedirection 5 `
            -TimeoutSec 30
        if ([int]$res.StatusCode -ne 200) {
            throw "GET $($appInstallerTarget.Url) returned $($res.StatusCode)"
        }
        $text = Convert-ContentToText -Content $res.Content
        $appMatch = [regex]::Match($text, '<AppInstaller[\s\S]*?\sVersion="([^"]+)"')
        $mainMatch = [regex]::Match($text, '<MainPackage[\s\S]*?\sVersion="([^"]+)"')
        if (-not $appMatch.Success) {
            throw "Could not parse AppInstaller Version"
        }
        if (-not $mainMatch.Success) {
            throw "Could not parse MainPackage Version"
        }
        $appInstallerCheck.appinstaller_version = $appMatch.Groups[1].Value
        $appInstallerCheck.main_package_version = $mainMatch.Groups[1].Value
        $appInstallerCheck.ok = (
            $appInstallerCheck.appinstaller_version -eq $expectedPackageVersion -and
            $appInstallerCheck.main_package_version -eq $expectedPackageVersion
        )
        if (-not $appInstallerCheck.ok) {
            $failures++
        }
    } catch {
        $failures++
        $appInstallerCheck.error = $_.Exception.Message
    }
}

$installScriptCheck = [pscustomobject]@{
    ok = $false
    expected_public_version = $publicVersion
    local_path = $InstallScriptPath
    local_sha256 = $null
    hosted_sha256 = $null
    local_length = $null
    hosted_length = $null
    hash_match = $null
    hosted_expected_release_version = $null
    hosted_expected_cert_thumbprint = $null
    error = $null
}
if ($null -eq $installScriptTarget) {
    $failures++
    $installScriptCheck.error = "DESKTOP_INSTALL_SCRIPT_URL not found in publicRelease.ts"
} else {
    try {
        $localInstall = Get-LocalFileSnapshot -Path $InstallScriptPath
        $hostedInstall = Get-HostedFileSnapshot -Url $installScriptTarget.Url
        $text = $hostedInstall.text
        $installScriptCheck.local_sha256 = $localInstall.sha256
        $installScriptCheck.hosted_sha256 = $hostedInstall.sha256
        $installScriptCheck.local_length = $localInstall.length
        $installScriptCheck.hosted_length = $hostedInstall.length
        $installScriptCheck.hash_match = ($localInstall.sha256 -eq $hostedInstall.sha256)
        $installScriptCheck.hosted_expected_release_version = Get-RegexGroup `
            -Text $text `
            -Pattern '\$ExpectedReleaseVersion\s*=\s*"([^"]+)"'
        $installScriptCheck.hosted_expected_cert_thumbprint = Get-RegexGroup `
            -Text $text `
            -Pattern '\$ExpectedCertThumbprint\s*=\s*"([A-Fa-f0-9]+)"'
        $installScriptCheck.ok = (
            $installScriptCheck.hosted_expected_release_version -eq $publicVersion -and
            -not [string]::IsNullOrWhiteSpace($installScriptCheck.hosted_expected_cert_thumbprint) -and
            $installScriptCheck.hash_match
        )
        if (-not $installScriptCheck.ok) {
            $failures++
        }
    } catch {
        $failures++
        $installScriptCheck.error = $_.Exception.Message
    }
}

$uninstallScriptCheck = [pscustomobject]@{
    ok = $false
    local_path = $UninstallScriptPath
    local_sha256 = $null
    hosted_sha256 = $null
    local_length = $null
    hosted_length = $null
    hash_match = $null
    error = $null
}
if ($null -eq $uninstallScriptTarget) {
    $failures++
    $uninstallScriptCheck.error = "DESKTOP_UNINSTALL_SCRIPT_URL not found in publicRelease.ts"
} else {
    try {
        $localUninstall = Get-LocalFileSnapshot -Path $UninstallScriptPath
        $hostedUninstall = Get-HostedFileSnapshot -Url $uninstallScriptTarget.Url
        $uninstallScriptCheck.local_sha256 = $localUninstall.sha256
        $uninstallScriptCheck.hosted_sha256 = $hostedUninstall.sha256
        $uninstallScriptCheck.local_length = $localUninstall.length
        $uninstallScriptCheck.hosted_length = $hostedUninstall.length
        $uninstallScriptCheck.hash_match = ($localUninstall.sha256 -eq $hostedUninstall.sha256)
        $uninstallScriptCheck.ok = $uninstallScriptCheck.hash_match
        if (-not $uninstallScriptCheck.ok) {
            $failures++
        }
    } catch {
        $failures++
        $uninstallScriptCheck.error = $_.Exception.Message
    }
}

$repairFleetScriptCheck = [pscustomobject]@{
    ok = $false
    local_path = $RepairFleetScriptPath
    local_sha256 = $null
    hosted_sha256 = $null
    local_length = $null
    hosted_length = $null
    hash_match = $null
    hosted_schema_present = $false
    hosted_expected_node_guard_present = $false
    error = $null
}
if ($null -eq $repairFleetScriptTarget) {
    $failures++
    $repairFleetScriptCheck.error = "DESKTOP_REPAIR_FLEET_SCRIPT_URL not found in publicRelease.ts"
} else {
    try {
        $localRepair = Get-LocalFileSnapshot -Path $RepairFleetScriptPath
        $hostedRepair = Get-HostedFileSnapshot -Url $repairFleetScriptTarget.Url
        $repairFleetScriptCheck.local_sha256 = $localRepair.sha256
        $repairFleetScriptCheck.hosted_sha256 = $hostedRepair.sha256
        $repairFleetScriptCheck.local_length = $localRepair.length
        $repairFleetScriptCheck.hosted_length = $hostedRepair.length
        $repairFleetScriptCheck.hash_match = ($localRepair.sha256 -eq $hostedRepair.sha256)
        $repairFleetScriptCheck.hosted_schema_present = ($hostedRepair.text -match 'musu\.fleet_node_public_url_repair\.v1')
        $repairFleetScriptCheck.hosted_expected_node_guard_present = ($hostedRepair.text -match 'ExpectedNodeName')
        $repairFleetScriptCheck.ok = (
            $repairFleetScriptCheck.hash_match -and
            $repairFleetScriptCheck.hosted_schema_present -and
            $repairFleetScriptCheck.hosted_expected_node_guard_present
        )
        if (-not $repairFleetScriptCheck.ok) {
            $failures++
        }
    } catch {
        $failures++
        $repairFleetScriptCheck.error = $_.Exception.Message
    }
}

$certCheck = [pscustomobject]@{
    ok = $null
    skipped = $false
    expected_thumbprint = $installScriptCheck.hosted_expected_cert_thumbprint
    hosted_thumbprint = $null
    error = $null
}
if ([string]::IsNullOrWhiteSpace($installScriptCheck.hosted_expected_cert_thumbprint)) {
    $certCheck.skipped = $true
    $certCheck.error = "hosted Install-MUSU.ps1 did not expose ExpectedCertThumbprint"
} elseif ($null -eq $certTarget) {
    $failures++
    $certCheck.ok = $false
    $certCheck.error = "DESKTOP_CERT_URL not found in publicRelease.ts"
} else {
    $tmp = $null
    try {
        $tmp = New-TemporaryFile
        Invoke-WebRequest -UseBasicParsing -Uri $certTarget.Url -Method Get -MaximumRedirection 5 `
            -TimeoutSec 30 -OutFile $tmp.FullName
        $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2 $tmp.FullName
        $certCheck.hosted_thumbprint = $cert.Thumbprint.ToUpperInvariant()
        $certCheck.ok = ($certCheck.hosted_thumbprint -eq $installScriptCheck.hosted_expected_cert_thumbprint.ToUpperInvariant())
        if (-not $certCheck.ok) {
            $failures++
        }
    } catch {
        $failures++
        $certCheck.ok = $false
        $certCheck.error = $_.Exception.Message
    } finally {
        if ($tmp -and (Test-Path -LiteralPath $tmp.FullName)) {
            Remove-Item -LiteralPath $tmp.FullName -Force -ErrorAction SilentlyContinue
        }
    }
}

$localHostedMsix = Join-Path $OutputDir "musu-desktop-x64.msix"
$msixLengthCheck = [pscustomobject]@{
    ok = $null
    skipped = $false
    local_path = $localHostedMsix
    local_length = $null
    remote_length = $null
    error = $null
}
if ($SkipLocalArtifactLengthChecks) {
    $msixLengthCheck.skipped = $true
    $msixLengthCheck.error = "local artifact length checks skipped by caller"
} elseif ($null -eq $msixTarget) {
    $failures++
    $msixLengthCheck.ok = $false
    $msixLengthCheck.error = "DESKTOP_MSIX_URL not found in publicRelease.ts"
} elseif (-not (Test-Path -LiteralPath $localHostedMsix)) {
    $msixLengthCheck.skipped = $true
} else {
    $msixLengthCheck.local_length = (Get-Item -LiteralPath $localHostedMsix).Length
    $remoteMsix = $remoteResults | Where-Object { $_.name -eq "DESKTOP_MSIX_URL" } | Select-Object -First 1
    if ($null -eq $remoteMsix -or $null -eq $remoteMsix.content_length) {
        $failures++
        $msixLengthCheck.ok = $false
        $msixLengthCheck.error = "Live DESKTOP_MSIX_URL Content-Length missing"
    } else {
        $msixLengthCheck.remote_length = [int64]$remoteMsix.content_length
        $msixLengthCheck.ok = ($msixLengthCheck.remote_length -eq $msixLengthCheck.local_length)
        if (-not $msixLengthCheck.ok) {
            $failures++
        }
    }
}

$setupExeLengthCheck = [pscustomobject]@{
    ok = $null
    skipped = $false
    local_path = $SetupExePath
    local_length = $null
    remote_length = $null
    error = $null
}
if ($SkipLocalArtifactLengthChecks) {
    $setupExeLengthCheck.skipped = $true
    $setupExeLengthCheck.error = "local artifact length checks skipped by caller"
} elseif ($null -eq $setupExeTarget) {
    $failures++
    $setupExeLengthCheck.ok = $false
    $setupExeLengthCheck.error = "DESKTOP_SETUP_EXE_URL not found in publicRelease.ts"
} else {
    if ([string]::IsNullOrWhiteSpace($SetupExePath)) {
        $setupLeaf = (($setupExeTarget.Url -split "/")[-1] -split "\?", 2)[0]
        $SetupExePath = Join-PathParts -Base $repoRoot -Parts @("musu-bee", "src-tauri", "target", "release", "bundle", "nsis", $setupLeaf)
        $setupExeLengthCheck.local_path = $SetupExePath
    }
    if (-not (Test-Path -LiteralPath $SetupExePath)) {
        $failures++
        $setupExeLengthCheck.ok = $false
        $setupExeLengthCheck.error = "local setup exe not found at $SetupExePath"
    } else {
        $setupExeLengthCheck.local_length = (Get-Item -LiteralPath $SetupExePath).Length
        $remoteSetup = $remoteResults | Where-Object { $_.name -eq "DESKTOP_SETUP_EXE_URL" } | Select-Object -First 1
        if ($null -eq $remoteSetup -or $null -eq $remoteSetup.content_length) {
            $failures++
            $setupExeLengthCheck.ok = $false
            $setupExeLengthCheck.error = "Live DESKTOP_SETUP_EXE_URL Content-Length missing"
        } else {
            $setupExeLengthCheck.remote_length = [int64]$remoteSetup.content_length
            $setupExeLengthCheck.ok = ($setupExeLengthCheck.remote_length -eq $setupExeLengthCheck.local_length)
            if (-not $setupExeLengthCheck.ok) {
                $failures++
            }
        }
    }
}

$ok = ($failures -eq 0)
$summary = [pscustomobject]@{
    schema = "musu.desktop_release_canary.v6"
    ok = $ok
    failure_count = $failures
    public_version = $publicVersion
    expected_package_version = $expectedPackageVersion
    public_release_path = $PublicReleasePath
    version_path = $VersionPath
    output_dir = $OutputDir
    urls = $remoteResults
    appinstaller_version = $appInstallerCheck
    installer_script = $installScriptCheck
    uninstaller_script = $uninstallScriptCheck
    repair_fleet_script = $repairFleetScriptCheck
    cert_thumbprint = $certCheck
    hosted_msix_length = $msixLengthCheck
    hosted_setup_exe_length = $setupExeLengthCheck
}

if ($Json) {
    $summary | ConvertTo-Json -Depth 8
    if ($ok) { exit 0 } else { exit 1 }
}

Write-Host ""
$appMark = if ($appInstallerCheck.ok) { "PASS" } else { "FAIL" }
Write-Host ("  [{0}] {1,-26} appinstaller={2} main={3} expected={4}" -f `
    $appMark,
    "APPINSTALLER_VERSION",
    $appInstallerCheck.appinstaller_version,
    $appInstallerCheck.main_package_version,
    $expectedPackageVersion)

$installerMark = if ($installScriptCheck.ok) { "PASS" } else { "FAIL" }
Write-Host ("  [{0}] {1,-26} expected_release={2} hosted_release={3} hash_match={4}" -f `
    $installerMark,
    "INSTALLER_SCRIPT",
    $publicVersion,
    $installScriptCheck.hosted_expected_release_version,
    $installScriptCheck.hash_match)

$uninstallerMark = if ($uninstallScriptCheck.ok) { "PASS" } else { "FAIL" }
Write-Host ("  [{0}] {1,-26} local_len={2} hosted_len={3} hash_match={4}" -f `
    $uninstallerMark,
    "UNINSTALLER_SCRIPT",
    $uninstallScriptCheck.local_length,
    $uninstallScriptCheck.hosted_length,
    $uninstallScriptCheck.hash_match)

$repairMark = if ($repairFleetScriptCheck.ok) { "PASS" } else { "FAIL" }
Write-Host ("  [{0}] {1,-26} local_len={2} hosted_len={3} hash_match={4} schema={5} node_guard={6}" -f `
    $repairMark,
    "REPAIR_FLEET_SCRIPT",
    $repairFleetScriptCheck.local_length,
    $repairFleetScriptCheck.hosted_length,
    $repairFleetScriptCheck.hash_match,
    $repairFleetScriptCheck.hosted_schema_present,
    $repairFleetScriptCheck.hosted_expected_node_guard_present)

if ($certCheck.skipped) {
    Write-Host ("  [SKIP] {0,-26} {1}" -f "CERT_THUMBPRINT", $certCheck.error)
} else {
    $certMark = if ($certCheck.ok) { "PASS" } else { "FAIL" }
    Write-Host ("  [{0}] {1,-26} hosted={2} expected={3}" -f `
        $certMark,
        "CERT_THUMBPRINT",
        $certCheck.hosted_thumbprint,
        $certCheck.expected_thumbprint)
}

if ($msixLengthCheck.skipped) {
    $message = if ($msixLengthCheck.error) { $msixLengthCheck.error } else { "local hosted MSIX not found at $localHostedMsix" }
    Write-Host ("  [SKIP] {0,-26} {1}" -f "HOSTED_MSIX_LENGTH", $message)
} else {
    $msixMark = if ($msixLengthCheck.ok) { "PASS" } else { "FAIL" }
    Write-Host ("  [{0}] {1,-26} remote={2} local={3}" -f `
        $msixMark,
        "HOSTED_MSIX_LENGTH",
        $msixLengthCheck.remote_length,
        $msixLengthCheck.local_length)
}

if ($setupExeLengthCheck.skipped) {
    Write-Host ("  [SKIP] {0,-26} {1}" -f "HOSTED_SETUP_EXE_LENGTH", $setupExeLengthCheck.error)
} else {
    $setupMark = if ($setupExeLengthCheck.ok) { "PASS" } else { "FAIL" }
    Write-Host ("  [{0}] {1,-26} remote={2} local={3}" -f `
        $setupMark,
        "HOSTED_SETUP_EXE_LENGTH",
        $setupExeLengthCheck.remote_length,
        $setupExeLengthCheck.local_length)
}

Write-Host ""
if ($failures -eq 0) {
    Write-Host "CANARY OK: all assets resolve and the hosted appinstaller/installer/repair/cert/MSIX/setup exe match the current release."
    exit 0
} else {
    Write-Host "CANARY FAILED: $failures release check(s) failed."
    Write-Host "Re-upload the current desktop-latest assets with scripts\windows\publish-desktop-latest-assets.ps1 -ConfirmUpload."
    exit 1
}
