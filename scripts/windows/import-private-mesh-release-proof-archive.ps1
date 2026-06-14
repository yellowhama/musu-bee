[CmdletBinding()]
param(
    [string]$ArchiveDir,
    [string]$ArchiveManifestPath,
    [switch]$LatestFromMusuHome,
    [string]$MusuHome,
    [string]$Version,
    [string]$OutputRoot,
    [string]$ExpectedTargetNode,
    [string]$ExpectedTargetIp,
    [string]$ExpectedControlServerUrl,
    [switch]$Force,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
if ([string]::IsNullOrWhiteSpace($Version)) {
    $Version = (Get-Content -LiteralPath (Join-Path $repoRoot "VERSION") -Raw).Trim()
}
if ([string]::IsNullOrWhiteSpace($OutputRoot)) {
    $OutputRoot = Join-Path $repoRoot ("docs\evidence\private-mesh-release-proof\{0}" -f $Version)
}

function Write-Step([string]$Message) {
    if (-not $Json) {
        Write-Host "==> $Message"
    }
}

function Write-ImporterFailureAndExit {
    param(
        [Parameter(Mandatory = $true)][string]$ErrorMessage,
        [string]$FailureKind = "archive_import_failed",
        [object[]]$RejectedCandidates = @()
    )

    if ($Json) {
        $homePath = ""
        try {
            $homePath = Resolve-MusuHomePath
        }
        catch {
            $homePath = ""
        }
        $autoDiscovered = $false
        $autoDiscoveryVariable = Get-Variable -Name "autoDiscoverFromMusuHome" -ErrorAction SilentlyContinue
        if ($autoDiscoveryVariable) {
            $autoDiscovered = [bool]$autoDiscoveryVariable.Value
        }

        $failure = [pscustomobject]@{
            schema = "musu.private_mesh_release_proof_archive_import.v1"
            ok = $false
            failed_at = (Get-Date).ToString("o")
            version = $Version
            latest_from_musu_home = [bool]$LatestFromMusuHome -or $autoDiscovered
            auto_discovered_from_musu_home = $autoDiscovered
            musu_home = if ([bool]$LatestFromMusuHome -or $autoDiscovered) { $homePath } else { "" }
            failure_kind = $FailureKind
            error = $ErrorMessage
            auto_rejected_archive_candidates = @($RejectedCandidates)
            next_action = "Open the installed MUSU desktop app, run Release proof on real hardware, then rerun this importer. If a packaged archive exists outside MUSU_HOME, pass -ArchiveManifestPath."
        }
        [Console]::Out.WriteLine(($failure | ConvertTo-Json -Depth 10))
        exit 1
    }

    throw $ErrorMessage
}

function Resolve-MusuHomePath {
    if (-not [string]::IsNullOrWhiteSpace($MusuHome)) {
        return [System.IO.Path]::GetFullPath($MusuHome)
    }
    if (-not [string]::IsNullOrWhiteSpace($env:MUSU_HOME)) {
        return [System.IO.Path]::GetFullPath($env:MUSU_HOME)
    }

    $profile = $env:USERPROFILE
    if ([string]::IsNullOrWhiteSpace($profile)) {
        $profile = $HOME
    }
    if ([string]::IsNullOrWhiteSpace($profile)) {
        throw "Cannot resolve MUSU_HOME. Pass -MusuHome, set MUSU_HOME, or pass -ArchiveManifestPath."
    }
    return [System.IO.Path]::GetFullPath((Join-Path $profile ".musu"))
}

function Get-ArchiveManifestCandidatesFromMusuHome {
    $homePath = Resolve-MusuHomePath
    $root = Join-Path $homePath "private-mesh-release-proof"
    if (-not (Test-Path -LiteralPath $root)) {
        Write-ImporterFailureAndExit `
            -FailureKind "private_mesh_release_proof_root_missing" `
            -ErrorMessage "No Private Mesh release proof root found at $root. Pass -ArchiveManifestPath or run Release proof in the installed MUSU desktop app first."
    }

    $candidates = Get-ChildItem -LiteralPath $root -Filter "private-mesh-release-proof.archive.json" -File -Recurse -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTimeUtc -Descending |
        Select-Object -First 25
    if (-not $candidates) {
        Write-ImporterFailureAndExit `
            -FailureKind "private_mesh_release_proof_archive_manifest_missing" `
            -ErrorMessage "No private-mesh-release-proof.archive.json found under $root. Pass -ArchiveManifestPath or run Release proof in the installed MUSU desktop app first."
    }
    return @($candidates)
}

function Resolve-LatestArchiveManifestFromMusuHome {
    $candidate = Get-ArchiveManifestCandidatesFromMusuHome | Select-Object -First 1
    return $candidate.FullName
}

function Resolve-ArchiveManifestPath {
    if (-not [string]::IsNullOrWhiteSpace($ArchiveManifestPath)) {
        $manifestPath = [System.IO.Path]::GetFullPath($ArchiveManifestPath)
        if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
            Write-ImporterFailureAndExit `
                -FailureKind "archive_manifest_path_missing" `
                -ErrorMessage "Archive manifest path does not exist: $manifestPath"
        }
        return (Resolve-Path -LiteralPath $manifestPath).Path
    }
    if ([string]::IsNullOrWhiteSpace($ArchiveDir)) {
        return (Resolve-Path -LiteralPath (Resolve-LatestArchiveManifestFromMusuHome)).Path
    }
    if (-not (Test-Path -LiteralPath $ArchiveDir -PathType Container)) {
        $missingArchiveDir = [System.IO.Path]::GetFullPath($ArchiveDir)
        Write-ImporterFailureAndExit `
            -FailureKind "archive_dir_missing" `
            -ErrorMessage "Archive directory does not exist: $missingArchiveDir"
    }
    $dir = (Resolve-Path -LiteralPath $ArchiveDir).Path
    $path = Join-Path $dir "private-mesh-release-proof.archive.json"
    if (-not (Test-Path -LiteralPath $path)) {
        Write-ImporterFailureAndExit `
            -FailureKind "archive_manifest_missing_in_archive_dir" `
            -ErrorMessage "Archive manifest not found: $path"
    }
    return (Resolve-Path -LiteralPath $path).Path
}

