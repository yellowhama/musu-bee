[CmdletBinding()]
<#
.SYNOPSIS
  Post-deploy canary: verify every desktop-release URL that musu-pro links to
  actually resolves (HTTP 200) on the live GitHub release.

.DESCRIPTION
  Publishing the desktop artifacts to the `desktop-latest` release is a MANUAL
  step (see musu-bee/src/lib/publicRelease.ts) — no CI uploads them. So a single
  forgotten `gh release upload` silently breaks installs/auto-update: the
  .appinstaller 404s at update time, or the one-line installer can't fetch the
  cert/script. This script is the drift guard that comment prescribes.

  It parses the canonical URLs straight out of publicRelease.ts (so it can never
  drift from what the site actually links) and issues a HEAD request to each.
  Any non-200 → non-zero exit, so it doubles as a CI gate.

.EXAMPLE
  pwsh scripts/windows/canary-desktop-release.ps1
  # → one line per asset, PASS/FAIL summary, exit 0 if all 200.
#>
param(
    [string]$PublicReleasePath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
if (-not $PublicReleasePath) {
    $PublicReleasePath = Join-Path $repoRoot "musu-bee\src\lib\publicRelease.ts"
}
if (-not (Test-Path -LiteralPath $PublicReleasePath)) {
    throw "publicRelease.ts not found at $PublicReleasePath"
}

$src = Get-Content -LiteralPath $PublicReleasePath -Raw

# Resolve the release base (a template literal: `${...}/...`). Extract the literal
# string the base const is assigned, then the suffix each URL appends.
$baseMatch = [regex]::Match($src, 'DESKTOP_RELEASE_BASE\s*=\s*\r?\n?\s*"([^"]+)"')
if (-not $baseMatch.Success) {
    throw "Could not parse DESKTOP_RELEASE_BASE from publicRelease.ts"
}
$base = $baseMatch.Groups[1].Value

# Each exported URL is `${DESKTOP_RELEASE_BASE}/<suffix>`; capture the suffix.
$urlMatches = [regex]::Matches(
    $src,
    'export const (DESKTOP_[A-Z_]+URL)\s*=\s*`\$\{DESKTOP_RELEASE_BASE\}/([^`]+)`'
)
if ($urlMatches.Count -eq 0) {
    throw "Could not parse any DESKTOP_*_URL from publicRelease.ts"
}

$targets = @()
foreach ($m in $urlMatches) {
    $targets += [pscustomobject]@{
        Name = $m.Groups[1].Value
        Url  = "$base/$($m.Groups[2].Value)"
    }
}

Write-Host "Canary: $($targets.Count) desktop-release URLs from $PublicReleasePath"
Write-Host ""

$failures = 0
foreach ($t in $targets) {
    $status = $null
    $len = $null
    try {
        # HEAD via Invoke-WebRequest. GitHub release asset URLs 302→S3; follow it.
        $resp = Invoke-WebRequest -Uri $t.Url -Method Head -MaximumRedirection 5 `
            -SkipHttpErrorCheck -TimeoutSec 30
        $status = [int]$resp.StatusCode
        $len = $resp.Headers["Content-Length"]
    } catch {
        $status = "ERR: $($_.Exception.Message)"
    }
    $ok = ($status -eq 200)
    if (-not $ok) { $failures++ }
    $mark = if ($ok) { "PASS" } else { "FAIL" }
    Write-Host ("  [{0}] {1,-26} {2}  {3}" -f $mark, $t.Name, $status, $t.Url)
}

Write-Host ""
if ($failures -eq 0) {
    Write-Host "CANARY OK: all $($targets.Count) assets return 200."
    exit 0
} else {
    Write-Host "CANARY FAILED: $failures of $($targets.Count) assets are not 200."
    Write-Host "A forgotten upload silently breaks installs/auto-update — re-upload the missing asset(s) to the desktop-latest release."
    exit 1
}
