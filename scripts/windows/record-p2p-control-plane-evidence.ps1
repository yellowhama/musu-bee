[CmdletBinding()]
param(
    [string]$BaseUrl = "https://musu.pro",
    [string]$MusuExe,
    [string]$Version,
    [string]$OutputRoot,
    [switch]$AllowUnverified,
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
    $OutputRoot = Join-Path $repoRoot ("docs\evidence\p2p-control-plane\{0}" -f $Version)
}
if ([string]::IsNullOrWhiteSpace($MusuExe)) {
    $localMusu = Join-Path $repoRoot "musu-rs\target\debug\musu.exe"
    if (Test-Path -LiteralPath $localMusu) {
        $MusuExe = $localMusu
    }
    else {
        $MusuExe = "musu"
    }
}

New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null

function Invoke-MusuJson {
    param(
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )

    $output = & $MusuExe @Arguments 2>&1
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
        json = $parsed
        raw = $text
    }
}

function Get-BoolProperty {
    param(
        [Parameter(Mandatory = $true)]$Object,
        [Parameter(Mandatory = $true)][string]$Name
    )

    if (-not $Object) {
        return $false
    }
    $property = $Object.PSObject.Properties[$Name]
    if (-not $property -or $null -eq $property.Value) {
        return $false
    }
    return [bool]$property.Value
}

$recordedAt = [datetimeoffset]::Now
$stamp = $recordedAt.ToString("yyyyMMdd-HHmmss")
$safeBaseUrl = $BaseUrl -replace "^https?://", "" -replace "[^A-Za-z0-9._-]", "_"
$baseName = "$stamp-$safeBaseUrl"
$evidencePath = Join-Path $OutputRoot "$baseName.evidence.json"
$verificationPath = Join-Path $OutputRoot "$baseName.verification.json"
$summaryPath = Join-Path $OutputRoot "$baseName.summary.md"

$oldCloudBaseUrl = $env:MUSU_CLOUD_BASE_URL
try {
    $env:MUSU_CLOUD_BASE_URL = $BaseUrl
    $relayStatusResult = Invoke-MusuJson -Arguments @("relay", "status", "--json")
    $relayLeasesResult = Invoke-MusuJson -Arguments @("relay", "leases", "--json")
}
finally {
    $env:MUSU_CLOUD_BASE_URL = $oldCloudBaseUrl
}

$relayStatus = $relayStatusResult.json
$relayLeases = $relayLeasesResult.json
$statusOk = (
    $relayStatusResult.exit_code -eq 0 -and
    $relayStatus -and
    [string]$relayStatus.schema -eq "musu.relay_status.v1" -and
    (Get-BoolProperty -Object $relayStatus -Name "logged_in") -and
    (Get-BoolProperty -Object $relayStatus -Name "rendezvous_session_wired") -and
    (Get-BoolProperty -Object $relayStatus -Name "relay_control_plane_lease_wired") -and
    -not (Get-BoolProperty -Object $relayStatus -Name "relay_default_data_path")
)
$leasesOk = (
    $relayLeasesResult.exit_code -eq 0 -and
    $relayLeases -and
    [string]$relayLeases.schema -eq "musu.relay_leases.v1" -and
    (Get-BoolProperty -Object $relayLeases -Name "logged_in") -and
    (Get-BoolProperty -Object $relayLeases -Name "ok") -and
    (Get-BoolProperty -Object $relayLeases -Name "owner_scope_verified") -and
    (Get-BoolProperty -Object $relayLeases -Name "owner_scoped") -and
    -not (Get-BoolProperty -Object $relayLeases -Name "relay_default_data_path")
)

$evidence = [pscustomobject]@{
    schema = "musu.p2p_control_plane_live_evidence.v1"
    ok = [bool]($statusOk -and $leasesOk)
    version = $Version
    base_url = $BaseUrl
    recorded_at = $recordedAt.ToString("o")
    operator_machine = $env:COMPUTERNAME
    operator_user = $env:USERNAME
    musu_exe = $MusuExe
    relay_status_exit_code = $relayStatusResult.exit_code
    relay_status = $relayStatus
    relay_status_raw = if ($relayStatus) { $null } else { $relayStatusResult.raw }
    relay_leases_exit_code = $relayLeasesResult.exit_code
    relay_leases = $relayLeases
    relay_leases_raw = if ($relayLeases) { $null } else { $relayLeasesResult.raw }
    notes = "Live P2P control-plane evidence. Passing evidence requires owner-scoped relay lease query against the configured base URL; lease count may be zero."
}

$evidence | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $evidencePath -Encoding UTF8

$verifyScript = Join-Path $scriptDir "verify-p2p-control-plane-evidence.ps1"
$verifyText = (& powershell -NoProfile -ExecutionPolicy Bypass -File $verifyScript -EvidencePath $evidencePath -ExpectedVersion $Version -ExpectedBaseUrl $BaseUrl -Json 2>&1 | Out-String).Trim()
$verification = $null
try {
    $verification = $verifyText | ConvertFrom-Json
}
catch {
    $verification = [pscustomobject]@{
        ok = $false
        evidence_path = (Resolve-Path -LiteralPath $evidencePath).Path
        raw = $verifyText
    }
}
$verification | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $verificationPath -Encoding UTF8

$evidenceHash = Get-FileHash -Algorithm SHA256 -LiteralPath $evidencePath
$verificationHash = Get-FileHash -Algorithm SHA256 -LiteralPath $verificationPath

$summary = @"
# MUSU P2P Control-Plane Live Evidence

- Version: $Version
- Base URL: $BaseUrl
- Verified: $($verification.ok)
- Relay status exit code: $($relayStatusResult.exit_code)
- Relay leases exit code: $($relayLeasesResult.exit_code)
- Relay leases ok: $(Get-BoolProperty -Object $relayLeases -Name "ok")
- Owner scope verified: $(Get-BoolProperty -Object $relayLeases -Name "owner_scope_verified")
- Relay default data path: $(Get-BoolProperty -Object $relayLeases -Name "relay_default_data_path")
- Evidence: $([System.IO.Path]::GetFileName($evidencePath))
- Evidence SHA256: $($evidenceHash.Hash.ToLowerInvariant())
- Verification: $([System.IO.Path]::GetFileName($verificationPath))
- Verification SHA256: $($verificationHash.Hash.ToLowerInvariant())
- Recorded at: $($recordedAt.ToString("o"))

This evidence proves whether the hosted P2P control-plane can be queried by the
logged-in runtime token without making relay the default payload path.
"@
$summary | Set-Content -LiteralPath $summaryPath -Encoding UTF8

$result = [pscustomobject]@{
    ok = [bool]$verification.ok
    version = $Version
    base_url = $BaseUrl
    output_root = (Resolve-Path -LiteralPath $OutputRoot).Path
    evidence_path = (Resolve-Path -LiteralPath $evidencePath).Path
    evidence_sha256 = $evidenceHash.Hash.ToLowerInvariant()
    verification_path = (Resolve-Path -LiteralPath $verificationPath).Path
    verification_sha256 = $verificationHash.Hash.ToLowerInvariant()
    summary_path = (Resolve-Path -LiteralPath $summaryPath).Path
    owner_scope_verified = Get-BoolProperty -Object $relayLeases -Name "owner_scope_verified"
    relay_leases_ok = Get-BoolProperty -Object $relayLeases -Name "ok"
}

if ($Json) {
    $result | ConvertTo-Json -Depth 6
}
else {
    $result
}

if (-not $result.ok -and -not $AllowUnverified) {
    exit 1
}
