[CmdletBinding()]
param(
    [string]$SourceBridgeUrl,
    [string]$MusuHome,
    [string]$Token,
    [Parameter(Mandatory = $true)]
    [string]$TargetNode,
    [string]$TargetUrl,
    [string]$TailscaleIp,
    [int]$TailscaleBridgePort = 8070,
    [string]$ExpectedRouteKind,
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

function Read-BridgeToken([string]$ResolvedHome, [string]$ExplicitToken) {
    if (-not [string]::IsNullOrWhiteSpace($ExplicitToken)) {
        return $ExplicitToken
    }
    if (-not [string]::IsNullOrWhiteSpace($env:MUSU_TOKEN)) {
        return $env:MUSU_TOKEN
    }
    if (-not [string]::IsNullOrWhiteSpace($env:MUSU_BRIDGE_TOKEN)) {
        return $env:MUSU_BRIDGE_TOKEN
    }
    $envPath = Join-Path $ResolvedHome "bridge.env"
    if (Test-Path -LiteralPath $envPath) {
        foreach ($line in Get-Content -LiteralPath $envPath) {
            if ($line -match '^\s*MUSU_BRIDGE_TOKEN\s*=\s*(.+?)\s*$') {
                return $Matches[1].Trim()
            }
        }
    }
    throw "Bridge token not found. Pass -Token, set MUSU_TOKEN/MUSU_BRIDGE_TOKEN, or provide bridge.env."
}

function Resolve-BridgeUrl([string]$ResolvedHome, [string]$ExplicitUrl) {
    if (-not [string]::IsNullOrWhiteSpace($ExplicitUrl)) {
        return $ExplicitUrl.TrimEnd("/")
    }
    $registryPath = Join-Path $ResolvedHome "services\bridge.json"
    if (-not (Test-Path -LiteralPath $registryPath)) {
        throw "Bridge registry not found at $registryPath. Start the bridge or pass -SourceBridgeUrl."
    }
    $record = Get-Content -LiteralPath $registryPath -Raw | ConvertFrom-Json
    $addr = [string]$record.addr
    if ([string]::IsNullOrWhiteSpace($addr)) {
        throw "Bridge registry did not include addr: $registryPath"
    }
    $loopbackAddr = $addr `
        -replace '^0\.0\.0\.0:', '127.0.0.1:' `
        -replace '^\[::\]:', '127.0.0.1:' `
        -replace '^:::', '127.0.0.1:'
    if ($loopbackAddr -match '^https?://') {
        return $loopbackAddr.TrimEnd("/")
    }
    return ("http://{0}" -f $loopbackAddr).TrimEnd("/")
}

function Invoke-BridgeJson(
    [string]$Method,
    [string]$Url,
    [hashtable]$Headers,
    [object]$Body,
    [int]$TimeoutSeconds
) {
    $params = @{
        Uri = $Url
        Method = $Method
        UseBasicParsing = $true
        Headers = $Headers
        TimeoutSec = $TimeoutSeconds
    }
    if ($null -ne $Body) {
        $params.ContentType = "application/json"
        $params.Body = ($Body | ConvertTo-Json -Depth 20)
    }
    $resp = Invoke-WebRequest @params
    if ([string]::IsNullOrWhiteSpace($resp.Content)) {
        return $null
    }
    return $resp.Content | ConvertFrom-Json
}

function Invoke-TailscaleCommand(
    [string[]]$TailArgs,
    [bool]$Required
) {
    $cmd = Get-Command tailscale -ErrorAction SilentlyContinue
    if (-not $cmd) {
        if ($Required) {
            throw "compatible mesh client CLI not found. Join MUSU Private Mesh with --login-server=<headscale-url>, or do not claim -ExpectedRouteKind tailscale."
        }
        return [pscustomobject]@{
            found = $false
            exit_code = $null
            stdout = $null
        }
    }

    $output = & $cmd.Source @TailArgs 2>&1
    $exitCode = $LASTEXITCODE
    $text = ($output | Out-String).Trim()
    if ($Required -and $exitCode -ne 0) {
        throw ("tailscale {0} failed with exit {1}: {2}" -f ($TailArgs -join " "), $exitCode, $text)
    }

    [pscustomobject]@{
        found = $true
        exit_code = $exitCode
        stdout = $text
    }
}

function Test-TailscalePreflight(
    [string]$Name,
    [string]$TailIp,
    [int]$BridgePort,
    [string]$ExpectedKind
) {
    $required = (-not [string]::IsNullOrWhiteSpace($TailIp)) -or ($ExpectedKind -eq "tailscale")
    if (-not $required) {
        return $null
    }

    if ([string]::IsNullOrWhiteSpace($TailIp)) {
        throw "-ExpectedRouteKind tailscale requires -TailscaleIp so the smoke proves a concrete tailnet endpoint."
    }
    if ($TailIp -notmatch '^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.') {
        throw "-TailscaleIp must be an IPv4 tailnet address in 100.64.0.0/10; got $TailIp"
    }

    $localIp = Invoke-TailscaleCommand -TailArgs @("ip", "-4") -Required $true
    $ping = Invoke-TailscaleCommand -TailArgs @("ping", "--timeout=5s", "--c=1", $TailIp) -Required $true
    $whois = Invoke-TailscaleCommand -TailArgs @("whois", "--json", $TailIp) -Required $false

    $healthUrl = "http://{0}:{1}/health" -f $TailIp, $BridgePort
    $health = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 8
    if ($health.StatusCode -ne 200) {
        throw "target bridge over Tailscale returned HTTP $($health.StatusCode) at $healthUrl"
    }

    [pscustomobject]@{
        target_node = $Name
        tailscale_ip = $TailIp
        local_tailscale_ip_output = $localIp.stdout
        ping_output = $ping.stdout
        whois_exit_code = $whois.exit_code
        whois_output = $whois.stdout
        target_bridge_health_url = $healthUrl
        target_bridge_health_status = [int]$health.StatusCode
    }
}

function Maybe-RegisterTarget(
    [string]$BridgeUrl,
    [hashtable]$Headers,
    [string]$Name,
    [string]$Url,
    [string]$TailIp
) {
    if ([string]::IsNullOrWhiteSpace($Url) -and [string]::IsNullOrWhiteSpace($TailIp)) {
        return $null
    }
    $body = @{ name = $Name }
    if (-not [string]::IsNullOrWhiteSpace($Url)) {
        $body.url = $Url.TrimEnd("/")
    }
    if (-not [string]::IsNullOrWhiteSpace($TailIp)) {
        $body.tailscale_ip = $TailIp
    }
    return Invoke-BridgeJson `
        -Method "Post" `
        -Url ("{0}/api/nodes/add" -f $BridgeUrl) `
        -Headers $Headers `
        -Body $body `
        -TimeoutSeconds 15
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
if (-not $EvidenceRoot) {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $EvidenceRoot = Join-Path $repoRoot ".local-build\real-peer-route-proof\$stamp"
}
New-Item -ItemType Directory -Force -Path $EvidenceRoot | Out-Null
$EvidenceRoot = (Resolve-Path -LiteralPath $EvidenceRoot).Path

$evidence = [ordered]@{
    schema = "musu.real_peer_route_proof_smoke.v1"
    started_at = (Get-Date).ToString("o")
    repo_root = $repoRoot
    evidence_root = $EvidenceRoot
    target_node = $TargetNode
    target_url = $TargetUrl
    tailscale_ip = $TailscaleIp
    tailscale_bridge_port = $TailscaleBridgePort
    expected_route_kind = $ExpectedRouteKind
    ok = $false
}

try {
    $resolvedHome = Resolve-MusuHome -ExplicitHome $MusuHome
    $bridgeUrl = Resolve-BridgeUrl -ResolvedHome $resolvedHome -ExplicitUrl $SourceBridgeUrl
    $bridgeToken = Read-BridgeToken -ResolvedHome $resolvedHome -ExplicitToken $Token
    $headers = @{ Authorization = "Bearer $bridgeToken" }
    $expected = "MUSU_REAL_PEER_ROUTE_PROOF_OK_$(Get-Date -Format yyyyMMddHHmmss)"

    $evidence.musu_home = $resolvedHome
    $evidence.source_bridge_url = $bridgeUrl
    $evidence.expected_output_token = $expected
    $targetUrlForRegistration = $TargetUrl
    if (
        [string]::IsNullOrWhiteSpace($targetUrlForRegistration) -and
        -not [string]::IsNullOrWhiteSpace($TailscaleIp) -and
        $TailscaleBridgePort -ne 8070
    ) {
        $targetUrlForRegistration = "http://{0}:{1}" -f $TailscaleIp, $TailscaleBridgePort
    }
    $evidence.effective_target_url = $targetUrlForRegistration

    Write-Step "Checking source bridge health"
    $health = Invoke-WebRequest -Uri ("{0}/health" -f $bridgeUrl) -UseBasicParsing -TimeoutSec 5
    $evidence.source_bridge_health_status = [int]$health.StatusCode
    if ($health.StatusCode -ne 200) {
        throw "source bridge health returned $($health.StatusCode)"
    }

    Write-Step "Checking Tailscale preflight when a tailnet route is claimed"
    $tailscalePreflight = Test-TailscalePreflight `
        -Name $TargetNode `
        -TailIp $TailscaleIp `
        -BridgePort $TailscaleBridgePort `
        -ExpectedKind $ExpectedRouteKind
    if ($tailscalePreflight) {
        $evidence.tailscale_preflight = $tailscalePreflight
    }

    Write-Step "Registering target peer when target URL or Tailscale IP was supplied"
    $registration = Maybe-RegisterTarget `
        -BridgeUrl $bridgeUrl `
        -Headers $headers `
        -Name $TargetNode `
        -Url $targetUrlForRegistration `
        -TailIp $TailscaleIp
    if ($registration) {
        $evidence.registration = $registration
    }

    Write-Step "Delegating to real peer and waiting for callback"
    $delegateBody = [ordered]@{
        channel = "real-peer-smoke"
        sender_id = "smoke"
        text = "Reply exactly: $expected"
        target_node = $TargetNode
        adapter_type = "echo"
        allow_duplicate = $true
    }
    $delegate = Invoke-BridgeJson `
        -Method "Post" `
        -Url ("{0}/api/tasks/delegate" -f $bridgeUrl) `
        -Headers $headers `
        -Body $delegateBody `
        -TimeoutSeconds 20
    $taskId = [string]$delegate.task_id
    if ([string]::IsNullOrWhiteSpace($taskId)) {
        throw "delegate response did not include task_id"
    }
    $evidence.delegate_response = $delegate
    $evidence.source_task_id = $taskId

    $taskJson = $null
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        try {
            $taskJson = Invoke-BridgeJson `
                -Method "Get" `
                -Url ("{0}/api/tasks/{1}" -f $bridgeUrl, $taskId) `
                -Headers $headers `
                -Body $null `
                -TimeoutSeconds 5
            $status = [string]$taskJson.status
            if ($status -eq "done" -or $status -eq "failed" -or $status -eq "cancelled") {
                break
            }
        }
        catch {
            $evidence.last_status_poll_error = $_.Exception.Message
        }
        Start-Sleep -Milliseconds 500
    }
    if (-not $taskJson) {
        throw "source task status was never readable before timeout"
    }
    $evidence.task_status = $taskJson

    if ([string]$taskJson.status -ne "done") {
        throw "task status was not done: $($taskJson.status)"
    }
    if ([string]$taskJson.output -notlike "*$expected*") {
        throw "task output did not include expected token $expected"
    }
    if (-not ($taskJson.PSObject.Properties.Name -contains "route_proof") -or -not $taskJson.route_proof) {
        throw "task status did not include route_proof"
    }
    $proof = $taskJson.route_proof
    if ([string]$proof.result -ne "success") {
        throw "route proof result was not success: $($proof.result)"
    }
    if (-not [bool]$proof.callback_delivered) {
        throw "route proof did not show callback_delivered=true"
    }
    if ([string]$proof.callback_node -ne $TargetNode) {
        throw "callback node mismatch: expected $TargetNode got $($proof.callback_node)"
    }
    if (-not [string]::IsNullOrWhiteSpace($ExpectedRouteKind) -and [string]$proof.route_kind -ne $ExpectedRouteKind) {
        throw "route kind mismatch: expected $ExpectedRouteKind got $($proof.route_kind)"
    }

    $routeEvidencePath = Join-Path $resolvedHome ("route-evidence\{0}.route-evidence.json" -f $taskId)
    $callbackProofPath = Join-Path $resolvedHome ("route-evidence\{0}.callback-proof.json" -f $taskId)
    $evidence.route_evidence_path = $routeEvidencePath
    $evidence.callback_proof_path = $callbackProofPath
    if (Test-Path -LiteralPath $routeEvidencePath) {
        $evidence.route_evidence = Get-Content -LiteralPath $routeEvidencePath -Raw | ConvertFrom-Json
    }
    if (Test-Path -LiteralPath $callbackProofPath) {
        $evidence.callback_proof = Get-Content -LiteralPath $callbackProofPath -Raw | ConvertFrom-Json
    }
    $evidence.ok = $true
    Write-Step "Real-peer route/callback proof smoke passed"
}
catch {
    $evidence.error = $_.Exception.Message
    throw
}
finally {
    $evidence.completed_at = (Get-Date).ToString("o")
    $evidencePath = Join-Path $EvidenceRoot "real-peer-route-proof.evidence.json"
    ($evidence | ConvertTo-Json -Depth 30) | Set-Content -LiteralPath $evidencePath -Encoding utf8
    if ($Json) {
        Get-Content -LiteralPath $evidencePath -Raw
    }
    else {
        Write-Step "Evidence written to $evidencePath"
    }
}
