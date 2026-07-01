[CmdletBinding()]
param(
    [string]$BaseUrl = "https://musu.pro",
    [string]$VersionPath,
    [string]$CanaryScriptPath,
    [switch]$SkipDesktopCanary,
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

function Normalize-BaseUrl {
    param([Parameter(Mandatory = $true)][string]$Value)
    return $Value.TrimEnd("/")
}

function Convert-ContentToText {
    param([Parameter(Mandatory = $true)]$Content)

    if ($Content -is [byte[]]) {
        return [System.Text.Encoding]::UTF8.GetString($Content)
    }
    return [string]$Content
}

function Add-Check {
    param(
        [Parameter(Mandatory = $true)]
        [AllowEmptyCollection()]
        [System.Collections.Generic.List[object]]$Checks,
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Status,
        [Parameter(Mandatory = $true)][string]$Message,
        [object]$Details = $null
    )

    $Checks.Add([pscustomobject]@{
        name = $Name
        status = $Status
        message = $Message
        details = $Details
    }) | Out-Null
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

function Invoke-TextGet {
    param([Parameter(Mandatory = $true)][string]$Url)

    $res = Invoke-WebRequest -UseBasicParsing -Uri $Url -Method Get -MaximumRedirection 5 -TimeoutSec 30
    return [pscustomobject]@{
        status_code = [int]$res.StatusCode
        text = Convert-ContentToText -Content $res.Content
    }
}

function Invoke-DesktopCanary {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)

    $shell = if (Get-Command pwsh -ErrorAction SilentlyContinue) { "pwsh" } else { "powershell" }
    $output = & $shell -NoProfile -ExecutionPolicy Bypass -File $ScriptPath -Json -SkipLocalArtifactLengthChecks 2>&1
    $exitCode = $LASTEXITCODE
    $raw = ($output | ForEach-Object { [string]$_ }) -join "`n"
    $parsed = $null
    try {
        $parsed = $raw | ConvertFrom-Json
    } catch {
        $parsed = $null
    }
    return [pscustomobject]@{
        exit_code = $exitCode
        parsed = $parsed
        raw = $raw
    }
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-PathParts -Base $scriptDir -Parts @("..", ".."))).Path
if (-not $VersionPath) {
    $VersionPath = Join-Path $repoRoot "VERSION"
}
if (-not $CanaryScriptPath) {
    $CanaryScriptPath = Join-PathParts -Base $repoRoot -Parts @("scripts", "windows", "canary-desktop-release.ps1")
}
if (-not (Test-Path -LiteralPath $VersionPath -PathType Leaf)) {
    throw "VERSION not found at $VersionPath"
}
if (-not $SkipDesktopCanary -and -not (Test-Path -LiteralPath $CanaryScriptPath -PathType Leaf)) {
    throw "Desktop canary not found at $CanaryScriptPath"
}

$base = Normalize-BaseUrl -Value $BaseUrl
$expectedVersion = (Get-Content -LiteralPath $VersionPath -Raw).Trim()
$expectedPackageVersion = Convert-PublicVersionToPackageVersion -PublicVersion $expectedVersion
$checks = [System.Collections.Generic.List[object]]::new()

