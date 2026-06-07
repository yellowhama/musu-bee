[CmdletBinding()]
param(
    [string]$BaseUrl = "https://musu.pro",
    [string]$RoomId = "one-machine-rc1",
    [string]$MusuExe,
    [string]$P2pControlToken,
    [string]$WorkspaceUri = "file:///F:/workspace/musu-bee",
    [string]$CompanyId = "musu-rc1",
    [string]$ProjectId = "one-machine",
    [string]$TargetNode,
    [string]$Instruction,
    [string]$PostRunIdleCpuEvidencePath,
    [string]$Version,
    [string]$OutputRoot,
    [string]$EvidencePath,
    [int]$CommandTimeoutSec = 90,
    [int]$HttpTimeoutSec = 30,
    [switch]$AllowDeveloperRuntime,
    [switch]$AllowUnverified,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path

if ([string]::IsNullOrWhiteSpace($Version)) {
    $Version = (Get-Content -LiteralPath (Join-Path $repoRoot "VERSION") -Raw).Trim()
}
if ([string]::IsNullOrWhiteSpace($OutputRoot)) {
    $OutputRoot = Join-Path $repoRoot ("docs\evidence\one-machine-musu-pro-work-order\{0}" -f $Version)
}

$recordedAt = [datetimeoffset]::Now
$stamp = $recordedAt.ToString("yyyyMMdd-HHmmss")
$machine = if ([string]::IsNullOrWhiteSpace($env:COMPUTERNAME)) { "machine" } else { $env:COMPUTERNAME }
$safeMachine = $machine -replace "[^A-Za-z0-9._-]", "_"
$safeBaseUrl = $BaseUrl -replace "^https?://", "" -replace "[^A-Za-z0-9._-]", "_"
if ([string]::IsNullOrWhiteSpace($EvidencePath)) {
    $EvidencePath = Join-Path $OutputRoot "$stamp-$safeMachine-$safeBaseUrl.one-machine-musu-pro-work-order.evidence.json"
}
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $EvidencePath) | Out-Null

if ([string]::IsNullOrWhiteSpace($TargetNode)) {
    $TargetNode = $machine
}
$WorkOrderId = "wo-one-machine-$stamp"
$ExpectedOutput = "MUSU_ONE_MACHINE_MUSU_PRO_WORK_ORDER_OK_$stamp"
if ([string]::IsNullOrWhiteSpace($Instruction)) {
    $Instruction = "Reply exactly: $ExpectedOutput"
}

$checks = New-Object System.Collections.Generic.List[object]

function Add-Check {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][bool]$Passed,
        [Parameter(Mandatory = $true)][string]$PassMessage,
        [Parameter(Mandatory = $true)][string]$FailMessage
    )

    $checks.Add([pscustomobject]@{
        name = $Name
        status = if ($Passed) { "pass" } else { "fail" }
        message = if ($Passed) { $PassMessage } else { $FailMessage }
    }) | Out-Null
}

function Resolve-MusuExeForSmoke {
    param([string]$RequestedPath)

    if (-not [string]::IsNullOrWhiteSpace($RequestedPath)) {
        if (-not (Test-Path -LiteralPath $RequestedPath)) {
            throw "MusuExe not found: $RequestedPath"
        }
        return [pscustomobject]@{
            path = (Resolve-Path -LiteralPath $RequestedPath).Path
            source = "parameter"
        }
    }

    $windowsAppsAlias = if (-not [string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
        Join-Path $env:LOCALAPPDATA "Microsoft\WindowsApps\musu.exe"
    }
    else {
        ""
    }
    if (-not [string]::IsNullOrWhiteSpace($windowsAppsAlias) -and (Test-Path -LiteralPath $windowsAppsAlias)) {
        return [pscustomobject]@{
            path = $windowsAppsAlias
            source = "windowsapps_alias"
        }
    }

    $developerMusu = Join-Path $repoRoot "musu-rs\target\debug\musu.exe"
    if ($AllowDeveloperRuntime -and (Test-Path -LiteralPath $developerMusu)) {
        return [pscustomobject]@{
            path = (Resolve-Path -LiteralPath $developerMusu).Path
            source = "repo_debug_binary"
        }
    }

    $pathCommand = Get-Command "musu.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($AllowDeveloperRuntime -and $pathCommand -and -not [string]::IsNullOrWhiteSpace([string]$pathCommand.Source)) {
        return [pscustomobject]@{
            path = [string]$pathCommand.Source
            source = "path"
        }
    }

    throw "Unable to resolve packaged MUSU. Install the MSIX package, pass -MusuExe, or use -AllowDeveloperRuntime for diagnostics."
}

