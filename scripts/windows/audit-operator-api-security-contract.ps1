[CmdletBinding()]
param(
    [switch]$Json,
    [switch]$FailOnProblem
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path

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

$securityHelper = Get-RepoText "musu-bee\src\lib\operator-api-security.ts"
$nodesExecute = Get-RepoText "musu-bee\src\app\api\nodes\execute\route.ts"
$processesList = Get-RepoText "musu-bee\src\app\api\processes\route.ts"
$processStart = Get-RepoText "musu-bee\src\app\api\processes\start\route.ts"
$processKill = Get-RepoText "musu-bee\src\app\api\processes\kill\route.ts"
$packageJson = Get-RepoText "musu-bee\package.json"
$workflow = Get-RepoText ".github\workflows\test.yml"
$config = Get-RepoText "docs\CONFIG.md"

Add-Check -Scope "source" -Name "operator auth helper" `
    -Passed ($securityHelper.Contains("requireOperator") -and $securityHelper.Contains("getUserFromRequest") -and $securityHelper.Contains('"Not authenticated"')) `
    -Path "musu-bee\src\lib\operator-api-security.ts" `
    -Message "Operator API helper requires authenticated Supabase operator identity."

Add-Check -Scope "source" -Name "node execute allowlist" `
    -Passed ($securityHelper.Contains("MUSU_NODE_EXECUTE_ALLOWLIST") -and $securityHelper.Contains("isAllowedNodeExecuteCommand") -and $nodesExecute.Contains("isAllowedNodeExecuteCommand") -and $nodesExecute.Contains("appendControlAudit")) `
    -Path "musu-bee\src\app\api\nodes\execute\route.ts" `
    -Message "Node execute route is auth-gated, allowlisted, and audit-logged."

Add-Check -Scope "source" -Name "process list auth and target guard" `
    -Passed ($processesList.Contains("requireOperator") -and $processesList.Contains("resolveWorkerTarget") -and $securityHelper.Contains("MUSU_ENABLE_REMOTE_WORKER_PROXY")) `
    -Path "musu-bee\src\app\api\processes\route.ts" `
    -Message "Process list route requires auth and rejects remote worker proxy unless explicitly enabled."

Add-Check -Scope "source" -Name "process start fail-closed allowlist" `
    -Passed ($processStart.Contains("isAllowedProcessStartCommand") -and $securityHelper.Contains("MUSU_PROCESS_START_ALLOWLIST") -and $processStart.Contains("env: {}") -and $processStart.Contains("appendControlAudit")) `
    -Path "musu-bee\src\app\api\processes\start\route.ts" `
    -Message "Process start route requires auth, command allowlist, no user env forwarding, and audit logging."

Add-Check -Scope "source" -Name "process kill explicit enable flag" `
    -Passed ($processKill.Contains('MUSU_ENABLE_PROCESS_KILL') -and $processKill.Contains("appendControlAudit") -and $processKill.Contains("requireOperator")) `
    -Path "musu-bee\src\app\api\processes\kill\route.ts" `
    -Message "Process kill route requires auth, explicit env opt-in, and audit logging."

Add-Check -Scope "tests" -Name "route security test script" `
    -Passed ($packageJson.Contains('"test:routes"') -and $packageJson.Contains("src/app/api/nodes/execute/route.test.ts") -and $packageJson.Contains("src/app/api/processes/start/route.test.ts") -and $packageJson.Contains("src/app/api/processes/kill/route.test.ts")) `
    -Path "musu-bee\package.json" `
    -Message "npm test:routes covers operator API security routes."

Add-Check -Scope "tests" -Name "CI route security step" `
    -Passed ($workflow.Contains("Route security tests") -and $workflow.Contains("npm run test:routes")) `
    -Path ".github\workflows\test.yml" `
    -Message "GitHub Actions runs route security tests in the web job."

Add-Check -Scope "docs" -Name "operator API security env documented" `
    -Passed ($config.Contains("MUSU_NODE_EXECUTE_ALLOWLIST") -and $config.Contains("MUSU_PROCESS_START_ALLOWLIST") -and $config.Contains("MUSU_ENABLE_PROCESS_KILL") -and $config.Contains("MUSU_ENABLE_REMOTE_WORKER_PROXY")) `
    -Path "docs\CONFIG.md" `
    -Message "Operator API security env flags and allowlists are documented."

$failCount = @($checks | Where-Object { $_.status -eq "fail" }).Count
$result = [pscustomobject]@{
    schema = "musu.operator_api_security_contract.v1"
    ok = ($failCount -eq 0)
    generated_at = [datetimeoffset]::Now.ToString("o")
    fail_count = $failCount
    checks = $checks.ToArray()
}

if ($Json) {
    $result | ConvertTo-Json -Depth 8
}
else {
    "MUSU operator API security contract audit"
    "ok: $($result.ok)"
    "fail_count: $($result.fail_count)"
    ""
    $checks | Format-Table scope, name, status, path, message -Wrap
}

if ($FailOnProblem -and -not $result.ok) {
    exit 1
}
