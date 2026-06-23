# Uninstall-MUSU.ps1 — local complete uninstall for the self-signed beta (U-B).
#
# Inverse of Install-MUSU.ps1. Removes THIS machine's MUSU install:
#   [1/5] run the CLI uninstall (detach from account + stop bridge + purge data)
#   [2/5] Remove-AppxPackage   (a running process can't remove its own package,
#                               so the cockpit hands this to THIS elevated script)
#   [3/5] untrust the beta signing certificate
#   [4/5] backstop-remove ~/.musu (idempotent; the CLI --purge already did it)
#   [5/5] clean %TEMP%\musu-install
#
# This does NOT touch other machines on the account. Cloud self-deregister
# (removing this node from the account registry) is a separate server task
# (U-C); until it ships, this machine may linger as a ghost node until removed
# from another machine's cockpit fleet view.
#
# Self-elevates (mirrors Install-MUSU.ps1): if not admin, it re-launches itself
# from its own file path inside an elevated PowerShell.
#
# Every step is best-effort and continues on failure; the script exits 0 even on
# partial failure with a "re-run to finish" note, so a half-removed machine can
# always be cleaned up by running it again.

[CmdletBinding()]
param(
    # Skip the typed-phrase confirmation (used when launched from the cockpit,
    # which already collected the typed confirmation).
    [switch]$Force,
    # Keep ~/.musu data and skip the CLI --purge (detach + stop only).
    [switch]$KeepData,
    # Skip the CLI uninstall step entirely (just remove the package + cert).
    [switch]$SkipCleanup,
    # Keep the beta signing certificate trusted in LocalMachine\TrustedPeople.
    [switch]$KeepCert
)

# NOTE: deliberately NOT $ErrorActionPreference='Stop'. Every step here is
# best-effort: a failure in one step must not abort the rest of the teardown.

# Pinned signing-certificate thumbprint (canonical key blossompark.musu). MUST
# match Install-MUSU.ps1 and musu-rs/src/install/uninstall.rs. If the signing
# key rotates, update all three in the same commit.
$ExpectedCertThumbprint = "65F5926444D563966C75F000C384C8530B1D8DD8"
$PackageName = "blossompark.musu"
$ConfirmPhrase = "REMOVE MUSU"

function Test-IsAdmin {
    $id = [System.Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object System.Security.Principal.WindowsPrincipal($id)
    return $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-IsAdmin)) {
    Write-Host "MUSU uninstall needs administrator rights to remove the package and untrust the beta certificate." -ForegroundColor Yellow
    Write-Host "Re-launching elevated..." -ForegroundColor Yellow
    # Re-launch THIS script (we always have a file path — unlike the installer's
    # `irm | iex` mode, this script ships on disk). Forward the same switches and
    # always -Force when re-elevating (the elevated run shouldn't re-prompt).
    $argList = @("-ExecutionPolicy", "Bypass", "-NoProfile", "-File", $PSCommandPath, "-Force")
    if ($KeepData)    { $argList += "-KeepData" }
    if ($SkipCleanup) { $argList += "-SkipCleanup" }
    if ($KeepCert)    { $argList += "-KeepCert" }
    Start-Process powershell -Verb RunAs -ArgumentList $argList
    return
}

if (-not $Force) {
    Write-Host ""
    Write-Host "================================================================" -ForegroundColor Red
    Write-Host " MUSU complete uninstall  (DESTRUCTIVE, one-way)" -ForegroundColor Red
    Write-Host "================================================================" -ForegroundColor Red
    Write-Host " This removes MUSU from THIS machine: local data, the app" -ForegroundColor Yellow
    Write-Host " package, and the beta certificate. Other machines on your" -ForegroundColor Yellow
    Write-Host " account are NOT affected." -ForegroundColor Yellow
    Write-Host "================================================================" -ForegroundColor Red
    $typed = Read-Host "Type exactly '$ConfirmPhrase' to proceed (anything else aborts)"
    if ($typed -ne $ConfirmPhrase) {
        Write-Host "Aborted (typed input did not match)." -ForegroundColor Yellow
        return
    }
}

# Track per-step outcomes for the summary table + the "re-run to finish" exit note.
$results = [ordered]@{}

