[CmdletBinding()]
param(
    [string]$OutputRoot,
    [ValidateSet("local-sideload-manual", "store-reviewed-immediate-registration")]
    [string]$StartupContract = "local-sideload-manual",
    [switch]$IncludeDesktopShell
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $scriptDir "msix-common.ps1")

$repoRoot = Get-WindowsRepoRoot $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($OutputRoot)) {
    $OutputRoot = Join-Path $repoRoot ".local-build\multi-device-test-kit"
}

$version = (Get-Content -LiteralPath (Join-Path $repoRoot "VERSION") -Raw).Trim()
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$safeVersion = $version -replace "[^A-Za-z0-9._-]", "_"
$kitRoot = Join-Path $OutputRoot "musu-multidevice-$safeVersion-$stamp"
$kitWindowsDir = Join-Path $kitRoot "scripts\windows"
$kitMsixDir = Join-Path $kitRoot ".local-build\msix\output"
$kitDocsDir = Join-Path $kitRoot "docs"
$kitDesktopDir = Join-Path $kitRoot "desktop-shell"

if (Test-Path -LiteralPath $kitRoot) {
    throw "Test kit output already exists: $kitRoot"
}

$packagePath = Find-LatestMsixArtifact -Directory (Join-Path $repoRoot ".local-build\msix\output") -StartupContract $StartupContract
if (-not $packagePath -or -not (Test-Path -LiteralPath $packagePath)) {
    throw "MSIX package for '$StartupContract' was not found. Build the package first."
}

$certPath = Find-LatestMsixCertificateArtifact -Directory (Join-Path $repoRoot ".local-build\msix\output")
if (-not $certPath -or -not (Test-Path -LiteralPath $certPath)) {
    throw "MSIX public certificate was not found."
}
if ([System.IO.Path]::GetExtension($certPath).ToLowerInvariant() -notin @(".cer", ".crt", ".cert")) {
    throw "Refusing to package private certificate material. Expected a public .cer certificate, got: $certPath"
}

New-Item -ItemType Directory -Force -Path $kitWindowsDir, $kitMsixDir, $kitDocsDir | Out-Null

$scriptFiles = @(
    "msix-common.ps1",
    "check-msix-sideload-readiness.ps1",
    "check-msix-legacy-conflicts.ps1",
    "check-packaged-startup-state.ps1",
    "install-msix.ps1",
    "install-and-verify-msix.ps1",
    "verify-installed-msix-package.ps1",
    "capture-msix-install-evidence.ps1",
    "verify-msix-install-evidence.ps1",
    "record-msix-install-evidence.ps1",
    "verify-multidevice-evidence.ps1",
    "record-multidevice-evidence.ps1",
    "smoke-multidevice-beta.ps1"
)

foreach ($name in $scriptFiles) {
    Copy-Item -LiteralPath (Join-Path $scriptDir $name) -Destination (Join-Path $kitWindowsDir $name)
}

Copy-Item -LiteralPath $packagePath -Destination (Join-Path $kitMsixDir (Split-Path -Leaf $packagePath))
Copy-Item -LiteralPath $certPath -Destination (Join-Path $kitMsixDir (Split-Path -Leaf $certPath))
Copy-Item -LiteralPath (Join-Path $repoRoot "VERSION") -Destination (Join-Path $kitRoot "VERSION")
Copy-Item -LiteralPath (Join-Path $repoRoot "docs\MULTI_DEVICE_RELEASE_TEST_PLAN_1_15_0_RC1_2026_05_29.md") -Destination $kitDocsDir

if ($IncludeDesktopShell) {
    New-Item -ItemType Directory -Force -Path $kitDesktopDir | Out-Null
    $desktopBundles = @(
        (Join-Path $repoRoot "musu-bee\src-tauri\target\release\bundle\msi\MUSU_1.15.0_x64_en-US.msi"),
        (Join-Path $repoRoot "musu-bee\src-tauri\target\release\bundle\nsis\MUSU_1.15.0_x64-setup.exe")
    )
    foreach ($bundle in $desktopBundles) {
        if (Test-Path -LiteralPath $bundle) {
            Copy-Item -LiteralPath $bundle -Destination (Join-Path $kitDesktopDir (Split-Path -Leaf $bundle))
        }
    }
}

$readme = @'
# MUSU __VERSION__ Multi-Device Test Kit

This kit is for the required second-PC beta smoke. It contains the public test
certificate, the __STARTUP_CONTRACT__ MSIX, install/verify scripts, and the
multi-device smoke script.

No private signing key is included.

## On each Windows PC

Open PowerShell in this kit directory.

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\check-msix-sideload-readiness.ps1
powershell -ExecutionPolicy Bypass -File scripts\windows\install-and-verify-msix.ps1 -StartupContract __STARTUP_CONTRACT__ -ReplaceExisting
powershell -ExecutionPolicy Bypass -File scripts\windows\capture-msix-install-evidence.ps1 -StartupContract __STARTUP_CONTRACT__
musu up --json
musu doctor --json
musu status
```

If certificate trust fails, rerun the install from an elevated PowerShell with:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\install-and-verify-msix.ps1 -StartupContract __STARTUP_CONTRACT__ -ReplaceExisting -MachineTrust
```

The install evidence command writes `.local-build\msix-install\*.evidence.json`.
Return that JSON to the release repo with the multi-device smoke evidence.

## On the primary PC

Use the other PC's bridge address from `musu up --json`.

Status-only:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\smoke-multidevice-beta.ps1 -RemoteAddr OTHER_PC_IP:BRIDGE_PORT -RemoteName OTHER_PC_NAME -SkipRoute
```

Full route:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\smoke-multidevice-beta.ps1 -RemoteAddr OTHER_PC_IP:BRIDGE_PORT -RemoteName OTHER_PC_NAME -RouteTarget OTHER_PC_NAME
```

The smoke writes an evidence JSON file under `.local-build\multi-device\`.
Send that JSON back to the release repo before claiming multi-device readiness.

Verify it locally with:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\verify-multidevice-evidence.ps1 -EvidencePath .local-build\multi-device\YOUR-EVIDENCE.json
```

In the release repo, record verified evidence with:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\record-multidevice-evidence.ps1 -EvidencePath .local-build\multi-device\YOUR-EVIDENCE.json
```
'@
$readme = $readme.Replace("__VERSION__", $version).Replace("__STARTUP_CONTRACT__", $StartupContract)
$readme | Set-Content -LiteralPath (Join-Path $kitRoot "README_MULTI_DEVICE_TEST_KIT.md") -Encoding UTF8

$checksumsPath = Join-Path $kitRoot "SHA256SUMS.txt"
Get-ChildItem -LiteralPath $kitRoot -Recurse -File |
    Where-Object { $_.FullName -ne $checksumsPath } |
    Sort-Object FullName |
    ForEach-Object {
        $relative = $_.FullName.Substring($kitRoot.Length + 1)
        $hash = Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName
        "{0}  {1}" -f $hash.Hash.ToLowerInvariant(), ($relative -replace "\\", "/")
    } | Set-Content -LiteralPath $checksumsPath -Encoding ASCII

$zipPath = "$kitRoot.zip"
Compress-Archive -Path (Join-Path $kitRoot "*") -DestinationPath $zipPath -Force

[pscustomobject]@{
    ok = $true
    version = $version
    startup_contract = $StartupContract
    kit_root = $kitRoot
    zip_path = $zipPath
    package = Split-Path -Leaf $packagePath
    certificate = Split-Path -Leaf $certPath
    includes_desktop_shell = [bool]$IncludeDesktopShell
}