$healthUrl = "$base/api/health"
try {
    $healthResponse = Invoke-TextGet -Url $healthUrl
    $health = $healthResponse.text | ConvertFrom-Json
    $healthSchema = [string]$health.schema
    $healthOk = $health.ok
    $healthService = [string]$health.service
    $healthVersion = [string]$health.version

    if ($healthResponse.status_code -ne 200) {
        Add-Check -Checks $checks -Name "health status" -Status "fail" -Message "$healthUrl returned HTTP $($healthResponse.status_code)."
    } elseif ($healthSchema -ne "musu.site_health.v1") {
        Add-Check -Checks $checks -Name "health schema" -Status "fail" -Message "$healthUrl returned schema '$healthSchema', expected 'musu.site_health.v1'."
    } elseif (-not ($healthOk -is [bool]) -or $healthOk -ne $true) {
        Add-Check -Checks $checks -Name "health ok" -Status "fail" -Message "$healthUrl returned ok='$healthOk', expected boolean true."
    } elseif ($healthService -ne "musu.pro") {
        Add-Check -Checks $checks -Name "health service" -Status "fail" -Message "$healthUrl returned service '$healthService', expected 'musu.pro'."
    } else {
        Add-Check -Checks $checks -Name "health status" -Status "pass" -Message "$healthUrl returned ok=true with schema $healthSchema and service $healthService."
    }

    if ($healthVersion -eq $expectedVersion) {
        Add-Check -Checks $checks -Name "health version" -Status "pass" -Message "$healthUrl publishes $healthVersion."
    } else {
        Add-Check -Checks $checks -Name "health version" -Status "fail" -Message "$healthUrl publishes '$healthVersion', expected '$expectedVersion'."
    }
} catch {
    Add-Check -Checks $checks -Name "health" -Status "fail" -Message "$healthUrl failed: $($_.Exception.Message)"
}

$publicConfigUrl = "$base/api/public-config"
try {
    $publicConfigResponse = Invoke-TextGet -Url $publicConfigUrl
    $publicConfig = $publicConfigResponse.text | ConvertFrom-Json
    $actualVersion = [string]$publicConfig.releaseVersion
    if ($actualVersion -eq $expectedVersion) {
        Add-Check -Checks $checks -Name "public-config releaseVersion" -Status "pass" -Message "$publicConfigUrl publishes $actualVersion."
    } else {
        Add-Check -Checks $checks -Name "public-config releaseVersion" -Status "fail" -Message "$publicConfigUrl publishes '$actualVersion', expected '$expectedVersion'."
    }
} catch {
    Add-Check -Checks $checks -Name "public-config" -Status "fail" -Message "$publicConfigUrl failed: $($_.Exception.Message)"
}

$installUrl = "$base/install.ps1"
try {
    $installResponse = Invoke-TextGet -Url $installUrl
    $script = $installResponse.text
    $scriptVersion = Get-RegexGroup -Text $script -Pattern '\$ExpectedReleaseVersion\s*=\s*"([^"]+)"'
    $scriptThumbprint = Get-RegexGroup -Text $script -Pattern '\$ExpectedCertThumbprint\s*=\s*"([A-Fa-f0-9]+)"'
    $temporarilyUnavailable = ($script -match 'MUSU installer is temporarily unavailable')

    if ($installResponse.status_code -ne 200) {
        Add-Check -Checks $checks -Name "install.ps1 status" -Status "fail" -Message "$installUrl returned HTTP $($installResponse.status_code)."
    } elseif ($temporarilyUnavailable) {
        Add-Check -Checks $checks -Name "install.ps1 availability" -Status "fail" -Message "$installUrl returned a fail-closed unavailable script."
    } else {
        Add-Check -Checks $checks -Name "install.ps1 status" -Status "pass" -Message "$installUrl returned HTTP 200."
    }

    if ($scriptVersion -eq $expectedVersion) {
        Add-Check -Checks $checks -Name "install.ps1 ExpectedReleaseVersion" -Status "pass" -Message "install.ps1 expects $scriptVersion."
    } else {
        Add-Check -Checks $checks -Name "install.ps1 ExpectedReleaseVersion" -Status "fail" -Message "install.ps1 expects '$scriptVersion', expected '$expectedVersion'."
    }

    if ([string]::IsNullOrWhiteSpace($scriptThumbprint)) {
        Add-Check -Checks $checks -Name "install.ps1 ExpectedCertThumbprint" -Status "fail" -Message "install.ps1 does not expose ExpectedCertThumbprint."
    } else {
        Add-Check -Checks $checks -Name "install.ps1 ExpectedCertThumbprint" -Status "pass" -Message "install.ps1 exposes a certificate thumbprint."
    }
} catch {
    Add-Check -Checks $checks -Name "install.ps1" -Status "fail" -Message "$installUrl failed: $($_.Exception.Message)"
}

