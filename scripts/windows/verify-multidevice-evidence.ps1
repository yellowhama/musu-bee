[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$EvidencePath,
    [string]$ExpectedVersion,
    [string]$ExpectedRouteOutput = "MUSU_REMOTE_ROUTE_OK",
    [int]$MaxAgeDays = 30,
    [switch]$AllowStatusOnly,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path

if ([string]::IsNullOrWhiteSpace($ExpectedVersion)) {
    $ExpectedVersion = (Get-Content -LiteralPath (Join-Path $repoRoot "VERSION") -Raw).Trim()
}

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

function Get-StringProperty {
    param(
        [Parameter(Mandatory = $true)]$Object,
        [Parameter(Mandatory = $true)][string]$Name
    )

    $property = $Object.PSObject.Properties[$Name]
    if (-not $property -or $null -eq $property.Value) {
        return ""
    }
    return [string]$property.Value
}

function Get-BoolProperty {
    param(
        [Parameter(Mandatory = $true)]$Object,
        [Parameter(Mandatory = $true)][string]$Name
    )

    $property = $Object.PSObject.Properties[$Name]
    if (-not $property -or $null -eq $property.Value) {
        return $false
    }
    return [bool]$property.Value
}

function Get-ArrayProperty {
    param(
        [Parameter(Mandatory = $true)]$Object,
        [Parameter(Mandatory = $true)][string]$Name
    )

    $property = $Object.PSObject.Properties[$Name]
    if (-not $property -or $null -eq $property.Value) {
        return @()
    }
    return @($property.Value)
}

function Try-ParseDateTimeOffset {
    param([string]$Text)

    if ([string]::IsNullOrWhiteSpace($Text)) {
        return $null
    }
    try {
        return [datetimeoffset]::Parse($Text)
    }
    catch {
        return $null
    }
}

function Get-CommandEvidence {
    param(
        [object[]]$Commands = @(),
        [Parameter(Mandatory = $true)][string]$Pattern
    )

    @($Commands | Where-Object {
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

$schema = Get-StringProperty -Object $evidence -Name "schema"
$version = Get-StringProperty -Object $evidence -Name "version"
$startedAt = Try-ParseDateTimeOffset -Text (Get-StringProperty -Object $evidence -Name "started_at")
$completedAt = Try-ParseDateTimeOffset -Text (Get-StringProperty -Object $evidence -Name "completed_at")
$commands = Get-ArrayProperty -Object $evidence -Name "commands"
$discoverChecked = Get-BoolProperty -Object $evidence -Name "discover_checked"
$routeChecked = Get-BoolProperty -Object $evidence -Name "route_checked"
$remoteAddr = Get-StringProperty -Object $evidence -Name "remote_addr"
$remoteName = Get-StringProperty -Object $evidence -Name "remote_name"
$operatorMachine = Get-StringProperty -Object $evidence -Name "operator_machine"
$operatorUser = Get-StringProperty -Object $evidence -Name "operator_user"
$scriptError = Get-StringProperty -Object $evidence -Name "error"

Add-CheckFromCondition "schema" ($schema -eq "musu.multidevice_smoke_evidence.v1") "schema is valid" "schema is not musu.multidevice_smoke_evidence.v1"
Add-CheckFromCondition "evidence ok" (Get-BoolProperty -Object $evidence -Name "ok") "evidence reports ok=true" "evidence does not report ok=true"
Add-CheckFromCondition "version" (-not [string]::IsNullOrWhiteSpace($version)) "version is present" "version is missing"
Add-CheckFromCondition "expected version" ($version -eq $ExpectedVersion) "version matches $ExpectedVersion" "version does not match $ExpectedVersion"
Add-CheckFromCondition "started timestamp" ($null -ne $startedAt) "started_at parses" "started_at is missing or invalid"
Add-CheckFromCondition "completed timestamp" ($null -ne $completedAt) "completed_at parses" "completed_at is missing or invalid"
if ($completedAt) {
    $age = [datetimeoffset]::Now - $completedAt
    Add-CheckFromCondition "evidence age" ($age.TotalDays -le $MaxAgeDays -and $age.TotalSeconds -ge -300) "completed_at is within $MaxAgeDays days" "completed_at is outside the allowed evidence window"
}
if ($startedAt -and $completedAt) {
    Add-CheckFromCondition "timestamp order" ($completedAt -ge $startedAt) "completed_at is after started_at" "completed_at is before started_at"
}
Add-CheckFromCondition "operator machine" (-not [string]::IsNullOrWhiteSpace($operatorMachine)) "operator machine is present" "operator machine is missing"
Add-CheckFromCondition "operator user" (-not [string]::IsNullOrWhiteSpace($operatorUser)) "operator user is present" "operator user is missing"
Add-CheckFromCondition "remote address" (-not [string]::IsNullOrWhiteSpace($remoteAddr)) "remote_addr is present" "remote_addr is missing"
Add-CheckFromCondition "remote address includes port" ($remoteAddr -match ":\d+$") "remote_addr includes a port" "remote_addr must include host:port"
Add-CheckFromCondition "remote name" (-not [string]::IsNullOrWhiteSpace($remoteName)) "remote_name is present" "remote_name is missing"
Add-CheckFromCondition "command log" (@($commands).Count -gt 0) "command log is present" "command log is empty"
Add-CheckFromCondition "no script error" ([string]::IsNullOrWhiteSpace($scriptError)) "script error field is empty" "script error field is not empty: $scriptError"

if (@($commands).Count -gt 0) {
    $up = Get-CommandEvidence -Commands $commands -Pattern "musu up --json"
    $doctor = Get-CommandEvidence -Commands $commands -Pattern "musu doctor --json"
    $peerAdd = Get-CommandEvidence -Commands $commands -Pattern "musu peer add *"
    $peerList = Get-CommandEvidence -Commands $commands -Pattern "musu peer list"
    $discover = Get-CommandEvidence -Commands $commands -Pattern "musu discover *"
    $status = Get-CommandEvidence -Commands $commands -Pattern "musu status"
    $route = Get-CommandEvidence -Commands $commands -Pattern "musu route *"
}
else {
    $up = $null
    $doctor = $null
    $peerAdd = $null
    $peerList = $null
    $discover = $null
    $status = $null
    $route = $null
}

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

if ($discoverChecked) {
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
    Add-CheckFromCondition "route checked" $routeChecked "route_checked=true" "route_checked is not true"
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
elseif ($routeChecked -and $route) {
    Add-CheckFromCondition "route exit" ([int]$route.exit_code -eq 0) "route exited 0" "route exit code was $($route.exit_code)"
}

$failCount = @($checks | Where-Object { $_.status -eq "fail" }).Count
$result = [pscustomobject]@{
    ok = ($failCount -eq 0)
    evidence_path = (Resolve-Path -LiteralPath $EvidencePath).Path
    fail_count = $failCount
    version = $version
    remote_addr = $remoteAddr
    remote_name = $remoteName
    route_checked = $routeChecked
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
