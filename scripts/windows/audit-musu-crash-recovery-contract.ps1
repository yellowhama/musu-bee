[CmdletBinding()]
param(
    [switch]$Json,
    [switch]$FailOnProblem
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
$version = (Get-Content -LiteralPath (Join-Path $repoRoot "VERSION") -Raw).Trim()
$gitCommit = (& git -C $repoRoot rev-parse HEAD 2>$null | Out-String).Trim()

$checks = New-Object System.Collections.Generic.List[object]

function Add-Check {
    param(
        [Parameter(Mandatory = $true)][string]$Scope,
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][bool]$Passed,
        [Parameter(Mandatory = $true)][string]$Message,
        [string]$Path = ""
    )

    $checks.Add([pscustomobject]@{
        scope = $Scope
        name = $Name
        status = if ($Passed) { "pass" } else { "fail" }
        path = $Path
        message = $Message
    }) | Out-Null
}

function Get-RepoText {
    param([Parameter(Mandatory = $true)][string]$RelativePath)

    $path = Join-Path $repoRoot $RelativePath
    if (-not (Test-Path -LiteralPath $path)) {
        Add-Check -Scope "file" -Name "exists: $RelativePath" -Passed $false -Path $RelativePath -Message "$RelativePath is missing."
        return ""
    }

    Add-Check -Scope "file" -Name "exists: $RelativePath" -Passed $true -Path $RelativePath -Message "$RelativePath exists."
    return Get-Content -LiteralPath $path -Raw
}

function Test-ContainsAll {
    param(
        [Parameter(Mandatory = $true)][string]$Text,
        [Parameter(Mandatory = $true)][string[]]$Needles
    )

    return @($Needles | Where-Object { -not $Text.Contains($_) }).Count -eq 0
}

$cliCommandsPath = "musu-rs\src\install\cli_commands.rs"
$servicesPath = "musu-rs\src\bridge\services.rs"
$startupAuditPath = "scripts\windows\audit-musu-startup-single-instance.ps1"
$processOwnershipAuditPath = "scripts\windows\audit-musu-process-ownership.ps1"
$goNoGoPath = "scripts\windows\write-release-go-no-go.ps1"
$handoffStatusPath = "scripts\windows\show-final-release-handoff-status.ps1"
$packetPreparePath = "scripts\windows\prepare-final-operator-gate-packet.ps1"
$packetVerifyPath = "scripts\windows\verify-final-operator-gate-packet.ps1"
$releaseVerifierTestPath = "scripts\windows\test-release-evidence-verifiers.ps1"

$cliCommands = Get-RepoText $cliCommandsPath
$services = Get-RepoText $servicesPath
$startupAudit = Get-RepoText $startupAuditPath
$processOwnershipAudit = Get-RepoText $processOwnershipAuditPath
$goNoGo = Get-RepoText $goNoGoPath
$handoffStatus = Get-RepoText $handoffStatusPath
$packetPrepare = Get-RepoText $packetPreparePath
$packetVerify = Get-RepoText $packetVerifyPath
$releaseVerifierTest = Get-RepoText $releaseVerifierTestPath

Add-Check `
    -Scope "cli-up" `
    -Name "musu up removes stale bridge registry before probing" `
    -Passed (Test-ContainsAll -Text $cliCommands -Needles @(
        "pub async fn run_up(opts: UpOpts) -> Result<()>",
        'ServiceRegistry::with_dir(home.join("services"))',
        "stale_bridge_registry_pid",
        "let alive = crate::bridge::services::is_pid_alive(*pid);",
        "if !alive {",
        "!alive",
        "registry.cleanup_stale();",
        "stale_bridge_registry_removed",
        'registry.discover("bridge").is_none()'
    )) `
    -Path $cliCommandsPath `
    -Message "musu up must remove a dead bridge registry record before check_bridge can reuse stale address/PID data."

Add-Check `
    -Scope "cli-up" `
    -Name "musu up reports stale bridge cleanup evidence" `
    -Passed (Test-ContainsAll -Text $cliCommands -Needles @(
        "stale_bridge_registry_removed: bool",
        "stale_bridge_registry_pid: Option<u32>",
        "removed stale bridge registry pid"
    )) `
    -Path $cliCommandsPath `
    -Message "musu up JSON/text output must expose stale bridge registry cleanup for operator evidence."

Add-Check `
    -Scope "cli-down" `
    -Name "musu down clears dead bridge registry" `
    -Passed (Test-ContainsAll -Text $cliCommands -Needles @(
        "pub async fn run_stop(opts: StopOpts) -> Result<()>",
        "pid_alive_before = crate::bridge::services::is_pid_alive(pid);",
        'registry.deregister("bridge")?;',
        "registry_deregistered = true;",
        'next_steps.push("Removed stale bridge registry record.".into());'
    )) `
    -Path $cliCommandsPath `
    -Message "musu down must remove dead bridge registry records instead of treating a stale PID as a live runtime."

Add-Check `
    -Scope "service-registry" `
    -Name "registry cleanup removes dead pids" `
    -Passed (Test-ContainsAll -Text $services -Needles @(
        "pub fn cleanup_stale(&self)",
        "Services that crash without cleaning up leave stale JSON behind.",
        "if !is_pid_alive(pid)",
        "removing stale service record (pid dead)",
        "let _ = self.deregister(&rec.name);"
    )) `
    -Path $servicesPath `
    -Message "ServiceRegistry cleanup_stale must continue to remove stale JSON records whose PID is dead."

