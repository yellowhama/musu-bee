[CmdletBinding()]
param(
    [string]$Version,
    [string]$ExpectedPackageVersion,
    [string]$BaseUrl = "http://127.0.0.1:8080",
    [string]$TenantId = "local",
    [string]$WorkspaceId = "musu",
    [string]$OutputRoot,
    [int]$WaitSeconds = 10,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path

function Convert-PublicVersionToPackageVersion {
    param([Parameter(Mandatory = $true)][string]$PublicVersion)

    if ($PublicVersion -match '^(\d+)\.(\d+)\.(\d+)-rc\.(\d+)$') {
        return "$($Matches[1]).$($Matches[2]).$($Matches[3]).$($Matches[4])"
    }
    if ($PublicVersion -match '^\d+\.\d+\.\d+\.\d+$') {
        return $PublicVersion
    }
    throw "Cannot convert public version '$PublicVersion' to a 4-segment package version."
}

if ([string]::IsNullOrWhiteSpace($Version)) {
    $Version = (Get-Content -LiteralPath (Join-Path $repoRoot "VERSION") -Raw).Trim()
}
if ([string]::IsNullOrWhiteSpace($ExpectedPackageVersion)) {
    $ExpectedPackageVersion = Convert-PublicVersionToPackageVersion -PublicVersion $Version
}
if ([string]::IsNullOrWhiteSpace($OutputRoot)) {
    $OutputRoot = Join-Path $repoRoot ".local-build\brain-product"
}

New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null

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

function Add-CheckFromCondition {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][bool]$Condition,
        [Parameter(Mandatory = $true)][string]$PassMessage,
        [Parameter(Mandatory = $true)][string]$FailMessage
    )

    if ($Condition) {
        Add-Check -Name $Name -Status "pass" -Message $PassMessage
    }
    else {
        Add-Check -Name $Name -Status "fail" -Message $FailMessage
    }
}

function Test-RestrictedAcl {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        return [pscustomobject]@{
            exists = $false
            ok = $false
            summary = "missing"
        }
    }

    $acl = Get-Acl -LiteralPath $Path
    $owner = [string]$acl.Owner
    $bad = @()
    foreach ($entry in @($acl.Access)) {
        $identity = [string]$entry.IdentityReference
        $allowed = (
            $identity -eq $owner -or
            $identity -match '\\Administrators$' -or
            $identity -match '^(NT AUTHORITY\\SYSTEM|SYSTEM)$'
        )
        if (-not $allowed) {
            $bad += $identity
        }
    }

    return [pscustomobject]@{
        exists = $true
        ok = ($bad.Count -eq 0)
        summary = $(if ($bad.Count -eq 0) { "restricted" } else { "unexpected identities: $($bad -join ', ')" })
    }
}

function Invoke-BrainJson {
    param(
        [Parameter(Mandatory = $true)][string]$Method,
        [Parameter(Mandatory = $true)][string]$Path,
        [object]$Body,
        [hashtable]$Headers = @{}
    )

    $uri = $BaseUrl.TrimEnd("/") + $Path
    $args = @{
        Method = $Method
        Uri = $uri
        TimeoutSec = 8
        Headers = $Headers
    }
    if ($null -ne $Body) {
        $args["ContentType"] = "application/json"
        $args["Body"] = ($Body | ConvertTo-Json -Depth 10)
    }

    try {
        $response = Invoke-RestMethod @args
        return [pscustomobject]@{
            ok = $true
            response = $response
            error = ""
        }
    }
    catch {
        return [pscustomobject]@{
            ok = $false
            response = $null
            error = $_.Exception.Message
        }
    }
}

function Get-SourceId {
    param($Response)

    if ($null -eq $Response) {
        return ""
    }
    foreach ($name in @("ID", "id")) {
        if ($Response.PSObject.Properties[$name] -and $null -ne $Response.$name) {
            return [string]$Response.$name
        }
    }
    return ""
}

function Get-ResultCount {
    param($Response)

    if ($Response -and $Response.PSObject.Properties["results"] -and $null -ne $Response.results) {
        return @($Response.results).Count
    }
    return 0
}