$repairFleetUrl = "$base/repair-fleet.ps1"
try {
    $repairResponse = Invoke-TextGet -Url $repairFleetUrl
    $repairScript = $repairResponse.text
    $repairUnavailable = ($repairScript -match 'MUSU fleet repair script (is )?temporarily unavailable')
    $repairSchemaPresent = ($repairScript -match 'musu\.fleet_node_public_url_repair\.v1')
    $repairNodeGuardPresent = ($repairScript -match 'ExpectedNodeName')

    if ($repairResponse.status_code -ne 200) {
        Add-Check -Checks $checks -Name "repair-fleet.ps1 status" -Status "fail" -Message "$repairFleetUrl returned HTTP $($repairResponse.status_code)."
    } elseif ($repairUnavailable) {
        Add-Check -Checks $checks -Name "repair-fleet.ps1 availability" -Status "fail" -Message "$repairFleetUrl returned a fail-closed unavailable script."
    } else {
        Add-Check -Checks $checks -Name "repair-fleet.ps1 status" -Status "pass" -Message "$repairFleetUrl returned HTTP 200."
    }

    if ($repairSchemaPresent) {
        Add-Check -Checks $checks -Name "repair-fleet.ps1 schema" -Status "pass" -Message "repair-fleet.ps1 exposes musu.fleet_node_public_url_repair.v1."
    } else {
        Add-Check -Checks $checks -Name "repair-fleet.ps1 schema" -Status "fail" -Message "repair-fleet.ps1 does not expose musu.fleet_node_public_url_repair.v1."
    }

    if ($repairNodeGuardPresent) {
        Add-Check -Checks $checks -Name "repair-fleet.ps1 ExpectedNodeName" -Status "pass" -Message "repair-fleet.ps1 exposes ExpectedNodeName."
    } else {
        Add-Check -Checks $checks -Name "repair-fleet.ps1 ExpectedNodeName" -Status "fail" -Message "repair-fleet.ps1 does not expose ExpectedNodeName."
    }
} catch {
    Add-Check -Checks $checks -Name "repair-fleet.ps1" -Status "fail" -Message "$repairFleetUrl failed: $($_.Exception.Message)"
}

