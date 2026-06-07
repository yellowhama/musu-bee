[CmdletBinding()]
param(
    [string]$EvidencePath,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path

if ([string]::IsNullOrWhiteSpace($EvidencePath)) {
    $defaultRoot = Join-Path $repoRoot ".local-build\process-attribution"
    $latest = Get-ChildItem -LiteralPath $defaultRoot -Filter "*.json" -File -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTimeUtc -Descending |
        Select-Object -First 1
    if (-not $latest) {
        throw "EvidencePath was not provided and no .local-build\\process-attribution\\*.json file exists."
    }
    $EvidencePath = $latest.FullName
}

if (-not (Test-Path -LiteralPath $EvidencePath)) {
    throw "Process attribution summary not found: $EvidencePath"
}

function New-Check {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Status,
        [Parameter(Mandatory = $true)][string]$Message
    )

    [pscustomobject]@{
        name = $Name
        status = $Status
        message = $Message
    }
}

function Test-ObjectHasPropertyNames {
    param(
        $Object,
        [Parameter(Mandatory = $true)][string[]]$Names
    )

    if ($null -eq $Object) {
        return $false
    }

    foreach ($name in $Names) {
        if (-not $Object.PSObject.Properties[$name]) {
            return $false
        }
    }
    return $true
}

$resolvedEvidencePath = (Resolve-Path -LiteralPath $EvidencePath).Path
$checks = New-Object System.Collections.Generic.List[object]
$summary = $null

try {
    $summary = Get-Content -LiteralPath $resolvedEvidencePath -Raw | ConvertFrom-Json
    $checks.Add((New-Check -Name "parse" -Status "pass" -Message "process attribution summary parses")) | Out-Null
}
catch {
    $checks.Add((New-Check -Name "parse" -Status "fail" -Message "process attribution summary does not parse: $($_.Exception.Message)")) | Out-Null
}

