[CmdletBinding()]
param(
    [string]$BundleDir,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $scriptDir "msix-common.ps1")

$repoRoot = Get-WindowsRepoRoot $MyInvocation.MyCommand.Path
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

try {
    if ([string]::IsNullOrWhiteSpace($BundleDir)) {
        $submissionRoot = Join-Path $repoRoot ".local-build\msix\submission-bundles"
        $BundleDir = Get-ChildItem -LiteralPath $submissionRoot -Directory -Filter "store-reviewed-*" -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending |
            Select-Object -First 1 -ExpandProperty FullName
    }
    if ([string]::IsNullOrWhiteSpace($BundleDir) -or -not (Test-Path -LiteralPath $BundleDir)) {
        throw "Store submission bundle not found. Pass -BundleDir or run prepare-store-submission-bundle.ps1."
    }

    $bundleRoot = (Resolve-Path -LiteralPath $BundleDir).Path
    Add-Check "bundle root" "pass" "store submission bundle resolved to $bundleRoot"

    $requiredFiles = @(
        "bundle.json",
        "submission-notes.txt",
        "partner-center-capability-justification.md",
        "verify-store-reviewed.txt",
        "STORE_MSIX_RESTRICTED_CAPABILITY_SUBMISSION_CHECKLIST_2026_05_27.md",
        "STORE_MSIX_PACKAGING_GUIDE_2026_05_27.md",
        "WINDOWS_DISTRIBUTION_PIVOT_2026-05-27.md",
        "SHA256SUMS.txt"
    )
    foreach ($relative in $requiredFiles) {
        Add-CheckFromCondition "required file: $relative" (Test-Path -LiteralPath (Join-Path $bundleRoot $relative)) "$relative exists" "$relative is missing"
    }

    $msixFiles = @(Get-ChildItem -LiteralPath $bundleRoot -File -Filter "*_store-reviewed-immediate-registration.msix" -ErrorAction SilentlyContinue)
    Add-CheckFromCondition "store-reviewed MSIX count" ($msixFiles.Count -eq 1) "exactly one Store-reviewed MSIX exists" "expected exactly one Store-reviewed MSIX, found $($msixFiles.Count)"
    $msixFile = $msixFiles | Select-Object -First 1

    $certFiles = @(Get-ChildItem -LiteralPath $bundleRoot -File -Filter "*.cer" -ErrorAction SilentlyContinue)
    Add-CheckFromCondition "public cert count" ($certFiles.Count -ge 1) "public certificate .cer exists" "public certificate .cer is missing"

    $privateCerts = @(Get-ChildItem -LiteralPath $bundleRoot -Recurse -File -ErrorAction SilentlyContinue | Where-Object {
        $_.Extension -in @(".pfx", ".p12")
    })
    Add-CheckFromCondition "private key exclusion" ($privateCerts.Count -eq 0) "bundle excludes private .pfx/.p12 files" "bundle contains private certificate material"

    $bundleMetadataPath = Join-Path $bundleRoot "bundle.json"
    $metadata = $null
    if (Test-Path -LiteralPath $bundleMetadataPath) {
        try {
            $metadata = Get-Content -LiteralPath $bundleMetadataPath -Raw | ConvertFrom-Json
            Add-Check "metadata schema" "pass" "bundle.json parses"
        }
        catch {
            Add-Check "metadata schema" "fail" "bundle.json does not parse: $($_.Exception.Message)"
        }
    }
    if ($metadata) {
        Add-CheckFromCondition "metadata StartupContract" ($metadata.StartupContract -eq "store-reviewed-immediate-registration") "metadata uses Store-reviewed startup contract" "metadata StartupContract is not store-reviewed-immediate-registration"
        Add-CheckFromCondition "metadata PackagePath" (-not [string]::IsNullOrWhiteSpace([string]$metadata.PackagePath)) "metadata includes PackagePath" "metadata PackagePath is missing"
        Add-CheckFromCondition "metadata PreparedAtUtc" (-not [string]::IsNullOrWhiteSpace([string]$metadata.PreparedAtUtc)) "metadata includes PreparedAtUtc" "metadata PreparedAtUtc is missing"
    }

    if ($msixFile) {
        try {
            $package = Get-MsixPackageInfo -Path $msixFile.FullName
            $contract = Get-MsixStartupContract -Manifest $package.Manifest
            Add-Check "MSIX manifest read" "pass" "MSIX manifest parsed"
            Add-CheckFromCondition "MSIX alias" ([bool]$contract.HasAlias) "MSIX declares musu.exe alias" "MSIX does not declare musu.exe alias"
            Add-CheckFromCondition "MSIX startup task" ([bool]$contract.HasStartupTask) "MSIX declares MusuBridgeStartup" "MSIX does not declare MusuBridgeStartup"
            Add-CheckFromCondition "MSIX immediate registration" ($contract.StartupImmediateRegistration -eq "true") "MSIX sets ImmediateRegistration=true" "MSIX does not set ImmediateRegistration=true"
            Add-CheckFromCondition "MSIX restricted startup capability" ([bool]$contract.HasNonUserConfigurableStartupCapability) "MSIX declares restricted startup capability" "MSIX lacks restricted startup capability"
            Add-CheckFromCondition "MSIX runFullTrust" ([bool]$contract.HasRunFullTrust) "MSIX declares runFullTrust" "MSIX lacks runFullTrust"
        }
        catch {
            Add-Check "MSIX manifest read" "fail" "MSIX manifest could not be inspected: $($_.Exception.Message)"
        }

        $verifyScript = Join-Path $scriptDir "verify-msix-package.ps1"
        $verifyOutput = & powershell -NoProfile -ExecutionPolicy Bypass -File $verifyScript -PackagePath $msixFile.FullName -StartupContract store-reviewed-immediate-registration -SkipSmoke 2>&1
        Add-CheckFromCondition "verify-msix-package" ($LASTEXITCODE -eq 0) "verify-msix-package.ps1 passed" "verify-msix-package.ps1 failed: $($verifyOutput | Out-String)"

        $desktopEntrypointScript = Join-Path $scriptDir "audit-msix-desktop-entrypoint.ps1"
        if (Test-Path -LiteralPath $desktopEntrypointScript) {
            $entrypointOutput = & powershell -NoProfile -ExecutionPolicy Bypass -File $desktopEntrypointScript -PackagePath $msixFile.FullName -StartupContract store-reviewed-immediate-registration -Json 2>&1
            if ($LASTEXITCODE -eq 0) {
                try {
                    $entrypointAudit = ($entrypointOutput | Out-String).Trim() | ConvertFrom-Json
                    Add-CheckFromCondition "MSIX desktop entrypoint" ([bool]$entrypointAudit.ok) "MSIX application entrypoint launches $($entrypointAudit.expected_application_executable)" "MSIX desktop entrypoint audit failed: $(@($entrypointAudit.checks | Where-Object { $_.status -eq "fail" } | Select-Object -First 3 | ForEach-Object { $_.message }) -join '; ')"
                }
                catch {
                    Add-Check "MSIX desktop entrypoint" "fail" "audit-msix-desktop-entrypoint.ps1 did not return parseable JSON: $($_.Exception.Message)"
                }
            }
            else {
                Add-Check "MSIX desktop entrypoint" "fail" "audit-msix-desktop-entrypoint.ps1 failed: $($entrypointOutput | Out-String)"
            }
        }
        else {
            Add-Check "MSIX desktop entrypoint" "fail" "audit-msix-desktop-entrypoint.ps1 is missing"
        }
    }

    $notes = ""
    $notesPath = Join-Path $bundleRoot "submission-notes.txt"
    if (Test-Path -LiteralPath $notesPath) {
        $notes = Get-Content -LiteralPath $notesPath -Raw
    }
    Add-CheckFromCondition "notes restricted capability" ($notes -match "Microsoft\.nonUserConfigurableStartupTasks_8wekyb3d8bbwe" -and $notes -match "runFullTrust|desktop:StartupTask") "submission notes mention restricted startup/full-trust context" "submission notes do not explain restricted startup/full-trust context"
    Add-CheckFromCondition "notes no unrelated product" ($notes -notmatch "HiveLink|Vibe PM") "submission notes avoid unrelated product names" "submission notes include unrelated product names"

    $checksumsPath = Join-Path $bundleRoot "SHA256SUMS.txt"
    if (Test-Path -LiteralPath $checksumsPath) {
        $checksumLines = @(Get-Content -LiteralPath $checksumsPath | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
        Add-CheckFromCondition "checksums present" ($checksumLines.Count -gt 0) "SHA256SUMS.txt has entries" "SHA256SUMS.txt is empty"
        foreach ($line in $checksumLines) {
            if ($line -notmatch "^([0-9a-fA-F]{64})\s+(.+)$") {
                Add-Check "checksum format" "fail" "invalid checksum line: $line"
                continue
            }
            $expected = $Matches[1].ToLowerInvariant()
            $relative = $Matches[2] -replace "/", "\"
            $filePath = Join-Path $bundleRoot $relative
            if (-not (Test-Path -LiteralPath $filePath)) {
                Add-Check "checksum file: $relative" "fail" "file listed in checksums is missing"
                continue
            }
            $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $filePath).Hash.ToLowerInvariant()
            Add-CheckFromCondition "checksum file: $relative" ($actual -eq $expected) "checksum matches" "checksum mismatch"
        }
    }

    $failCount = @($checks | Where-Object { $_.status -eq "fail" }).Count
    $result = [pscustomobject]@{
        ok = ($failCount -eq 0)
        bundle_dir = $bundleRoot
        fail_count = $failCount
        msix = if ($msixFile) { $msixFile.FullName } else { $null }
        checks = $checks.ToArray()
    }

    if ($Json) {
        $result | ConvertTo-Json -Depth 8
    }
    else {
        "MUSU Store submission bundle verification"
        "ok: $($result.ok)"
        "bundle_dir: $($result.bundle_dir)"
        ""
        $checks | Format-Table name, status, message -Wrap
    }

    if (-not $result.ok) {
        exit 1
    }
}
catch {
    if ($Json) {
        [pscustomobject]@{
            ok = $false
            bundle_dir = $BundleDir
            fail_count = 1
            error = $_.Exception.Message
            checks = $checks.ToArray()
        } | ConvertTo-Json -Depth 8
    }
    else {
        Write-Error $_.Exception.Message
    }
    exit 1
}
