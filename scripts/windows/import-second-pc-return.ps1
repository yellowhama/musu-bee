[CmdletBinding()]
param(
    [string]$ReturnZipPath,
    [string]$ExpectedVersion,
    [string]$ImportRoot,
    [switch]$RecordMsixInstall,
    [switch]$RequireReleaseGateEvidence,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path

if ([string]::IsNullOrWhiteSpace($ExpectedVersion)) {
    $ExpectedVersion = (Get-Content -LiteralPath (Join-Path $repoRoot "VERSION") -Raw).Trim()
}
if ([string]::IsNullOrWhiteSpace($ImportRoot)) {
    $ImportRoot = Join-Path $repoRoot ".local-build\second-pc-return\imported"
}
if ([string]::IsNullOrWhiteSpace($ReturnZipPath)) {
    $returnRoot = Join-Path $repoRoot ".local-build\second-pc-return"
    $latest = Get-ChildItem -LiteralPath $returnRoot -Filter "*.zip" -File -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTimeUtc -Descending |
        Select-Object -First 1
    if (-not $latest) {
        throw "Return zip path was not provided and no .local-build\second-pc-return\*.zip file exists."
    }
    $ReturnZipPath = $latest.FullName
}
if (-not (Test-Path -LiteralPath $ReturnZipPath)) {
    throw "Return zip not found: $ReturnZipPath"
}

function Resolve-LatestFile {
    param(
        [Parameter(Mandatory = $true)][string]$Root,
        [Parameter(Mandatory = $true)][string]$Filter,
        [Parameter(Mandatory = $true)][string]$Label
    )

    $file = Get-ChildItem -LiteralPath $Root -Filter $Filter -File -Recurse -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTimeUtc -Descending |
        Select-Object -First 1
    if (-not $file) {
        throw "$Label file not found under $Root matching $Filter"
    }
    return $file.FullName
}

function Resolve-LatestJsonBySchema {
    param(
        [Parameter(Mandatory = $true)][string]$Root,
        [Parameter(Mandatory = $true)][string]$Schema,
        [Parameter(Mandatory = $true)][string]$Label,
        [switch]$Optional
    )

    $matches = @()
    foreach ($file in @(Get-ChildItem -LiteralPath $Root -Filter "*.json" -File -Recurse -ErrorAction SilentlyContinue)) {
        try {
            $json = Get-Content -LiteralPath $file.FullName -Raw | ConvertFrom-Json
            if ([string]$json.schema -eq $Schema) {
                $matches += $file
            }
        }
        catch {
            # Ignore non-JSON or partial files; the final chosen file is verified later.
        }
    }

    $match = $matches | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
    if (-not $match -and -not $Optional) {
        throw "$Label file not found under $Root with schema $Schema"
    }
    if (-not $match) {
        return $null
    }
    return $match.FullName
}

function Resolve-LatestRuntimeIdleReleaseEvidence {
    param(
        [Parameter(Mandatory = $true)][string]$Root,
        [switch]$Optional
    )

    $matches = @()
    foreach ($file in @(Get-ChildItem -LiteralPath $Root -Filter "*.json" -File -Recurse -ErrorAction SilentlyContinue)) {
        try {
            $json = Get-Content -LiteralPath $file.FullName -Raw | ConvertFrom-Json
            $normalizedPath = $file.FullName -replace "/", "\"
            if (
                [string]$json.schema -eq "musu.runtime_idle_cpu_evidence.v1" -and
                [string]$json.scenario -eq "desktop-open" -and
                [bool]$json.require_owned_webview2 -and
                $normalizedPath -like "*\.local-build\runtime-idle-cpu\*"
            ) {
                $matches += $file
            }
        }
        catch {
            # Ignore unrelated JSON files; the selected evidence is verified by go/no-go later.
        }
    }

    $match = $matches | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
    if (-not $match -and -not $Optional) {
        throw "release-grade runtime idle CPU evidence file not found under $Root"
    }
    if (-not $match) {
        return $null
    }
    return $match.FullName
}

function Copy-IntoRoot {
    param(
        [Parameter(Mandatory = $true)][string]$SourcePath,
        [Parameter(Mandatory = $true)][string]$TargetRoot
    )

    New-Item -ItemType Directory -Force -Path $TargetRoot | Out-Null
    $targetPath = Join-Path $TargetRoot (Split-Path -Leaf $SourcePath)
    Copy-Item -LiteralPath $SourcePath -Destination $targetPath -Force
    return (Resolve-Path -LiteralPath $targetPath).Path
}

function Get-JsonPropertyString {
    param(
        [Parameter(Mandatory = $true)]$Object,
        [Parameter(Mandatory = $true)][string]$Name
    )

    $property = $Object.PSObject.Properties[$Name]
    if (-not $property -or $null -eq $property.Value) {
        return ""
    }
    return [string]$property.Value
}

$resolvedReturnZip = (Resolve-Path -LiteralPath $ReturnZipPath).Path
$safeBaseName = [System.IO.Path]::GetFileNameWithoutExtension($resolvedReturnZip) -replace "[^A-Za-z0-9._-]", "_"
$extractRoot = Join-Path $ImportRoot $safeBaseName
if (Test-Path -LiteralPath $extractRoot) {
    $extractRoot = Join-Path $ImportRoot "$safeBaseName-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
}
New-Item -ItemType Directory -Force -Path $extractRoot | Out-Null
Expand-Archive -LiteralPath $resolvedReturnZip -DestinationPath $extractRoot -Force
$extractRoot = (Resolve-Path -LiteralPath $extractRoot).Path

$sourceMsixEvidence = Resolve-LatestJsonBySchema -Root $extractRoot -Schema "musu.msix_install_evidence.v1" -Label "MSIX install evidence"
$sourceHandoff = Resolve-LatestFile -Root $extractRoot -Filter "*.handoff.json" -Label "second-PC handoff"
$sourceRuntimeIdleCpuEvidence = Resolve-LatestRuntimeIdleReleaseEvidence -Root $extractRoot -Optional
$sourceRuntimeCpuScenarioMatrix = Resolve-LatestJsonBySchema -Root $extractRoot -Schema "musu.runtime_cpu_scenario_matrix.v1" -Label "runtime CPU scenario matrix" -Optional
$sourceProcessAttributionSummary = Resolve-LatestJsonBySchema -Root $extractRoot -Schema "musu.process_attribution_summary.v1" -Label "process attribution summary" -Optional
$sourceReleaseCheck = Get-ChildItem -LiteralPath $extractRoot -Filter "*.release-check.json" -File -Recurse -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTimeUtc -Descending |
    Select-Object -First 1

$canonicalMsixEvidence = Copy-IntoRoot -SourcePath $sourceMsixEvidence -TargetRoot (Join-Path $repoRoot ".local-build\msix-install")
$canonicalHandoff = Copy-IntoRoot -SourcePath $sourceHandoff -TargetRoot (Join-Path $repoRoot ".local-build\second-pc-handoff")
$canonicalRuntimeIdleCpuEvidence = if ($sourceRuntimeIdleCpuEvidence) {
    Copy-IntoRoot -SourcePath $sourceRuntimeIdleCpuEvidence -TargetRoot (Join-Path $repoRoot ".local-build\runtime-idle-cpu")
}
else {
    $null
}
$canonicalRuntimeCpuScenarioMatrix = if ($sourceRuntimeCpuScenarioMatrix) {
    Copy-IntoRoot -SourcePath $sourceRuntimeCpuScenarioMatrix -TargetRoot (Join-Path $repoRoot ".local-build\runtime-cpu-scenarios")
}
else {
    $null
}
$canonicalProcessAttributionSummary = if ($sourceProcessAttributionSummary) {
    Copy-IntoRoot -SourcePath $sourceProcessAttributionSummary -TargetRoot (Join-Path $repoRoot ".local-build\process-attribution")
}
else {
    $null
}
$canonicalReleaseCheck = if ($sourceReleaseCheck) {
    Copy-IntoRoot -SourcePath $sourceReleaseCheck.FullName -TargetRoot (Join-Path $repoRoot ".local-build\second-pc-release-check")
}
else {
    $null
}

$handoff = Get-Content -LiteralPath $canonicalHandoff -Raw | ConvertFrom-Json
if ((Get-JsonPropertyString -Object $handoff -Name "schema") -ne "musu.second_pc_handoff.v1") {
    throw "Unexpected handoff schema in ${canonicalHandoff}: $($handoff.schema)"
}
if ((Get-JsonPropertyString -Object $handoff -Name "version") -ne $ExpectedVersion) {
    throw "Handoff version mismatch. Expected $ExpectedVersion, got $($handoff.version)."
}
if (-not [bool]$handoff.ok) {
    throw "Handoff file reports ok=false: $canonicalHandoff"
}

if ($canonicalReleaseCheck) {
    $releaseCheck = Get-Content -LiteralPath $canonicalReleaseCheck -Raw | ConvertFrom-Json
    if ((Get-JsonPropertyString -Object $releaseCheck -Name "schema") -ne "musu.second_pc_release_check.v1") {
        throw "Unexpected release-check schema in ${canonicalReleaseCheck}: $($releaseCheck.schema)"
    }
    if ((Get-JsonPropertyString -Object $releaseCheck -Name "version") -ne $ExpectedVersion) {
        throw "Release-check version mismatch. Expected $ExpectedVersion, got $($releaseCheck.version)."
    }
    if (-not [bool]$releaseCheck.ok) {
        throw "Release-check file reports ok=false: $canonicalReleaseCheck"
    }
}

$verifyMsixText = (& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $scriptDir "verify-msix-install-evidence.ps1") -EvidencePath $canonicalMsixEvidence -ExpectedVersion $ExpectedVersion -Json 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0) {
    throw "MSIX install evidence from second-PC return did not verify.`n$verifyMsixText"
}
$verifyMsix = $verifyMsixText | ConvertFrom-Json
if (-not [bool]$verifyMsix.ok) {
    throw "MSIX install verifier returned ok=false for $canonicalMsixEvidence"
}

