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

$bridgeTokenText = Get-RepoText "musu-rs\src\install\token.rs"
$installRunnerText = Get-RepoText "musu-rs\src\install\runner.rs"
$cloudTokenText = Get-RepoText "musu-rs\src\cloud\token.rs"
$bridgeTokenWebText = Get-RepoText "musu-bee\src\lib\bridge-token.ts"
$hashHelperText = Get-RepoText "scripts\windows\show-p2p-control-token-hash.ps1"
$configureP2pText = Get-RepoText "scripts\windows\configure-musu-pro-p2p-env.ps1"
$deployWorkflowText = Get-RepoText ".github\workflows\deploy-musu-bee.yml"
$idleCpuText = Get-RepoText "scripts\windows\measure-musu-idle-cpu.ps1"
$matrixText = Get-RepoText "scripts\windows\measure-musu-runtime-cpu-scenarios.ps1"
$productionText = Get-RepoText "docs\PRODUCTION.md"
$configText = Get-RepoText "docs\CONFIG.md"

Add-Check `
    -Scope "source" `
    -Name "bridge token generated with CSPRNG and warning" `
    -Passed ($bridgeTokenText.Contains("getrandom::getrandom") -and $bridgeTokenText.Contains("Do NOT commit this file") -and $bridgeTokenText.Contains("Do NOT share the token") -and $bridgeTokenText.Contains("MUSU_BRIDGE_TOKEN={token}")) `
    -Path "musu-rs\src\install\token.rs" `
    -Message "Packaged startup bridge.env generation uses CSPRNG token material and writes an explicit no-commit/no-share warning."

Add-Check `
    -Scope "source" `
    -Name "bridge token file restricted on Unix and Windows" `
    -Passed ($bridgeTokenText.Contains("perms.set_mode(0o600)") -and $bridgeTokenText.Contains('"icacls"') -and $bridgeTokenText.Contains('"/inheritance:r"') -and $bridgeTokenText.Contains('"/grant:r"') -and $bridgeTokenText.Contains("USERDOMAIN")) `
    -Path "musu-rs\src\install\token.rs" `
    -Message "Packaged startup bridge.env is restricted to 0600 on Unix and domain-qualified current-user ACL on Windows."

Add-Check `
    -Scope "source" `
    -Name "installer bridge token restricted" `
    -Passed ($installRunnerText.Contains("generate_bridge_token") -and $installRunnerText.Contains("set_mode(&path, 0o600)") -and $installRunnerText.Contains("restrict_acl_to_current_user(&path)") -and $installRunnerText.Contains("USERDOMAIN") -and $installRunnerText.Contains("Do NOT commit this file")) `
    -Path "musu-rs\src\install\runner.rs" `
    -Message "musu install bridge.env path has the same no-share warning and platform permission contract."

Add-Check `
    -Scope "source" `
    -Name "account token file restricted on Unix and Windows" `
    -Passed ($cloudTokenText.Contains('musu_home.join("token")') -and $cloudTokenText.Contains("std::fs::write(&token_path, token)") -and $cloudTokenText.Contains("perms.set_mode(0o600)") -and $cloudTokenText.Contains("restrict_acl_to_current_user(&token_path)") -and $cloudTokenText.Contains('"icacls"') -and $cloudTokenText.Contains('"/inheritance:r"') -and $cloudTokenText.Contains('"/grant:r"') -and $cloudTokenText.Contains("USERDOMAIN")) `
    -Path "musu-rs\src\cloud\token.rs" `
    -Message "musu.pro account token storage uses 0600 on Unix and domain-qualified current-user ACL on Windows."

Add-Check `
    -Scope "source" `
    -Name "bridge token web helper is server-only" `
    -Passed ($bridgeTokenWebText.Contains('import "server-only"') -and $bridgeTokenWebText.Contains("getBridgeToken") -and $bridgeTokenWebText.Contains('join(getMusuHome(), "bridge.env")')) `
    -Path "musu-bee\src\lib\bridge-token.ts" `
    -Message "Next.js bridge token helper is server-only and reads the token from env or MUSU_HOME bridge.env."

Add-Check `
    -Scope "scripts" `
    -Name "P2P control token hash helper does not print raw token" `
    -Passed ($hashHelperText.Contains("raw_token_printed = `$false") -and $hashHelperText.Contains("MUSU_P2P_CONTROL_TOKEN_SHA256S") -and $hashHelperText.Contains("Raw token was not printed.")) `
    -Path "scripts\windows\show-p2p-control-token-hash.ps1" `
    -Message "P2P hash helper emits only the SHA-256 env value and records raw_token_printed=false."

