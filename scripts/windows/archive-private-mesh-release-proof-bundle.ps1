[CmdletBinding()]
param(
    [string]$EvidenceRoot,
    [string]$VerificationPath,
    [string]$ExpectedTargetNode,
    [string]$ExpectedTargetIp,
    [string]$ExpectedControlServerUrl,
    [string]$ManifestPath,
    [string]$ArchiveRoot,
    [switch]$NoZip,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step([string]$Message) {
    if (-not $Json) {
        Write-Host "==> $Message"
    }
}

function Resolve-ReleaseVerificationPath {
    if (-not [string]::IsNullOrWhiteSpace($VerificationPath)) {
        return (Resolve-Path -LiteralPath $VerificationPath).Path
    }
    if ([string]::IsNullOrWhiteSpace($EvidenceRoot)) {
        throw "Pass -EvidenceRoot or -VerificationPath."
    }
    $root = (Resolve-Path -LiteralPath $EvidenceRoot).Path
    $path = Join-Path $root "private-mesh-release-proof.verification.json"
    if (-not (Test-Path -LiteralPath $path)) {
        throw "Release proof verification file not found: $path"
    }
    return (Resolve-Path -LiteralPath $path).Path
}

function Read-JsonFile([string]$Path) {
    return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
}

function Get-PropertyValue([object]$Value, [string]$Name) {
    if ($null -eq $Value -or $null -eq $Value.PSObject.Properties[$Name]) {
        return $null
    }
    return $Value.$Name
}

function Get-StringProperty([object]$Value, [string]$Name) {
    $raw = Get-PropertyValue -Value $Value -Name $Name
    if ($null -eq $raw) {
        return ""
    }
    return [string]$raw
}

function Copy-ArtifactPair {
    param(
        [System.Collections.Generic.List[object]]$Copied,
        [string]$Role,
        [string]$EvidencePath,
        [string]$SidecarPath,
        [string]$ArchiveDir
    )
    if ([string]::IsNullOrWhiteSpace($EvidencePath) -or -not (Test-Path -LiteralPath $EvidencePath)) {
        throw "Archive artifact is missing for role ${Role}: $EvidencePath"
    }
    if ([string]::IsNullOrWhiteSpace($SidecarPath) -or -not (Test-Path -LiteralPath $SidecarPath)) {
        throw "Archive sidecar is missing for role ${Role}: $SidecarPath"
    }

    $resolvedEvidence = (Resolve-Path -LiteralPath $EvidencePath).Path
    $resolvedSidecar = (Resolve-Path -LiteralPath $SidecarPath).Path
    $roleDir = Join-Path $ArchiveDir $Role
    New-Item -ItemType Directory -Force -Path $roleDir | Out-Null

    $targetEvidence = Join-Path $roleDir ([System.IO.Path]::GetFileName($resolvedEvidence))
    $targetSidecar = Join-Path $roleDir ([System.IO.Path]::GetFileName($resolvedSidecar))
    Copy-Item -LiteralPath $resolvedEvidence -Destination $targetEvidence -Force
    Copy-Item -LiteralPath $resolvedSidecar -Destination $targetSidecar -Force

    $integrity = Test-EvidenceIntegritySidecar -EvidencePath $targetEvidence
    if (-not [bool]$integrity.ok) {
        throw "Copied archive artifact failed integrity check for role ${Role}: $($integrity.message)"
    }

    $Copied.Add([pscustomobject]@{
        role = $Role
        evidence_path = $targetEvidence
        sha256_path = $targetSidecar
        sha256 = [string]$integrity.actual
    }) | Out-Null
}

function Copy-OptionalArtifactPair {
    param(
        [System.Collections.Generic.List[object]]$Copied,
        [string]$Role,
        [string]$EvidencePath,
        [string]$SidecarPath,
        [string]$ArchiveDir
    )
    if ([string]::IsNullOrWhiteSpace($EvidencePath)) {
        return
    }
    Copy-ArtifactPair -Copied $Copied -Role $Role -EvidencePath $EvidencePath -SidecarPath $SidecarPath -ArchiveDir $ArchiveDir
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $scriptDir "evidence-integrity.ps1")

$resolvedVerificationPath = Resolve-ReleaseVerificationPath
$resolvedRoot = Split-Path -Parent $resolvedVerificationPath
if ([string]::IsNullOrWhiteSpace($ManifestPath)) {
    $ManifestPath = Join-Path $resolvedRoot "private-mesh-release-proof.bundle-manifest.json"
}
if ([string]::IsNullOrWhiteSpace($ArchiveRoot)) {
    $ArchiveRoot = Join-Path $resolvedRoot "archive"
}

Write-Step "Verifying Private Mesh release proof bundle before archiving"
$verifier = Join-Path $scriptDir "verify-private-mesh-release-proof-bundle.ps1"
$verifierArgs = @(
    "-VerificationPath", $resolvedVerificationPath,
    "-ManifestPath", $ManifestPath,
    "-Json"
)
if (-not [string]::IsNullOrWhiteSpace($ExpectedTargetNode)) {
    $verifierArgs += @("-ExpectedTargetNode", $ExpectedTargetNode)
}
if (-not [string]::IsNullOrWhiteSpace($ExpectedTargetIp)) {
    $verifierArgs += @("-ExpectedTargetIp", $ExpectedTargetIp)
}
if (-not [string]::IsNullOrWhiteSpace($ExpectedControlServerUrl)) {
    $verifierArgs += @("-ExpectedControlServerUrl", $ExpectedControlServerUrl)
}
$verifierOutput = & powershell -NoProfile -ExecutionPolicy Bypass -File $verifier @verifierArgs 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "Bundle verifier failed; archive was not created. $verifierOutput"
}

