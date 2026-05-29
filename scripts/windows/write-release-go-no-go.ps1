[CmdletBinding()]
param(
    [string]$PublicMetadataBaseUrl = "https://musu.pro",
    [switch]$SkipPublicMetadata,
    [switch]$FailOnNotReady,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
$version = (Get-Content -LiteralPath (Join-Path $repoRoot "VERSION") -Raw).Trim()

function Invoke-JsonScript {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [string[]]$Arguments = @(),
        [switch]$AllowFailure
    )

    $output = & powershell -NoProfile -ExecutionPolicy Bypass -File $FilePath @Arguments 2>&1
    $exitCode = $LASTEXITCODE
    $text = ($output | Out-String).Trim()
    $parsed = $null
    if (-not [string]::IsNullOrWhiteSpace($text)) {
        try {
            $parsed = $text | ConvertFrom-Json
        }
        catch {
            if (-not $AllowFailure) {
                throw "Script did not return parseable JSON: $FilePath`n$text"
            }
        }
    }

    if ($exitCode -ne 0 -and -not $AllowFailure) {
        throw "Script failed with exit code ${exitCode}: $FilePath`n$text"
    }

    [pscustomobject]@{
        exit_code = $exitCode
        json = $parsed
        raw = $text
    }
}

function Add-Blocker {
    param(
        [System.Collections.Generic.List[object]]$List,
        [Parameter(Mandatory = $true)][string]$Area,
        [Parameter(Mandatory = $true)][string]$Message
    )

    $List.Add([pscustomobject]@{
        area = $Area
        message = $Message
    }) | Out-Null
}

$auditScript = Join-Path $scriptDir "audit-desktop-release-readiness.ps1"
$metadataScript = Join-Path $scriptDir "verify-store-public-metadata.ps1"
$manifestScript = Join-Path $scriptDir "write-release-candidate-manifest.ps1"
$supportMailboxVerifierScript = Join-Path $scriptDir "verify-support-mailbox-evidence.ps1"
$msixInstallVerifierScript = Join-Path $scriptDir "verify-msix-install-evidence.ps1"
$storeReleaseVerifierScript = Join-Path $scriptDir "verify-store-release-evidence.ps1"
$manifestPath = Join-Path $repoRoot ".local-build\release-candidates\$version\release-candidate-manifest.json"

$auditResult = Invoke-JsonScript -FilePath $auditScript -Arguments @("-Json")
$audit = $auditResult.json

& powershell -NoProfile -ExecutionPolicy Bypass -File $manifestScript | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "Release candidate manifest generation failed."
}
$manifest = if (Test-Path -LiteralPath $manifestPath) {
    Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
}
else {
    $null
}

$publicMetadataResult = $null
if (-not $SkipPublicMetadata) {
    $publicMetadataResult = Invoke-JsonScript `
        -FilePath $metadataScript `
        -Arguments @("-BaseUrl", $PublicMetadataBaseUrl, "-Json") `
        -AllowFailure
}

$supportMailboxVerified = $false
$supportMailboxEvidence = $null
$supportMailboxEvidenceCandidate = $null
if (-not $supportMailboxVerified) {
    $supportEvidenceRoots = @(
        [pscustomobject]@{
            path = (Join-Path $repoRoot ("docs\evidence\support-mailbox\{0}" -f $version))
            filter = "*.evidence.json"
        },
        [pscustomobject]@{
            path = (Join-Path $repoRoot ".local-build\support-mailbox")
            filter = "*.evidence.json"
        }
    )

    foreach ($root in $supportEvidenceRoots) {
        if (Test-Path -LiteralPath $root.path) {
            $candidate = Get-ChildItem -LiteralPath $root.path -Filter $root.filter -File -ErrorAction SilentlyContinue |
                Sort-Object LastWriteTime -Descending |
                Select-Object -First 1
            if ($candidate) {
                $supportMailboxEvidenceCandidate = $candidate
                break
            }
        }
    }

    if ($supportMailboxEvidenceCandidate) {
        $supportMailboxEvidenceResult = Invoke-JsonScript `
            -FilePath $supportMailboxVerifierScript `
            -Arguments @("-EvidencePath", $supportMailboxEvidenceCandidate.FullName, "-Json") `
            -AllowFailure
        if ($supportMailboxEvidenceResult.json -and [bool]$supportMailboxEvidenceResult.json.ok) {
            $supportMailboxVerified = $true
            $supportMailboxEvidence = $supportMailboxEvidenceResult.json
        }
        else {
            $supportMailboxEvidence = [pscustomobject]@{
                ok = $false
                evidence_path = $supportMailboxEvidenceCandidate.FullName
                raw = $supportMailboxEvidenceResult.raw
            }
        }
    }
}

