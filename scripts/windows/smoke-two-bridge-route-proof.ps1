[CmdletBinding()]
param(
    [string]$MusuExe,
    [string]$EvidenceRoot,
    [int]$TimeoutSec = 90,
    [switch]$KeepRunning,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step([string]$Message) {
    if (-not $Json) {
        Write-Host "==> $Message"
    }
}

function Resolve-ExistingPath([string]$PathValue, [string]$Label) {
    if (-not (Test-Path -LiteralPath $PathValue)) {
        throw "$Label not found at $PathValue"
    }
    return (Resolve-Path -LiteralPath $PathValue).Path
}

function Join-ProcessArguments([string[]]$Arguments) {
    $quoted = foreach ($arg in $Arguments) {
        if ($null -eq $arg) {
            '""'
        }
        elseif ($arg -match '[\s"]') {
            '"' + ($arg -replace '"', '\"') + '"'
        }
        else {
            $arg
        }
    }
    return ($quoted -join " ")
}

function New-BridgeHome([string]$Root, [string]$Name, [string]$Token) {
    $bridgeHome = Join-Path $Root $Name
    New-Item -ItemType Directory -Force -Path $bridgeHome | Out-Null
    @"
MUSU_BRIDGE_TOKEN=$Token
MUSU_DEFAULT_ADAPTER=echo
"@ | Set-Content -LiteralPath (Join-Path $bridgeHome "bridge.env") -Encoding utf8
    return $bridgeHome
}

function Start-TestBridge([string]$Exe, [string]$BridgeHome, [string]$NodeName, [string]$Token) {
    $stdout = Join-Path $BridgeHome "bridge.stdout.log"
    $stderr = Join-Path $BridgeHome "bridge.stderr.log"
    $psi = [System.Diagnostics.ProcessStartInfo]::new()
    $psi.FileName = $Exe
    $psi.Arguments = "bridge"
    $psi.WorkingDirectory = Split-Path -Parent $Exe
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.Environment["MUSU_HOME"] = $BridgeHome
    $psi.Environment["MUSU_ENV"] = "development"
    $psi.Environment["BRIDGE_HOST"] = "127.0.0.1"
    $psi.Environment["BRIDGE_PORT"] = "0"
    $psi.Environment["MUSU_NODE_NAME"] = $NodeName
    $psi.Environment["MUSU_TOKEN"] = $Token
    $psi.Environment["MUSU_DEFAULT_ADAPTER"] = "echo"
    $psi.Environment["MUSU_BRIDGE_LOCALHOST_AUTH"] = "0"
    $psi.Environment["MUSU_DISABLE_RATE_LIMIT"] = "1"

    $proc = [System.Diagnostics.Process]::new()
    $proc.StartInfo = $psi
    if (-not $proc.Start()) {
        throw "failed to start bridge for $NodeName"
    }
    $stdoutTask = $proc.StandardOutput.ReadToEndAsync()
    $stderrTask = $proc.StandardError.ReadToEndAsync()
    return [pscustomobject]@{
        Process = $proc
        StdoutTask = $stdoutTask
        StderrTask = $stderrTask
        StdoutPath = $stdout
        StderrPath = $stderr
        Home = $BridgeHome
        NodeName = $NodeName
    }
}

function Wait-BridgeReady([object]$Bridge, [int]$TimeoutSeconds) {
    $registryPath = Join-Path $Bridge.Home "services\bridge.json"
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if ($Bridge.Process.HasExited) {
            throw "$($Bridge.NodeName) bridge exited early with code $($Bridge.Process.ExitCode)"
        }
        if (Test-Path -LiteralPath $registryPath) {
            $record = Get-Content -LiteralPath $registryPath | ConvertFrom-Json
            $addr = [string]$record.addr
            if (-not [string]::IsNullOrWhiteSpace($addr)) {
                $loopbackAddr = $addr `
                    -replace '^0\.0\.0\.0:', '127.0.0.1:' `
                    -replace '^\[::\]:', '127.0.0.1:' `
                    -replace '^:::', '127.0.0.1:'
                try {
                    $resp = Invoke-WebRequest -Uri ("http://{0}/health" -f $loopbackAddr) -UseBasicParsing -TimeoutSec 2
                    if ($resp.StatusCode -eq 200) {
                        return $loopbackAddr
                    }
                }
                catch {
                    Start-Sleep -Milliseconds 250
                }
            }
        }
        Start-Sleep -Milliseconds 250
    }
    throw "$($Bridge.NodeName) bridge did not become healthy within ${TimeoutSeconds}s"
}

function Invoke-MusuCapture([string]$Exe, [string]$BridgeHome, [string[]]$Arguments, [string]$Token, [int]$TimeoutSeconds) {
    $psi = [System.Diagnostics.ProcessStartInfo]::new()
    $psi.FileName = $Exe
    $psi.Arguments = Join-ProcessArguments -Arguments $Arguments
    $psi.WorkingDirectory = Split-Path -Parent $Exe
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.Environment["MUSU_HOME"] = $BridgeHome
    $psi.Environment["MUSU_BRIDGE_TOKEN"] = $Token
    $psi.Environment["MUSU_TOKEN"] = $Token
    $psi.Environment["MUSU_DEFAULT_ADAPTER"] = "echo"

    $proc = [System.Diagnostics.Process]::new()
    $proc.StartInfo = $psi
    if (-not $proc.Start()) {
        throw "failed to start $Exe $($Arguments -join ' ')"
    }
    $stdoutTask = $proc.StandardOutput.ReadToEndAsync()
    $stderrTask = $proc.StandardError.ReadToEndAsync()
    if (-not $proc.WaitForExit($TimeoutSeconds * 1000)) {
        try { $proc.Kill($true) } catch {}
        throw "command timed out after ${TimeoutSeconds}s: $Exe $($Arguments -join ' ')"
    }
    $stdout = $stdoutTask.GetAwaiter().GetResult()
    $stderr = $stderrTask.GetAwaiter().GetResult()
    if ($proc.ExitCode -ne 0) {
        throw "command failed ($($proc.ExitCode)): $Exe $($Arguments -join ' ')`nSTDOUT:`n$stdout`nSTDERR:`n$stderr"
    }
    return [pscustomobject]@{
        ExitCode = $proc.ExitCode
        Stdout = $stdout
        Stderr = $stderr
    }
}

function Stop-TestBridge([object]$Bridge) {
    if (-not $Bridge) { return }
    if (-not $Bridge.Process.HasExited) {
        try {
            $Bridge.Process.Kill()
            $Bridge.Process.WaitForExit(5000) | Out-Null
        }
        catch {}
    }
    if ($Bridge.Process.HasExited) {
        try { $Bridge.StdoutTask.GetAwaiter().GetResult() | Set-Content -LiteralPath $Bridge.StdoutPath -Encoding utf8 } catch {}
        try { $Bridge.StderrTask.GetAwaiter().GetResult() | Set-Content -LiteralPath $Bridge.StderrPath -Encoding utf8 } catch {}
    }
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
if (-not $MusuExe) {
    $MusuExe = Join-Path $repoRoot "musu-rs\target\debug\musu.exe"
}
if (-not $EvidenceRoot) {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $EvidenceRoot = Join-Path $repoRoot ".local-build\two-bridge-route-proof\$stamp"
}

$MusuExe = Resolve-ExistingPath -PathValue $MusuExe -Label "musu executable"
New-Item -ItemType Directory -Force -Path $EvidenceRoot | Out-Null
$EvidenceRoot = (Resolve-Path -LiteralPath $EvidenceRoot).Path

$token = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
$expected = "MUSU_TWO_BRIDGE_ROUTE_PROOF_OK_$(Get-Date -Format yyyyMMddHHmmss)"
$bridgeA = $null
$bridgeB = $null
$evidence = [ordered]@{
    schema = "musu.two_bridge_route_proof_smoke.v1"
    started_at = (Get-Date).ToString("o")
    repo_root = $repoRoot
    musu_exe = $MusuExe
    evidence_root = $EvidenceRoot
    expected_output_token = $expected
    ok = $false
}

try {
    Write-Step "Preparing independent bridge homes"
    $homeA = New-BridgeHome -Root $EvidenceRoot -Name "this-laptop" -Token $token
    $homeB = New-BridgeHome -Root $EvidenceRoot -Name "studio-pc" -Token $token
    $evidence.source_home = $homeA
    $evidence.target_home = $homeB

    Write-Step "Starting two independent bridge runtimes"
    $bridgeA = Start-TestBridge -Exe $MusuExe -BridgeHome $homeA -NodeName "this-laptop" -Token $token
    $bridgeB = Start-TestBridge -Exe $MusuExe -BridgeHome $homeB -NodeName "studio-pc" -Token $token
    $addrA = Wait-BridgeReady -Bridge $bridgeA -TimeoutSeconds $TimeoutSec
    $addrB = Wait-BridgeReady -Bridge $bridgeB -TimeoutSeconds $TimeoutSec
    $evidence.source_bridge_addr = $addrA
    $evidence.target_bridge_addr = $addrB

    Write-Step "Linking source bridge to target peer"
    @"
[nodes.studio-pc]
url = "http://$addrB"
last_health_at = $([int][double]::Parse((Get-Date -UFormat %s)))
"@ | Set-Content -LiteralPath (Join-Path $homeA "nodes.toml") -Encoding utf8

    Write-Step "Delegating from source bridge to target peer and waiting for callback"
    $headers = @{ Authorization = "Bearer $token" }
    $delegateBody = [ordered]@{
        channel = "smoke"
        sender_id = "smoke"
        text = "Reply exactly: $expected"
        target_node = "studio-pc"
        adapter_type = "echo"
        allow_duplicate = $true
    } | ConvertTo-Json -Depth 10
    $delegateResp = Invoke-WebRequest `
        -Uri ("http://{0}/api/tasks/delegate" -f $addrA) `
        -UseBasicParsing `
        -Method Post `
        -Headers $headers `
        -ContentType "application/json" `
        -Body $delegateBody `
        -TimeoutSec 15
    $evidence.delegate_status_code = [int]$delegateResp.StatusCode
    $evidence.delegate_response = $delegateResp.Content | ConvertFrom-Json
    $taskId = [string]$evidence.delegate_response.task_id
    if ([string]::IsNullOrWhiteSpace($taskId)) {
        throw "delegate response did not include task_id"
    }
    $evidence.source_task_id = $taskId

    Write-Step "Reading source task status with route/callback proof"
    $taskJson = $null
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        try {
            $statusResp = Invoke-WebRequest `
                -Uri ("http://{0}/api/tasks/{1}" -f $addrA, $taskId) `
                -UseBasicParsing `
                -Method Get `
                -Headers $headers `
                -TimeoutSec 5
            $taskJson = $statusResp.Content | ConvertFrom-Json
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
    $taskCli = Invoke-MusuCapture -Exe $MusuExe -BridgeHome $homeA -Token $token -TimeoutSeconds 30 -Arguments @("task", $taskId, "--json")
    $evidence.task_cli_stdout = $taskCli.Stdout
    $evidence.task_cli_stderr = $taskCli.Stderr
    $taskCliJson = $taskCli.Stdout | ConvertFrom-Json
    if ([string]$taskCliJson.status -ne [string]$taskJson.status) {
        throw "CLI task status mismatch: api=$($taskJson.status) cli=$($taskCliJson.status)"
    }

    if (-not ($taskJson.PSObject.Properties.Name -contains "route_proof")) {
        throw "task status did not include route_proof"
    }
    $routeProof = $taskJson.route_proof
    if (-not $routeProof) {
        throw "task status did not include route_proof"
    }
    if ([string]$taskJson.status -ne "done") {
        throw "task status was not done: $($taskJson.status)"
    }
    if ([string]$taskJson.output -notlike "*$expected*") {
        throw "task output did not include expected token $expected"
    }
    if ([string]$routeProof.result -ne "success") {
        throw "route proof result was not success: $($routeProof.result)"
    }
    if (-not [bool]$routeProof.callback_delivered) {
        throw "route proof did not show callback_delivered=true"
    }
    if ([string]$routeProof.callback_node -ne "studio-pc") {
        throw "callback node mismatch: $($routeProof.callback_node)"
    }

    $routeEvidencePath = Join-Path $homeA ("route-evidence\{0}.route-evidence.json" -f $taskId)
    $callbackProofPath = Join-Path $homeA ("route-evidence\{0}.callback-proof.json" -f $taskId)
    $evidence.route_evidence_path = $routeEvidencePath
    $evidence.callback_proof_path = $callbackProofPath
    if (-not (Test-Path -LiteralPath $routeEvidencePath)) {
        throw "route evidence file missing: $routeEvidencePath"
    }
    if (-not (Test-Path -LiteralPath $callbackProofPath)) {
        throw "callback proof file missing: $callbackProofPath"
    }
    $evidence.route_evidence = Get-Content -LiteralPath $routeEvidencePath -Raw | ConvertFrom-Json
    $evidence.callback_proof = Get-Content -LiteralPath $callbackProofPath -Raw | ConvertFrom-Json
    $evidence.ok = $true
    Write-Step "Two-bridge route/callback proof smoke passed"
}
catch {
    $evidence.error = $_.Exception.Message
    throw
}
finally {
    $evidence.completed_at = (Get-Date).ToString("o")
    $evidencePath = Join-Path $EvidenceRoot "two-bridge-route-proof.evidence.json"
    ($evidence | ConvertTo-Json -Depth 20) | Set-Content -LiteralPath $evidencePath -Encoding utf8
    if (-not $KeepRunning) {
        Stop-TestBridge -Bridge $bridgeA
        Stop-TestBridge -Bridge $bridgeB
    }
    else {
        Write-Step "Leaving bridge processes running"
    }
    if ($Json) {
        Get-Content -LiteralPath $evidencePath -Raw
    }
    else {
        Write-Step "Evidence written to $evidencePath"
    }
}