$manifest = Read-JsonFile -Path $ManifestPath
if (-not [bool]$manifest.ok -or [int]$manifest.fail_count -ne 0 -or -not [bool]$manifest.release_evidence_trusted) {
    throw "Bundle manifest is not release-trusted; archive was not created."
}

$targetNode = Get-StringProperty -Value $manifest -Name "target_node"
$targetIp = Get-StringProperty -Value $manifest -Name "target_ip"
$timestamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
$safeTarget = (($targetNode + "-" + $targetIp) -replace "[^A-Za-z0-9_.-]", "_").Trim("_")
if ([string]::IsNullOrWhiteSpace($safeTarget)) {
    $safeTarget = "private-mesh"
}
$archiveDir = Join-Path $ArchiveRoot ("private-mesh-release-proof-" + $safeTarget + "-" + $timestamp)
New-Item -ItemType Directory -Force -Path $archiveDir | Out-Null

$artifacts = Get-PropertyValue -Value $manifest -Name "artifacts"
$copied = [System.Collections.Generic.List[object]]::new()
Copy-ArtifactPair -Copied $copied -Role "verification" -EvidencePath $resolvedVerificationPath -SidecarPath (Get-EvidenceIntegritySidecarPath -EvidencePath $resolvedVerificationPath) -ArchiveDir $archiveDir
Copy-ArtifactPair -Copied $copied -Role "bundle_manifest" -EvidencePath $ManifestPath -SidecarPath (Get-EvidenceIntegritySidecarPath -EvidencePath $ManifestPath) -ArchiveDir $archiveDir
Copy-ArtifactPair -Copied $copied -Role "route_evidence" -EvidencePath (Get-StringProperty -Value $artifacts -Name "route_evidence") -SidecarPath (Get-StringProperty -Value $artifacts -Name "route_evidence_sha256") -ArchiveDir $archiveDir
Copy-ArtifactPair -Copied $copied -Role "physical_peer_evidence" -EvidencePath (Get-StringProperty -Value $artifacts -Name "physical_peer_evidence") -SidecarPath (Get-StringProperty -Value $artifacts -Name "physical_peer_evidence_sha256") -ArchiveDir $archiveDir
Copy-OptionalArtifactPair -Copied $copied -Role "native_release_evidence" -EvidencePath (Get-StringProperty -Value $artifacts -Name "native_release_evidence") -SidecarPath (Get-StringProperty -Value $artifacts -Name "native_release_evidence_sha256") -ArchiveDir $archiveDir
Copy-OptionalArtifactPair -Copied $copied -Role "native_verification" -EvidencePath (Get-StringProperty -Value $artifacts -Name "native_verification") -SidecarPath (Get-StringProperty -Value $artifacts -Name "native_verification_sha256") -ArchiveDir $archiveDir

