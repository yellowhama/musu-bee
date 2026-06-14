[CmdletBinding()]
param(
    [string]$MusuExe,
    [string]$SourceBridgeUrl,
    [string]$MusuHome,
    [string]$Token,
    [string]$TargetNode,
    [Alias("ExpectedTargetIp")]
    [string]$TargetIp,
    [int]$BridgePort = 8070,
    [string]$TargetUrl,
    [string]$ExpectedControlServerUrl,
    [int]$TimeoutSec = 120,
    [string]$EvidenceRoot,
    [string]$ExistingEvidencePath,
    [string]$PhysicalPeerEvidencePath,
    [string]$ArchiveRoot,
    [switch]$SkipArchive,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ReleaseBundleContract = "musu.private_mesh_release_bundle_contract.v20260614_toolchain_bound"

function Write-Step([string]$Message) {
    if (-not $Json) {
        Write-Host "==> $Message"
    }
}

function Get-CurrentPowerShellExecutable {
    $currentProcessPath = $null
    try {
        $currentProcessPath = [System.Diagnostics.Process]::GetCurrentProcess().MainModule.FileName
    }
    catch {
        $currentProcessPath = $null
    }
    if (-not [string]::IsNullOrWhiteSpace($currentProcessPath) -and (Test-Path -LiteralPath $currentProcessPath)) {
        return $currentProcessPath
    }
    if ($PSVersionTable.ContainsKey("PSEdition") -and [string]$PSVersionTable.PSEdition -eq "Core") {
        return "pwsh"
    }
    return "powershell.exe"
}

function Invoke-JsonScript {
    param(
        [Parameter(Mandatory = $true)][string]$ScriptPath,
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )

    $output = & $powerShellExecutable -NoProfile -ExecutionPolicy Bypass -File $ScriptPath @Arguments 2>&1
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
        exit_code = [int]$exitCode
        parsed = $parsed
        raw = $text
    }
}

function Resolve-MusuExe([string]$ExplicitExe, [string]$RepoRoot) {
    if (-not [string]::IsNullOrWhiteSpace($ExplicitExe)) {
        return (Resolve-Path -LiteralPath $ExplicitExe).Path
    }
    $cmd = Get-Command musu -ErrorAction SilentlyContinue
    if ($cmd) {
        return $cmd.Source
    }
    $debugExe = Join-Path $RepoRoot "musu-rs\target\debug\musu.exe"
    if (Test-Path -LiteralPath $debugExe) {
        return (Resolve-Path -LiteralPath $debugExe).Path
    }
    throw "musu executable not found. Pass -MusuExe or put musu on PATH."
}

function Invoke-MusuJson {
    param(
        [Parameter(Mandatory = $true)][string]$Exe,
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )

    $output = & $Exe @Arguments 2>&1
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
        exit_code = [int]$exitCode
        parsed = $parsed
        raw = $text
    }
}

function Get-ReleaseProofToolHashes {
    $toolPaths = [ordered]@{
        runner = $PSCommandPath
        smoke = Join-Path $scriptDir "smoke-private-mesh-route-proof.ps1"
        route_verifier = Join-Path $scriptDir "verify-private-mesh-route-proof-evidence.ps1"
        bundle_verifier = Join-Path $scriptDir "verify-private-mesh-release-proof-bundle.ps1"
        archive = Join-Path $scriptDir "archive-private-mesh-release-proof-bundle.ps1"
        archive_verifier = Join-Path $scriptDir "verify-private-mesh-release-proof-archive.ps1"
        evidence_integrity = Join-Path $scriptDir "evidence-integrity.ps1"
    }
    $hashes = [ordered]@{
        schema = "musu.private_mesh_release_proof_tool_hashes.v1"
    }
    foreach ($entry in $toolPaths.GetEnumerator()) {
        $path = (Resolve-Path -LiteralPath $entry.Value).Path
        $hashes[$entry.Key] = [ordered]@{
            path = $path
            sha256 = Get-EvidenceFileSha256 -Path $path
        }
    }
    return $hashes
}