function Invoke-ProcessCapture {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [int]$TimeoutSec = $CommandTimeoutSec
    )

    $psi = [System.Diagnostics.ProcessStartInfo]::new()
    $psi.FileName = $FilePath
    $psi.WorkingDirectory = $repoRoot
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.Arguments = ConvertTo-ProcessArgumentString -Items $Arguments

    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $psi
    $started = $process.Start()
    if (-not $started) {
        throw "Failed to start $FilePath"
    }
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    $completed = $process.WaitForExit($TimeoutSec * 1000)
    if (-not $completed) {
        try {
            $process.Kill($true)
        }
        catch {
            $process.Kill()
        }
        $process.WaitForExit()
    }

    [pscustomobject]@{
        command = "$FilePath $($Arguments -join ' ')"
        arguments = $Arguments
        exit_code = if ($completed) { [int]$process.ExitCode } else { -1 }
        timed_out = -not $completed
        stdout = $stdoutTask.GetAwaiter().GetResult()
        stderr = $stderrTask.GetAwaiter().GetResult()
    }
}

function Convert-JsonOutput {
    param($Capture)

    $text = ([string]$Capture.stdout).Trim()
    if ([string]::IsNullOrWhiteSpace($text)) {
        return $null
    }
    try {
        return $text | ConvertFrom-Json
    }
    catch {
        return $null
    }
}

function Get-PropertyValue {
    param(
        $Object,
        [Parameter(Mandatory = $true)][string]$Name
    )

    if (-not $Object) {
        return $null
    }
    $property = $Object.PSObject.Properties[$Name]
    if (-not $property) {
        return $null
    }
    return $property.Value
}

function Resolve-P2pControlToken {
    if (-not [string]::IsNullOrWhiteSpace($P2pControlToken)) {
        return [pscustomobject]@{ present = $true; source = "parameter"; token = $P2pControlToken }
    }
    foreach ($name in @("MUSU_P2P_CONTROL_TOKEN", "MUSU_ROUTE_EVIDENCE_TOKEN", "MUSU_TOKEN")) {
        $value = [Environment]::GetEnvironmentVariable($name)
        if (-not [string]::IsNullOrWhiteSpace($value)) {
            return [pscustomobject]@{ present = $true; source = "env:$name"; token = $value }
        }
    }
    return [pscustomobject]@{ present = $false; source = ""; token = "" }
}