function ConvertTo-SafePathSegment {
    param([Parameter(Mandatory = $true)][AllowEmptyString()][string]$Value)

    $safe = ($Value -replace "[^A-Za-z0-9_.-]", "_").Trim("_")
    if ([string]::IsNullOrWhiteSpace($safe)) {
        return "private-mesh-release-proof"
    }
    return $safe
}

function Test-PathInsideDirectory {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Directory
    )

    $resolvedPath = [System.IO.Path]::GetFullPath($Path).TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)
    $resolvedDirectory = [System.IO.Path]::GetFullPath($Directory).TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)
    return $resolvedPath.Equals($resolvedDirectory, [System.StringComparison]::OrdinalIgnoreCase) -or
        $resolvedPath.StartsWith($resolvedDirectory + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase) -or
        $resolvedPath.StartsWith($resolvedDirectory + [System.IO.Path]::AltDirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)
}

function Invoke-ArchiveVerifier {
    param([Parameter(Mandatory = $true)][string]$ManifestPath)

    $verifier = Join-Path $scriptDir "verify-private-mesh-release-proof-archive.ps1"
    $args = @("-ArchiveManifestPath", $ManifestPath, "-Json")
    if (-not [string]::IsNullOrWhiteSpace($ExpectedTargetNode)) {
        $args += @("-ExpectedTargetNode", $ExpectedTargetNode)
    }
    if (-not [string]::IsNullOrWhiteSpace($ExpectedTargetIp)) {
        $args += @("-ExpectedTargetIp", $ExpectedTargetIp)
    }
    if (-not [string]::IsNullOrWhiteSpace($ExpectedControlServerUrl)) {
        $args += @("-ExpectedControlServerUrl", $ExpectedControlServerUrl)
    }

    $output = & powershell -NoProfile -ExecutionPolicy Bypass -File $verifier @args 2>&1
    $exitCode = $LASTEXITCODE
    $text = ($output | Out-String).Trim()
    $parsed = $null
    if (-not [string]::IsNullOrWhiteSpace($text)) {
        try {
            $parsed = $text | ConvertFrom-Json
        }
        catch {
            $parsed = $null
        }
    }
    [pscustomobject]@{
        exit_code = $exitCode
        parsed = $parsed
        raw = $text
    }
}