$msixInstallVerified = $false
$msixInstallEvidence = $null
$msixInstallEvidenceCandidate = $null
$msixInstallEvidenceRoots = @(
    [pscustomobject]@{
        path = (Join-Path $repoRoot ("docs\evidence\msix-install\{0}" -f $version))
        filter = "*.evidence.json"
    },
    [pscustomobject]@{
        path = (Join-Path $repoRoot ".local-build\msix-install")
        filter = "*.evidence.json"
    }
)

foreach ($root in $msixInstallEvidenceRoots) {
    if (Test-Path -LiteralPath $root.path) {
        $candidate = Get-ChildItem -LiteralPath $root.path -Filter $root.filter -File -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending |
            Select-Object -First 1
        if ($candidate) {
            $msixInstallEvidenceCandidate = $candidate
            break
        }
    }
}

if ($msixInstallEvidenceCandidate) {
    $msixInstallEvidenceResult = Invoke-JsonScript `
        -FilePath $msixInstallVerifierScript `
        -Arguments @("-EvidencePath", $msixInstallEvidenceCandidate.FullName, "-ExpectedVersion", $version, "-Json") `
        -AllowFailure
    if ($msixInstallEvidenceResult.json -and [bool]$msixInstallEvidenceResult.json.ok) {
        $msixInstallVerified = $true
        $msixInstallEvidence = $msixInstallEvidenceResult.json
    }
    else {
        $msixInstallEvidence = [pscustomobject]@{
            ok = $false
            evidence_path = $msixInstallEvidenceCandidate.FullName
            raw = $msixInstallEvidenceResult.raw
        }
    }
}

$storeReleaseVerified = $false
$storeReleaseEvidence = $null
$storeReleaseEvidenceCandidate = $null
$storeReleaseEvidenceRoots = @(
    [pscustomobject]@{
        path = (Join-Path $repoRoot ("docs\evidence\store-release\{0}" -f $version))
        filter = "*.evidence.json"
    },
    [pscustomobject]@{
        path = (Join-Path $repoRoot ".local-build\store-release")
        filter = "*.evidence.json"
    }
)

foreach ($root in $storeReleaseEvidenceRoots) {
    if (Test-Path -LiteralPath $root.path) {
        $candidate = Get-ChildItem -LiteralPath $root.path -Filter $root.filter -File -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending |
            Select-Object -First 1
        if ($candidate) {
            $storeReleaseEvidenceCandidate = $candidate
            break
        }
    }
}

if ($storeReleaseEvidenceCandidate) {
    $storeReleaseEvidenceResult = Invoke-JsonScript `
        -FilePath $storeReleaseVerifierScript `
        -Arguments @("-EvidencePath", $storeReleaseEvidenceCandidate.FullName, "-ExpectedVersion", $version, "-Json") `
        -AllowFailure
    if ($storeReleaseEvidenceResult.json -and [bool]$storeReleaseEvidenceResult.json.ok) {
        $storeReleaseVerified = $true
        $storeReleaseEvidence = $storeReleaseEvidenceResult.json
    }
    else {
        $storeReleaseEvidence = [pscustomobject]@{
            ok = $false
            evidence_path = $storeReleaseEvidenceCandidate.FullName
            raw = $storeReleaseEvidenceResult.raw
        }
    }
}

$gitStatus = (& git -C $repoRoot status --short 2>$null | Out-String).Trim()
$blockers = New-Object System.Collections.Generic.List[object]
$warnings = New-Object System.Collections.Generic.List[object]