function Get-JsonBool([object]$Value, [string]$Name) {
    if ($null -eq $Value -or $null -eq $Value.PSObject.Properties[$Name]) {
        return $false
    }
    return [bool]$Value.$Name
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
. (Join-Path $scriptDir "evidence-integrity.ps1")
$powerShellExecutable = Get-CurrentPowerShellExecutable

if (-not $EvidenceRoot) {
    if (-not [string]::IsNullOrWhiteSpace($ExistingEvidencePath)) {
        $EvidenceRoot = Split-Path -Parent (Resolve-Path -LiteralPath $ExistingEvidencePath).Path
    }
    else {
        $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
        $EvidenceRoot = Join-Path $repoRoot ".local-build\private-mesh-release-proof\$stamp"
    }
}
New-Item -ItemType Directory -Force -Path $EvidenceRoot | Out-Null
$EvidenceRoot = (Resolve-Path -LiteralPath $EvidenceRoot).Path

$result = [ordered]@{
    schema = "musu.private_mesh_release_proof_runner.v1"
    started_at = (Get-Date).ToString("o")
    repo_root = $repoRoot
    evidence_root = $EvidenceRoot
    target_node = $TargetNode
    target_ip = $TargetIp
    expected_control_server_url = $ExpectedControlServerUrl
    release_bundle_contract = $ReleaseBundleContract
    used_existing_evidence = -not [string]::IsNullOrWhiteSpace($ExistingEvidencePath)
    physical_peer_evidence_path = $PhysicalPeerEvidencePath
    software_route_trusted = $false
    physical_peer_verified = $false
    release_identity_bound = $false
    release_evidence_trusted = $false
    desktop_runtime_kind = "external_cli_release_runner"
    desktop_runtime_packaged = $false
    desktop_runtime_exe_path = $null
    desktop_runtime_exe_sha256 = $null
    release_tool_hashes = Get-ReleaseProofToolHashes
    ok = $false
}

try {
    if ([string]::IsNullOrWhiteSpace($PhysicalPeerEvidencePath)) {
        throw "-PhysicalPeerEvidencePath is required for final release proof. Generate it on the target physical PC with `musu mesh physical-peer-evidence --json`, copy both the JSON and its .sha256 sidecar to the same folder on this source PC, then rerun this script."
    }
    if (-not (Test-Path -LiteralPath $PhysicalPeerEvidencePath)) {
        throw "Physical peer evidence file not found: $PhysicalPeerEvidencePath"
    }
    $PhysicalPeerEvidencePath = (Resolve-Path -LiteralPath $PhysicalPeerEvidencePath).Path
    $physicalPeerIntegrity = Test-EvidenceIntegritySidecar -EvidencePath $PhysicalPeerEvidencePath
    $result.physical_peer_evidence_path = $PhysicalPeerEvidencePath
    $result.physical_peer_evidence_sha256_path = [string]$physicalPeerIntegrity.sidecar_path
    $result.physical_peer_evidence_integrity_status = [string]$physicalPeerIntegrity.status
    if ([bool]$physicalPeerIntegrity.ok) {
        $result.physical_peer_evidence_sha256 = [string]$physicalPeerIntegrity.actual
    }
    if (-not [bool]$physicalPeerIntegrity.ok) {
        throw "Physical peer evidence SHA256 sidecar check failed: $($physicalPeerIntegrity.message). Copy both the target-generated JSON and its .sha256 sidecar to the same folder before running release proof."
    }

    $evidencePath = $ExistingEvidencePath
    if ([string]::IsNullOrWhiteSpace($evidencePath)) {
        if ([string]::IsNullOrWhiteSpace($TargetNode)) {
            throw "-TargetNode is required unless -ExistingEvidencePath is supplied."
        }
        if ([string]::IsNullOrWhiteSpace($TargetIp)) {
            throw "-TargetIp is required unless -ExistingEvidencePath is supplied."
        }

        Write-Step "Running Private Mesh route/callback smoke"
        $smokeScript = Join-Path $scriptDir "smoke-private-mesh-route-proof.ps1"
        $smokeArgs = @(
            "-TargetNode", $TargetNode,
            "-TargetIp", $TargetIp,
            "-BridgePort", [string]$BridgePort,
            "-TimeoutSec", [string]$TimeoutSec,
            "-EvidenceRoot", $EvidenceRoot,
            "-Json"
        )
        if (-not [string]::IsNullOrWhiteSpace($MusuExe)) {
            $smokeArgs += @("-MusuExe", $MusuExe)
        }
        if (-not [string]::IsNullOrWhiteSpace($SourceBridgeUrl)) {
            $smokeArgs += @("-SourceBridgeUrl", $SourceBridgeUrl)
        }
        if (-not [string]::IsNullOrWhiteSpace($MusuHome)) {
            $smokeArgs += @("-MusuHome", $MusuHome)
        }
        if (-not [string]::IsNullOrWhiteSpace($Token)) {
            $smokeArgs += @("-Token", $Token)
        }
        if (-not [string]::IsNullOrWhiteSpace($TargetUrl)) {
            $smokeArgs += @("-TargetUrl", $TargetUrl)
        }
        if (-not [string]::IsNullOrWhiteSpace($ExpectedControlServerUrl)) {
            $smokeArgs += @("-ExpectedControlServerUrl", $ExpectedControlServerUrl)
        }

        $smoke = Invoke-JsonScript -ScriptPath $smokeScript -Arguments $smokeArgs
        $result.smoke_exit_code = $smoke.exit_code
        if ($smoke.parsed) {
            $result.smoke_ok = [bool]$smoke.parsed.ok
        }
        if ($smoke.exit_code -ne 0) {
            $result.smoke_raw = $smoke.raw
            throw "Private Mesh smoke failed with exit $($smoke.exit_code)."
        }
        $evidencePath = Join-Path $EvidenceRoot "private-mesh-route-proof.evidence.json"
    }

    if (-not (Test-Path -LiteralPath $evidencePath)) {
        throw "Private Mesh evidence file not found: $evidencePath"
    }
    $evidencePath = (Resolve-Path -LiteralPath $evidencePath).Path
    $result.evidence_path = $evidencePath

    $needsEvidenceMetadata = [string]::IsNullOrWhiteSpace($TargetNode) -or
        [string]::IsNullOrWhiteSpace($TargetIp) -or
        [string]::IsNullOrWhiteSpace($ExpectedControlServerUrl)
    if ($needsEvidenceMetadata) {
        $evidenceJson = Get-Content -LiteralPath $evidencePath -Raw | ConvertFrom-Json
        if ([string]::IsNullOrWhiteSpace($TargetNode) -and $evidenceJson.PSObject.Properties["target_node"]) {
            $TargetNode = [string]$evidenceJson.target_node
            $result.target_node = $TargetNode
        }
        if ([string]::IsNullOrWhiteSpace($TargetIp) -and $evidenceJson.PSObject.Properties["target_ip"]) {
            $TargetIp = [string]$evidenceJson.target_ip
            $result.target_ip = $TargetIp
        }
        if ([string]::IsNullOrWhiteSpace($ExpectedControlServerUrl) -and $evidenceJson.PSObject.Properties["expected_control_server_url"]) {
            $ExpectedControlServerUrl = [string]$evidenceJson.expected_control_server_url
            $result.expected_control_server_url = $ExpectedControlServerUrl
        }
    }

    Write-Step "Verifying saved Private Mesh release evidence"
    $verifierScript = Join-Path $scriptDir "verify-private-mesh-route-proof-evidence.ps1"
    $verifyArgs = @(
        "-EvidencePath", $evidencePath,
        "-Json"
    )
    if (-not [string]::IsNullOrWhiteSpace($TargetIp)) {
        $verifyArgs += @("-ExpectedTargetIp", $TargetIp)
    }
    if (-not [string]::IsNullOrWhiteSpace($ExpectedControlServerUrl)) {
        $verifyArgs += @("-ExpectedControlServerUrl", $ExpectedControlServerUrl)
    }
    $verification = Invoke-JsonScript -ScriptPath $verifierScript -Arguments $verifyArgs
    $result.verifier_exit_code = $verification.exit_code
    $result.verification = $verification.parsed
    if ($verification.exit_code -ne 0 -or -not $verification.parsed -or -not [bool]$verification.parsed.ok) {
        $result.verifier_raw = $verification.raw
        throw "Private Mesh release evidence verifier failed."
    }
    $result.software_route_verifier_ok = $true

    if ([string]::IsNullOrWhiteSpace($TargetNode)) {
        throw "-TargetNode is required for native release proof."
    }
    if ([string]::IsNullOrWhiteSpace($TargetIp)) {
        throw "-TargetIp is required for native release proof."
    }

    Write-Step "Running native MUSU release proof with physical peer evidence"
    $musuExeResolved = Resolve-MusuExe -ExplicitExe $MusuExe -RepoRoot $repoRoot
    $result.desktop_runtime_exe_path = $musuExeResolved
    $result.desktop_runtime_exe_sha256 = Get-EvidenceFileSha256 -Path $musuExeResolved
    $nativeEvidenceRoot = Join-Path $EvidenceRoot "native-release-proof"
    New-Item -ItemType Directory -Force -Path $nativeEvidenceRoot | Out-Null
    $nativeEvidenceRoot = (Resolve-Path -LiteralPath $nativeEvidenceRoot).Path
    $result.native_evidence_root = $nativeEvidenceRoot
    $releaseArgs = @(
        "mesh", "release-proof",
        "--target-node", $TargetNode,
        "--target-ip", $TargetIp,
        "--bridge-port", [string]$BridgePort,
        "--timeout-sec", [string]$TimeoutSec,
        "--evidence-root", $nativeEvidenceRoot,
        "--physical-peer-evidence", $PhysicalPeerEvidencePath,
        "--json"
    )
    if (-not [string]::IsNullOrWhiteSpace($SourceBridgeUrl)) {
        $releaseArgs += @("--source-bridge-url", $SourceBridgeUrl)
    }
    if (-not [string]::IsNullOrWhiteSpace($MusuHome)) {
        $releaseArgs += @("--musu-home", $MusuHome)
    }
    if (-not [string]::IsNullOrWhiteSpace($Token)) {
        $releaseArgs += @("--token", $Token)
    }
    if (-not [string]::IsNullOrWhiteSpace($TargetUrl)) {
        $releaseArgs += @("--target-url", $TargetUrl)
    }
    if (-not [string]::IsNullOrWhiteSpace($ExpectedControlServerUrl)) {
        $releaseArgs += @("--expected-control-server-url", $ExpectedControlServerUrl)
    }

    $nativeProof = Invoke-MusuJson -Exe $musuExeResolved -Arguments $releaseArgs
    $result.native_release_proof_exit_code = $nativeProof.exit_code
    $result.native_release_proof = $nativeProof.parsed
    if ($nativeProof.exit_code -ne 0 -or -not $nativeProof.parsed -or -not [bool]$nativeProof.parsed.ok) {
        $result.native_release_proof_raw = $nativeProof.raw
        throw "Native MUSU release proof failed."
    }

    $nativeEvidencePath = [string]$nativeProof.parsed.evidence_path
    if ([string]::IsNullOrWhiteSpace($nativeEvidencePath) -or -not (Test-Path -LiteralPath $nativeEvidencePath)) {
        throw "Native MUSU release proof did not write a readable evidence_path."
    }
    $nativeEvidencePath = (Resolve-Path -LiteralPath $nativeEvidencePath).Path
    $result.native_release_evidence_path = $nativeEvidencePath
    $nativeEvidence = Get-Content -LiteralPath $nativeEvidencePath -Raw | ConvertFrom-Json
    $peerIdentity = $nativeEvidence.peer_identity

    $softwareRouteTrusted = [bool]$nativeProof.parsed.ok -and
        (Get-JsonBool -Value $nativeEvidence -Name "ok") -and
        (Get-JsonBool -Value $verification.parsed -Name "ok") -and
        (Get-JsonBool -Value $peerIdentity -Name "release_identity_bound")
    $physicalPeerVerified = Get-JsonBool -Value $peerIdentity -Name "physical_peer_verified"
    $releaseEvidenceTrusted = $softwareRouteTrusted -and $physicalPeerVerified

    $result.software_route_trusted = $softwareRouteTrusted
    $result.physical_peer_verified = $physicalPeerVerified
    $result.release_identity_bound = Get-JsonBool -Value $peerIdentity -Name "release_identity_bound"
    $result.release_evidence_trusted = $releaseEvidenceTrusted
    $result.native_verification_path = [string]$nativeProof.parsed.verification_path
    $result.native_verification_sha256_path = [string]$nativeProof.parsed.verification_sha256_path

    if (-not $releaseEvidenceTrusted) {
        throw "Native MUSU release proof completed, but release_evidence_trusted=false."
    }

    $result.ok = $true
}
catch {
    $result.error = $_.Exception.Message
}
finally {
    $result.completed_at = (Get-Date).ToString("o")
    $resultPath = Join-Path $EvidenceRoot "private-mesh-release-proof.verification.json"
    $bundleManifestPath = Join-Path $EvidenceRoot "private-mesh-release-proof.bundle-manifest.json"
    $result.bundle_manifest_path = $bundleManifestPath
    $result.bundle_manifest_sha256_path = Get-EvidenceIntegritySidecarPath -EvidencePath $bundleManifestPath
    $result | ConvertTo-Json -Depth 50 | Set-Content -LiteralPath $resultPath -Encoding utf8
    Write-EvidenceIntegritySidecar -EvidencePath $resultPath | Out-Null
    if ([bool]$result.ok) {
        Write-Step "Verifying complete Private Mesh release proof bundle"
        $bundleVerifierScript = Join-Path $scriptDir "verify-private-mesh-release-proof-bundle.ps1"
        $bundleArgs = @(
            "-VerificationPath", $resultPath,
            "-ManifestPath", $bundleManifestPath,
            "-Json"
        )
        if (-not [string]::IsNullOrWhiteSpace($TargetNode)) {
            $bundleArgs += @("-ExpectedTargetNode", $TargetNode)
        }
        if (-not [string]::IsNullOrWhiteSpace($TargetIp)) {
            $bundleArgs += @("-ExpectedTargetIp", $TargetIp)
        }
        if (-not [string]::IsNullOrWhiteSpace($ExpectedControlServerUrl)) {
            $bundleArgs += @("-ExpectedControlServerUrl", $ExpectedControlServerUrl)
        }
        $bundle = Invoke-JsonScript -ScriptPath $bundleVerifierScript -Arguments $bundleArgs
        $result.bundle_verifier_exit_code = $bundle.exit_code
        if ($bundle.parsed) {
            $result.bundle_manifest_schema = [string]$bundle.parsed.schema
            $result.bundle_manifest_ok = [bool]$bundle.parsed.ok
            $result.bundle_manifest_fail_count = [int]$bundle.parsed.fail_count
        }
        if ($bundle.exit_code -ne 0 -or -not $bundle.parsed -or -not [bool]$bundle.parsed.ok) {
            $result.ok = $false
            $result.bundle_verifier_raw = $bundle.raw
            $result.error = "Private Mesh release proof bundle verifier failed."
            $result | ConvertTo-Json -Depth 50 | Set-Content -LiteralPath $resultPath -Encoding utf8
            Write-EvidenceIntegritySidecar -EvidencePath $resultPath | Out-Null
        }
        elseif (-not $SkipArchive) {
            Write-Step "Archiving complete Private Mesh release proof bundle"
            $archiveScript = Join-Path $scriptDir "archive-private-mesh-release-proof-bundle.ps1"
            $archiveArgs = @(
                "-VerificationPath", $resultPath,
                "-ManifestPath", $bundleManifestPath,
                "-Json"
            )
            if (-not [string]::IsNullOrWhiteSpace($TargetNode)) {
                $archiveArgs += @("-ExpectedTargetNode", $TargetNode)
            }
            if (-not [string]::IsNullOrWhiteSpace($TargetIp)) {
                $archiveArgs += @("-ExpectedTargetIp", $TargetIp)
            }
            if (-not [string]::IsNullOrWhiteSpace($ExpectedControlServerUrl)) {
                $archiveArgs += @("-ExpectedControlServerUrl", $ExpectedControlServerUrl)
            }
            if (-not [string]::IsNullOrWhiteSpace($ArchiveRoot)) {
                $archiveArgs += @("-ArchiveRoot", $ArchiveRoot)
            }
            $archive = Invoke-JsonScript -ScriptPath $archiveScript -Arguments $archiveArgs
            $result.archive_exit_code = $archive.exit_code
            if ($archive.parsed) {
                $result.archive_dir = [string]$archive.parsed.archive_dir
                $result.archive_manifest_path = [string]$archive.parsed.archive_manifest_path
                $result.archive_manifest_sha256_path = [string]$archive.parsed.archive_manifest_sha256_path
                $result.archive_zip_path = [string]$archive.parsed.archive_zip_path
                $result.archive_artifact_count = [int]$archive.parsed.artifact_count
                $result.archive_verifier_ok = [bool]$archive.parsed.archive_verifier_ok
                $result.archive_verifier_schema = [string]$archive.parsed.archive_verifier_schema
                $result.archive_verifier_fail_count = [int]$archive.parsed.archive_verifier_fail_count
                $result.archive_verifier_kind = [string]$archive.parsed.archive_verifier_kind
            }
            if ($archive.exit_code -ne 0 -or -not $archive.parsed -or -not [bool]$archive.parsed.ok) {
                $result.ok = $false
                $result.archive_raw = $archive.raw
                $result.error = "Private Mesh release proof archive failed."
            }
            $result | ConvertTo-Json -Depth 50 | Set-Content -LiteralPath $resultPath -Encoding utf8
            Write-EvidenceIntegritySidecar -EvidencePath $resultPath | Out-Null
        }
    }
    if ($Json) {
        Get-Content -LiteralPath $resultPath -Raw
    }
    else {
        if ([bool]$result.ok) {
            Write-Step "Private Mesh release proof verified: $resultPath"
        }
        else {
            Write-Step "Private Mesh release proof failed: $resultPath"
        }
    }
}

if (-not [bool]$result.ok) {
    exit 1
}
