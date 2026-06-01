param(
    [string]$Token,
    [string]$TokenPath = (Join-Path $env:USERPROFILE ".musu\token"),
    [switch]$Json
)

$ErrorActionPreference = "Stop"

if (-not $Token) {
    if (-not (Test-Path -LiteralPath $TokenPath)) {
        throw "Token not found. Run musu login or pass -Token."
    }
    $Token = (Get-Content -LiteralPath $TokenPath -Raw).Trim()
}

if (-not $Token) {
    throw "Token is empty."
}

$sha = [System.Security.Cryptography.SHA256]::Create()
try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Token)
    $hashBytes = $sha.ComputeHash($bytes)
    $hash = -join ($hashBytes | ForEach-Object { $_.ToString("x2") })
    $envValue = "sha256:$hash"

    if ($Json) {
        [pscustomobject]@{
            ok = $true
            schema = "musu.p2p_control_token_hash.v1"
            env_name = "MUSU_P2P_CONTROL_TOKEN_SHA256S"
            env_value = $envValue
            token_path = $TokenPath
            raw_token_printed = $false
        } | ConvertTo-Json -Depth 4
        return
    }

    Write-Output "MUSU_P2P_CONTROL_TOKEN_SHA256S=$envValue"
    Write-Output "Raw token was not printed."
} finally {
    $sha.Dispose()
}
