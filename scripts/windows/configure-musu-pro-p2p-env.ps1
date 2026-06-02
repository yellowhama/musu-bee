[CmdletBinding()]
param(
    [string]$Repo = "yellowhama/musu-bee",
    [string]$Ref = "main",
    [string]$Workflow = "deploy-musu-bee.yml",
    [string]$KvRestApiUrl,
    [string]$KvRestApiToken,
    [string]$UpstashRedisRestUrl,
    [string]$UpstashRedisRestToken,
    [switch]$StoreKvUrlAsSecret,
    [string]$P2pControlTokenSha256s,
    [string]$RelayEnabled,
    [string]$RelayTransportWired,
    [string]$RelayUrl,
    [string]$RelayEntitlement,
    [string]$RelayLeaseMaxRecords,
    [string]$RelayLeaseTtlSec,
    [switch]$FromEnvironment,
    [switch]$Deploy,
    [switch]$WatchDeploy,
    [switch]$DryRun,
    [switch]$FailOnProblem,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path

function Get-EnvOrValue {
    param(
        [string]$Value,
        [Parameter(Mandatory = $true)][string]$EnvName
    )

    if (-not [string]::IsNullOrWhiteSpace($Value)) {
        return $Value
    }
    if ($FromEnvironment) {
        $envValue = [Environment]::GetEnvironmentVariable($EnvName)
        if (-not [string]::IsNullOrWhiteSpace($envValue)) {
            return $envValue
        }
    }
    return $null
}

function Test-GhAvailable {
    return $null -ne (Get-Command gh -ErrorAction SilentlyContinue)
}

function Invoke-GhSet {
    param(
        [Parameter(Mandatory = $true)][ValidateSet("secret", "variable")][string]$Kind,
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Value
    )

    if ($DryRun) {
        return [pscustomobject]@{
            name = $Name
            kind = $Kind
            ok = $true
            dry_run = $true
            exit_code = 0
            error = $null
        }
    }

    $ghArgs = @($Kind, "set", $Name, "--repo", $Repo)
    $output = ($Value | gh @ghArgs 2>&1)
    $exitCode = $LASTEXITCODE
    return [pscustomobject]@{
        name = $Name
        kind = $Kind
        ok = ($exitCode -eq 0)
        dry_run = $false
        exit_code = $exitCode
        error = if ($exitCode -eq 0) { $null } else { ($output | Out-String).Trim() }
    }
}

function Add-Setting {
    param(
        [System.Collections.Generic.List[object]]$List,
        [Parameter(Mandatory = $true)][string]$Name,
        [string]$Value,
        [ValidateSet("secret", "variable")][string]$Kind = "secret",
        [switch]$Required
    )

    if ([string]::IsNullOrWhiteSpace($Value)) {
        if ($Required) {
            $List.Add([pscustomobject]@{
                name = $Name
                kind = $Kind
                required = $true
                present = $false
            }) | Out-Null
        }
        return
    }

    $List.Add([pscustomobject]@{
        name = $Name
        kind = $Kind
        required = [bool]$Required
        present = $true
        value = $Value
    }) | Out-Null
}

$settings = New-Object System.Collections.Generic.List[object]
$kvRestApiUrlValue = Get-EnvOrValue -Value $KvRestApiUrl -EnvName "KV_REST_API_URL"
$kvRestApiTokenValue = Get-EnvOrValue -Value $KvRestApiToken -EnvName "KV_REST_API_TOKEN"
$upstashRedisRestUrlValue = Get-EnvOrValue -Value $UpstashRedisRestUrl -EnvName "UPSTASH_REDIS_REST_URL"
$upstashRedisRestTokenValue = Get-EnvOrValue -Value $UpstashRedisRestToken -EnvName "UPSTASH_REDIS_REST_TOKEN"
if ([string]::IsNullOrWhiteSpace($kvRestApiUrlValue)) {
    $kvRestApiUrlValue = $upstashRedisRestUrlValue
}
if ([string]::IsNullOrWhiteSpace($kvRestApiTokenValue)) {
    $kvRestApiTokenValue = $upstashRedisRestTokenValue
}

Add-Setting -List $settings -Name "MUSU_P2P_CONTROL_TOKEN_SHA256S" -Value (Get-EnvOrValue -Value $P2pControlTokenSha256s -EnvName "MUSU_P2P_CONTROL_TOKEN_SHA256S") -Kind "secret"
Add-Setting -List $settings -Name "KV_REST_API_URL" -Value $kvRestApiUrlValue -Kind ($(if ($StoreKvUrlAsSecret) { "secret" } else { "variable" })) -Required
Add-Setting -List $settings -Name "KV_REST_API_TOKEN" -Value $kvRestApiTokenValue -Kind "secret" -Required
Add-Setting -List $settings -Name "UPSTASH_REDIS_REST_URL" -Value $upstashRedisRestUrlValue -Kind ($(if ($StoreKvUrlAsSecret) { "secret" } else { "variable" }))
Add-Setting -List $settings -Name "UPSTASH_REDIS_REST_TOKEN" -Value $upstashRedisRestTokenValue -Kind "secret"
Add-Setting -List $settings -Name "MUSU_P2P_RELAY_ENABLED" -Value (Get-EnvOrValue -Value $RelayEnabled -EnvName "MUSU_P2P_RELAY_ENABLED") -Kind "variable"
Add-Setting -List $settings -Name "MUSU_P2P_RELAY_TRANSPORT_WIRED" -Value (Get-EnvOrValue -Value $RelayTransportWired -EnvName "MUSU_P2P_RELAY_TRANSPORT_WIRED") -Kind "variable"
Add-Setting -List $settings -Name "MUSU_P2P_RELAY_URL" -Value (Get-EnvOrValue -Value $RelayUrl -EnvName "MUSU_P2P_RELAY_URL") -Kind "variable"
Add-Setting -List $settings -Name "MUSU_P2P_RELAY_ENTITLEMENT" -Value (Get-EnvOrValue -Value $RelayEntitlement -EnvName "MUSU_P2P_RELAY_ENTITLEMENT") -Kind "variable"
Add-Setting -List $settings -Name "MUSU_P2P_RELAY_LEASE_MAX_RECORDS" -Value (Get-EnvOrValue -Value $RelayLeaseMaxRecords -EnvName "MUSU_P2P_RELAY_LEASE_MAX_RECORDS") -Kind "variable"
Add-Setting -List $settings -Name "MUSU_P2P_RELAY_LEASE_TTL_SEC" -Value (Get-EnvOrValue -Value $RelayLeaseTtlSec -EnvName "MUSU_P2P_RELAY_LEASE_TTL_SEC") -Kind "variable"

$missingRequired = @($settings | Where-Object { [bool]$_.required -and -not [bool]$_.present } | ForEach-Object { [string]$_.name })
$setResults = New-Object System.Collections.Generic.List[object]
$deployResult = $null
$statusResult = $null
$errors = New-Object System.Collections.Generic.List[string]

if (-not (Test-GhAvailable)) {
    $errors.Add("gh_not_found") | Out-Null
}
foreach ($name in $missingRequired) {
    $errors.Add(("missing_required_{0}" -f $name.ToLowerInvariant())) | Out-Null
}

if ($errors.Count -eq 0) {
    foreach ($setting in @($settings | Where-Object { [bool]$_.present })) {
        $setResult = Invoke-GhSet -Kind ([string]$setting.kind) -Name ([string]$setting.name) -Value ([string]$setting.value)
        $setResults.Add($setResult) | Out-Null
        if (-not [bool]$setResult.ok) {
            $errors.Add(("set_failed_{0}" -f ([string]$setting.name).ToLowerInvariant())) | Out-Null
        }
    }
}

if ($Deploy -and $errors.Count -eq 0) {
    if ($DryRun) {
        $deployResult = [pscustomobject]@{
            requested = $true
            dry_run = $true
            ok = $true
            workflow = $Workflow
            ref = $Ref
            run_watch_exit_code = $null
        }
    }
    else {
        $deployOutput = & gh workflow run $Workflow --repo $Repo --ref $Ref 2>&1
        $deployExitCode = $LASTEXITCODE
        $watchExitCode = $null
        if ($deployExitCode -eq 0 -and $WatchDeploy) {
            Start-Sleep -Seconds 5
            $runJsonRaw = & gh run list --repo $Repo --workflow $Workflow --branch $Ref --limit 1 --json databaseId 2>$null
            if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace(($runJsonRaw | Out-String).Trim())) {
                $runJson = ($runJsonRaw | Out-String).Trim() | ConvertFrom-Json
                $runId = @($runJson)[0].databaseId
                if ($runId) {
                    & gh run watch $runId --repo $Repo --exit-status
                    $watchExitCode = $LASTEXITCODE
                }
            }
        }
        $deployResult = [pscustomobject]@{
            requested = $true
            dry_run = $false
            ok = ($deployExitCode -eq 0 -and ($null -eq $watchExitCode -or $watchExitCode -eq 0))
            workflow = $Workflow
            ref = $Ref
            exit_code = $deployExitCode
            output = if ($deployExitCode -eq 0) { $null } else { ($deployOutput | Out-String).Trim() }
            run_watch_exit_code = $watchExitCode
        }
        if (-not [bool]$deployResult.ok) {
            $errors.Add("deploy_workflow_failed") | Out-Null
        }
    }
}