function ConvertTo-ProcessArgumentString {
    param([string[]]$Items)

    (@($Items) | ForEach-Object {
        $item = [string]$_
        $escaped = $item -replace '"', '\"'
        if ($escaped -match "\s") {
            "`"$escaped`""
        }
        else {
            $escaped
        }
    }) -join " "
}

function Invoke-HttpJson {
    param(
        [Parameter(Mandatory = $true)][string]$Uri,
        [Parameter(Mandatory = $true)][string]$Method,
        [hashtable]$Headers = @{},
        $Body = $null
    )

    $content = ""
    $statusCode = 0
    $errorText = $null
    try {
        $parameters = @{
            Uri = $Uri
            Method = $Method
            Headers = $Headers
            TimeoutSec = $HttpTimeoutSec
            UseBasicParsing = $true
        }
        if ($null -ne $Body) {
            $parameters["Body"] = ($Body | ConvertTo-Json -Depth 8 -Compress)
            $parameters["ContentType"] = "application/json"
        }
        $response = Invoke-WebRequest @parameters
        $statusCode = [int]$response.StatusCode
        $content = [string]$response.Content
    }
    catch {
        $errorText = $_.Exception.Message
        if ($_.Exception.Response) {
            try {
                $statusCode = [int]$_.Exception.Response.StatusCode
                $stream = $_.Exception.Response.GetResponseStream()
                if ($stream) {
                    $reader = [System.IO.StreamReader]::new($stream)
                    try {
                        $content = $reader.ReadToEnd()
                    }
                    finally {
                        $reader.Dispose()
                    }
                }
            }
            catch {
                # Keep the original error; parsing failure is diagnostic only.
            }
        }
    }

    $json = $null
    if (-not [string]::IsNullOrWhiteSpace($content)) {
        try {
            $json = $content | ConvertFrom-Json
        }
        catch {
            $json = $null
        }
    }

    [pscustomobject]@{
        uri = $Uri
        method = $Method
        status_code = $statusCode
        ok = ($statusCode -ge 200 -and $statusCode -lt 300)
        json = $json
        raw = if ($json) { $null } else { $content }
        error = $errorText
    }
}

$musuExeResolution = $null
$upCapture = $null
$up = $null
$doctorCapture = $null
$doctor = $null
$presencePublishCapture = $null
$presencePublish = $null
$presenceListCapture = $null
$presenceList = $null
$workOrderPost = $null
$postRunIdleCpu = $null
$bridgeUrl = ""
$accountLoggedIn = $false
$tokenResolution = Resolve-P2pControlToken

try {
    $musuExeResolution = Resolve-MusuExeForSmoke -RequestedPath $MusuExe
    $MusuExe = [string]$musuExeResolution.path
    Add-Check "musu executable" (Test-Path -LiteralPath $MusuExe) "musu.exe exists at $MusuExe" "musu.exe was not found at $MusuExe"

    $upCapture = Invoke-ProcessCapture -FilePath $MusuExe -Arguments @("up", "--json")
    $up = Convert-JsonOutput -Capture $upCapture
    $upOk = ($upCapture.exit_code -eq 0 -and $up -and [bool](Get-PropertyValue -Object $up -Name "ok"))
    Add-Check "musu up" $upOk "musu up --json reported ok=true" "musu up --json did not report ok=true"

    $doctorCapture = Invoke-ProcessCapture -FilePath $MusuExe -Arguments @("doctor", "--json")
    $doctor = Convert-JsonOutput -Capture $doctorCapture
    $doctorOverall = [string](Get-PropertyValue -Object $doctor -Name "overall")
    Add-Check "musu doctor" ($doctorCapture.exit_code -eq 0 -and $doctor -and $doctorOverall -ne "fail") "musu doctor overall is not fail" "musu doctor overall is fail or not parseable"

    $bridge = Get-PropertyValue -Object $doctor -Name "bridge"
    if ($bridge) {
        $bridgeUrl = [string](Get-PropertyValue -Object $bridge -Name "local_url")
    }
    if ([string]::IsNullOrWhiteSpace($bridgeUrl) -and $up) {
        $upBridge = Get-PropertyValue -Object $up -Name "bridge"
        if ($upBridge) {
            $bridgeUrl = [string](Get-PropertyValue -Object $upBridge -Name "local_url")
        }
    }
    Add-Check "actual bridge URL discovered" (-not [string]::IsNullOrWhiteSpace($bridgeUrl)) "local bridge URL discovered: $bridgeUrl" "local bridge URL was not discovered from runtime state"
    Add-Check "no fixed localhost 3001 assumption" ($bridgeUrl -notmatch "^http://(localhost|127\.0\.0\.1):3001(/|$)") "bridge URL is not the fixed localhost:3001 dashboard port" "bridge URL points at fixed localhost:3001"

    $account = Get-PropertyValue -Object $doctor -Name "account"
    if ($account) {
        $accountLoggedIn = [bool](Get-PropertyValue -Object $account -Name "logged_in")
    }
    Add-Check "MUSU.PRO account login" $accountLoggedIn "local runtime reports MUSU.PRO account login" "local runtime is not logged in to MUSU.PRO"

    $oldCloudBaseUrl = $env:MUSU_CLOUD_BASE_URL
    try {
        $env:MUSU_CLOUD_BASE_URL = $BaseUrl
        $presencePublishArgs = @(
            "room", "presence", "publish", $RoomId,
            "--json",
            "--node-name", $TargetNode,
            "--status", "online",
            "--company-id", $CompanyId,
            "--project-id", $ProjectId,
            "--work-order-id", $WorkOrderId,
            "--capability", "bridge_http_forward",
            "--origin", "musu.local-program.one-machine-smoke"
        )
        if (-not [string]::IsNullOrWhiteSpace($bridgeUrl)) {
            $presencePublishArgs += @("--public-url", $bridgeUrl)
        }
        $presencePublishCapture = Invoke-ProcessCapture -FilePath $MusuExe -Arguments $presencePublishArgs
        $presencePublish = Convert-JsonOutput -Capture $presencePublishCapture
        $presencePublishOk = ($presencePublishCapture.exit_code -eq 0 -and $presencePublish -and [bool](Get-PropertyValue -Object $presencePublish -Name "ok"))
        Add-Check "room presence publish" $presencePublishOk "room presence publish succeeded for $RoomId" "room presence publish did not prove this local executor is online"

        $localNodeId = [string](Get-PropertyValue -Object $presencePublish -Name "local_node_id")
        $presenceListArgs = @("room", "presence", "list", $RoomId, "--json", "--limit", "20")
        if (-not [string]::IsNullOrWhiteSpace($localNodeId)) {
            $presenceListArgs += @("--node-id", $localNodeId)
        }
        $presenceListCapture = Invoke-ProcessCapture -FilePath $MusuExe -Arguments $presenceListArgs
        $presenceList = Convert-JsonOutput -Capture $presenceListCapture
        $presenceCount = 0
        if ($presenceList) {
            $presenceCountValue = Get-PropertyValue -Object $presenceList -Name "count"
            if ($null -ne $presenceCountValue) {
                $presenceCount = [int]$presenceCountValue
            }
        }
        Add-Check "room presence query" ($presenceListCapture.exit_code -eq 0 -and $presenceList -and [bool](Get-PropertyValue -Object $presenceList -Name "ok") -and $presenceCount -ge 1) "room presence query sees this local executor" "room presence query does not see a current local executor record"
    }
    finally {
        $env:MUSU_CLOUD_BASE_URL = $oldCloudBaseUrl
    }

    Add-Check "P2P control token available" ([bool]$tokenResolution.present) "P2P control token is available from $($tokenResolution.source)" "P2P control token is not available; set MUSU_P2P_CONTROL_TOKEN or pass -P2pControlToken"

    $baseUrlIsFixedLocalDashboard = ($BaseUrl -match "^http://(localhost|127\.0\.0\.1):3001(/|$)")
    Add-Check "MUSU.PRO base URL is product surface" (-not $baseUrlIsFixedLocalDashboard) "BaseUrl is not fixed localhost:3001" "BaseUrl points at fixed localhost:3001 instead of MUSU.PRO/product control-plane"

    if ([bool]$tokenResolution.present) {
        $roomPath = [uri]::EscapeDataString($RoomId)
        $uri = "$($BaseUrl.TrimEnd('/'))/api/rooms/$roomPath/work-orders"
        $headers = @{ Authorization = "Bearer $($tokenResolution.token)" }
        $body = @{
            instruction = $Instruction
            sender_id = "one-machine-smoke"
            target_node = $TargetNode
            adapter_type = "claude"
            workspace_uri = $WorkspaceUri
            company_id = $CompanyId
            project_id = $ProjectId
            work_order_id = $WorkOrderId
        }
        $workOrderPost = Invoke-HttpJson -Uri $uri -Method "Post" -Headers $headers -Body $body
        Add-Check "MUSU.PRO work-order POST" ([bool]$workOrderPost.ok) "MUSU.PRO accepted the work order POST" "MUSU.PRO work-order POST did not return 2xx"

        $responseWorkOrderId = if ($workOrderPost.json) { [string](Get-PropertyValue -Object $workOrderPost.json -Name "work_order_id") } else { "" }
        $responseOrigin = if ($workOrderPost.json) { [string](Get-PropertyValue -Object $workOrderPost.json -Name "origin") } else { "" }
        $ownerScoped = if ($workOrderPost.json) { [bool](Get-PropertyValue -Object $workOrderPost.json -Name "owner_scoped") } else { $false }
        $bridgeResponse = if ($workOrderPost.json) { Get-PropertyValue -Object $workOrderPost.json -Name "bridge" } else { $null }
        $bridgeTaskId = if ($bridgeResponse) { [string](Get-PropertyValue -Object $bridgeResponse -Name "task_id") } else { "" }
        $bridgeStatus = if ($bridgeResponse) { [string](Get-PropertyValue -Object $bridgeResponse -Name "status") } else { "" }
        Add-Check "work-order id echoed" ($responseWorkOrderId -eq $WorkOrderId) "work-order id was echoed" "work-order id was not echoed"
        Add-Check "work-order owner scoped" $ownerScoped "work-order response is owner-scoped" "work-order response did not prove owner scope"
        Add-Check "work-order origin" ($responseOrigin -eq "musu.pro") "work-order origin is musu.pro" "work-order origin is not musu.pro"
        Add-Check "local bridge task response" (-not [string]::IsNullOrWhiteSpace($bridgeTaskId) -or $bridgeStatus -in @("queued", "done", "accepted")) "work order returned local bridge task/status" "work order did not return a local bridge task/status"
    }
    else {
        Add-Check "MUSU.PRO work-order POST" $false "MUSU.PRO accepted the work order POST" "skipped because no P2P control token was available"
        Add-Check "work-order id echoed" $false "work-order id was echoed" "skipped because no P2P control token was available"
        Add-Check "work-order owner scoped" $false "work-order response is owner-scoped" "skipped because no P2P control token was available"
        Add-Check "work-order origin" $false "work-order origin is musu.pro" "skipped because no P2P control token was available"
        Add-Check "local bridge task response" $false "work order returned local bridge task/status" "skipped because no P2P control token was available"
    }

    if (-not [string]::IsNullOrWhiteSpace($PostRunIdleCpuEvidencePath) -and (Test-Path -LiteralPath $PostRunIdleCpuEvidencePath)) {
        $postRunIdleCpu = Get-Content -LiteralPath $PostRunIdleCpuEvidencePath -Raw | ConvertFrom-Json
        $postRunIdleOk = [bool](Get-PropertyValue -Object $postRunIdleCpu -Name "ok")
        Add-Check "post-run idle CPU evidence" $postRunIdleOk "post-run idle CPU evidence is linked and ok" "post-run idle CPU evidence is linked but not ok"
    }
    else {
        Add-Check "post-run idle CPU evidence" $false "post-run idle CPU evidence is linked and ok" "post-run idle CPU evidence path was not supplied; run measure-musu-idle-cpu.ps1 after remote work-order pickup"
    }
}
catch {
    Add-Check "script exception" $false "script completed without exception" $_.Exception.Message
}

$failCount = @($checks | Where-Object { $_.status -eq "fail" }).Count
$ok = ($failCount -eq 0)
$nextSteps = New-Object System.Collections.Generic.List[string]
if (-not $accountLoggedIn) {
    $nextSteps.Add("Log in with the packaged MUSU runtime, then rerun this smoke.") | Out-Null
}
if (-not [bool]$tokenResolution.present) {
    $nextSteps.Add("Configure MUSU_P2P_CONTROL_TOKEN or pass -P2pControlToken for the owner-scoped MUSU.PRO work-order API.") | Out-Null
}
if ($null -eq $workOrderPost -or -not [bool]$workOrderPost.ok) {
    $nextSteps.Add("Implement or configure the one-machine remote work-order pickup path so MUSU.PRO can create an order and the local Desktop can pick it up outbound.") | Out-Null
}
if ([string]::IsNullOrWhiteSpace($PostRunIdleCpuEvidencePath)) {
    $nextSteps.Add("After a successful remote work-order pickup, capture post-run 60s idle CPU evidence and pass -PostRunIdleCpuEvidencePath.") | Out-Null
}
if ($nextSteps.Count -eq 0) {
    $nextSteps.Add("Promote this evidence and wire it into the release go/no-go once the second-PC gates are also ready.") | Out-Null
}

$evidence = [pscustomobject]@{
    schema = "musu.one_machine_musu_pro_work_order.v1"
    ok = [bool]$ok
    fail_count = [int]$failCount
    version = $Version
    base_url = $BaseUrl
    room_id = $RoomId
    work_order_id = $WorkOrderId
    expected_output = $ExpectedOutput
    recorded_at = $recordedAt.ToString("o")
    operator_machine = $machine
    operator_user = $env:USERNAME
    musu_exe = if ($musuExeResolution) { [string]$musuExeResolution.path } else { $MusuExe }
    musu_exe_source = if ($musuExeResolution) { [string]$musuExeResolution.source } else { $null }
    target_node = $TargetNode
    bridge_url = $bridgeUrl
    account_logged_in = [bool]$accountLoggedIn
    p2p_control_token_present = [bool]$tokenResolution.present
    p2p_control_token_source = [string]$tokenResolution.source
    allow_unverified = [bool]$AllowUnverified
    requires_desktop_outbound_pickup = $true
    fixed_localhost_3001_assumption = ($BaseUrl -match "^http://(localhost|127\.0\.0\.1):3001(/|$)" -or $bridgeUrl -match "^http://(localhost|127\.0\.0\.1):3001(/|$)")
    up_exit_code = if ($upCapture) { $upCapture.exit_code } else { $null }
    up = $up
    up_raw = if ($up) { $null } else { if ($upCapture) { (($upCapture.stdout + "`n" + $upCapture.stderr).Trim()) } else { $null } }
    doctor_exit_code = if ($doctorCapture) { $doctorCapture.exit_code } else { $null }
    doctor = $doctor
    doctor_raw = if ($doctor) { $null } else { if ($doctorCapture) { (($doctorCapture.stdout + "`n" + $doctorCapture.stderr).Trim()) } else { $null } }
    presence_publish_exit_code = if ($presencePublishCapture) { $presencePublishCapture.exit_code } else { $null }
    presence_publish = $presencePublish
    presence_publish_raw = if ($presencePublish) { $null } else { if ($presencePublishCapture) { (($presencePublishCapture.stdout + "`n" + $presencePublishCapture.stderr).Trim()) } else { $null } }
    presence_list_exit_code = if ($presenceListCapture) { $presenceListCapture.exit_code } else { $null }
    presence_list = $presenceList
    presence_list_raw = if ($presenceList) { $null } else { if ($presenceListCapture) { (($presenceListCapture.stdout + "`n" + $presenceListCapture.stderr).Trim()) } else { $null } }
    work_order_post = if ($workOrderPost) {
        [pscustomobject]@{
            uri = $workOrderPost.uri
            status_code = $workOrderPost.status_code
            ok = $workOrderPost.ok
            json = $workOrderPost.json
            raw = $workOrderPost.raw
            error = $workOrderPost.error
        }
    } else { $null }
    post_run_idle_cpu_evidence_path = $PostRunIdleCpuEvidencePath
    post_run_idle_cpu_evidence = $postRunIdleCpu
    checks = $checks.ToArray()
    next_steps = $nextSteps.ToArray()
}

$evidence | ConvertTo-Json -Depth 18 | Set-Content -LiteralPath $EvidencePath -Encoding UTF8

if ($Json) {
    $evidence | ConvertTo-Json -Depth 18
}
else {
    "schema: $($evidence.schema)"
    "ok: $($evidence.ok)"
    "fail_count: $($evidence.fail_count)"
    "evidence_path: $EvidencePath"
    "base_url: $BaseUrl"
    "room_id: $RoomId"
    "work_order_id: $WorkOrderId"
    "bridge_url: $bridgeUrl"
    "checks:"
    $checks | Format-Table name, status, message -Wrap
}

if (-not $ok -and -not $AllowUnverified) {
    exit 1
}

if (-not $ok -and -not $AllowUnverified) {
    exit 1
}