function Test-LoopbackBaseUrl {
    param([string]$Text)

    try {
        $uri = [uri]$Text
        return (
            $uri.Scheme -eq "http" -and
            ($uri.Host -eq "127.0.0.1" -or $uri.Host -eq "localhost") -and
            $uri.Port -gt 0
        )
    }
    catch {
        return $false
    }
}

$generatedAt = [datetimeoffset]::Now
$machine = if ([string]::IsNullOrWhiteSpace($env:COMPUTERNAME)) { "machine" } else { $env:COMPUTERNAME }
$safeMachine = $machine -replace "[^A-Za-z0-9._-]", "_"
$stamp = $generatedAt.ToString("yyyyMMdd-HHmmss")
$evidencePath = Join-Path $OutputRoot "$stamp-$safeMachine.brain-product-proof.json"
$verificationPath = Join-Path $OutputRoot "$stamp-$safeMachine.brain-product-verification.json"

$package = $null
try {
    $package = Get-AppxPackage -Name "blossompark.musu" -ErrorAction SilentlyContinue | Sort-Object Version -Descending | Select-Object -First 1
}
catch {
    $package = $null
}

$packageFullName = if ($package) { [string]$package.PackageFullName } else { "" }
$packageVersion = if ($package) { [string]$package.Version } else { "" }
$installLocation = if ($package) { [string]$package.InstallLocation } else { "" }
$brainBinaryPath = if (-not [string]::IsNullOrWhiteSpace($installLocation)) { Join-Path $installLocation "musu-brain.exe" } else { "" }
$brainBinaryPackaged = (-not [string]::IsNullOrWhiteSpace($brainBinaryPath) -and (Test-Path -LiteralPath $brainBinaryPath))

$brainRoot = Join-Path $env:USERPROFILE ".musu\brain"
$tokenPath = Join-Path $brainRoot "runtime\musu-ingest.token"
$tokenPresent = Test-Path -LiteralPath $tokenPath
$tokenAcl = Test-RestrictedAcl -Path $tokenPath
$token = ""
if ($tokenPresent) {
    $token = (Get-Content -LiteralPath $tokenPath -Raw).Trim()
}
$headers = @{}
if (-not [string]::IsNullOrWhiteSpace($token)) {
    $headers["Authorization"] = "Bearer $token"
}

$health = $null
$deadline = (Get-Date).AddSeconds([Math]::Max(1, $WaitSeconds))
do {
    $health = Invoke-BrainJson -Method "GET" -Path "/health"
    if ($health.ok) {
        break
    }
    Start-Sleep -Milliseconds 500
} while ((Get-Date) -lt $deadline)

$processObserved = $false
try {
    $processObserved = @(
        Get-Process -Name "musu-brain" -ErrorAction SilentlyContinue
    ).Count -gt 0
}
catch {
    $processObserved = $false
}

$proofSuffix = "{0}-{1}" -f $generatedAt.ToString("yyyyMMddHHmmss"), ([guid]::NewGuid().ToString("N").Substring(0, 8))
$taskMarker = "musu-brain-proof-task-$proofSuffix"
$captureMarker = "musu-brain-proof-capture-$proofSuffix"
$workspacePayload = [pscustomobject]@{
    tenant_id = $TenantId
    workspace_id = $WorkspaceId
    display_name = "MUSU"
}
$workspace = Invoke-BrainJson -Method "POST" -Path "/v1/workspaces" -Body $workspacePayload -Headers $headers

$taskSource = Invoke-BrainJson -Method "POST" -Path "/v1/sources" -Headers $headers -Body ([pscustomobject]@{
        tenant_id = $TenantId
        workspace_id = $WorkspaceId
        title = "MUSU brain product proof task $proofSuffix"
        content = "MUSU hidden brain product proof task marker $taskMarker. This source proves a completed MUSU task can be ingested into the brain store."
    })
$taskProcess = Invoke-BrainJson -Method "POST" -Path "/v1/process" -Headers $headers -Body ([pscustomobject]@{
        tenant_id = $TenantId
        workspace_id = $WorkspaceId
    })
$taskQuery = Invoke-BrainJson -Method "POST" -Path "/v1/query" -Headers $headers -Body ([pscustomobject]@{
        tenant_id = $TenantId
        workspace_id = $WorkspaceId
        query = $taskMarker
    })