if ($summary) {
    $schema = [string]$summary.schema
    $checks.Add((New-Check -Name "schema" -Status ($(if ($schema -eq "musu.process_attribution_summary.v1") { "pass" } else { "fail" })) -Message ($(if ($schema -eq "musu.process_attribution_summary.v1") { "schema is valid" } else { "schema is '$schema'" })))) | Out-Null

    $summaryOk = [bool]$summary.ok
    $checks.Add((New-Check -Name "summary ok" -Status ($(if ($summaryOk) { "pass" } else { "fail" })) -Message ($(if ($summaryOk) { "summary reports ok=true" } else { "summary reports ok=false" })))) | Out-Null

    $generatedAtOk = $false
    if ($summary.PSObject.Properties["generated_at"]) {
        try {
            [void][datetimeoffset]::Parse([string]$summary.generated_at)
            $generatedAtOk = $true
        }
        catch {
            $generatedAtOk = $false
        }
    }
    $checks.Add((New-Check -Name "generated timestamp" -Status ($(if ($generatedAtOk) { "pass" } else { "fail" })) -Message ($(if ($generatedAtOk) { "generated_at parses" } else { "generated_at is missing or invalid" })))) | Out-Null

    $auditEvidencePath = if ($summary.PSObject.Properties["audit_evidence_path"]) { [string]$summary.audit_evidence_path } else { "" }
    $checks.Add((New-Check -Name "audit evidence path" -Status ($(if (-not [string]::IsNullOrWhiteSpace($auditEvidencePath)) { "pass" } else { "fail" })) -Message ($(if (-not [string]::IsNullOrWhiteSpace($auditEvidencePath)) { "audit_evidence_path is present" } else { "audit_evidence_path is missing" })))) | Out-Null

    $operatorMachine = if ($summary.PSObject.Properties["operator_machine"]) { [string]$summary.operator_machine } else { "" }
    $checks.Add((New-Check -Name "operator machine" -Status ($(if (-not [string]::IsNullOrWhiteSpace($operatorMachine)) { "pass" } else { "fail" })) -Message ($(if (-not [string]::IsNullOrWhiteSpace($operatorMachine)) { "operator_machine is present" } else { "operator_machine is missing" })))) | Out-Null

    $bridgeRegistry = if ($summary.PSObject.Properties["bridge_registry"]) { $summary.bridge_registry } else { $null }
    $bridgeRegistryPresent = ($null -ne $bridgeRegistry)
    $checks.Add((New-Check -Name "bridge registry" -Status ($(if ($bridgeRegistryPresent) { "pass" } else { "fail" })) -Message ($(if ($bridgeRegistryPresent) { "bridge_registry is present" } else { "bridge_registry is missing" })))) | Out-Null

    $bridgePidAlive = ($bridgeRegistryPresent -and $bridgeRegistry.PSObject.Properties["pid_alive"] -and [bool]$bridgeRegistry.pid_alive)
    $checks.Add((New-Check -Name "bridge registry pid alive" -Status ($(if ($bridgePidAlive) { "pass" } else { "fail" })) -Message ($(if ($bridgePidAlive) { "bridge registry pid is alive" } else { "bridge registry pid is missing or dead" })))) | Out-Null

    $bridgeHealthOk = ($bridgeRegistryPresent -and $bridgeRegistry.PSObject.Properties["health"] -and $bridgeRegistry.health -and $bridgeRegistry.health.PSObject.Properties["ok"] -and [bool]$bridgeRegistry.health.ok)
    $checks.Add((New-Check -Name "bridge health" -Status ($(if ($bridgeHealthOk) { "pass" } else { "fail" })) -Message ($(if ($bridgeHealthOk) { "bridge /health passed" } else { "bridge /health did not pass" })))) | Out-Null

    $requiredCountNames = @(
        "musu_runtime",
        "musu_cli",
        "desktop_shell",
        "machine_wide_node",
        "owned_node",
        "unowned_node",
        "machine_wide_webview2",
        "owned_webview2",
        "unowned_webview2",
        "orphan_repo_helpers"
    )
    $counts = if ($summary.PSObject.Properties["counts"]) { $summary.counts } else { $null }
    $countsPresent = Test-ObjectHasPropertyNames -Object $counts -Names $requiredCountNames
    $checks.Add((New-Check -Name "counts fields" -Status ($(if ($countsPresent) { "pass" } else { "fail" })) -Message ($(if ($countsPresent) { "all required count fields are present" } else { "one or more required count fields are missing" })))) | Out-Null

    $countsNonNegative = $false
    if ($countsPresent) {
        $countsNonNegative = @($requiredCountNames | Where-Object { [int]$counts.$_ -lt 0 }).Count -eq 0
    }
    $checks.Add((New-Check -Name "counts nonnegative" -Status ($(if ($countsNonNegative) { "pass" } else { "fail" })) -Message ($(if ($countsNonNegative) { "all count fields are nonnegative" } else { "one or more count fields are negative" })))) | Out-Null

    $musuRuntimeCount = if ($countsPresent) { [int]$counts.musu_runtime } else { 0 }
    $checks.Add((New-Check -Name "MUSU runtime count" -Status ($(if ($musuRuntimeCount -eq 1) { "pass" } else { "fail" })) -Message ($(if ($musuRuntimeCount -eq 1) { "exactly one MUSU runtime process was observed" } else { "$musuRuntimeCount MUSU runtime processes were observed" })))) | Out-Null

    $nodeCountConsistent = $false
    if ($countsPresent) {
        $nodeCountConsistent = ([int]$counts.machine_wide_node -eq ([int]$counts.owned_node + [int]$counts.unowned_node))
    }
    $checks.Add((New-Check -Name "node count conservation" -Status ($(if ($nodeCountConsistent) { "pass" } else { "fail" })) -Message ($(if ($nodeCountConsistent) { "machine-wide node count matches owned+unowned node counts" } else { "machine-wide node count does not match owned+unowned node counts" })))) | Out-Null

    $webView2CountConsistent = $false
    if ($countsPresent) {
        $webView2CountConsistent = ([int]$counts.machine_wide_webview2 -eq ([int]$counts.owned_webview2 + [int]$counts.unowned_webview2))
    }
    $checks.Add((New-Check -Name "WebView2 count conservation" -Status ($(if ($webView2CountConsistent) { "pass" } else { "fail" })) -Message ($(if ($webView2CountConsistent) { "machine-wide WebView2 count matches owned+unowned WebView2 counts" } else { "machine-wide WebView2 count does not match owned+unowned WebView2 counts" })))) | Out-Null

    $orphanRepoHelpers = if ($countsPresent) { [int]$counts.orphan_repo_helpers } else { 1 }
    $checks.Add((New-Check -Name "orphan repo helpers" -Status ($(if ($orphanRepoHelpers -eq 0) { "pass" } else { "fail" })) -Message ($(if ($orphanRepoHelpers -eq 0) { "no repo-related orphan helpers are present" } else { "$orphanRepoHelpers repo-related orphan helper(s) are present" })))) | Out-Null

    $nestedChecks = if ($summary.PSObject.Properties["checks"]) { @($summary.checks) } else { @() }
    $nestedChecksPresent = ($nestedChecks.Count -gt 0)
    $checks.Add((New-Check -Name "nested checks present" -Status ($(if ($nestedChecksPresent) { "pass" } else { "fail" })) -Message ($(if ($nestedChecksPresent) { "nested process ownership checks are present" } else { "nested process ownership checks are missing" })))) | Out-Null

    $nestedFailCount = if ($nestedChecksPresent) { @($nestedChecks | Where-Object { [string]$_.status -eq "fail" }).Count } else { 1 }
    $checks.Add((New-Check -Name "nested checks fail count" -Status ($(if ($nestedFailCount -eq 0) { "pass" } else { "fail" })) -Message ($(if ($nestedFailCount -eq 0) { "nested process ownership checks passed" } else { "$nestedFailCount nested process ownership check(s) failed" })))) | Out-Null

    $topNodeProcessesPresent = ($summary.PSObject.Properties["top_node_processes"] -ne $null)
    $checks.Add((New-Check -Name "top node processes present" -Status ($(if ($topNodeProcessesPresent) { "pass" } else { "fail" })) -Message ($(if ($topNodeProcessesPresent) { "top_node_processes is present" } else { "top_node_processes is missing" })))) | Out-Null

    $topWebView2ProcessesPresent = ($summary.PSObject.Properties["top_webview2_processes"] -ne $null)
    $checks.Add((New-Check -Name "top WebView2 processes present" -Status ($(if ($topWebView2ProcessesPresent) { "pass" } else { "fail" })) -Message ($(if ($topWebView2ProcessesPresent) { "top_webview2_processes is present" } else { "top_webview2_processes is missing" })))) | Out-Null
}

$failCount = @($checks | Where-Object { $_.status -eq "fail" }).Count
$result = [pscustomobject]@{
    ok = ($failCount -eq 0)
    evidence_path = $resolvedEvidencePath
    fail_count = $failCount
    operator_machine = if ($summary -and $summary.PSObject.Properties["operator_machine"]) { [string]$summary.operator_machine } else { $null }
    checks = $checks.ToArray()
}

if ($Json) {
    $result | ConvertTo-Json -Depth 8
}
else {
    $result
}

if (-not [bool]$result.ok) {
    exit 1
}
