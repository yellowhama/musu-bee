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
$roomWorkOrders = Get-RepoText "musu-bee\src\app\api\rooms\[roomId]\work-orders\route.ts"
$roomWorkOrdersTest = Get-RepoText "musu-bee\src\app\api\rooms\[roomId]\work-orders\route.test.ts"
$p2pRendezvousStore = Get-RepoText "musu-bee\src\lib\p2pRendezvousStore.ts"
$p2pRendezvousCreate = Get-RepoText "musu-bee\src\app\api\v1\p2p\rendezvous\route.ts"
$p2pRendezvousRead = Get-RepoText "musu-bee\src\app\api\v1\p2p\rendezvous\[id]\route.ts"
$p2pRendezvousCandidates = Get-RepoText "musu-bee\src\app\api\v1\p2p\rendezvous\[id]\candidates\route.ts"
$p2pRendezvousApprove = Get-RepoText "musu-bee\src\app\api\v1\p2p\rendezvous\[id]\approve\route.ts"
$p2pRendezvousClose = Get-RepoText "musu-bee\src\app\api\v1\p2p\rendezvous\[id]\close\route.ts"
$p2pRendezvousTest = Get-RepoText "musu-bee\src\app\api\v1\p2p\rendezvous\route.test.ts"
$roomRendezvous = Get-RepoText "musu-bee\src\app\api\rooms\[roomId]\rendezvous\route.ts"
$roomRendezvousTest = Get-RepoText "musu-bee\src\app\api\rooms\[roomId]\rendezvous\route.test.ts"
$roomPresence = Get-RepoText "musu-bee\src\app\api\rooms\[roomId]\presence\route.ts"
$roomPresenceTest = Get-RepoText "musu-bee\src\app\api\rooms\[roomId]\presence\route.test.ts"
$relayConnect = Get-RepoText "musu-bee\src\app\api\v1\relay\connect\route.ts"
$relayConnectTest = Get-RepoText "musu-bee\src\app\api\v1\relay\connect\route.test.ts"
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

Add-Check -Scope "source" -Name "relay connect requires P2P control auth" `
    -Passed ($relayConnect.Contains("authorizeP2pControl") -and $relayConnect.Contains("const failedAuth = authorizeP2pControl(req)") -and $relayConnect.Contains("return failedAuth") -and $relayConnect.Contains("relay_payload_transport_not_implemented")) `
    -Path "musu-bee\src\app\api\v1\relay\connect\route.ts" `
    -Message "Relay connect preflight/fail-closed endpoint requires P2P control auth before exposing relay status."

Add-Check -Scope "source" -Name "room work order requires P2P control auth" `
    -Passed ($roomWorkOrders.Contains("authorizeP2pControl") -and $roomWorkOrders.Contains("const failedAuth = authorizeP2pControl(req)") -and $roomWorkOrders.Contains("return failedAuth") -and $roomWorkOrders.Contains('origin: "musu.pro"') -and $roomWorkOrders.Contains("owner_scoped: true")) `
    -Path "musu-bee\src\app\api\rooms\[roomId]\work-orders\route.ts" `
    -Message "Room work-order web input requires P2P control auth before forwarding to the local bridge."

Add-Check -Scope "source" -Name "rendezvous sessions are owner-scoped" `
    -Passed ($p2pRendezvousStore.Contains("owner_key: string") -and $p2pRendezvousStore.Contains("isSession(session) && session.owner_key === ownerKey") -and $p2pRendezvousCreate.Contains("p2pControlPrincipal(req).owner_key") -and $p2pRendezvousCreate.Contains("owner_key: ownerKey") -and $p2pRendezvousRead.Contains("getRendezvousSession(id, ownerKey)") -and $p2pRendezvousCandidates.Contains("updateRendezvousSession(id, ownerKey") -and $p2pRendezvousApprove.Contains("updateRendezvousSession(id, ownerKey") -and $p2pRendezvousClose.Contains("updateRendezvousSession(id, ownerKey") -and $roomRendezvous.Contains("owner_key: ownerKey")) `
    -Path "musu-bee\src\lib\p2pRendezvousStore.ts" `
    -Message "Rendezvous sessions are bound to the authenticated P2P control owner and cross-owner reads/mutations return not found."

Add-Check -Scope "source" -Name "rendezvous candidate cache is owner-scoped" `
    -Passed ($p2pRendezvousStore.Contains("function candidateKey(ownerKey: string, nodeId: string)") -and $p2pRendezvousStore.Contains("function localCandidateKey(ownerKey: string, nodeId: string)") -and $p2pRendezvousCreate.Contains("loadNodeCandidateSet(ownerKey") -and $roomRendezvous.Contains("loadNodeCandidateSet(ownerKey") -and $p2pRendezvousCandidates.Contains("saveNodeCandidateSet(ownerKey") -and $roomPresence.Contains("saveNodeCandidateSet(principal.owner_key")) `
    -Path "musu-bee\src\lib\p2pRendezvousStore.ts" `
    -Message "Cached P2P route candidates cannot seed sessions for another authenticated owner."

Add-Check -Scope "tests" -Name "route security test script" `
    -Passed ($packageJson.Contains('"test:routes"') -and $packageJson.Contains("src/app/api/nodes/execute/route.test.ts") -and $packageJson.Contains("src/app/api/processes/start/route.test.ts") -and $packageJson.Contains("src/app/api/processes/kill/route.test.ts")) `
    -Path "musu-bee\package.json" `
    -Message "npm test:routes covers operator API security routes."

Add-Check -Scope "tests" -Name "room work order auth regression test" `
    -Passed ($packageJson.Contains("src/app/api/rooms/[[]roomId[]]/work-orders/route.test.ts") -and $roomWorkOrdersTest.Contains("requires P2P control auth before forwarding a room work order") -and $roomWorkOrdersTest.Contains('assert.equal(res.status, 401)') -and $roomWorkOrdersTest.Contains('assert.equal(body.error, "unauthorized")')) `
    -Path "musu-bee\src\app\api\rooms\[roomId]\work-orders\route.test.ts" `
    -Message "Route tests cover room work-order auth before web input can reach the local bridge."

Add-Check -Scope "tests" -Name "relay connect auth regression test" `
    -Passed ($packageJson.Contains("src/app/api/v1/relay/connect/route.test.ts") -and $relayConnectTest.Contains("requires P2P control auth before reporting relay connect status") -and $relayConnectTest.Contains('assert.equal(res.status, 401)') -and $relayConnectTest.Contains('assert.equal(body.error, "unauthorized")')) `
    -Path "musu-bee\src\app\api\v1\relay\connect\route.test.ts" `
    -Message "P2P tests cover relay connect auth before fail-closed relay status is returned."

Add-Check -Scope "tests" -Name "rendezvous owner-scope regression tests" `
    -Passed ($packageJson.Contains("src/app/api/v1/p2p/rendezvous/route.test.ts") -and $p2pRendezvousTest.Contains("does not expose or mutate rendezvous sessions for another authorized owner") -and $p2pRendezvousTest.Contains("does not seed rendezvous candidates across authorized owners") -and $roomRendezvousTest.Contains("p2pControlOwnerKey") -and $roomPresenceTest.Contains("loadNodeCandidateSet(body.presence.owner_key")) `
    -Path "musu-bee\src\app\api\v1\p2p\rendezvous\route.test.ts" `
    -Message "P2P route tests cover owner-scoped sessions and candidate cache isolation."

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