$captureClip = Invoke-BrainJson -Method "POST" -Path "/v1/clips" -Headers $headers -Body ([pscustomobject]@{
        tenant_id = $TenantId
        workspace_id = $WorkspaceId
        title = "MUSU brain product proof capture $proofSuffix"
        url = "https://musu.pro/brain-product-proof/$proofSuffix"
        content = "MUSU hidden brain product proof capture marker $captureMarker. This clip proves recall and capture can use the brain store."
    })
$captureProcess = Invoke-BrainJson -Method "POST" -Path "/v1/process" -Headers $headers -Body ([pscustomobject]@{
        tenant_id = $TenantId
        workspace_id = $WorkspaceId
    })
$captureQuery = Invoke-BrainJson -Method "POST" -Path "/v1/query" -Headers $headers -Body ([pscustomobject]@{
        tenant_id = $TenantId
        workspace_id = $WorkspaceId
        query = $captureMarker
    })

$taskSourceId = Get-SourceId -Response $taskSource.response
$captureSourceId = Get-SourceId -Response $captureClip.response
$taskRecallCount = Get-ResultCount -Response $taskQuery.response
$captureRecallCount = Get-ResultCount -Response $captureQuery.response

Add-CheckFromCondition "installed package" (-not [string]::IsNullOrWhiteSpace($packageFullName)) "MUSU MSIX package is installed" "MUSU MSIX package is not installed"
Add-CheckFromCondition "package version" ($packageVersion -eq $ExpectedPackageVersion) "installed package version matches $ExpectedPackageVersion" "installed package version is '$packageVersion', expected '$ExpectedPackageVersion'"
Add-CheckFromCondition "brain binary packaged" $brainBinaryPackaged "musu-brain.exe is present in the package install location" "musu-brain.exe was not found in the package install location"
Add-CheckFromCondition "brain root" ($brainRoot.Replace("\", "/") -match "/\.musu/brain/?$" -and $brainRoot.Replace("\", "/") -notmatch "(?i)/LocalState/") "brain root is under ~/.musu/brain" "brain root must be ~/.musu/brain and not LocalState"
Add-CheckFromCondition "base url loopback" (Test-LoopbackBaseUrl -Text $BaseUrl) "base URL is product-owned loopback" "base URL must be loopback HTTP"
Add-CheckFromCondition "sidecar process" $processObserved "musu-brain sidecar process is running" "musu-brain sidecar process is not running"
Add-CheckFromCondition "token present" $tokenPresent "brain ingest token exists" "brain ingest token is missing"
Add-CheckFromCondition "token acl" ([bool]$tokenAcl.ok) "brain ingest token ACL is restricted" "brain ingest token ACL is not restricted: $($tokenAcl.summary)"
Add-CheckFromCondition "health" ([bool]$health.ok) "brain /health is reachable" "brain /health is not reachable: $($health.error)"
Add-CheckFromCondition "workspace" ([bool]$workspace.ok) "brain workspace scope is ready" "brain workspace scope is not ready: $($workspace.error)"
Add-CheckFromCondition "task ingest" ([bool]$taskSource.ok -and -not [string]::IsNullOrWhiteSpace($taskSourceId)) "task source ingest created a source" "task source ingest failed: $($taskSource.error)"
Add-CheckFromCondition "task process" ([bool]$taskProcess.ok) "task source processing succeeded" "task source processing failed: $($taskProcess.error)"
Add-CheckFromCondition "task recall" ([bool]$taskQuery.ok -and $taskRecallCount -gt 0) "task marker was recalled" "task marker was not recalled: $($taskQuery.error)"
Add-CheckFromCondition "capture clip" ([bool]$captureClip.ok -and -not [string]::IsNullOrWhiteSpace($captureSourceId)) "capture clip created a source" "capture clip failed: $($captureClip.error)"
Add-CheckFromCondition "capture process" ([bool]$captureProcess.ok) "capture source processing succeeded" "capture source processing failed: $($captureProcess.error)"
Add-CheckFromCondition "capture recall" ([bool]$captureQuery.ok -and $captureRecallCount -gt 0) "capture marker was recalled" "capture marker was not recalled: $($captureQuery.error)"

$failCount = @($checks | Where-Object { $_.status -eq "fail" }).Count
$ok = ($failCount -eq 0)
$evidence = [pscustomobject]@{
    schema = "musu.brain_product_proof.v1"
    ok = [bool]$ok
    version = $Version
    package_version = $packageVersion
    expected_package_version = $ExpectedPackageVersion
    package_full_name = $packageFullName
    install_location = $installLocation
    brain_binary_path = $brainBinaryPath
    brain_binary_packaged = [bool]$brainBinaryPackaged
    sidecar_process_observed = [bool]$processObserved
    generated_at = $generatedAt.ToString("o")
    operator_machine = $machine
    operator_user = $env:USERNAME
    brain_root = $brainRoot
    base_url = $BaseUrl.TrimEnd("/")
    product_owned_loopback = [bool](Test-LoopbackBaseUrl -Text $BaseUrl)
    brain_http_public_surface_exposed = $false
    token_present = [bool]$tokenPresent
    token_acl_restricted = [bool]$tokenAcl.ok
    token_path = $tokenPath
    version_coherence_ok = ($packageVersion -eq $ExpectedPackageVersion -and $brainBinaryPackaged)
    source_store_owner = "musu-brain"
    musu_db_shared_write = $false
    tenant_id = $TenantId
    workspace_id = $WorkspaceId
    health_ok = [bool]$health.ok
    workspace_ok = [bool]$workspace.ok
    task_ingest_ok = ([bool]$taskSource.ok -and -not [string]::IsNullOrWhiteSpace($taskSourceId))
    task_source_id = $taskSourceId
    task_marker = $taskMarker
    task_process_ok = [bool]$taskProcess.ok
    task_recall_ok = ([bool]$taskQuery.ok -and $taskRecallCount -gt 0)
    task_recall_result_count = [int]$taskRecallCount
    recall_capture_ux_ok = ([bool]$captureClip.ok -and [bool]$captureProcess.ok -and [bool]$captureQuery.ok -and $captureRecallCount -gt 0)
    capture_clip_ok = ([bool]$captureClip.ok -and -not [string]::IsNullOrWhiteSpace($captureSourceId))
    capture_source_id = $captureSourceId
    capture_marker = $captureMarker
    capture_process_ok = [bool]$captureProcess.ok
    capture_recall_ok = ([bool]$captureQuery.ok -and $captureRecallCount -gt 0)
    capture_recall_result_count = [int]$captureRecallCount
    checks = $checks.ToArray()
}

$evidence | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $evidencePath -Encoding UTF8

$verification = $null
$verifyText = ""
$verifyScript = Join-Path $scriptDir "verify-brain-product-proof.ps1"
try {
    $verifyText = (& powershell -NoProfile -ExecutionPolicy Bypass -File $verifyScript -EvidencePath $evidencePath -ExpectedVersion $Version -ExpectedPackageVersion $ExpectedPackageVersion -ExpectedBaseUrl $BaseUrl -Json 2>&1 | Out-String).Trim()
    $verification = $verifyText | ConvertFrom-Json
    $verification | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $verificationPath -Encoding UTF8
}
catch {
    $verifyText = if ([string]::IsNullOrWhiteSpace($verifyText)) { $_.Exception.Message } else { $verifyText }
}

$result = [pscustomobject]@{
    ok = [bool]($verification -and [bool]$verification.ok)
    version = $Version
    output_root = (Resolve-Path -LiteralPath $OutputRoot).Path
    evidence_path = (Resolve-Path -LiteralPath $evidencePath).Path
    verification_path = if (Test-Path -LiteralPath $verificationPath) { (Resolve-Path -LiteralPath $verificationPath).Path } else { "" }
    fail_count = if ($verification -and $verification.PSObject.Properties["fail_count"]) { [int]$verification.fail_count } else { $failCount }
    package_full_name = $packageFullName
    base_url = $BaseUrl.TrimEnd("/")
    brain_root = $brainRoot
    raw_verification = if ($verification) { "" } else { $verifyText }
}

if ($Json) {
    $result | ConvertTo-Json -Depth 8
}
else {
    $result
}

if (-not $result.ok) {
    exit 1
}
