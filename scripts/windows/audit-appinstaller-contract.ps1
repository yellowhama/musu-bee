[CmdletBinding()]
param(
    # Override the artifact dir (defaults to the standard local-build output).
    [string]$OutputDir
)

# audit-appinstaller-contract.ps1 — asserts the generated `musu.appinstaller`
# auto-update manifest is internally consistent and matches the MSIX it ships
# alongside. The failure mode this guards is silent: if the .appinstaller's
# MainPackage Name/Publisher/Version/ProcessorArchitecture do NOT byte-match the
# packaged MSIX <Identity>, Windows App Installer refuses the update with an
# opaque publisher/identity-mismatch error and the user simply never updates.
#
# Checks:
#   1. The .appinstaller exists and is well-formed XML.
#   2. It has NO UTF-8 BOM (App Installer's parser rejects a leading BOM).
#   3. MainPackage Name/Publisher/Version/Arch == MSIX Identity (the 4 fields that
#      must match or the update is rejected).
#   4. Root <AppInstaller Version> == MainPackage Version.
#   5. The MainPackage Uri filename is the fixed hosted name (matches musu-pro's
#      DESKTOP_DOWNLOAD_URL), not the version-suffixed local artifact name.
#
# Exit 0 = contract holds. Non-zero = a real publish-blocking defect.

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $scriptDir "msix-common.ps1")

$repoRoot = Get-WindowsRepoRoot $MyInvocation.MyCommand.Path
if (-not $OutputDir) {
    $OutputDir = Join-Path $repoRoot ".local-build\msix\output"
}

$failures = New-Object System.Collections.Generic.List[string]
function Add-Failure([string]$Message) { $script:failures.Add($Message) }

$appInstallerPath = Join-Path $OutputDir "musu.appinstaller"
if (-not (Test-Path -LiteralPath $appInstallerPath)) {
    Add-Failure "musu.appinstaller not found at $appInstallerPath (run build-msix.ps1 first)"
    $failures | ForEach-Object { Write-Host "FAIL: $_" }
    throw "appinstaller contract audit FAILED ($($failures.Count) issue(s))"
}

# (2) BOM check — read raw bytes, the first three must not be EF BB BF.
$rawBytes = [System.IO.File]::ReadAllBytes($appInstallerPath)
if ($rawBytes.Length -ge 3 -and $rawBytes[0] -eq 0xEF -and $rawBytes[1] -eq 0xBB -and $rawBytes[2] -eq 0xBF) {
    Add-Failure "musu.appinstaller starts with a UTF-8 BOM; App Installer rejects it"
}

# (1) Well-formed XML.
$appXml = $null
try {
    [xml]$appXml = Get-Content -LiteralPath $appInstallerPath -Raw
} catch {
    Add-Failure "musu.appinstaller is not well-formed XML: $($_.Exception.Message)"
}

if ($appXml) {
    $ns = $appXml.AppInstaller
    $main = $ns.MainPackage

    $aiName = [string]$main.Name
    $aiPublisher = [string]$main.Publisher
    $aiVersion = [string]$main.Version
    $aiArch = [string]$main.ProcessorArchitecture
    $aiRootVersion = [string]$ns.Version
    $aiMsixUri = [string]$main.Uri

    # (4) root Version == MainPackage Version
    if ($aiRootVersion -ne $aiVersion) {
        Add-Failure "root <AppInstaller Version='$aiRootVersion'> != MainPackage Version='$aiVersion'"
    }

    # (5) hosted MSIX filename is the fixed name, not the version-suffixed local
    # artifact. The local pattern is musu_<ver>_<arch>_<contract>.msix — assert the
    # hosted leaf does NOT match it for ANY arch/contract (not just x64), so the
    # durable hosted URL can never point at a per-build artifact name that rots.
    $msixLeaf = (($aiMsixUri -split "/")[-1] -split "[?#]", 2)[0]
    if ($msixLeaf -notmatch "\.msix$") {
        Add-Failure "MainPackage Uri path does not end in .msix: $aiMsixUri"
    }
    if ($msixLeaf -match "_(x64|x86|arm64|neutral)_(local-sideload-manual|store-reviewed-immediate-registration)\.msix$") {
        Add-Failure "MainPackage Uri points at a version-suffixed local artifact ($msixLeaf); it must be the fixed hosted name so the durable URL never rots"
    }

    # (3) parity vs the packaged MSIX Identity
    $msix = Find-LatestMsixArtifact -Directory $OutputDir -StartupContract "local-sideload-manual"
    if (-not $msix) {
        Add-Failure "no local-sideload MSIX found in $OutputDir to compare the .appinstaller against"
    } else {
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        $manifestText = $null
        $zip = [System.IO.Compression.ZipFile]::OpenRead($msix)
        try {
            $entry = $zip.GetEntry("AppxManifest.xml")
            if (-not $entry) { $entry = $zip.GetEntry("appxmanifest.xml") }
            if (-not $entry) {
                Add-Failure "MSIX $msix contains no AppxManifest.xml to compare against"
            } else {
                $reader = New-Object System.IO.StreamReader($entry.Open())
                $manifestText = $reader.ReadToEnd()
                $reader.Dispose()
            }
        } finally {
            $zip.Dispose()
        }

        if ($manifestText) {
            [xml]$manifestXml = $manifestText
            $identity = $manifestXml.Package.Identity
            $msixName = [string]$identity.Name
            $msixPublisher = [string]$identity.Publisher
            $msixVersion = [string]$identity.Version
            $msixArch = [string]$identity.ProcessorArchitecture

            # Guard against an empty parse masquerading as a match (LOW): a missing
            # MSIX field must FAIL, not silently compare '' vs ''.
            if ([string]::IsNullOrWhiteSpace($msixName)) { Add-Failure "MSIX Identity Name is empty/unparsed" }
            if ([string]::IsNullOrWhiteSpace($msixPublisher)) { Add-Failure "MSIX Identity Publisher is empty/unparsed" }
            if ([string]::IsNullOrWhiteSpace($msixVersion)) { Add-Failure "MSIX Identity Version is empty/unparsed" }

            if ($aiName -ne $msixName) { Add-Failure "Name mismatch: appinstaller='$aiName' msix='$msixName'" }
            if ($aiPublisher -ne $msixPublisher) { Add-Failure "Publisher mismatch (BREAKS App Installer): appinstaller='$aiPublisher' msix='$msixPublisher'" }
            if ($aiVersion -ne $msixVersion) { Add-Failure "Version mismatch: appinstaller='$aiVersion' msix='$msixVersion'" }
            if ($aiArch -ne $msixArch) { Add-Failure "ProcessorArchitecture mismatch: appinstaller='$aiArch' msix='$msixArch'" }
        }
    }
}

if ($failures.Count -gt 0) {
    $failures | ForEach-Object { Write-Host "FAIL: $_" }
    throw "appinstaller contract audit FAILED ($($failures.Count) issue(s))"
}

Write-Host "PASS: musu.appinstaller is well-formed, BOM-free, and its MainPackage"
Write-Host "      Name/Publisher/Version/Arch match the packaged MSIX Identity."
Write-Host "      ($appInstallerPath)"
exit 0
