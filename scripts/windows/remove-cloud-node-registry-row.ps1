[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$NodeName,
    [string]$BaseUrl = "https://musu.pro",
    [string]$Token,
    [switch]$RequireDeleted,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step([string]$Message) {
    if (-not $Json) {
        Write-Host ""
        Write-Host "==> $Message"
    }
}

function Get-AccountToken {
    if (-not [string]::IsNullOrWhiteSpace($Token)) {
        return $Token.Trim()
    }

    foreach ($name in @("MUSU_P2P_CONTROL_TOKEN", "MUSU_ROUTE_EVIDENCE_TOKEN", "MUSU_TOKEN")) {
        $value = [Environment]::GetEnvironmentVariable($name)
        if (-not [string]::IsNullOrWhiteSpace($value)) {
            return $value.Trim()
        }
    }

    $tokenPath = Join-Path $env:USERPROFILE ".musu\token"
    if (Test-Path -LiteralPath $tokenPath) {
        $value = (Get-Content -LiteralPath $tokenPath -Raw).Trim()
        if (-not [string]::IsNullOrWhiteSpace($value)) {
            return $value
        }
    }

    throw "No MUSU account token found. Run `musu login` or pass -Token."
}

function Invoke-DeleteNode {
    param(
        [Parameter(Mandatory = $true)][string]$Url,
        [Parameter(Mandatory = $true)][string]$Bearer
    )

    try {
        $response = Invoke-WebRequest `
            -Method Delete `
            -Uri $Url `
            -Headers @{ Authorization = "Bearer $Bearer" } `
            -UseBasicParsing `
            -TimeoutSec 20
        return [pscustomobject]@{
            status_code = [int]$response.StatusCode
            body = $response.Content
            error = $null
        }
    }
    catch {
        $statusCode = $null
        $body = $null
        if ($_.Exception.Response) {
            $statusCode = [int]$_.Exception.Response.StatusCode
            try {
                $stream = $_.Exception.Response.GetResponseStream()
                if ($stream) {
                    $reader = [System.IO.StreamReader]::new($stream)
                    $body = $reader.ReadToEnd()
                }
            }
            catch {
                $body = $null
            }
        }
        return [pscustomobject]@{
            status_code = $statusCode
            body = $body
            error = $_.Exception.Message
        }
    }
}

$normalizedNodeName = $NodeName.Trim()
if ([string]::IsNullOrWhiteSpace($normalizedNodeName)) {
    throw "-NodeName must not be empty."
}

$base = $BaseUrl.TrimEnd("/")
$escapedNode = [System.Uri]::EscapeDataString($normalizedNodeName)
$url = "$base/api/v1/nodes/$escapedNode"

Write-Step "Deleting owner-scoped cloud node registry row"
$accountToken = Get-AccountToken
$result = Invoke-DeleteNode -Url $url -Bearer $accountToken
$bodyJson = $null
if (-not [string]::IsNullOrWhiteSpace([string]$result.body)) {
    try {
        $bodyJson = $result.body | ConvertFrom-Json
    }
    catch {
        $bodyJson = $null
    }
}

$deleted = $false
if ($bodyJson -and $bodyJson.PSObject.Properties["deleted"]) {
    $deleted = [bool]$bodyJson.deleted
}

$ok = ($result.status_code -eq 200 -and $deleted) -or ($result.status_code -eq 404 -and -not $RequireDeleted)
$evidence = [pscustomobject]@{
    schema = "musu.cloud_node_registry_delete.v1"
    generated_at = (Get-Date).ToUniversalTime().ToString("o")
    ok = $ok
    base_url = $base
    node_name = $normalizedNodeName
    status_code = $result.status_code
    deleted = $deleted
    require_deleted = [bool]$RequireDeleted
    error = $result.error
}

if ($Json) {
    $evidence | ConvertTo-Json -Depth 6
}
else {
    $evidence | Format-List
}

if (-not $ok) {
    exit 1
}
