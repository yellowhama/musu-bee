[CmdletBinding()]
param(
    [string]$MusuExe,
    [string]$SourceBridgeUrl,
    [string]$MusuHome,
    [string]$Token,
    [Parameter(Mandatory = $true)]
    [string]$TargetNode,
    [Parameter(Mandatory = $true)]
    [string]$TargetIp,
    [int]$BridgePort = 8070,
    [string]$TargetUrl,
    [string]$ExpectedControlServerUrl,
    [int]$TimeoutSec = 120,
    [string]$EvidenceRoot,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step([string]$Message) {
    if (-not $Json) {
        Write-Host "==> $Message"
    }
}

function Resolve-MusuHome([string]$ExplicitHome) {
    if (-not [string]::IsNullOrWhiteSpace($ExplicitHome)) {
        return (Resolve-Path -LiteralPath $ExplicitHome).Path
    }
    if (-not [string]::IsNullOrWhiteSpace($env:MUSU_HOME)) {
        return (Resolve-Path -LiteralPath $env:MUSU_HOME).Path
    }
    $defaultHome = Join-Path $env:USERPROFILE ".musu"
    if (Test-Path -LiteralPath $defaultHome) {
        return (Resolve-Path -LiteralPath $defaultHome).Path
    }
    throw "MUSU home not found. Pass -MusuHome or set MUSU_HOME."
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

function Invoke-MusuJson([string]$Exe, [string[]]$CommandArgs) {
    $output = & $Exe @CommandArgs 2>&1
    $exitCode = $LASTEXITCODE
    $text = ($output | Out-String).Trim()
    if ($exitCode -ne 0) {
        throw ("musu {0} failed with exit {1}: {2}" -f ($CommandArgs -join " "), $exitCode, $text)
    }
    if ([string]::IsNullOrWhiteSpace($text)) {
        throw ("musu {0} returned no JSON" -f ($CommandArgs -join " "))
    }
    return $text | ConvertFrom-Json
}

function Assert-PrivateMeshStatus(
    [object]$Status,
    [string]$ExpectedUrl
) {
    if ([string]$Status.schema -ne "musu.private_mesh_status.v1") {
        throw "unexpected mesh status schema: $($Status.schema)"
    }
    if ([string]$Status.mode -ne "musu_headscale") {
        throw "Private Mesh proof requires mode=musu_headscale; got $($Status.mode)"
    }
    if ([string]::IsNullOrWhiteSpace([string]$Status.control_server_url)) {
        throw "Private Mesh proof requires control_server_url in private_mesh.toml"
    }
    if (-not [bool]$Status.control_server_verified) {
        throw "Private Mesh proof requires control_server_verified=true"
    }
    if (
        -not [string]::IsNullOrWhiteSpace($ExpectedUrl) -and
        ([string]$Status.control_server_url).TrimEnd("/") -ne $ExpectedUrl.TrimEnd("/")
    ) {
        throw "control server mismatch: expected $ExpectedUrl got $($Status.control_server_url)"
    }
}

function Assert-MeshVerify([object]$Verify) {
    if ([string]$Verify.schema -ne "musu.private_mesh_verify.v1") {
        throw "unexpected mesh verify schema: $($Verify.schema)"
    }
    if (-not [bool]$Verify.bridge_health_ok) {
        throw "musu mesh verify did not prove target bridge /health"
    }
    if (-not [bool]$Verify.ping.found -or [int]$Verify.ping.exit_code -ne 0) {
        throw "musu mesh verify did not prove tailnet ping"
    }
}

function Assert-BoundProof(
    [object]$Status,
    [string]$ExpectedTargetIp
) {
    if ([string]$Status.verified_target_tailnet_ip -ne $ExpectedTargetIp) {
        throw "verified target mismatch: expected $ExpectedTargetIp got $($Status.verified_target_tailnet_ip)"
    }
    if ([string]$Status.callback_tailnet_ip -ne $ExpectedTargetIp) {
        throw "callback target mismatch: expected $ExpectedTargetIp got $($Status.callback_tailnet_ip)"
    }
    if (-not [bool]$Status.target_callback_match) {
        throw "Private Mesh status did not report target_callback_match=true"
    }
    if (-not [bool]$Status.verification.target_callback_match) {
        throw "Private Mesh verification did not report target_callback_match=true"
    }
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
. (Join-Path $scriptDir "evidence-integrity.ps1")
if (-not $EvidenceRoot) {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $EvidenceRoot = Join-Path $repoRoot ".local-build\private-mesh-route-proof\$stamp"
}
New-Item -ItemType Directory -Force -Path $EvidenceRoot | Out-Null
$EvidenceRoot = (Resolve-Path -LiteralPath $EvidenceRoot).Path

$evidence = [ordered]@{
    schema = "musu.private_mesh_route_proof_smoke.v1"
    started_at = (Get-Date).ToString("o")
    repo_root = $repoRoot
    evidence_root = $EvidenceRoot
    target_node = $TargetNode
    target_ip = $TargetIp
    bridge_port = $BridgePort
    expected_control_server_url = $ExpectedControlServerUrl
    ok = $false
}

try {
    if ($TargetIp -notmatch '^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.') {
        throw "-TargetIp must be an IPv4 tailnet address in 100.64.0.0/10; got $TargetIp"
    }

    $resolvedHome = Resolve-MusuHome -ExplicitHome $MusuHome
    $resolvedMusuExe = Resolve-MusuExe -ExplicitExe $MusuExe -RepoRoot $repoRoot
    $evidence.musu_home = $resolvedHome
    $evidence.musu_exe = $resolvedMusuExe

    Write-Step "Checking local MUSU Private Mesh status"
    $statusArgs = @("mesh", "status", "--json", "--musu-home", $resolvedHome)
    $meshStatus = Invoke-MusuJson -Exe $resolvedMusuExe -CommandArgs $statusArgs
    Assert-PrivateMeshStatus -Status $meshStatus -ExpectedUrl $ExpectedControlServerUrl
    $evidence.mesh_status = $meshStatus

    Write-Step "Verifying target tailnet ping and bridge health"
    $verifyArgs = @(
        "mesh", "verify",
        "--target-ip", $TargetIp,
        "--bridge-port", [string]$BridgePort,
        "--json",
        "--musu-home", $resolvedHome
    )
    $meshVerify = Invoke-MusuJson -Exe $resolvedMusuExe -CommandArgs $verifyArgs
    Assert-MeshVerify -Verify $meshVerify
    if ([string]$meshVerify.target_ip -ne $TargetIp) {
        throw "mesh verify target mismatch: expected $TargetIp got $($meshVerify.target_ip)"
    }
    $evidence.mesh_verify = $meshVerify

    Write-Step "Running delegated route/callback proof through existing real-peer smoke"
    $realPeerRoot = Join-Path $EvidenceRoot "real-peer"
    New-Item -ItemType Directory -Force -Path $realPeerRoot | Out-Null
    $realPeerScript = Join-Path $scriptDir "smoke-real-peer-route-proof.ps1"
    $realPeerArgs = @(
        "-MusuHome", $resolvedHome,
        "-TargetNode", $TargetNode,
        "-TailscaleIp", $TargetIp,
        "-TailscaleBridgePort", [string]$BridgePort,
        "-ExpectedRouteKind", "tailscale",
        "-TimeoutSec", [string]$TimeoutSec,
        "-EvidenceRoot", $realPeerRoot,
        "-Json"
    )
    if (-not [string]::IsNullOrWhiteSpace($SourceBridgeUrl)) {
        $realPeerArgs += @("-SourceBridgeUrl", $SourceBridgeUrl)
    }
    if (-not [string]::IsNullOrWhiteSpace($Token)) {
        $realPeerArgs += @("-Token", $Token)
    }
    if (-not [string]::IsNullOrWhiteSpace($TargetUrl)) {
        $realPeerArgs += @("-TargetUrl", $TargetUrl)
    }
    $realPeerRaw = & $realPeerScript @realPeerArgs
    if ($LASTEXITCODE -ne 0) {
        throw "real-peer route proof failed with exit $LASTEXITCODE"
    }
    $realPeerEvidencePath = Join-Path $realPeerRoot "real-peer-route-proof.evidence.json"
    if (-not (Test-Path -LiteralPath $realPeerEvidencePath)) {
        throw "real-peer evidence file missing at $realPeerEvidencePath"
    }
    $realPeerEvidence = Get-Content -LiteralPath $realPeerEvidencePath -Raw | ConvertFrom-Json
    if (-not [bool]$realPeerEvidence.ok) {
        throw "real-peer route proof evidence ok=false"
    }
    $evidence.real_peer_output = ($realPeerRaw | Out-String).Trim()
    $evidence.real_peer_evidence = $realPeerEvidence

    Write-Step "Checking Private Mesh release-grade status after callback proof"
    $postCallbackStatus = Invoke-MusuJson -Exe $resolvedMusuExe -CommandArgs $statusArgs
    Assert-PrivateMeshStatus -Status $postCallbackStatus -ExpectedUrl $ExpectedControlServerUrl
    if (-not [bool]$postCallbackStatus.verification.callback_verified) {
        throw "Private Mesh status did not record callback_verified=true after route proof"
    }
    if (-not [bool]$postCallbackStatus.verification.release_grade) {
        throw "Private Mesh status did not reach release_grade=true after ping, health, and callback proof"
    }
    Assert-BoundProof -Status $postCallbackStatus -ExpectedTargetIp $TargetIp
    $evidence.post_callback_mesh_status = $postCallbackStatus
    $evidence.ok = $true
    Write-Step "Private Mesh route/callback proof smoke passed"
}
catch {
    $evidence.error = $_.Exception.Message
    throw
}
finally {
    $evidence.completed_at = (Get-Date).ToString("o")
    $evidencePath = Join-Path $EvidenceRoot "private-mesh-route-proof.evidence.json"
    ($evidence | ConvertTo-Json -Depth 40) | Set-Content -LiteralPath $evidencePath -Encoding utf8
    Write-EvidenceIntegritySidecar -EvidencePath $evidencePath | Out-Null
    if ($Json) {
        Get-Content -LiteralPath $evidencePath -Raw
    }
    else {
        Write-Step "Evidence written to $evidencePath"
    }
}
