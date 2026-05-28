[CmdletBinding()]
param(
    [string]$PublicMetadataBaseUrl = "https://musu.pro",
    [switch]$SkipPublicMetadata,
    [string]$PacketPath,
    [switch]$SkipPacketVerification,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
$version = (Get-Content -LiteralPath (Join-Path $repoRoot "VERSION") -Raw).Trim()
$safeVersion = $version -replace "[^A-Za-z0-9._-]", "_"

if ([string]::IsNullOrWhiteSpace($PacketPath)) {
    $PacketPath = Join-Path $repoRoot ".local-build\final-operator-gates\musu-final-operator-gates-$safeVersion-latest.zip"
}

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

function Get-EvidenceRootStatus {
    param([Parameter(Mandatory = $true)][object[]]$Roots)

    $rootResults = New-Object System.Collections.Generic.List[object]
    $latest = $null

    foreach ($root in $Roots) {
        $exists = Test-Path -LiteralPath $root.path
        $candidate = $null
        if ($exists) {
            $candidate = Get-ChildItem -LiteralPath $root.path -Filter $root.filter -File -ErrorAction SilentlyContinue |
                Sort-Object LastWriteTime -Descending |
                Select-Object -First 1
            if (-not $latest -and $candidate) {
                $latest = $candidate
            }
        }

        $rootResults.Add([pscustomobject]@{
            path = $root.path
            filter = $root.filter
            exists = [bool]$exists
            latest_file = if ($candidate) { $candidate.FullName } else { $null }
            latest_write_time = if ($candidate) { $candidate.LastWriteTime.ToString("o") } else { $null }
        }) | Out-Null
    }

    [pscustomobject]@{
        latest_file = if ($latest) { $latest.FullName } else { $null }
        roots = $rootResults.ToArray()
    }
}

function Add-OperatorStep {
    param(
        [System.Collections.Generic.List[object]]$List,
        [Parameter(Mandatory = $true)][string]$Gate,
        [Parameter(Mandatory = $true)][string]$Summary,
        [Parameter(Mandatory = $true)][string]$Command
    )

    $List.Add([pscustomobject]@{
        gate = $Gate
        summary = $Summary
        command = $Command
    }) | Out-Null
}

$goNoGoArgs = @("-Json")
if ($SkipPublicMetadata) {
    $goNoGoArgs += "-SkipPublicMetadata"
}
else {
    $goNoGoArgs += @("-PublicMetadataBaseUrl", $PublicMetadataBaseUrl)
}
$goNoGo = (Invoke-JsonScript -FilePath (Join-Path $scriptDir "write-release-go-no-go.ps1") -Arguments $goNoGoArgs).json

$packetExists = Test-Path -LiteralPath $PacketPath
$resolvedPacketPath = if ($packetExists) { (Resolve-Path -LiteralPath $PacketPath).Path } else { $PacketPath }
$packetVerification = $null
$packetVerified = $null
if ($packetExists -and -not $SkipPacketVerification) {
    $packetVerificationResult = Invoke-JsonScript `
        -FilePath (Join-Path $scriptDir "verify-final-operator-gate-packet.ps1") `
        -Arguments @("-PacketPath", $resolvedPacketPath, "-Json") `
        -AllowFailure
    $packetVerification = $packetVerificationResult.json
    $packetVerified = ($packetVerificationResult.json -and [bool]$packetVerificationResult.json.ok)
}

$multiDeviceRoots = @(
    [pscustomobject]@{
        path = (Join-Path $repoRoot ("docs\evidence\multidevice\{0}" -f $version))
        filter = "*.evidence.json"
    },
    [pscustomobject]@{
        path = (Join-Path $repoRoot ".local-build\multi-device")
        filter = "*.json"
    }
)
$supportRoots = @(
    [pscustomobject]@{
        path = (Join-Path $repoRoot ("docs\evidence\support-mailbox\{0}" -f $version))
        filter = "*.evidence.json"
    },
    [pscustomobject]@{
        path = (Join-Path $repoRoot ".local-build\support-mailbox")
        filter = "*.evidence.json"
    }
)
$storeRoots = @(
    [pscustomobject]@{
        path = (Join-Path $repoRoot ("docs\evidence\store-release\{0}" -f $version))
        filter = "*.evidence.json"
    },
    [pscustomobject]@{
        path = (Join-Path $repoRoot ".local-build\store-release")
        filter = "*.evidence.json"
    }
)

$commands = [pscustomobject]@{
    show_status = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\show-final-release-handoff-status.ps1"
    prepare_packet = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\prepare-final-operator-gate-packet.ps1 -IncludeDesktopShell"
    verify_packet = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\verify-final-operator-gate-packet.ps1 -PacketPath .local-build\final-operator-gates\musu-final-operator-gates-$safeVersion-latest.zip -Json"
    final_completion = @"
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\complete-final-operator-gates.ps1 `
  -MultiDeviceEvidencePath .local-build\multi-device\<EVIDENCE_JSON> `
  -SupportFromAddress "<sender@example.com>" `
  -SupportReceivedBy "<operator-name>" `
  -SupportVerificationId "<support-verification-id>" `
  -SupportNotes "Verified delivery in support@musu.pro inbox" `
  -StoreProductName "MUSU" `
  -StoreSubmissionId "<partner-center-submission-id>" `
  -StoreCertificationStatus "approved" `
  -StoreRestrictedCapabilityStatus "approved" `
  -StoreRecordedBy "<operator-name>" `
  -StoreNotes "Microsoft Store certification and restricted capability review approved" `
  -Json
"@
    go_no_go = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\write-release-go-no-go.ps1 -Json"
}

$operatorSteps = New-Object System.Collections.Generic.List[object]
if (-not $packetExists) {
    Add-OperatorStep `
        -List $operatorSteps `
        -Gate "handoff-packet" `
        -Summary "Generate the final operator packet before handoff." `
        -Command $commands.prepare_packet
}
elseif (-not $SkipPacketVerification -and -not $packetVerified) {
    Add-OperatorStep `
        -List $operatorSteps `
        -Gate "handoff-packet" `
        -Summary "Regenerate or fix the final operator packet; packet verification is not passing." `
        -Command $commands.verify_packet
}

if (-not [bool]$goNoGo.multi_device_verified) {
    Add-OperatorStep `
        -List $operatorSteps `
        -Gate "multi-device" `
        -Summary "Run the second-PC kit, return `.local-build\multi-device\*.json`, then record it." `
        -Command "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\record-multidevice-evidence.ps1 -EvidencePath .local-build\multi-device\<EVIDENCE_JSON>"
}
if (-not [bool]$goNoGo.support_mailbox_verified) {
    Add-OperatorStep `
        -List $operatorSteps `
        -Gate "support-mailbox" `
        -Summary "Send a real email to support@musu.pro, confirm inbox delivery, then record the operator evidence." `
        -Command 'powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\record-support-mailbox-verification.ps1 -FromAddress "<sender@example.com>" -ReceivedBy "<operator-name>" -VerificationId "<support-verification-id>" -Notes "Verified delivery in support@musu.pro inbox" -Json'
}
if (-not [bool]$goNoGo.store_release_verified) {
    Add-OperatorStep `
        -List $operatorSteps `
        -Gate "store-release" `
        -Summary "After Partner Center submission, Microsoft certification, and restricted capability approval, record Store release evidence." `
        -Command 'powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\record-store-release-verification.ps1 -ProductName "MUSU" -SubmissionId "<partner-center-submission-id>" -CertificationStatus "approved" -RestrictedCapabilityStatus "approved" -RecordedBy "<operator-name>" -Notes "Microsoft Store certification and restricted capability review approved" -Json'
}

$result = [pscustomobject]@{
    schema = "musu.final_release_handoff_status.v1"
    generated_at = (Get-Date).ToString("o")
    version = $version
    repo_root = $repoRoot
    ready_for_public_desktop_release = [bool]$goNoGo.ready_for_public_desktop_release
    packet = [pscustomobject]@{
        path = $resolvedPacketPath
        exists = [bool]$packetExists
        verified = $packetVerified
        verification = $packetVerification
    }
    gates = [pscustomobject]@{
        local_artifacts_ready = [bool]$goNoGo.local_artifacts_ready
        single_machine_verified = [bool]$goNoGo.single_machine_verified
        multi_device_verified = [bool]$goNoGo.multi_device_verified
        public_metadata_ok = $goNoGo.public_metadata_ok
        support_mailbox_verified = [bool]$goNoGo.support_mailbox_verified
        store_release_verified = [bool]$goNoGo.store_release_verified
        manifest_git_dirty = if ($goNoGo.manifest_git) { [bool]$goNoGo.manifest_git.dirty } else { $null }
    }
    blockers = $goNoGo.blockers
    warnings = $goNoGo.warnings
    evidence_roots = [pscustomobject]@{
        multi_device = Get-EvidenceRootStatus -Roots $multiDeviceRoots
        support_mailbox = Get-EvidenceRootStatus -Roots $supportRoots
        store_release = Get-EvidenceRootStatus -Roots $storeRoots
    }
    operator_steps = $operatorSteps.ToArray()
    commands = $commands
    go_no_go = $goNoGo
}

if ($Json) {
    $result | ConvertTo-Json -Depth 10
}
else {
    "MUSU final release handoff status"
    "version: $($result.version)"
    "ready_for_public_desktop_release: $($result.ready_for_public_desktop_release)"
    "packet_exists: $($result.packet.exists)"
    "packet_verified: $($result.packet.verified)"
    "packet_path: $($result.packet.path)"
    ""
    "Gates"
    $result.gates | Format-List
    ""
    "Blockers"
    if (@($result.blockers).Count -eq 0) {
        "- none"
    }
    else {
        $result.blockers | Format-Table area, message -Wrap
    }
    if (@($result.warnings).Count -gt 0) {
        ""
        "Warnings"
        $result.warnings | Format-Table area, message -Wrap
    }
    ""
    "Operator steps"
    if ($operatorSteps.Count -eq 0) {
        "- none"
    }
    else {
        foreach ($step in $operatorSteps) {
            "- [$($step.gate)] $($step.summary)"
            "  $($step.command)"
        }
    }
    ""
    "Final completion command"
    $commands.final_completion
}