$fleetProofUrl = "$base/fleet-proof.ps1"
try {
    $fleetProofResponse = Invoke-TextGet -Url $fleetProofUrl
    $fleetProofScript = $fleetProofResponse.text
    $proofSchemaPresent = ($fleetProofScript -match 'musu\.fleet_node_proof\.v1')
    $repairSchemaPresent = ($fleetProofScript -match 'musu\.fleet_node_public_url_repair\.v1')
    $proofExpectedPackage = Get-RegexGroup -Text $fleetProofScript -Pattern '\$ExpectedPackageVersion\s*=\s*"([^"]+)"'
    $proofInstallUrlPresent = ($fleetProofScript -match 'https://musu\.pro/install\.ps1')
    $proofRepairUrlPresent = ($fleetProofScript -match 'https://musu\.pro/repair-fleet\.ps1')
    $proofPeerGuardPresent = ($fleetProofScript -match 'ExpectedDirectPeerName')
    $proofBrainGatePresent = ($fleetProofScript -match 'RequireBrainToken')
    $proofReleaseRouteGatePresent = ($fleetProofScript -match 'RequireReleaseGradeRoute')
    $proofReleaseRouteContractPresent = (
        $fleetProofScript -match 'musu\.route_evidence\.v1' -and
        $fleetProofScript -match 'quic_tls_1_3' -and
        $fleetProofScript -match 'musu_quic_tls_transport' -and
        $fleetProofScript -match 'release_grade_route_verified'
    )

    if ($fleetProofResponse.status_code -ne 200) {
        Add-Check -Checks $checks -Name "fleet-proof.ps1 status" -Status "fail" -Message "$fleetProofUrl returned HTTP $($fleetProofResponse.status_code)."
    } else {
        Add-Check -Checks $checks -Name "fleet-proof.ps1 status" -Status "pass" -Message "$fleetProofUrl returned HTTP 200."
    }

    if ($proofSchemaPresent -and $repairSchemaPresent) {
        Add-Check -Checks $checks -Name "fleet-proof.ps1 schemas" -Status "pass" -Message "fleet-proof.ps1 exposes proof and repair evidence schemas."
    } else {
        Add-Check -Checks $checks -Name "fleet-proof.ps1 schemas" -Status "fail" -Message "fleet-proof.ps1 is missing proof or repair evidence schema markers."
    }

    if ($proofExpectedPackage -eq $expectedPackageVersion) {
        Add-Check -Checks $checks -Name "fleet-proof.ps1 ExpectedPackageVersion" -Status "pass" -Message "fleet-proof.ps1 expects package $proofExpectedPackage."
    } else {
        Add-Check -Checks $checks -Name "fleet-proof.ps1 ExpectedPackageVersion" -Status "fail" -Message "fleet-proof.ps1 expects '$proofExpectedPackage', expected '$expectedPackageVersion'."
    }

    if ($proofInstallUrlPresent -and $proofRepairUrlPresent -and $proofPeerGuardPresent -and $proofBrainGatePresent -and $proofReleaseRouteGatePresent -and $proofReleaseRouteContractPresent) {
        Add-Check -Checks $checks -Name "fleet-proof.ps1 proof gates" -Status "pass" -Message "fleet-proof.ps1 validates install channel, repair evidence, direct peer, brain token, and opt-in release-grade route gates."
    } else {
        Add-Check -Checks $checks -Name "fleet-proof.ps1 proof gates" -Status "fail" -Message "fleet-proof.ps1 is missing an install/repair/direct-peer/brain-token/release-grade-route proof gate."
    }
} catch {
    Add-Check -Checks $checks -Name "fleet-proof.ps1" -Status "fail" -Message "$fleetProofUrl failed: $($_.Exception.Message)"
}

if ($SkipDesktopCanary) {
    Add-Check -Checks $checks -Name "desktop-latest canary" -Status "skip" -Message "Skipped by caller."
} else {
    $canary = Invoke-DesktopCanary -ScriptPath $CanaryScriptPath
    if ($canary.exit_code -eq 0) {
        Add-Check -Checks $checks -Name "desktop-latest canary" -Status "pass" -Message "desktop-latest canary passed." -Details $canary.parsed
    } else {
        $failureCount = $null
        if ($null -ne $canary.parsed) {
            $failureCount = $canary.parsed.failure_count
        }
        Add-Check -Checks $checks -Name "desktop-latest canary" -Status "fail" -Message "desktop-latest canary failed with $failureCount failure(s)." -Details $canary.parsed
    }
}

$failures = @($checks | Where-Object { $_.status -eq "fail" })
$ok = ($failures.Count -eq 0)
$summary = [pscustomobject]@{
    schema = "musu.install_channel.v1"
    ok = $ok
    failure_count = $failures.Count
    base_url = $base
    expected_version = $expectedVersion
    checks = $checks
}

if ($Json) {
    $summary | ConvertTo-Json -Depth 12
    if ($ok) { exit 0 } else { exit 1 }
}

foreach ($check in $checks) {
    $mark = switch ($check.status) {
        "pass" { "PASS" }
        "skip" { "SKIP" }
        default { "FAIL" }
    }
    Write-Host ("[{0}] {1}: {2}" -f $mark, $check.name, $check.message)
}

if ($ok) {
    Write-Host "INSTALL CHANNEL OK: $base is ready for the one-line installer."
    exit 0
}

Write-Host "INSTALL CHANNEL FAILED: $($failures.Count) check(s) failed."
exit 1