# ── [1/5] CLI uninstall (detach from account + stop bridge + purge data) ──────
# MUST run BEFORE Remove-AppxPackage: the `musu` alias resolves to the packaged
# binary, which disappears with the package. Resolve it while the package is
# still present.
if ($SkipCleanup) {
    $results["cli-uninstall"] = "skipped (-SkipCleanup)"
} else {
    Write-Host "[1/5] Running MUSU CLI uninstall (detach + stop + purge)..." -ForegroundColor Cyan
    try {
        $musu = Get-Command musu.exe -ErrorAction SilentlyContinue
        if (-not $musu) { $musu = Get-Command musu -ErrorAction SilentlyContinue }
        if ($musu) {
            $musuArgs = @("uninstall", "--deregister")
            if (-not $KeepData) {
                $musuArgs += @("--purge", "--i-understand-this-deletes-data", "--i-have-a-backup")
            }
            & $musu.Source @musuArgs
            if ($LASTEXITCODE -eq 0) {
                $results["cli-uninstall"] = "done"
            } else {
                $results["cli-uninstall"] = "failed (exit $LASTEXITCODE)"
            }
        } else {
            $results["cli-uninstall"] = "skipped (musu not on PATH)"
            Write-Host "    musu not found on PATH; skipping CLI uninstall (data backstop runs in [4/5])." -ForegroundColor DarkGray
        }
    } catch {
        $results["cli-uninstall"] = "failed ($($_.Exception.Message))"
        Write-Host "    CLI uninstall failed: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

# ── [2/5] Remove-AppxPackage ──────────────────────────────────────────────────
Write-Host "[2/5] Removing the MUSU app package..." -ForegroundColor Cyan
try {
    $pkgs = Get-AppxPackage -Name $PackageName -ErrorAction SilentlyContinue
    if ($pkgs) {
        $pkgs | Remove-AppxPackage -ErrorAction Stop
        $results["remove-package"] = "done"
    } else {
        $results["remove-package"] = "skipped (not installed)"
        Write-Host "    Package $PackageName not installed." -ForegroundColor DarkGray
    }
} catch {
    $results["remove-package"] = "failed ($($_.Exception.Message))"
    Write-Host "    Remove-AppxPackage failed: $($_.Exception.Message)" -ForegroundColor Yellow
}

# ── [3/5] Untrust the beta signing certificate ───────────────────────────────
if ($KeepCert) {
    $results["untrust-cert"] = "skipped (-KeepCert)"
} else {
    Write-Host "[3/5] Untrusting the beta certificate..." -ForegroundColor Cyan
    try {
        $certPath = "Cert:\LocalMachine\TrustedPeople\$ExpectedCertThumbprint"
        if (Test-Path $certPath) {
            Remove-Item $certPath -Force -ErrorAction Stop
            $results["untrust-cert"] = "done"
        } else {
            $results["untrust-cert"] = "skipped (not present)"
            Write-Host "    Certificate $ExpectedCertThumbprint not in TrustedPeople." -ForegroundColor DarkGray
        }
    } catch {
        $results["untrust-cert"] = "failed ($($_.Exception.Message))"
        Write-Host "    Certificate removal failed: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

# ── [4/5] Backstop-remove ~/.musu (idempotent) ───────────────────────────────
# The CLI --purge in [1/5] normally already deleted this. This is the backstop
# for the "musu not on PATH" / "CLI failed" / -SkipCleanup-with-data paths.
if ($KeepData) {
    $results["remove-data"] = "skipped (-KeepData)"
} else {
    Write-Host "[4/5] Removing ~/.musu data directory (backstop)..." -ForegroundColor Cyan
    try {
        $musuHome = Join-Path $env:USERPROFILE ".musu"
        if (Test-Path $musuHome) {
            Remove-Item -Recurse -Force $musuHome -ErrorAction Stop
            $results["remove-data"] = "done"
        } else {
            $results["remove-data"] = "skipped (already gone)"
        }
    } catch {
        $results["remove-data"] = "failed ($($_.Exception.Message))"
        Write-Host "    Data removal failed: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

# ── [5/5] Clean %TEMP%\musu-install ──────────────────────────────────────────
Write-Host "[5/5] Cleaning install scratch directory..." -ForegroundColor Cyan
try {
    $work = Join-Path $env:TEMP "musu-install"
    if (Test-Path $work) {
        Remove-Item -Recurse -Force $work -ErrorAction Stop
        $results["clean-temp"] = "done"
    } else {
        $results["clean-temp"] = "skipped (already gone)"
    }
} catch {
    $results["clean-temp"] = "failed ($($_.Exception.Message))"
    Write-Host "    Temp cleanup failed: $($_.Exception.Message)" -ForegroundColor Yellow
}

# ── Summary ───────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "MUSU uninstall summary:" -ForegroundColor Cyan
foreach ($k in $results.Keys) {
    $v = $results[$k]
    $color = if ($v -like "failed*") { "Yellow" } elseif ($v -like "done") { "Green" } else { "DarkGray" }
    Write-Host ("  {0,-16} {1}" -f $k, $v) -ForegroundColor $color
}

$anyFailed = $false
foreach ($v in $results.Values) { if ($v -like "failed*") { $anyFailed = $true } }
if ($anyFailed) {
    Write-Host ""
    Write-Host "Some steps did not complete. Re-run this script to finish — every step is idempotent." -ForegroundColor Yellow
} else {
    Write-Host ""
    Write-Host "MUSU has been removed from this machine." -ForegroundColor Green
}

# Exit 0 even on partial failure: the operator can always re-run to converge.
exit 0
