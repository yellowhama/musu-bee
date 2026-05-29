Set-StrictMode -Version Latest

function Get-MusuReleaseRepoRoot {
    param([string]$ScriptDirectory = $PSScriptRoot)

    return (Resolve-Path (Join-Path $ScriptDirectory "..\..")).Path
}

function Get-MusuReleaseSupportEmail {
    param([string]$RepoRoot)

    if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
        $RepoRoot = Get-MusuReleaseRepoRoot
    }

    $supportEmailPath = Join-Path $RepoRoot "SUPPORT_EMAIL"
    if (-not (Test-Path -LiteralPath $supportEmailPath)) {
        throw "Support email config not found: $supportEmailPath"
    }

    $supportEmail = (Get-Content -LiteralPath $supportEmailPath -Raw).Trim()
    if ($supportEmail -notmatch "^[^@\s]+@[^@\s]+\.[^@\s]+$") {
        throw "Support email config is not email-shaped: $supportEmailPath"
    }

    return $supportEmail
}
