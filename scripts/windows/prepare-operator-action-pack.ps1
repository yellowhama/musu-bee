[CmdletBinding()]
param(
    [string]$OutputRoot,
    [string]$Version,
    [string]$SupportEmail,
    [string]$PacketPath,
    [string]$StoreSubmissionBundleDir,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
. (Join-Path $scriptDir "release-config.ps1")

if ([string]::IsNullOrWhiteSpace($Version)) {
    $Version = (Get-Content -LiteralPath (Join-Path $repoRoot "VERSION") -Raw).Trim()
}
if ([string]::IsNullOrWhiteSpace($SupportEmail)) {
    $SupportEmail = Get-MusuReleaseSupportEmail -RepoRoot $repoRoot
}
if ([string]::IsNullOrWhiteSpace($OutputRoot)) {
    $OutputRoot = Join-Path $repoRoot ".local-build\operator-action-pack"
}

$safeVersion = $Version -replace "[^A-Za-z0-9._-]", "_"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"

$gitBranch = (& git -C $repoRoot rev-parse --abbrev-ref HEAD 2>$null | Out-String).Trim()
$gitCommit = (& git -C $repoRoot rev-parse HEAD 2>$null | Out-String).Trim()
$gitStatus = (& git -C $repoRoot status --short 2>$null | Out-String).Trim()
if ([string]::IsNullOrWhiteSpace($gitCommit)) {
    throw "Unable to resolve git commit for operator action pack."
}
if (-not [string]::IsNullOrWhiteSpace($gitStatus)) {
    throw "Refusing to prepare operator action pack from a dirty worktree. Commit changes and regenerate the pack before handoff.`n$gitStatus"
}

if ([string]::IsNullOrWhiteSpace($PacketPath)) {
    $PacketPath = Join-Path $repoRoot ".local-build\final-operator-gates\musu-final-operator-gates-$safeVersion-latest.zip"
}
if (-not (Test-Path -LiteralPath $PacketPath)) {
    throw "Final operator packet not found: $PacketPath"
}

$packetVerifyOutput = & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $scriptDir "verify-final-operator-gate-packet.ps1") -PacketPath $PacketPath -Json 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "Final operator packet verification failed before action-pack generation.`n$($packetVerifyOutput | Out-String)"
}
$packetVerify = ($packetVerifyOutput | Out-String).Trim() | ConvertFrom-Json
if (-not [bool]$packetVerify.ok) {
    throw "Final operator packet verification did not report ok=true."
}

if ([string]::IsNullOrWhiteSpace($StoreSubmissionBundleDir)) {
    $submissionRoot = Join-Path $repoRoot ".local-build\msix\submission-bundles"
    $StoreSubmissionBundleDir = Get-ChildItem -LiteralPath $submissionRoot -Directory -Filter "store-reviewed-*" -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1 -ExpandProperty FullName
}
if ([string]::IsNullOrWhiteSpace($StoreSubmissionBundleDir) -or -not (Test-Path -LiteralPath $StoreSubmissionBundleDir)) {
    throw "Store submission bundle not found. Build or pass -StoreSubmissionBundleDir."
}

