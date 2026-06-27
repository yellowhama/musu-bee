[CmdletBinding()]
param(
    [string]$OutputDir,
    [string]$ReadinessAuditJsonPath,
    [switch]$IncludePrivateArtifacts
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
$version = (Get-Content -LiteralPath (Join-Path $repoRoot "VERSION") -Raw).Trim()
$numericVersion = if ($version.Contains("-")) { $version.Split("-", 2)[0] } else { $version }
$msixVersion = "$numericVersion.0"

if ([string]::IsNullOrWhiteSpace($OutputDir)) {
    $OutputDir = Join-Path $repoRoot ".local-build\release-candidates\$version"
}
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

function Get-GitValue([string[]]$Arguments) {
    $output = & git @Arguments 2>$null
    if ($LASTEXITCODE -ne 0) {
        return $null
    }
    return ($output | Out-String).Trim()
}

function Get-Sha256FileHash([string]$Path) {
    $cmd = Get-Command Get-FileHash -ErrorAction SilentlyContinue
    if ($cmd) {
        return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
    }

    $stream = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
    try {
        $sha = [System.Security.Cryptography.SHA256]::Create()
        try {
            return (($sha.ComputeHash($stream) | ForEach-Object { $_.ToString("x2") }) -join "")
        }
        finally {
            $sha.Dispose()
        }
    }
    finally {
        $stream.Dispose()
    }
}

function Get-FileArtifact([string]$Role, [string]$Path, [bool]$Required = $true) {
    if ([string]::IsNullOrWhiteSpace($Path)) {
        if ($Required) {
            throw "Required release artifact missing for ${Role}: no candidate path was found."
        }
        return [pscustomobject]@{
            role = $Role
            present = $false
            path = ""
        }
    }

    if (-not (Test-Path -LiteralPath $Path)) {
        if ($Required) {
            throw "Required release artifact missing for ${Role}: $Path"
        }
        return [pscustomobject]@{
            role = $Role
            present = $false
            path = $Path
        }
    }

    $item = Get-Item -LiteralPath $Path
    $hash = Get-Sha256FileHash -Path $Path
    return [pscustomobject]@{
        role = $Role
        present = $true
        path = $item.FullName
        name = $item.Name
        size_bytes = $item.Length
        sha256 = $hash
        last_write_time = $item.LastWriteTime.ToString("o")
    }
}

function Get-DirectoryArtifact([string]$Role, [string]$Path, [bool]$Required = $true) {
    if ([string]::IsNullOrWhiteSpace($Path)) {
        if ($Required) {
            throw "Required release artifact directory missing for ${Role}: no candidate path was found."
        }
        return [pscustomobject]@{
            role = $Role
            present = $false
            path = ""
        }
    }

    if (-not (Test-Path -LiteralPath $Path)) {
        if ($Required) {
            throw "Required release artifact directory missing for ${Role}: $Path"
        }
        return [pscustomobject]@{
            role = $Role
            present = $false
            path = $Path
        }
    }

    $root = (Resolve-Path -LiteralPath $Path).Path
    $files = @(Get-ChildItem -LiteralPath $root -Recurse -File | Sort-Object FullName | ForEach-Object {
        $relative = $_.FullName.Substring($root.Length + 1) -replace "\\", "/"
        $hash = Get-Sha256FileHash -Path $_.FullName
        [pscustomobject]@{
            relative_path = $relative
            size_bytes = $_.Length
            sha256 = $hash
        }
    })

    return [pscustomobject]@{
        role = $Role
        present = $true
        path = $root
        file_count = $files.Count
        total_size_bytes = ($files | Measure-Object -Property size_bytes -Sum).Sum
        files = $files
    }
}

function Find-LatestFile([string]$Directory, [string]$Filter) {
    if (-not (Test-Path -LiteralPath $Directory)) {
        return $null
    }
    Get-ChildItem -LiteralPath $Directory -Filter $Filter -File |
        Sort-Object LastWriteTime -Descending |
        Select-Object -ExpandProperty FullName -First 1
}

function Find-LatestDirectory([string]$Directory, [string]$Filter) {
    if (-not (Test-Path -LiteralPath $Directory)) {
        return $null
    }
    Get-ChildItem -LiteralPath $Directory -Filter $Filter -Directory |
        Sort-Object LastWriteTime -Descending |
        Select-Object -ExpandProperty FullName -First 1
}

function Set-TextFileAtomic {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)]$Content,
        [string]$Encoding = "UTF8",
        [int]$Attempts = 6
    )

    $directory = Split-Path -Parent $Path
    if (-not [string]::IsNullOrWhiteSpace($directory)) {
        New-Item -ItemType Directory -Force -Path $directory | Out-Null
    }

    $lastError = $null
    for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
        $tempPath = "{0}.{1}.{2}.tmp" -f $Path, $PID, ([guid]::NewGuid().ToString("N"))
        try {
            $Content | Set-Content -LiteralPath $tempPath -Encoding $Encoding
            Move-Item -LiteralPath $tempPath -Destination $Path -Force
            return
        }
        catch {
            $lastError = $_
            if (Test-Path -LiteralPath $tempPath) {
                Remove-Item -LiteralPath $tempPath -Force -ErrorAction SilentlyContinue
            }
            Start-Sleep -Milliseconds (150 * $attempt)
        }
    }

    throw "Failed to write $Path after $Attempts attempts: $($lastError.Exception.Message)"
}