$archiveManifestPath = Join-Path $archiveDir "private-mesh-release-proof.archive.json"
$archiveNow = [DateTimeOffset]::UtcNow
$archiveManifest = [ordered]@{
    schema = "musu.private_mesh_release_proof_archive.v1"
    ok = $true
    archived_at = $archiveNow.ToString("o")
    archived_at_unix_ms = $archiveNow.ToUnixTimeMilliseconds()
    source_verification_path = $resolvedVerificationPath
    source_bundle_manifest_path = (Resolve-Path -LiteralPath $ManifestPath).Path
    target_node = $targetNode
    target_ip = $targetIp
    expected_control_server_url = Get-StringProperty -Value $manifest -Name "expected_control_server_url"
    release_bundle_contract = Get-StringProperty -Value $manifest -Name "release_bundle_contract"
    desktop_runtime_kind = Get-StringProperty -Value $manifest -Name "desktop_runtime_kind"
    desktop_runtime_packaged = [bool](Get-PropertyValue -Value $manifest -Name "desktop_runtime_packaged")
    desktop_runtime_exe_path = Get-StringProperty -Value $manifest -Name "desktop_runtime_exe_path"
    desktop_runtime_exe_sha256 = Get-StringProperty -Value $manifest -Name "desktop_runtime_exe_sha256"
    release_evidence_trusted = $true
    bundle_manifest_ok = $true
    bundle_manifest_fail_count = 0
    release_tool_hashes = Get-PropertyValue -Value $manifest -Name "release_tool_hashes"
    artifact_count = $copied.Count
    artifacts = @($copied)
}
$archiveManifest | ConvertTo-Json -Depth 60 | Set-Content -LiteralPath $archiveManifestPath -Encoding utf8
$archiveManifestSidecar = Write-EvidenceIntegritySidecar -EvidencePath $archiveManifestPath

Write-Step "Verifying Private Mesh release proof archive"
$archiveVerifier = Join-Path $scriptDir "verify-private-mesh-release-proof-archive.ps1"
$archiveVerifierArgs = @(
    "-ArchiveManifestPath", $archiveManifestPath,
    "-Json"
)
if (-not [string]::IsNullOrWhiteSpace($ExpectedTargetNode)) {
    $archiveVerifierArgs += @("-ExpectedTargetNode", $ExpectedTargetNode)
}
if (-not [string]::IsNullOrWhiteSpace($ExpectedTargetIp)) {
    $archiveVerifierArgs += @("-ExpectedTargetIp", $ExpectedTargetIp)
}
if (-not [string]::IsNullOrWhiteSpace($ExpectedControlServerUrl)) {
    $archiveVerifierArgs += @("-ExpectedControlServerUrl", $ExpectedControlServerUrl)
}
$archiveVerifierOutput = & powershell -NoProfile -ExecutionPolicy Bypass -File $archiveVerifier @archiveVerifierArgs 2>&1
$archiveVerifierExitCode = $LASTEXITCODE
$archiveVerifierParsed = $null
$archiveVerifierText = ($archiveVerifierOutput | Out-String).Trim()
if (-not [string]::IsNullOrWhiteSpace($archiveVerifierText)) {
    try {
        $archiveVerifierParsed = $archiveVerifierText | ConvertFrom-Json
    }
    catch {
        $archiveVerifierParsed = $null
    }
}
if ($archiveVerifierExitCode -ne 0 -or -not $archiveVerifierParsed -or -not [bool]$archiveVerifierParsed.ok) {
    throw "Archive verifier failed; zip was not created. $archiveVerifierText"
}

$zipPath = ""
if (-not $NoZip) {
    $zipPath = $archiveDir + ".zip"
    if (Test-Path -LiteralPath $zipPath) {
        Remove-Item -LiteralPath $zipPath -Force
    }
    Compress-Archive -Path (Join-Path $archiveDir "*") -DestinationPath $zipPath -Force
}

$result = [ordered]@{
    schema = "musu.private_mesh_release_proof_archive_result.v1"
    ok = $true
    archive_dir = $archiveDir
    archive_manifest_path = $archiveManifestPath
    archive_manifest_sha256_path = $archiveManifestSidecar
    archive_zip_path = $zipPath
    archive_verifier_exit_code = $archiveVerifierExitCode
    archive_verifier_ok = [bool]$archiveVerifierParsed.ok
    archive_verifier_schema = [string]$archiveVerifierParsed.schema
    archive_verifier_fail_count = [int]$archiveVerifierParsed.fail_count
    archive_verifier_kind = "powershell_current_toolchain"
    desktop_runtime_kind = Get-StringProperty -Value $manifest -Name "desktop_runtime_kind"
    desktop_runtime_packaged = [bool](Get-PropertyValue -Value $manifest -Name "desktop_runtime_packaged")
    desktop_runtime_exe_path = Get-StringProperty -Value $manifest -Name "desktop_runtime_exe_path"
    desktop_runtime_exe_sha256 = Get-StringProperty -Value $manifest -Name "desktop_runtime_exe_sha256"
    artifact_count = $copied.Count
    target_node = $targetNode
    target_ip = $targetIp
}

if ($Json) {
    $result | ConvertTo-Json -Depth 20
} else {
    Write-Step "Private Mesh release proof archived: $archiveDir"
    if (-not [string]::IsNullOrWhiteSpace($zipPath)) {
        Write-Step "Archive zip written: $zipPath"
    }
}
