[CmdletBinding()]
param(
    [ValidateSet("local-sideload-manual", "store-reviewed-immediate-registration")]
    [string]$StartupContract = "local-sideload-manual",
    [switch]$MachineTrust,
    [switch]$ReplaceExisting = $true,
    [string]$OutputRoot,
    [int]$CommandTimeoutSec = 90,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $scriptDir "msix-common.ps1")

$repoRoot = Get-WindowsRepoRoot $MyInvocation.MyCommand.Path
$versionPath = Join-Path $repoRoot "VERSION"
$version = if (Test-Path -LiteralPath $versionPath) {
    (Get-Content -LiteralPath $versionPath -Raw).Trim()
}
else {
    "unknown"
}

if ([string]::IsNullOrWhiteSpace($OutputRoot)) {
    $OutputRoot = Join-Path $repoRoot ".local-build\second-pc-release-check"
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$machine = if ([string]::IsNullOrWhiteSpace($env:COMPUTERNAME)) { "machine" } else { $env:COMPUTERNAME }
$safeMachine = $machine -replace "[^A-Za-z0-9._-]", "_"
$summaryPath = Join-Path $OutputRoot "$stamp-$safeMachine.release-check.json"
$msixEvidencePath = Join-Path $repoRoot ".local-build\msix-install\$stamp-$safeMachine.evidence.json"
$handoffPath = Join-Path $repoRoot ".local-build\second-pc-handoff\$stamp-$safeMachine.handoff.json"

$steps = New-Object System.Collections.Generic.List[object]
$errorText = $null
$capture = $null
$handoff = $null

function Invoke-ReleaseStep {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$ScriptName,
        [string[]]$Arguments = @(),
        [switch]$ParseJson
    )

    $scriptPath = Join-Path $scriptDir $ScriptName
    if (-not (Test-Path -LiteralPath $scriptPath)) {
        throw "Required script is missing: $scriptPath"
    }

    $startedAt = Get-Date
    $output = & powershell -NoProfile -ExecutionPolicy Bypass -File $scriptPath @Arguments 2>&1
    $exitCode = $LASTEXITCODE
    $raw = ($output | Out-String).Trim()
    $parsed = $null

    if ($ParseJson -and -not [string]::IsNullOrWhiteSpace($raw)) {
        try {
            $parsed = $raw | ConvertFrom-Json
        }
        catch {
            throw "$Name did not return parseable JSON.`n$raw"
        }
    }

    $steps.Add([pscustomobject]@{
        name = $Name
        script = $ScriptName
        exit_code = $exitCode
        started_at = $startedAt.ToString("o")
        completed_at = (Get-Date).ToString("o")
        output = $raw
    }) | Out-Null

    if ($exitCode -ne 0) {
        throw "$Name failed with exit code ${exitCode}.`n$raw"
    }

    return $parsed
}

try {
    New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null

    Invoke-ReleaseStep `
        -Name "sideload readiness" `
        -ScriptName "check-msix-sideload-readiness.ps1" `
        -Arguments @("-StartupContract", $StartupContract) | Out-Null

    $installArgs = @("-StartupContract", $StartupContract)
    if ($ReplaceExisting) {
        $installArgs += "-ReplaceExisting"
    }
    if ($MachineTrust) {
        $installArgs += "-MachineTrust"
    }
    Invoke-ReleaseStep `
        -Name "install and verify MSIX" `
        -ScriptName "install-and-verify-msix.ps1" `
        -Arguments $installArgs | Out-Null

    $capture = Invoke-ReleaseStep `
        -Name "capture MSIX install evidence" `
        -ScriptName "capture-msix-install-evidence.ps1" `
        -Arguments @("-StartupContract", $StartupContract, "-EvidencePath", $msixEvidencePath, "-Json") `
        -ParseJson

    $handoff = Invoke-ReleaseStep `
        -Name "collect second-PC handoff" `
        -ScriptName "collect-second-pc-handoff.ps1" `
        -Arguments @("-OutputPath", $handoffPath, "-CommandTimeoutSec", ([string]$CommandTimeoutSec), "-Json") `
        -ParseJson
}
catch {
    $errorText = $_.Exception.Message
}

$result = [pscustomobject]@{
    schema = "musu.second_pc_release_check.v1"
    ok = [string]::IsNullOrWhiteSpace($errorText)
    version = $version
    startup_contract = $StartupContract
    completed_at = (Get-Date).ToString("o")
    operator_machine = $env:COMPUTERNAME
    operator_user = $env:USERNAME
    msix_install_evidence_path = $msixEvidencePath
    second_pc_handoff_path = $handoffPath
    suggested_remote_addrs = if ($handoff) { $handoff.suggested_remote_addrs } else { @() }
    remote_name_suggestion = if ($handoff) { [string]$handoff.remote_name_suggestion } else { $env:COMPUTERNAME }
    capture_ok = if ($capture) { [bool]$capture.ok } else { $false }
    handoff_ok = if ($handoff) { [bool]$handoff.ok } else { $false }
    return_files = @(
        $msixEvidencePath,
        $handoffPath,
        $summaryPath
    )
    steps = $steps.ToArray()
    error = $errorText
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $summaryPath) | Out-Null
$result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $summaryPath -Encoding UTF8

if ($Json) {
    $result | ConvertTo-Json -Depth 8
}
else {
    "MUSU second-PC release check"
    "ok: $($result.ok)"
    "summary_path: $((Resolve-Path -LiteralPath $summaryPath).Path)"
    "msix_install_evidence_path: $($result.msix_install_evidence_path)"
    "second_pc_handoff_path: $($result.second_pc_handoff_path)"
    "remote_name_suggestion: $($result.remote_name_suggestion)"
    "suggested_remote_addrs:"
    foreach ($addr in @($result.suggested_remote_addrs)) {
        "  - $addr"
    }
    ""
    "Return these files to the primary release repo:"
    foreach ($file in @($result.return_files)) {
        "  - $file"
    }
    if (-not $result.ok) {
        ""
        "error: $($result.error)"
    }
}

if (-not $result.ok) {
    exit 1
}