$returnCardText = (& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $scriptDir "show-second-pc-return-card.ps1") -HandoffPath $canonicalHandoff -MsixInstallEvidencePath $canonicalMsixEvidence -Json 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0) {
    throw "Unable to build second-PC return card.`n$returnCardText"
}
$returnCard = $returnCardText | ConvertFrom-Json

$recordMsixResult = $null
if ($RecordMsixInstall) {
    $recordText = (& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $scriptDir "record-msix-install-evidence.ps1") -EvidencePath $canonicalMsixEvidence -Version $ExpectedVersion -Json 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to record MSIX install evidence.`n$recordText"
    }
    $recordMsixResult = $recordText | ConvertFrom-Json
}

$releaseGateEvidenceIssues = New-Object System.Collections.Generic.List[string]
if (-not $canonicalRuntimeIdleCpuEvidence) {
    $releaseGateEvidenceIssues.Add("missing_runtime_idle_cpu_evidence") | Out-Null
}
if (-not $canonicalRuntimeCpuScenarioMatrix) {
    $releaseGateEvidenceIssues.Add("missing_runtime_cpu_scenario_matrix") | Out-Null
}
if (-not $canonicalProcessAttributionSummary) {
    $releaseGateEvidenceIssues.Add("missing_process_attribution_summary") | Out-Null
}
if (-not $canonicalReleaseCheck) {
    $releaseGateEvidenceIssues.Add("missing_second_pc_release_check") | Out-Null
}
else {
    if (-not $releaseCheck.PSObject.Properties["runtime_idle_cpu_ok"]) {
        $releaseGateEvidenceIssues.Add("release_check_runtime_idle_cpu_ok_missing") | Out-Null
    }
    elseif (-not [bool]$releaseCheck.runtime_idle_cpu_ok) {
        $releaseGateEvidenceIssues.Add("release_check_runtime_idle_cpu_not_ok") | Out-Null
    }
    if (-not $releaseCheck.PSObject.Properties["runtime_cpu_scenario_matrix_verified"]) {
        $releaseGateEvidenceIssues.Add("release_check_runtime_cpu_scenario_matrix_verified_missing") | Out-Null
    }
    elseif (-not [bool]$releaseCheck.runtime_cpu_scenario_matrix_verified) {
        $releaseGateEvidenceIssues.Add("release_check_runtime_cpu_scenario_matrix_not_verified") | Out-Null
    }
    if (-not $releaseCheck.PSObject.Properties["process_attribution_ok"]) {
        $releaseGateEvidenceIssues.Add("release_check_process_attribution_ok_missing") | Out-Null
    }
    elseif (-not [bool]$releaseCheck.process_attribution_ok) {
        $releaseGateEvidenceIssues.Add("release_check_process_attribution_not_ok") | Out-Null
    }
    if (-not $releaseCheck.PSObject.Properties["return_zip_ok"]) {
        $releaseGateEvidenceIssues.Add("release_check_return_zip_ok_missing") | Out-Null
    }
    elseif (-not [bool]$releaseCheck.return_zip_ok) {
        $releaseGateEvidenceIssues.Add("release_check_return_zip_not_ok") | Out-Null
    }
}
$releaseGateEvidenceOk = ($releaseGateEvidenceIssues.Count -eq 0)

$result = [pscustomobject]@{
    schema = "musu.second_pc_return_import.v1"
    ok = (-not $RequireReleaseGateEvidence -or $releaseGateEvidenceOk)
    version = $ExpectedVersion
    imported_at = (Get-Date).ToString("o")
    return_zip_path = $resolvedReturnZip
    extract_root = $extractRoot
    msix_install_evidence_path = $canonicalMsixEvidence
    handoff_path = $canonicalHandoff
    runtime_idle_cpu_evidence_path = $canonicalRuntimeIdleCpuEvidence
    runtime_cpu_scenario_matrix_path = $canonicalRuntimeCpuScenarioMatrix
    process_attribution_summary_path = $canonicalProcessAttributionSummary
    release_check_path = $canonicalReleaseCheck
    remote_name = [string]$returnCard.remote_name
    remote_addr = [string]$returnCard.remote_addr
    suggested_remote_addrs = $returnCard.suggested_remote_addrs
    msix_install_verification = $verifyMsix
    msix_install_recorded = ($null -ne $recordMsixResult)
    msix_install_record = $recordMsixResult
    release_gate_evidence_required = [bool]$RequireReleaseGateEvidence
    release_gate_evidence_ok = [bool]$releaseGateEvidenceOk
    release_gate_evidence_issues = @($releaseGateEvidenceIssues)
    commands = $returnCard.commands
}

if ($Json) {
    $result | ConvertTo-Json -Depth 10
}
else {
    "MUSU second-PC return import"
    "ok: $($result.ok)"
    "return_zip: $($result.return_zip_path)"
    "msix_install_evidence: $($result.msix_install_evidence_path)"
    "handoff: $($result.handoff_path)"
    "runtime_idle_cpu_evidence: $(if ($result.runtime_idle_cpu_evidence_path) { $result.runtime_idle_cpu_evidence_path } else { '<not present>' })"
    "runtime_cpu_scenario_matrix: $(if ($result.runtime_cpu_scenario_matrix_path) { $result.runtime_cpu_scenario_matrix_path } else { '<not present>' })"
    "process_attribution_summary: $(if ($result.process_attribution_summary_path) { $result.process_attribution_summary_path } else { '<not present>' })"
    "release_check: $(if ($result.release_check_path) { $result.release_check_path } else { '<not present>' })"
    "remote_name: $($result.remote_name)"
    "remote_addr: $($result.remote_addr)"
    "msix_install_recorded: $($result.msix_install_recorded)"
    ""
    "Primary repo commands"
    $result.commands.PSObject.Properties | ForEach-Object {
        "[$($_.Name)] $($_.Value)"
    }
    if ($result.release_gate_evidence_issues.Count -gt 0) {
        ""
        "release_gate_evidence_issues:"
        foreach ($issue in @($result.release_gate_evidence_issues)) {
            "  - $issue"
        }
    }
}

if ($RequireReleaseGateEvidence -and -not $releaseGateEvidenceOk) {
    exit 1
}
