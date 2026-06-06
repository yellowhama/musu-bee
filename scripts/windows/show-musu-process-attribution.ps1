[CmdletBinding()]
param(
    [string]$EvidencePath,
    [string]$OutputPath,
    [int]$TopProcessCount = 12,
    [switch]$Json,
    [switch]$FailOnProblem
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$auditScript = Join-Path $scriptDir "audit-musu-process-ownership.ps1"
if (-not (Test-Path -LiteralPath $auditScript)) {
    throw "Process ownership audit script not found: $auditScript"
}

$auditArgs = @("-Json")
if (-not [string]::IsNullOrWhiteSpace($EvidencePath)) {
    $auditArgs += @("-OutputPath", $EvidencePath)
}

$auditText = (& powershell -NoProfile -ExecutionPolicy Bypass -File $auditScript @auditArgs 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0) {
    throw "Process ownership audit failed.`n$auditText"
}

$audit = $auditText | ConvertFrom-Json
$processes = @($audit.processes)
$musuCliCount = if ($audit.process_counts.PSObject.Properties["musu_cli"]) {
    [int]$audit.process_counts.musu_cli
}
else {
    0
}
$nodeProcesses = @($processes | Where-Object { $_.role -eq "node_helper" })
$webView2Processes = @($processes | Where-Object { $_.role -eq "webview2_helper" })
$ownedNodeProcesses = @($nodeProcesses | Where-Object { [bool]$_.owned_by_musu })
$ownedWebView2Processes = @($webView2Processes | Where-Object { [bool]$_.owned_by_musu })
$unownedNodeProcesses = @($nodeProcesses | Where-Object { -not [bool]$_.owned_by_musu })
$unownedWebView2Processes = @($webView2Processes | Where-Object { -not [bool]$_.owned_by_musu })
$repoOrphanHelpers = @($processes | Where-Object {
    -not [bool]$_.owned_by_musu -and
    [bool]$_.repo_related -and
    ($_.role -eq "node_helper" -or $_.role -eq "webview2_helper")
})

function Select-DisplayProcess {
    param([object[]]$Items)

    @($Items |
        Sort-Object @{ Expression = { if ($null -ne $_.cpu_seconds) { [double]$_.cpu_seconds } else { 0.0 } }; Descending = $true },
            @{ Expression = { if ($null -ne $_.working_set_mb) { [double]$_.working_set_mb } else { 0.0 } }; Descending = $true } |
        Select-Object -First $TopProcessCount |
        ForEach-Object {
            [pscustomobject]@{
                pid = $_.pid
                process_name = $_.process_name
                parent_pid = $_.parent_pid
                owned_by_musu = [bool]$_.owned_by_musu
                repo_related = [bool]$_.repo_related
                cpu_seconds = $_.cpu_seconds
                working_set_mb = $_.working_set_mb
                start_time = $_.start_time
                path = $_.path
            }
        })
}

$findings = New-Object System.Collections.Generic.List[string]
if ($ownedNodeProcesses.Count -eq 0 -and $nodeProcesses.Count -gt 0) {
    $findings.Add("Machine-wide node.exe processes are present, but none are owned by the live MUSU process tree.") | Out-Null
}
elseif ($ownedNodeProcesses.Count -gt 0) {
    $findings.Add("$($ownedNodeProcesses.Count) node.exe process(es) are owned by MUSU.") | Out-Null
}
else {
    $findings.Add("No node.exe processes were found in the target process set.") | Out-Null
}

if ($ownedWebView2Processes.Count -gt 0) {
    $findings.Add("$($ownedWebView2Processes.Count) WebView2 helper process(es) are owned by MUSU.") | Out-Null
}
if ($musuCliCount -gt 0) {
    $findings.Add("$musuCliCount transient MUSU CLI process(es) were excluded from the bridge-runtime ownership count.") | Out-Null
}
if ($repoOrphanHelpers.Count -gt 0) {
    $findings.Add("$($repoOrphanHelpers.Count) repo-related Node/WebView2 helper process(es) are not owned by a live MUSU root.") | Out-Null
}
if ([bool]$audit.ok) {
    $findings.Add("Process ownership release checks pass.") | Out-Null
}
else {
    $findings.Add("Process ownership release checks fail; inspect checks for details.") | Out-Null
}

$result = [pscustomobject]@{
    schema = "musu.process_attribution_summary.v1"
    ok = [bool]$audit.ok
    generated_at = (Get-Date).ToString("o")
    summary_path = if ([string]::IsNullOrWhiteSpace($OutputPath)) { $null } else { [System.IO.Path]::GetFullPath($OutputPath) }
    audit_evidence_path = [string]$audit.evidence_path
    operator_machine = [string]$audit.operator_machine
    bridge_registry = $audit.bridge_registry
    counts = [pscustomobject]@{
        musu_runtime = [int]$audit.process_counts.musu_runtime
        musu_cli = $musuCliCount
        desktop_shell = [int]$audit.process_counts.desktop_shell
        machine_wide_node = $nodeProcesses.Count
        owned_node = $ownedNodeProcesses.Count
        unowned_node = $unownedNodeProcesses.Count
        machine_wide_webview2 = $webView2Processes.Count
        owned_webview2 = $ownedWebView2Processes.Count
        unowned_webview2 = $unownedWebView2Processes.Count
        orphan_repo_helpers = $repoOrphanHelpers.Count
    }
    findings = $findings.ToArray()
    checks = $audit.checks
    top_node_processes = Select-DisplayProcess -Items $nodeProcesses
    top_webview2_processes = Select-DisplayProcess -Items $webView2Processes
}

if (-not [string]::IsNullOrWhiteSpace($OutputPath)) {
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutputPath) | Out-Null
    $result | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $OutputPath -Encoding UTF8
}

if ($Json) {
    $result | ConvertTo-Json -Depth 10
}
else {
    "MUSU process attribution"
    "ok: $($result.ok)"
    "machine: $($result.operator_machine)"
    if ($result.summary_path) {
        "summary_path: $($result.summary_path)"
    }
    "audit_evidence: $($result.audit_evidence_path)"
    "musu_runtime: $($result.counts.musu_runtime)"
    "musu_cli: $($result.counts.musu_cli)"
    "desktop_shell: $($result.counts.desktop_shell)"
    "node.exe: machine-wide=$($result.counts.machine_wide_node), owned_by_musu=$($result.counts.owned_node), unowned=$($result.counts.unowned_node)"
    "WebView2: machine-wide=$($result.counts.machine_wide_webview2), owned_by_musu=$($result.counts.owned_webview2), unowned=$($result.counts.unowned_webview2)"
    "orphan_repo_helpers: $($result.counts.orphan_repo_helpers)"
    ""
    "Findings"
    foreach ($finding in $result.findings) {
        "- $finding"
    }
    ""
    "Top node.exe processes"
    $result.top_node_processes | Format-Table -AutoSize pid, parent_pid, owned_by_musu, repo_related, cpu_seconds, working_set_mb, path
    ""
    "Top WebView2 processes"
    $result.top_webview2_processes | Format-Table -AutoSize pid, parent_pid, owned_by_musu, repo_related, cpu_seconds, working_set_mb, path
}

if ($FailOnProblem -and -not [bool]$result.ok) {
    exit 1
}