function Read-ReadinessAuditJson {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Readiness audit JSON path does not exist: $Path"
    }

    $json = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
    foreach ($property in @(
            "runtime_package_ready",
            "msix_desktop_entrypoint_ready",
            "desktop_shell_ready",
            "single_machine_verified",
            "multi_device_verified",
            "public_desktop_release_ready"
        )) {
        if (-not $json.PSObject.Properties[$property]) {
            throw "Readiness audit JSON is missing required property '${property}': $Path"
        }
    }
    return $json
}

$msixOutput = Join-Path $repoRoot ".local-build\msix\output"
$localMsix = Join-Path $msixOutput ("musu_{0}_x64_local-sideload-manual.msix" -f $msixVersion)
$storeMsix = Join-Path $msixOutput ("musu_{0}_x64_store-reviewed-immediate-registration.msix" -f $msixVersion)
$publicCert = Find-LatestFile -Directory $msixOutput -Filter "*.cer"
$privateCert = Find-LatestFile -Directory $msixOutput -Filter "*.pfx"
$storeBundle = Find-LatestDirectory -Directory (Join-Path $repoRoot ".local-build\msix\submission-bundles") -Filter "store-reviewed-*"
$multiDeviceKit = Find-LatestFile -Directory (Join-Path $repoRoot ".local-build\multi-device-test-kit") -Filter ("musu-multidevice-{0}-*.zip" -f $version)
$tauriMsi = Join-Path $repoRoot "musu-bee\src-tauri\target\release\bundle\msi\MUSU_${numericVersion}_x64_en-US.msi"
$tauriNsis = Join-Path $repoRoot "musu-bee\src-tauri\target\release\bundle\nsis\MUSU_${numericVersion}_x64-setup.exe"
$readinessScript = Join-Path $scriptDir "audit-desktop-release-readiness.ps1"

$artifacts = @(
    (Get-FileArtifact -Role "msix_local_sideload" -Path $localMsix),
    (Get-FileArtifact -Role "msix_store_reviewed" -Path $storeMsix),
    (Get-FileArtifact -Role "signing_public_certificate" -Path $publicCert),
    (Get-DirectoryArtifact -Role "store_submission_bundle" -Path $storeBundle),
    (Get-FileArtifact -Role "tauri_desktop_msi" -Path $tauriMsi),
    (Get-FileArtifact -Role "tauri_desktop_nsis" -Path $tauriNsis),
    (Get-FileArtifact -Role "multi_device_test_kit" -Path $multiDeviceKit)
)

if ($IncludePrivateArtifacts -and $privateCert) {
    $artifacts += Get-FileArtifact -Role "signing_private_certificate_pfx" -Path $privateCert
}

$audit = if (-not [string]::IsNullOrWhiteSpace($ReadinessAuditJsonPath)) {
    Read-ReadinessAuditJson -Path $ReadinessAuditJsonPath
}
else {
    $auditText = (& powershell -NoProfile -ExecutionPolicy Bypass -File $readinessScript -Json 2>&1 | Out-String).Trim()
    $auditText | ConvertFrom-Json
}
$gitStatus = Get-GitValue -Arguments @("status", "--short")

$manifest = [ordered]@{
    schema = "musu.release_candidate_manifest.v1"
    product = "MUSU"
    version = $version
    msix_version = $msixVersion
    generated_at = (Get-Date).ToString("o")
    repo_root = $repoRoot
    git = [ordered]@{
        branch = Get-GitValue -Arguments @("branch", "--show-current")
        commit = Get-GitValue -Arguments @("rev-parse", "HEAD")
        dirty = -not [string]::IsNullOrWhiteSpace($gitStatus)
        status_short = $gitStatus
    }
    private_artifacts_included = [bool]$IncludePrivateArtifacts
    private_artifacts_note = if ($IncludePrivateArtifacts) { "private artifacts explicitly included by operator" } else { "private signing material excluded" }
    release_readiness = $audit
    artifacts = $artifacts
}

$manifestPath = Join-Path $OutputDir "release-candidate-manifest.json"
$manifestJson = $manifest | ConvertTo-Json -Depth 12
Set-TextFileAtomic -Path $manifestPath -Content $manifestJson -Encoding "UTF8"

$sumsPath = Join-Path $OutputDir "SHA256SUMS.txt"
$sumLines = @($artifacts | ForEach-Object {
    if ($_.present -and $_.PSObject.Properties.Name -contains "sha256") {
        "{0}  {1}" -f $_.sha256, $_.path
    }
    elseif ($_.present -and $_.PSObject.Properties.Name -contains "files") {
        foreach ($file in $_.files) {
            "{0}  {1}/{2}" -f $file.sha256, $_.path, $file.relative_path
        }
    }
})
Set-TextFileAtomic -Path $sumsPath -Content $sumLines -Encoding "ASCII"

[pscustomobject]@{
    ok = $true
    manifest_path = $manifestPath
    sha256sums_path = $sumsPath
    version = $version
    artifact_count = $artifacts.Count
    runtime_package_ready = [bool]$audit.runtime_package_ready
    msix_desktop_entrypoint_ready = [bool]$audit.msix_desktop_entrypoint_ready
    desktop_shell_ready = [bool]$audit.desktop_shell_ready
    single_machine_verified = [bool]$audit.single_machine_verified
    multi_device_verified = [bool]$audit.multi_device_verified
    public_desktop_release_ready = [bool]$audit.public_desktop_release_ready
}