Add-Check `
    -Scope "service-registry-tests" `
    -Name "registry stale cleanup unit test exists" `
    -Passed (Test-ContainsAll -Text $services -Needles @(
        "fn cleanup_stale_removes_dead_pids()",
        "rec.pid = Some(4_000_000_000);",
        "reg.cleanup_stale();",
        "stale record should have been removed"
    )) `
    -Path $servicesPath `
    -Message "Rust unit tests must keep stale registry removal locked."

Add-Check `
    -Scope "startup-audit" `
    -Name "startup audit proves repeated up is single instance" `
    -Passed (Test-ContainsAll -Text $startupAudit -Needles @(
        "musu.startup_single_instance_audit.v1",
        '"up", "--json"',
        '"stable bridge pid"',
        '"no repeated bridge spawn"',
        "audit-musu-process-ownership.ps1"
    )) `
    -Path $startupAuditPath `
    -Message "Repeated startup evidence must prove musu up reuses one bridge PID and re-runs process ownership."

Add-Check `
    -Scope "process-ownership" `
    -Name "process ownership rejects stale bridge registry" `
    -Passed (Test-ContainsAll -Text $processOwnershipAudit -Needles @(
        "musu.process_ownership_audit.v1",
        '"bridge registry pid alive"',
        '"bridge registry PID belongs to the packaged WindowsApps runtime"',
        'health = $bridgeHealth',
        "bridge /health is reachable"
    )) `
    -Path $processOwnershipAuditPath `
    -Message "Process ownership audit must fail if the bridge registry PID is missing, dead, or not a live MUSU runtime."

Add-Check `
    -Scope "go-no-go" `
    -Name "go/no-go blocks on crash recovery contract" `
    -Passed (Test-ContainsAll -Text $goNoGo -Needles @(
        "audit-musu-crash-recovery-contract.ps1",
        '$crashRecoveryContractVerified',
        "crash_recovery_contract_verified",
        "crash_recovery_contract_audit",
        "crash-recovery",
        "musu.crash_recovery_contract.v1",
        "stale bridge registry"
    )) `
    -Path $goNoGoPath `
    -Message "Final go/no-go must expose and block on stale bridge registry crash-recovery contract failures."

Add-Check `
    -Scope "handoff-status" `
    -Name "handoff status exposes crash recovery step" `
    -Passed (Test-ContainsAll -Text $handoffStatus -Needles @(
        "audit-musu-crash-recovery-contract.ps1",
        "crash_recovery_contract_verified",
        "crash-recovery",
        "stale bridge registry"
    )) `
    -Path $handoffStatusPath `
    -Message "Final handoff status must show the crash-recovery gate and rerun command."

Add-Check `
    -Scope "operator-packet" `
    -Name "operator packet carries crash recovery audit" `
    -Passed (Test-ContainsAll -Text $packetPrepare -Needles @(
        "audit-musu-crash-recovery-contract.ps1",
        "musu.crash_recovery_contract.v1",
        "crash_recovery_contract_verified=true",
        "stale service registry"
    )) `
    -Path $packetPreparePath `
    -Message "Final operator packet must include instructions and script copy coverage for the crash-recovery audit."

Add-Check `
    -Scope "operator-packet-verifier" `
    -Name "operator packet verifier checks crash recovery audit" `
    -Passed (Test-ContainsAll -Text $packetVerify -Needles @(
        "audit-musu-crash-recovery-contract.ps1",
        "musu.crash_recovery_contract.v1",
        "crash_recovery_contract_verified=true",
        "stale_bridge_registry_removed",
        "go no-go crash recovery contract gate"
    )) `
    -Path $packetVerifyPath `
    -Message "Final operator packet verifier must fail closed if crash-recovery audit wiring is missing."

Add-Check `
    -Scope "release-verifier-tests" `
    -Name "release verifier tests cover crash recovery gate" `
    -Passed (Test-ContainsAll -Text $releaseVerifierTest -Needles @(
        "Test-CrashRecoveryAuditSourceContract",
        "Test-CrashRecoveryGoNoGoContract",
        "crash recovery audit covers stale bridge registry cleanup",
        "go-no-go blocks on crash recovery contract"
    )) `
    -Path $releaseVerifierTestPath `
    -Message "Release evidence verifier tests must lock the crash-recovery source audit and go/no-go gate."

$failCount = @($checks | Where-Object { $_.status -eq "fail" }).Count
$result = [pscustomobject]@{
    schema = "musu.crash_recovery_contract.v1"
    ok = ($failCount -eq 0)
    version = $version
    git_commit = $gitCommit
    recorded_at = (Get-Date).ToString("o")
    repo_root = $repoRoot
    fail_count = $failCount
    checks = $checks.ToArray()
}

if ($Json) {
    $result | ConvertTo-Json -Depth 8
}
else {
    $result
}

if ($FailOnProblem -and -not [bool]$result.ok) {
    exit 1
}