function Test-PackagedArchiveVerificationResult {
    param([Parameter(Mandatory = $true)]$Verification)

    return $Verification.exit_code -eq 0 -and
        $Verification.parsed -and
        [bool]$Verification.parsed.ok -and
        [string]$Verification.parsed.desktop_runtime_kind -eq "packaged_desktop" -and
        [bool]$Verification.parsed.desktop_runtime_packaged
}

function Select-VerifiedPackagedArchiveManifestFromMusuHome {
    $rejected = New-Object System.Collections.Generic.List[object]
    foreach ($candidate in Get-ArchiveManifestCandidatesFromMusuHome) {
        Write-Step "Checking packaged Private Mesh archive candidate: $($candidate.FullName)"
        $candidateVerification = Invoke-ArchiveVerifier -ManifestPath $candidate.FullName
        if (Test-PackagedArchiveVerificationResult -Verification $candidateVerification) {
            return [pscustomobject]@{
                manifest_path = $candidate.FullName
                verification = $candidateVerification
                rejected_candidates = $rejected.ToArray()
            }
        }

        $reason = "archive verifier failed"
        if ($candidateVerification.parsed) {
            if ([bool]$candidateVerification.parsed.ok -and ([string]$candidateVerification.parsed.desktop_runtime_kind -ne "packaged_desktop" -or -not [bool]$candidateVerification.parsed.desktop_runtime_packaged)) {
                $reason = "archive verifier passed but runtime was not packaged_desktop"
            }
            elseif (-not [bool]$candidateVerification.parsed.ok) {
                $reason = "archive verifier returned ok=false"
            }
        }

        $rejected.Add([pscustomobject]@{
            manifest_path = $candidate.FullName
            reason = $reason
            exit_code = [int]$candidateVerification.exit_code
            verifier_ok = if ($candidateVerification.parsed) { [bool]$candidateVerification.parsed.ok } else { $false }
            verifier_fail_count = if ($candidateVerification.parsed -and $candidateVerification.parsed.PSObject.Properties["fail_count"]) { [int]$candidateVerification.parsed.fail_count } else { $null }
            desktop_runtime_kind = if ($candidateVerification.parsed -and $candidateVerification.parsed.PSObject.Properties["desktop_runtime_kind"]) { [string]$candidateVerification.parsed.desktop_runtime_kind } else { "" }
            desktop_runtime_packaged = if ($candidateVerification.parsed -and $candidateVerification.parsed.PSObject.Properties["desktop_runtime_packaged"]) { [bool]$candidateVerification.parsed.desktop_runtime_packaged } else { $false }
        })
    }

    Write-ImporterFailureAndExit `
        -FailureKind "no_packaged_desktop_archive_candidate" `
        -ErrorMessage ("No verifier-passing packaged desktop Private Mesh release proof archive found under MUSU_HOME. Rejected candidate count: {0}." -f $rejected.Count) `
        -RejectedCandidates $rejected.ToArray()
}

$autoDiscoverFromMusuHome = [string]::IsNullOrWhiteSpace($ArchiveManifestPath) -and [string]::IsNullOrWhiteSpace($ArchiveDir)
$autoRejectedArchiveCandidates = @()
$preverifiedSelection = $null
if ($autoDiscoverFromMusuHome) {
    $preverifiedSelection = Select-VerifiedPackagedArchiveManifestFromMusuHome
    $resolvedManifestPath = (Resolve-Path -LiteralPath $preverifiedSelection.manifest_path).Path
    $autoRejectedArchiveCandidates = @($preverifiedSelection.rejected_candidates)
}
else {
    $resolvedManifestPath = Resolve-ArchiveManifestPath
}
$sourceArchiveDir = Split-Path -Parent $resolvedManifestPath
$sourceArchiveDir = (Resolve-Path -LiteralPath $sourceArchiveDir).Path
$resolvedOutputRoot = [System.IO.Path]::GetFullPath($OutputRoot)

Write-Step "Verifying Private Mesh release proof archive before import"
$verification = if ($preverifiedSelection) { $preverifiedSelection.verification } else { Invoke-ArchiveVerifier -ManifestPath $resolvedManifestPath }
if ($verification.exit_code -ne 0 -or -not $verification.parsed -or -not [bool]$verification.parsed.ok) {
    Write-ImporterFailureAndExit `
        -FailureKind "archive_verifier_failed" `
        -ErrorMessage "Archive verifier failed; archive was not imported." `
        -RejectedCandidates @([pscustomobject]@{
            manifest_path = $resolvedManifestPath
            reason = "archive verifier failed"
            exit_code = [int]$verification.exit_code
            verifier_ok = if ($verification.parsed -and $verification.parsed.PSObject.Properties["ok"]) { [bool]$verification.parsed.ok } else { $false }
            verifier_fail_count = if ($verification.parsed -and $verification.parsed.PSObject.Properties["fail_count"]) { [int]$verification.parsed.fail_count } else { $null }
            raw = $verification.raw
        })
}
if ([string]$verification.parsed.desktop_runtime_kind -ne "packaged_desktop" -or -not [bool]$verification.parsed.desktop_runtime_packaged) {
    Write-ImporterFailureAndExit `
        -FailureKind "archive_not_packaged_desktop" `
        -ErrorMessage "Archive was not produced by the packaged desktop runtime; archive was not imported." `
        -RejectedCandidates @([pscustomobject]@{
            manifest_path = $resolvedManifestPath
            reason = "archive verifier passed but runtime was not packaged_desktop"
            exit_code = [int]$verification.exit_code
            verifier_ok = [bool]$verification.parsed.ok
            verifier_fail_count = if ($verification.parsed.PSObject.Properties["fail_count"]) { [int]$verification.parsed.fail_count } else { $null }
            desktop_runtime_kind = if ($verification.parsed.PSObject.Properties["desktop_runtime_kind"]) { [string]$verification.parsed.desktop_runtime_kind } else { "" }
            desktop_runtime_packaged = if ($verification.parsed.PSObject.Properties["desktop_runtime_packaged"]) { [bool]$verification.parsed.desktop_runtime_packaged } else { $false }
        })
}

$targetNode = ConvertTo-SafePathSegment -Value ([string]$verification.parsed.target_node)
$targetIp = ConvertTo-SafePathSegment -Value ([string]$verification.parsed.target_ip)
$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
$destArchiveDir = Join-Path $resolvedOutputRoot ("private-mesh-release-proof-$targetNode-$targetIp-$stamp")
$destArchiveDir = [System.IO.Path]::GetFullPath($destArchiveDir)
if (-not (Test-PathInsideDirectory -Path $destArchiveDir -Directory $resolvedOutputRoot)) {
    Write-ImporterFailureAndExit `
        -FailureKind "destination_outside_output_root" `
        -ErrorMessage "Resolved destination escapes OutputRoot: $destArchiveDir"
}
if ((Test-Path -LiteralPath $destArchiveDir) -and -not $Force) {
    Write-ImporterFailureAndExit `
        -FailureKind "destination_already_exists" `
        -ErrorMessage "Destination already exists: $destArchiveDir. Pass -Force to replace it."
}
if (Test-Path -LiteralPath $destArchiveDir) {
    Remove-Item -LiteralPath $destArchiveDir -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $destArchiveDir | Out-Null
foreach ($item in Get-ChildItem -LiteralPath $sourceArchiveDir -Force) {
    Copy-Item -LiteralPath $item.FullName -Destination $destArchiveDir -Recurse -Force
}

$destManifestPath = Join-Path $destArchiveDir "private-mesh-release-proof.archive.json"
if (-not (Test-Path -LiteralPath $destManifestPath)) {
    Write-ImporterFailureAndExit `
        -FailureKind "imported_archive_manifest_missing" `
        -ErrorMessage "Imported archive manifest missing after copy: $destManifestPath"
}

Write-Step "Verifying imported archive copy"
$importedVerification = Invoke-ArchiveVerifier -ManifestPath $destManifestPath
if ($importedVerification.exit_code -ne 0 -or -not $importedVerification.parsed -or -not [bool]$importedVerification.parsed.ok) {
    Write-ImporterFailureAndExit `
        -FailureKind "imported_archive_copy_verifier_failed" `
        -ErrorMessage "Imported archive copy failed verifier replay." `
        -RejectedCandidates @([pscustomobject]@{
            manifest_path = $destManifestPath
            reason = "imported archive verifier failed"
            exit_code = [int]$importedVerification.exit_code
            verifier_ok = if ($importedVerification.parsed -and $importedVerification.parsed.PSObject.Properties["ok"]) { [bool]$importedVerification.parsed.ok } else { $false }
            verifier_fail_count = if ($importedVerification.parsed -and $importedVerification.parsed.PSObject.Properties["fail_count"]) { [int]$importedVerification.parsed.fail_count } else { $null }
            raw = $importedVerification.raw
        })
}

