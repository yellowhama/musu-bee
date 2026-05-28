[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$EvidencePath,
    [string]$ExpectedRouteOutput = "MUSU_REMOTE_ROUTE_OK",
    [switch]$AllowStatusOnly,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$checks = New-Object System.Collections.Generic.List[object]

function Add-Check {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [ValidateSet("pass", "fail")]
        [Parameter(Mandatory = $true)][string]$Status,
        [Parameter(Mandatory = $true)][string]$Message
    )

    $checks.Add([pscustomobject]@{
        name = $Name
        status = $Status
        message = $Message
    }) | Out-Null
}

function Add-CheckFromCondition([string]$Name, [bool]$Condition, [string]$PassMessage, [string]$FailMessage) {
    if ($Condition) {
        Add-Check -Name $Name -Status "pass" -Message $PassMessage
    }
    else {
        Add-Check -Name $Name -Status "fail" -Message $FailMessage
    }
}

function Get-CommandEvidence($Evidence, [string]$Pattern) {
    @($Evidence.commands | Where-Object {
        ([string]$_.command) -like $Pattern
    }) | Select-Object -First 1
}

function Convert-OutputJson($Command) {
    if (-not $Command -or [string]::IsNullOrWhiteSpace([string]$Command.output)) {
        return $null
    }
    try {
        return ([string]$Command.output) | ConvertFrom-Json
    }
    catch {
        return $null
    }
}

if (-not (Test-Path -LiteralPath $EvidencePath)) {
    throw "Evidence file not found: $EvidencePath"
}

$evidence = Get-Content -LiteralPath $EvidencePath -Raw | ConvertFrom-Json

Add-CheckFromCondition "evidence ok" ([bool]$evidence.ok) "evidence reports ok=true" "evidence does not report ok=true"
Add-CheckFromCondition "remote address" (-not [string]::IsNullOrWhiteSpace([string]$evidence.remote_addr)) "remote_addr is present" "remote_addr is missing"
Add-CheckFromCondition "remote name" (-not [string]::IsNullOrWhiteSpace([string]$evidence.remote_name)) "remote_name is present" "remote_name is missing"
Add-CheckFromCondition "command log" (@($evidence.commands).Count -gt 0) "command log is present" "command log is empty"
Add-CheckFromCondition "no script error" ([string]::IsNullOrWhiteSpace([string]$evidence.error)) "script error field is empty" "script error field is not empty: $($evidence.error)"

$up = Get-CommandEvidence -Evidence $evidence -Pattern "musu up --json"
$doctor = Get-CommandEvidence -Evidence $evidence -Pattern "musu doctor --json"
$peerAdd = Get-CommandEvidence -Evidence $evidence -Pattern "musu peer add *"
$peerList = Get-CommandEvidence -Evidence $evidence -Pattern "musu peer list"
$discover = Get-CommandEvidence -Evidence $evidence -Pattern "musu discover *"
$status = Get-CommandEvidence -Evidence $evidence -Pattern "musu status"
$route = Get-CommandEvidence -Evidence $evidence -Pattern "musu route *"

foreach ($entry in @(
    @{ name = "musu up"; command = $up },
    @{ name = "musu doctor"; command = $doctor },
    @{ name = "musu peer add"; command = $peerAdd },
    @{ name = "musu peer list"; command = $peerList },
    @{ name = "musu status"; command = $status }
)) {
    $command = $entry.command
    Add-CheckFromCondition "$($entry.name) present" ($null -ne $command) "$($entry.name) command is recorded" "$($entry.name) command is missing"
    if ($command) {
        Add-CheckFromCondition "$($entry.name) exit" ([int]$command.exit_code -eq 0) "$($entry.name) exited 0" "$($entry.name) exit code was $($command.exit_code)"
    }
}

if ([bool]$evidence.discover_checked) {
    Add-CheckFromCondition "musu discover present" ($null -ne $discover) "discover command is recorded" "discover_checked=true but discover command is missing"
    if ($discover) {
        Add-CheckFromCondition "musu discover exit" ([int]$discover.exit_code -eq 0) "discover exited 0" "discover exit code was $($discover.exit_code)"
    }
}

$upJson = Convert-OutputJson -Command $up
Add-CheckFromCondition "up json" ($null -ne $upJson) "musu up output parses as JSON" "musu up output is not parseable JSON"
if ($upJson) {
    Add-CheckFromCondition "up ok" ([bool]$upJson.ok) "musu up reports ok" "musu up did not report ok"
    Add-CheckFromCondition "up bridge" ($upJson.bridge.status -eq "ok") "musu up bridge status is ok" "musu up bridge status is not ok"
}

$doctorJson = Convert-OutputJson -Command $doctor
Add-CheckFromCondition "doctor json" ($null -ne $doctorJson) "musu doctor output parses as JSON" "musu doctor output is not parseable JSON"
if ($doctorJson) {
    Add-CheckFromCondition "doctor overall" ($doctorJson.overall -ne "fail") "doctor overall is not fail" "doctor overall is fail"
    Add-CheckFromCondition "doctor bridge" ($doctorJson.bridge.status -eq "ok") "doctor bridge status is ok" "doctor bridge status is not ok"
}

if ($peerList) {
    $peerListText = [string]$peerList.output
    $remoteAddr = [string]$evidence.remote_addr
    $remoteName = [string]$evidence.remote_name
    Add-CheckFromCondition `
        "peer listed" `
        ($peerListText.Contains($remoteAddr) -or $peerListText.Contains($remoteName)) `
        "peer list contains the remote address or name" `
        "peer list does not contain remote address '$remoteAddr' or name '$remoteName'"
}

if ($status) {
    Add-CheckFromCondition `
        "fleet status rendered" `
        (([string]$status.output).Contains("MUSU Fleet Status")) `
        "fleet status rendered" `
        "fleet status output did not render"
}

$routeRequired = -not $AllowStatusOnly
if ($routeRequired) {
    Add-CheckFromCondition "route checked" ([bool]$evidence.route_checked) "route_checked=true" "route_checked is not true"
    Add-CheckFromCondition "route command present" ($null -ne $route) "route command is recorded" "route command is missing"
    if ($route) {
        Add-CheckFromCondition "route exit" ([int]$route.exit_code -eq 0) "route exited 0" "route exit code was $($route.exit_code)"
        Add-CheckFromCondition `
            "route expected output" `
            (([string]$route.output).Contains($ExpectedRouteOutput)) `
            "route output contains $ExpectedRouteOutput" `
            "route output does not contain $ExpectedRouteOutput"
    }
}
elseif ([bool]$evidence.route_checked -and $route) {
    Add-CheckFromCondition "route exit" ([int]$route.exit_code -eq 0) "route exited 0" "route exit code was $($route.exit_code)"
}

$failCount = @($checks | Where-Object { $_.status -eq "fail" }).Count
$result = [pscustomobject]@{
    ok = ($failCount -eq 0)
    evidence_path = (Resolve-Path -LiteralPath $EvidencePath).Path
    fail_count = $failCount
    remote_addr = [string]$evidence.remote_addr
    remote_name = [string]$evidence.remote_name
    route_checked = [bool]$evidence.route_checked
    checks = $checks.ToArray()
}

if ($Json) {
    $result | ConvertTo-Json -Depth 6
}
else {
    "MUSU multi-device evidence verification"
    "ok: $($result.ok)"
    "evidence_path: $($result.evidence_path)"
    "remote: $($result.remote_name) <$($result.remote_addr)>"
    "route_checked: $($result.route_checked)"
    ""
    $checks | Format-Table name, status, message -Wrap
}

if (-not $result.ok) {
    exit 1
}