if ($errors.Count -eq 0 -and -not $DryRun) {
    try {
        $statusText = (& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $scriptDir "show-musu-pro-p2p-env-status.ps1") -Repo $Repo -Json 2>&1 | Out-String).Trim()
        $statusResult = $statusText | ConvertFrom-Json
    }
    catch {
        $statusResult = [pscustomobject]@{
            ok = $false
            error = $_.Exception.Message
        }
    }
}

$result = [pscustomobject]@{
    schema = "musu.configure_musu_pro_p2p_env.v1"
    ok = ($errors.Count -eq 0)
    generated_at = [datetimeoffset]::Now.ToString("o")
    repo = $Repo
    ref = $Ref
    workflow = $Workflow
    dry_run = [bool]$DryRun
    settings_requested = @($settings | Where-Object { [bool]$_.present } | ForEach-Object {
        [pscustomobject]@{
            name = [string]$_.name
            kind = [string]$_.kind
            required = [bool]$_.required
        }
    })
    missing_required = $missingRequired
    set_results = $setResults.ToArray()
    deploy = $deployResult
    status_after = $statusResult
    errors = $errors.ToArray()
    notes = "Secret values are never printed. Secret/variable values are sent to gh over stdin."
}

if ($Json) {
    $result | ConvertTo-Json -Depth 8
}
else {
    "MUSU musu.pro P2P env configuration"
    "ok: $($result.ok)"
    "repo: $Repo"
    "dry_run: $($result.dry_run)"
    "settings: $(@($result.settings_requested | ForEach-Object { $_.name }) -join ', ')"
    if ($missingRequired.Count -gt 0) {
        "missing_required: $($missingRequired -join ', ')"
    }
    if ($Deploy) {
        "deploy_requested: True"
        if ($deployResult) {
            "deploy_ok: $($deployResult.ok)"
        }
    }
    if ($errors.Count -gt 0) {
        "errors: $($errors -join ', ')"
    }
}

if ($FailOnProblem -and -not $result.ok) {
    exit 1
}