function Resolve-PacketRoot {
    param([Parameter(Mandatory = $true)][string]$Path)

    $resolved = (Resolve-Path -LiteralPath $Path).Path
    if ((Get-Item -LiteralPath $resolved).PSIsContainer) {
        return $resolved
    }

    $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("musu-action-pack-packet-" + [guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null
    Expand-Archive -LiteralPath $resolved -DestinationPath $tempRoot -Force
    $candidate = Get-ChildItem -LiteralPath $tempRoot -Directory | Where-Object {
        Test-Path -LiteralPath (Join-Path $_.FullName "packet-build-metadata.json")
    } | Select-Object -First 1
    if ($candidate) {
        return $candidate.FullName
    }
    return $tempRoot
}

$packetExtractionRoot = $null
$actionRoot = $null
try {
    $packetRoot = Resolve-PacketRoot -Path $PacketPath
    if ($packetRoot -like (Join-Path ([System.IO.Path]::GetTempPath()) "musu-action-pack-packet-*")) {
        $packetExtractionRoot = $packetRoot
    }
    else {
        $parent = Split-Path -Parent $packetRoot
        if ($parent -like (Join-Path ([System.IO.Path]::GetTempPath()) "musu-action-pack-packet-*")) {
            $packetExtractionRoot = $parent
        }
    }

    $packetMetadata = Get-Content -LiteralPath (Join-Path $packetRoot "packet-build-metadata.json") -Raw | ConvertFrom-Json
    $supportTemplate = Get-Content -LiteralPath (Join-Path $packetRoot "support-mailbox-record-template.json") -Raw | ConvertFrom-Json
    $supportVerificationId = [string]$supportTemplate.verification_id
    if ([string]::IsNullOrWhiteSpace($supportVerificationId)) {
        throw "Final packet support template is missing verification_id."
    }

    $kitZip = Get-ChildItem -LiteralPath (Join-Path $packetRoot "kits") -Filter "*.zip" -File |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
    if (-not $kitZip) {
        throw "Final packet does not contain a second-PC kit zip."
    }

    $actionRoot = Join-Path $OutputRoot "MUSU-$safeVersion-operator-action-pack-$stamp"
    if (Test-Path -LiteralPath $actionRoot) {
        throw "Operator action pack output already exists: $actionRoot"
    }

    $secondPcDir = Join-Path $actionRoot "second-pc"
    $storeDir = Join-Path $actionRoot "partner-center"
    $supportDir = Join-Path $actionRoot "support-mailbox"
    New-Item -ItemType Directory -Force -Path $secondPcDir, $storeDir, $supportDir | Out-Null

    $quickstart = @"
MUSU $Version second-PC quickstart
Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss K')
Source commit: $gitCommit

Copy this inner zip to the second Windows PC:
- $($kitZip.Name)

On the second PC:
1. Extract $($kitZip.Name) into a normal writable folder, for example Downloads\musu-multidevice.
2. Open PowerShell in the extracted folder.
3. Run these commands:

powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\check-msix-sideload-readiness.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\install-and-verify-msix.ps1 -StartupContract local-sideload-manual -ReplaceExisting
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\capture-msix-install-evidence.ps1 -StartupContract local-sideload-manual
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\collect-second-pc-handoff.ps1

If certificate trust fails, rerun the install command from elevated PowerShell with -MachineTrust:

powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\install-and-verify-msix.ps1 -StartupContract local-sideload-manual -ReplaceExisting -MachineTrust

Return these files/folders to the primary repo:
- .local-build\msix-install\*.evidence.json
- .local-build\second-pc-handoff\*.handoff.json

After the handoff JSON is returned, run this on the primary PC:

powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\show-second-pc-return-card.ps1 -HandoffPath .local-build\second-pc-handoff\<HANDOFF_JSON>
"@
    $quickstartPath = Join-Path $secondPcDir "SECOND_PC_QUICKSTART_CURRENT.txt"
    $quickstart | Set-Content -LiteralPath $quickstartPath -Encoding UTF8

    $secondPcTransferZip = Join-Path $secondPcDir "MUSU-second-PC-transfer-$safeVersion-$stamp.zip"
    Compress-Archive -LiteralPath $kitZip.FullName, $quickstartPath -DestinationPath $secondPcTransferZip -CompressionLevel Optimal

    $storeFiles = @(
        "musu_1.15.0.0_x64_store-reviewed-immediate-registration.msix",
        "Yellowhama.MUSU_cert.cer",
        "bundle.json",
        "submission-notes.txt",
        "partner-center-capability-justification.md",
        "verify-store-reviewed.txt",
        "STORE_MSIX_RESTRICTED_CAPABILITY_SUBMISSION_CHECKLIST_2026_05_27.md",
        "STORE_MSIX_PACKAGING_GUIDE_2026_05_27.md",
        "WINDOWS_DISTRIBUTION_PIVOT_2026-05-27.md"
    )
    foreach ($name in $storeFiles) {
        $source = Join-Path $StoreSubmissionBundleDir $name
        if (Test-Path -LiteralPath $source) {
            Copy-Item -LiteralPath $source -Destination (Join-Path $storeDir $name)
        }
    }
    foreach ($doc in @(
        "docs\STORE_SUBMISSION_METADATA_2026_05_29.md",
        "docs\MICROSOFT_STORE_RELEASE_RUN_CARD_2026_05_29.md",
        "docs\STORE_LAUNCH_AND_PROMOTION_PLAN_2026_05_29.md"
    )) {
        Copy-Item -LiteralPath (Join-Path $repoRoot $doc) -Destination (Join-Path $storeDir (Split-Path -Leaf $doc))
    }

    $uploadMsix = Join-Path $storeDir "musu_1.15.0.0_x64_store-reviewed-immediate-registration.msix"
    if (-not (Test-Path -LiteralPath $uploadMsix)) {
        throw "Store MSIX is missing from action pack: $uploadMsix"
    }
    $cleanNotes = @"
MUSU Partner Center certification notes

Package:
- musu_1.15.0.0_x64_store-reviewed-immediate-registration.msix

Restricted capability justification summary:
- This package uses desktop:StartupTask with rescap5:ImmediateRegistration="true".
- It declares Microsoft.nonUserConfigurableStartupTasks_8wekyb3d8bbwe so the packaged bridge can be enabled at installation time.
- MUSU is a packaged desktop control-plane application. runFullTrust is required because the app runs a full-trust local bridge process rather than a sandboxed UWP background task.
- musu-startup.exe starts only the local MUSU bridge runtime required for node presence, local health checks, fleet availability, and user-invoked workflows.
- MUSU does not install raw Task Scheduler tasks, does not install a separate Windows service outside the package, does not self-copy binaries into user-managed install locations, and does not self-update packaged binaries from GitHub.
- The local-sideload package is a separate manual-start contract. This Store-reviewed artifact is the auto-start distribution model.

Reviewer-facing product truth:
- MUSU turns the user's Windows PC into a local AI operations node with a trusted dashboard, diagnostics, and task runner.
- Multi-device workflows are beta-gated and require explicit peer setup/evidence.
- The current Tauri shell is a launcher/status surface, not a full native dashboard GUI.
"@
    $cleanNotes | Set-Content -LiteralPath (Join-Path $storeDir "PARTNER_CENTER_CERTIFICATION_NOTES_CLEAN.txt") -Encoding UTF8

    $storeReadme = @"
MUSU Partner Center submission copy
Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss K')
Version: $Version / Windows package version 1.15.0.0
Source commit: $gitCommit

Upload this package in Partner Center:
- musu_1.15.0.0_x64_store-reviewed-immediate-registration.msix
- SHA256: $((Get-FileHash -LiteralPath $uploadMsix -Algorithm SHA256).Hash)

Do not upload this whole folder/zip as the app package. Partner Center needs the MSIX above.
The .cer file is public certificate reference only; no private .pfx is included.

Partner Center metadata:
- Product name preference: MUSU, then MUSU Desktop, MUSU Local, MUSU Control
- Category: Developer tools, or Utilities & tools if Developer tools causes review friction
- Privacy URL: https://musu.pro/privacy
- Support URL: https://musu.pro/support
- Support email: $SupportEmail
- Short description: MUSU turns your Windows PC into a local AI operations node with a trusted dashboard, diagnostics, and task runner.

Restricted capability notes:
- Paste/attach PARTNER_CENTER_CERTIFICATION_NOTES_CLEAN.txt and partner-center-capability-justification.md.
- Keep multi-device wording beta-gated; do not claim public multi-device release readiness until second-PC evidence is recorded.

After Partner Center approval, record evidence from the release repo:
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\record-store-release-verification.ps1 -ProductName "MUSU" -ProductNameReservedAt "<partner-center-name-reserved-at>" -SubmissionId "<partner-center-submission-id>" -CertificationStatus "approved" -RestrictedCapabilityStatus "approved" -RecordedBy "<operator-name>" -Notes "Microsoft Store certification and restricted capability review approved" -Json
"@
    $storeReadme | Set-Content -LiteralPath (Join-Path $storeDir "PARTNER_CENTER_UPLOAD_README_CURRENT.txt") -Encoding UTF8
    $partnerCenterZip = Join-Path $storeDir "MUSU-$safeVersion-store-submission-$stamp.zip"
    Compress-Archive -Path (Join-Path $storeDir "*") -DestinationPath $partnerCenterZip -CompressionLevel Optimal

    $supportBody = @"
MUSU Store support mailbox verification

Verification ID: $supportVerificationId
Release: $Version
Support mailbox: $SupportEmail
Source commit: $gitCommit

Purpose:
This message verifies that the public support mailbox receives mail for the MUSU Microsoft Store release gate.
"@
    $supportSubject = "MUSU Store support verification $Version $supportVerificationId"
    $supportEmailTemplate = @"
To: $SupportEmail
Subject: $supportSubject

$supportBody

After confirming this email arrived in the $SupportEmail inbox, run from the release repo:

powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\record-support-mailbox-verification.ps1 -SupportEmail "$SupportEmail" -FromAddress "<sender@example.com>" -ReceivedBy "<operator-name>" -VerificationId "$supportVerificationId" -Notes "Verified delivery in $SupportEmail inbox" -Json
"@
    $supportEmailTemplate | Set-Content -LiteralPath (Join-Path $supportDir "SUPPORT_MAILBOX_VERIFICATION_EMAIL_CURRENT.txt") -Encoding UTF8
    [pscustomobject]@{
        support_email = $SupportEmail
        subject = $supportSubject
        verification_id = $supportVerificationId
        body = $supportBody
        record_command = 'powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\record-support-mailbox-verification.ps1 -SupportEmail "{0}" -FromAddress "<sender@example.com>" -ReceivedBy "<operator-name>" -VerificationId "{1}" -Notes "Verified delivery in {0} inbox" -Json' -f $SupportEmail, $supportVerificationId
    } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $supportDir "support-mailbox-record-template-current.json") -Encoding UTF8

    $readme = @"
# MUSU $Version Operator Action Pack

Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss K')
Source commit: $gitCommit
Final packet source commit: $($packetMetadata.git.commit)

This pack groups the remaining external release actions.

1. Second PC test
- Use: `second-pc\MUSU-second-PC-transfer-$safeVersion-$stamp.zip`
- Return to repo after second-PC run:
  - `.local-build\msix-install\*.evidence.json`
  - `.local-build\second-pc-handoff\*.handoff.json`

2. Support mailbox proof
- Use: `support-mailbox\SUPPORT_MAILBOX_VERIFICATION_EMAIL_CURRENT.txt`
- Send the email to $SupportEmail from an external sender.
- After confirming inbox delivery, run the record command in that file from the release repo.

3. Partner Center Store submission
- Use: `partner-center\MUSU-$safeVersion-store-submission-$stamp.zip`
- Upload the MSIX inside that zip, not the zip itself, as the Partner Center package.
- Use the clean certification notes and restricted capability justification from that zip.

Current release gate status before these external actions:
- local artifacts: pass
- single-machine smoke: pass
- public metadata: pass
- MSIX install evidence: missing
- real multi-device evidence: missing
- support mailbox delivery evidence: missing
- Store approval evidence: missing
"@
    $readme | Set-Content -LiteralPath (Join-Path $actionRoot "OPERATOR_ACTION_PACK_README_CURRENT.md") -Encoding UTF8

    $metadata = [pscustomobject]@{
        schema = "musu.operator_action_pack.v1"
        generated_at = (Get-Date).ToString("o")
        version = $Version
        support_email = $SupportEmail
        support_verification_id = $supportVerificationId
        git = [pscustomobject]@{
            branch = $gitBranch
            commit = $gitCommit
            dirty = $false
            status_short = ""
        }
        final_packet = [pscustomobject]@{
            path = (Resolve-Path -LiteralPath $PacketPath).Path
            verified = $true
            source_commit = [string]$packetMetadata.git.commit
        }
        store_submission_bundle = (Resolve-Path -LiteralPath $StoreSubmissionBundleDir).Path
        artifacts = [pscustomobject]@{
            second_pc_transfer_zip = "second-pc\" + (Split-Path -Leaf $secondPcTransferZip)
            partner_center_zip = "partner-center\" + (Split-Path -Leaf $partnerCenterZip)
            support_email_template = "support-mailbox\SUPPORT_MAILBOX_VERIFICATION_EMAIL_CURRENT.txt"
        }
    }
    $metadata | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $actionRoot "action-pack-metadata.json") -Encoding UTF8

    if (@(Get-ChildItem -LiteralPath $actionRoot -Recurse -Filter "*.pfx" -File -ErrorAction SilentlyContinue).Count -gt 0) {
        throw "Refusing to package private .pfx material in operator action pack."
    }

    $checksumsPath = Join-Path $actionRoot "SHA256SUMS.txt"
    Get-ChildItem -LiteralPath $actionRoot -Recurse -File |
        Where-Object { $_.FullName -ne $checksumsPath } |
        Sort-Object FullName |
        ForEach-Object {
            $relative = $_.FullName.Substring($actionRoot.Length + 1)
            $hash = Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName
            "{0}  {1}" -f $hash.Hash.ToLowerInvariant(), ($relative -replace "\\", "/")
        } | Set-Content -LiteralPath $checksumsPath -Encoding ASCII

    $zipPath = "$actionRoot.zip"
    Compress-Archive -Path (Join-Path $actionRoot "*") -DestinationPath $zipPath -Force
    $latestZipPath = Join-Path (Resolve-Path -LiteralPath $OutputRoot).Path "MUSU-$safeVersion-operator-action-pack-latest.zip"
    Copy-Item -LiteralPath $zipPath -Destination $latestZipPath -Force

    $result = [pscustomobject]@{
        ok = $true
        version = $Version
        action_pack_root = (Resolve-Path -LiteralPath $actionRoot).Path
        zip_path = (Resolve-Path -LiteralPath $zipPath).Path
        latest_zip_path = (Resolve-Path -LiteralPath $latestZipPath).Path
        second_pc_transfer_zip = (Resolve-Path -LiteralPath $secondPcTransferZip).Path
        partner_center_zip = (Resolve-Path -LiteralPath $partnerCenterZip).Path
        support_email = $SupportEmail
        support_verification_id = $supportVerificationId
        git_commit = $gitCommit
    }

    if ($Json) {
        $result | ConvertTo-Json -Depth 6
    }
    else {
        $result
    }
}
finally {
    if ($packetExtractionRoot -and (Test-Path -LiteralPath $packetExtractionRoot)) {
        Remove-Item -LiteralPath $packetExtractionRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}