Add-Check `
    -Scope "scripts" `
    -Name "P2P env configurator omits secret values from output" `
    -Passed ($configureP2pText.Contains("Secret values are never printed") -and $configureP2pText.Contains('ghArgs = @($Kind, "set", $Name, "--repo", $Repo)') -and $configureP2pText.Contains('$output = ($Value | gh @ghArgs 2>&1)') -and -not ($configureP2pText -match 'settings_requested[\s\S]*value\s*=')) `
    -Path "scripts\windows\configure-musu-pro-p2p-env.ps1" `
    -Message "P2P env configurator sends secret values to gh over stdin and does not include values in result output."

Add-Check `
    -Scope "workflow" `
    -Name "P2P Vercel env sync uses REST upsert and sensitive env types" `
    -Passed ($deployWorkflowText.Contains('https://api.vercel.com/v10/projects/') -and $deployWorkflowText.Contains('endpoint.searchParams.set("upsert", "true")') -and $deployWorkflowText.Contains('target: ["production"]') -and $deployWorkflowText.Contains('type: "sensitive"') -and $deployWorkflowText.Contains('MUSU_P2P_CONTROL_TOKEN_SHA256S') -and $deployWorkflowText.Contains('KV_REST_API_TOKEN') -and $deployWorkflowText.Contains('UPSTASH_REDIS_REST_TOKEN') -and $deployWorkflowText.Contains('MUSU_P2P_RELAY_ENTITLEMENT')) `
    -Path ".github\workflows\deploy-musu-bee.yml" `
    -Message "Production P2P control-plane env sync uses Vercel REST upsert and marks token/entitlement values as sensitive."

Add-Check `
    -Scope "workflow" `
    -Name "P2P Vercel env sync does not use vercel env add or print response bodies" `
    -Passed ((-not $deployWorkflowText.Contains('vercel env add')) -and $deployWorkflowText.Contains('failed with HTTP') -and (-not $deployWorkflowText.Contains('console.error(bodyText)')) -and (-not $deployWorkflowText.Contains('console.log(bodyText)'))) `
    -Path ".github\workflows\deploy-musu-bee.yml" `
    -Message "Production P2P env sync avoids the CLI env-add path and does not dump Vercel response bodies that may contain submitted values."

Add-Check `
    -Scope "scripts" `
    -Name "runtime CPU command line redacts secrets" `
    -Passed ($idleCpuText.Contains('<redacted>') -and $idleCpuText.Contains("TOKEN|SECRET|KEY|PASSWORD") -and $matrixText.Contains("expectedRouteToken") -and -not ($matrixText.Contains("MUSU_BRIDGE_TOKEN="))) `
    -Path "scripts\windows\measure-musu-idle-cpu.ps1" `
    -Message "Runtime CPU evidence redacts token/secret/key/password command-line hints and route tokens are per-run evidence markers, not credentials."

Add-Check `
    -Scope "docs" `
    -Name "production backup excludes token-bearing files" `
    -Passed ($productionText.Contains("Do not include token-bearing files") -and $productionText.Contains("~/.musu/bridge.env") -and $productionText.Contains("~/.musu/token") -and -not ($productionText -match 'tar\s+\S*[^\r\n]*bridge\.env')) `
    -Path "docs\PRODUCTION.md" `
    -Message "Production backup guidance excludes bridge.env/account-token files from ordinary config backups."

Add-Check `
    -Scope "docs" `
    -Name "config documents hashed P2P control token preference" `
    -Passed ($configText.Contains("MUSU_P2P_CONTROL_TOKEN_SHA256S") -and $configText.Contains("without storing the raw token server-side") -and $configText.Contains("without printing secret values")) `
    -Path "docs\CONFIG.md" `
    -Message "Config docs prefer SHA-256 allowlist for hosted P2P control auth and secret-safe env setup."

$failCount = @($checks | Where-Object { $_.status -eq "fail" }).Count
$result = [pscustomobject]@{
    schema = "musu.secret_storage_contract.v1"
    ok = ($failCount -eq 0)
    generated_at = [datetimeoffset]::Now.ToString("o")
    fail_count = $failCount
    checks = $checks.ToArray()
}

if ($Json) {
    $result | ConvertTo-Json -Depth 8
}
else {
    "MUSU secret storage contract audit"
    "ok: $($result.ok)"
    "fail_count: $($result.fail_count)"
    ""
    $checks | Format-Table scope, name, status, path, message -Wrap
}

if ($FailOnProblem -and -not $result.ok) {
    exit 1
}