if (-not [bool]$audit.runtime_package_ready) {
    Add-Blocker -List $blockers -Area "runtime-package" -Message "Runtime package readiness is false."
}
if (-not [bool]$audit.desktop_shell_ready) {
    Add-Blocker -List $blockers -Area "desktop-shell" -Message "Desktop shell readiness is false."
}
if (-not [bool]$audit.single_machine_verified) {
    Add-Blocker -List $blockers -Area "single-machine" -Message "Fresh single-machine smoke evidence has not been recorded."
}
if (-not $msixInstallVerified) {
    Add-Blocker -List $blockers -Area "msix-install" -Message "Clean/current Windows MSIX install evidence has not been recorded."
}
if (-not [bool]$audit.multi_device_verified) {
    Add-Blocker -List $blockers -Area "multi-device" -Message "Real second-PC multi-device evidence has not been recorded."
}
if (-not $SkipPublicMetadata) {
    if (-not $publicMetadataResult.json -or -not [bool]$publicMetadataResult.json.ok) {
        Add-Blocker -List $blockers -Area "store-public-metadata" -Message "Public privacy/support metadata verification failed for $PublicMetadataBaseUrl."
    }
}
else {
    Add-Blocker -List $blockers -Area "store-public-metadata" -Message "Public privacy/support metadata verification was skipped."
}
if (-not $supportMailboxVerified) {
    Add-Blocker -List $blockers -Area "support-mailbox" -Message "support@musu.pro delivery has not been operator-verified."
}
if (-not $storeReleaseVerified) {
    Add-Blocker -List $blockers -Area "store-release" -Message "Partner Center product name reservation, app submission, Microsoft certification, and restricted capability approval evidence has not been recorded."
}
if (-not [string]::IsNullOrWhiteSpace($gitStatus)) {
    Add-Blocker -List $blockers -Area "git" -Message "Working tree is dirty; commit and regenerate manifest before final handoff."
}

$manualExternalGates = @(
    "Second-PC clean/current MSIX install verification",
    "Second-PC multi-device route verification",
    "support@musu.pro inbox delivery verification",
    "Partner Center product name reservation",
    "Partner Center app submission",
    "Microsoft app certification",
    "Microsoft restricted capability review"
)

$ready = ($blockers.Count -eq 0)
$result = [pscustomobject]@{
    schema = "musu.release_go_no_go.v1"
    generated_at = (Get-Date).ToString("o")
    version = $version
    repo_root = $repoRoot
    ready_for_public_desktop_release = $ready
    local_artifacts_ready = ([bool]$audit.runtime_package_ready -and [bool]$audit.desktop_shell_ready)
    single_machine_verified = [bool]$audit.single_machine_verified
    multi_device_verified = [bool]$audit.multi_device_verified
    public_metadata_checked = -not [bool]$SkipPublicMetadata
    public_metadata_ok = if ($SkipPublicMetadata) { $null } elseif ($publicMetadataResult.json) { [bool]$publicMetadataResult.json.ok } else { $false }
    msix_install_verified = [bool]$msixInstallVerified
    msix_install_evidence = $msixInstallEvidence
    support_mailbox_verified = [bool]$supportMailboxVerified
    support_mailbox_evidence = $supportMailboxEvidence
    store_release_verified = [bool]$storeReleaseVerified
    store_release_evidence = $storeReleaseEvidence
    blockers = $blockers.ToArray()
    warnings = $warnings.ToArray()
    manual_external_gates = $manualExternalGates
    readiness_audit = $audit
    public_metadata = if ($publicMetadataResult) { $publicMetadataResult.json } else { $null }
    manifest_path = if ($manifest) { (Resolve-Path -LiteralPath $manifestPath).Path } else { $null }
    manifest_git = if ($manifest) { $manifest.git } else { $null }
}

if ($Json) {
    $result | ConvertTo-Json -Depth 8
}
else {
    "MUSU release go/no-go"
    "ready_for_public_desktop_release: $($result.ready_for_public_desktop_release)"
    "local_artifacts_ready: $($result.local_artifacts_ready)"
    "single_machine_verified: $($result.single_machine_verified)"
    "msix_install_verified: $($result.msix_install_verified)"
    "multi_device_verified: $($result.multi_device_verified)"
    "public_metadata_ok: $($result.public_metadata_ok)"
    "support_mailbox_verified: $($result.support_mailbox_verified)"
    "store_release_verified: $($result.store_release_verified)"
    ""
    "Blockers"
    $blockers | Format-Table area, message -Wrap
    if ($warnings.Count -gt 0) {
        ""
        "Warnings"
        $warnings | Format-Table area, message -Wrap
    }
    ""
    "Manual external gates"
    $manualExternalGates | ForEach-Object { "- $_" }
}

if ($FailOnNotReady -and -not $ready) {
    exit 1
}
