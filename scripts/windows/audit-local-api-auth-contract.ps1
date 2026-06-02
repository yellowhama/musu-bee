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
$staleDocHits = New-Object System.Collections.Generic.List[object]

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

$configText = Get-RepoText "musu-rs\src\bridge\config.rs"
$authText = Get-RepoText "musu-rs\src\bridge\auth.rs"

Add-Check `
    -Scope "source" `
    -Name "localhost auth defaults required" `
    -Passed ($configText -match 'C-SEC-3 INVERSION:\s+default = true \(localhost requires auth\)' -and $configText -match 'default = true \(no localhost bypass\)') `
    -Path "musu-rs\src\bridge\config.rs" `
    -Message "config.rs documents that localhost auth is required by default."

Add-Check `
    -Scope "source" `
    -Name "localhost bypass is explicit opt-in" `
    -Passed ($configText -match 'MUSU_BRIDGE_LOCALHOST_AUTH=0' -and $configText -match 'Ok\("0"\)\s*\|\s*Ok\("false"\)\s*\|\s*Ok\("no"\)') `
    -Path "musu-rs\src\bridge\config.rs" `
    -Message "config.rs only enables localhost bypass for explicit 0/false/no opt-in values."

Add-Check `
    -Scope "source" `
    -Name "localhost auth tests present" `
    -Passed ($configText.Contains("fn localhost_auth_required_default_true()") -and $configText.Contains("fn localhost_auth_bypass_explicit_opt_in()")) `
    -Path "musu-rs\src\bridge\config.rs" `
    -Message "config.rs tests cover default-required auth and explicit local bypass."

Add-Check `
    -Scope "source" `
    -Name "middleware bypass requires opt-in and loopback" `
    -Passed ($authText.Contains("!state.localhost_auth_required && is_loopback_strict(ip)")) `
    -Path "musu-rs\src\bridge\auth.rs" `
    -Message "auth middleware only bypasses localhost when bypass is explicitly enabled and the client IP is loopback."

Add-Check `
    -Scope "source" `
    -Name "bearer auth and constant-time compare" `
    -Passed ($authText.Contains("parse_bearer") -and $authText.Contains("ct_compare") -and $authText.Contains('unauthorized("missing authorization")')) `
    -Path "musu-rs\src\bridge\auth.rs" `
    -Message "auth middleware parses Bearer tokens and uses the constant-time compare path."

$currentDocs = @(
    "docs\API.md",
    "docs\ARCHITECTURE.md",
    "docs\CONFIG.md",
    "docs\GETTING_STARTED.md",
    "docs\MANUAL.md",
    "docs\PRODUCTION.md",
    "docs\TROUBLESHOOTING.md",
    "musu-rs\README.md",
    "musu-rs\COMMANDS.md"
)

$stalePatterns = @(
    [pscustomobject]@{ id = "localhost bypasses auth"; pattern = '(?i)localhost requests bypass auth' },
    [pscustomobject]@{ id = "default localhost bypass"; pattern = '(?i)default:\s*localhost bypasses auth' },
    [pscustomobject]@{ id = "localhost requests bypass token auth"; pattern = '(?i)requests from [`'']?127\.0\.0\.1[`'']?\s+bypass token auth' },
    [pscustomobject]@{ id = "skip token validation dev convenience"; pattern = '(?i)skip token validation \(dev convenience\)' },
    [pscustomobject]@{ id = "default auth bypass applies"; pattern = '(?i)default auth bypass applies' },
    [pscustomobject]@{ id = "set 1 to require localhost token"; pattern = '(?i)MUSU_BRIDGE_LOCALHOST_AUTH=1' },
    [pscustomobject]@{ id = "if set any value requires localhost token"; pattern = '(?i)If set to any value, also requires the bearer token' }
)

foreach ($relative in $currentDocs) {
    $text = Get-RepoText $relative
    if ([string]::IsNullOrWhiteSpace($text)) {
        continue
    }

    $hits = New-Object System.Collections.Generic.List[object]
    foreach ($pattern in $stalePatterns) {
        if ($text -match $pattern.pattern) {
            $hit = [pscustomobject]@{
                path = $relative
                id = $pattern.id
                pattern = $pattern.pattern
            }
            $hits.Add($hit) | Out-Null
            $staleDocHits.Add($hit) | Out-Null
        }
    }

    Add-Check `
        -Scope "docs" `
        -Name "no stale localhost auth wording: $relative" `
        -Passed ($hits.Count -eq 0) `
        -Path $relative `
        -Message ($(if ($hits.Count -eq 0) { "No stale localhost-bypass wording found." } else { "Found stale localhost auth wording: $(@($hits | ForEach-Object { $_.id }) -join ', ')." }))
}

$expectedDocPhrases = @(
    [pscustomobject]@{
        path = "docs\API.md"
        pattern = 'Localhost requests require the same token by default\.'
        description = "Localhost requests require the same token by default."
    },
    [pscustomobject]@{
        path = "docs\CONFIG.md"
        pattern = 'Auth is required by default, including localhost\.'
        description = "Auth is required by default, including localhost."
    },
    [pscustomobject]@{
        path = "docs\GETTING_STARTED.md"
        pattern = 'Localhost requests require\s+the bearer token by default\.'
        description = "Localhost requests require the bearer token by default."
    },
    [pscustomobject]@{
        path = "docs\MANUAL.md"
        pattern = 'Auth is required by default, including `127\.0\.0\.1`/`::1`\.'
        description = "Auth is required by default, including 127.0.0.1/::1."
    },
    [pscustomobject]@{
        path = "docs\PRODUCTION.md"
        pattern = 'Do not set `MUSU_BRIDGE_LOCALHOST_AUTH=0` in production\.'
        description = "Do not set MUSU_BRIDGE_LOCALHOST_AUTH=0 in production."
    },
    [pscustomobject]@{
        path = "docs\TROUBLESHOOTING.md"
        pattern = 'Localhost requests require the bearer token by default\.'
        description = "Localhost requests require the bearer token by default."
    },
    [pscustomobject]@{
        path = "docs\ARCHITECTURE.md"
        pattern = 'Localhost requests also require the token by default\.'
        description = "Localhost requests also require the token by default."
    }
)

foreach ($expectation in $expectedDocPhrases) {
    $text = Get-RepoText $expectation.path
    $matched = ($text -match $expectation.pattern)
    Add-Check `
        -Scope "docs" `
        -Name "expected auth phrase: $($expectation.path)" `
        -Passed $matched `
        -Path $expectation.path `
        -Message ($(if ($matched) { "Document states the current localhost auth contract." } else { "Document is missing expected phrase: $($expectation.description)" }))
}

$failCount = @($checks | Where-Object { $_.status -eq "fail" }).Count
$result = [pscustomobject]@{
    schema = "musu.local_api_auth_contract.v1"
    ok = ($failCount -eq 0)
    generated_at = [datetimeoffset]::Now.ToString("o")
    fail_count = $failCount
    docs_checked = $currentDocs
    stale_doc_hit_count = $staleDocHits.Count
    stale_doc_hits = $staleDocHits.ToArray()
    checks = $checks.ToArray()
}

if ($Json) {
    $result | ConvertTo-Json -Depth 8
}
else {
    "MUSU local API auth contract audit"
    "ok: $($result.ok)"
    "fail_count: $($result.fail_count)"
    "stale_doc_hit_count: $($result.stale_doc_hit_count)"
    ""
    $checks | Format-Table scope, name, status, path, message -Wrap
}

if ($FailOnProblem -and -not $result.ok) {
    exit 1
}