$sourceZip = "$sourceArchiveDir.zip"
$destZip = ""
if (Test-Path -LiteralPath $sourceZip) {
    $destZip = "$destArchiveDir.zip"
    Copy-Item -LiteralPath $sourceZip -Destination $destZip -Force
}

$result = [pscustomobject]@{
    schema = "musu.private_mesh_release_proof_archive_import.v1"
    ok = $true
    imported_at = (Get-Date).ToString("o")
    version = $Version
    latest_from_musu_home = [bool]$LatestFromMusuHome -or $autoDiscoverFromMusuHome
    auto_discovered_from_musu_home = [bool]$autoDiscoverFromMusuHome
    auto_rejected_archive_candidates = $autoRejectedArchiveCandidates
    musu_home = if ($autoDiscoverFromMusuHome) { Resolve-MusuHomePath } else { "" }
    source_archive_dir = $sourceArchiveDir
    source_archive_manifest_path = $resolvedManifestPath
    imported_archive_dir = $destArchiveDir
    imported_archive_manifest_path = $destManifestPath
    imported_archive_zip_path = $destZip
    archive_verifier_ok = [bool]$importedVerification.parsed.ok
    archive_verifier_schema = [string]$importedVerification.parsed.schema
    archive_verifier_fail_count = [int]$importedVerification.parsed.fail_count
    desktop_runtime_kind = [string]$importedVerification.parsed.desktop_runtime_kind
    desktop_runtime_packaged = [bool]$importedVerification.parsed.desktop_runtime_packaged
    target_node = [string]$importedVerification.parsed.target_node
    target_ip = [string]$importedVerification.parsed.target_ip
    next_action = "Run scripts/windows/write-release-go-no-go.ps1 -Json; it will scan the imported archive under docs/evidence/private-mesh-release-proof/$Version."
}

if ($Json) {
    $result | ConvertTo-Json -Depth 10
}
else {
    Write-Step "Imported packaged Private Mesh release proof archive: $destArchiveDir"
    if (-not [string]::IsNullOrWhiteSpace($destZip)) {
        Write-Step "Copied archive zip: $destZip"
    }
    Write-Step $result.next_action
}
