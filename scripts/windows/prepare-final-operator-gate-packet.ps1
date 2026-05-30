[CmdletBinding()]
param(
    [string]$OutputRoot,
    [string]$Version,
    [string]$SupportEmail,
    [string]$MultiDeviceKitZip,
    [switch]$IncludeDesktopShell,
    [switch]$SkipMultiDeviceKit,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
. (Join-Path $scriptDir "release-config.ps1")

if ([string]::IsNullOrWhiteSpace($SupportEmail)) {
    $SupportEmail = Get-MusuReleaseSupportEmail -RepoRoot $repoRoot
}

$gitBranch = (& git -C $repoRoot rev-parse --abbrev-ref HEAD 2>$null | Out-String).Trim()
$gitCommit = (& git -C $repoRoot rev-parse HEAD 2>$null | Out-String).Trim()
$gitStatus = (& git -C $repoRoot status --short 2>$null | Out-String).Trim()
if ([string]::IsNullOrWhiteSpace($gitCommit)) {
    throw "Unable to resolve git commit for final operator packet."
}
if (-not [string]::IsNullOrWhiteSpace($gitStatus)) {
    throw "Refusing to prepare final operator packet from a dirty worktree. Commit changes and regenerate the packet before handoff.`n$gitStatus"
}

if ([string]::IsNullOrWhiteSpace($Version)) {
    $Version = (Get-Content -LiteralPath (Join-Path $repoRoot "VERSION") -Raw).Trim()
}
if ([string]::IsNullOrWhiteSpace($OutputRoot)) {
    $OutputRoot = Join-Path $repoRoot ".local-build\final-operator-gates"
}

$safeVersion = $Version -replace "[^A-Za-z0-9._-]", "_"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$packetRoot = Join-Path $OutputRoot "musu-final-operator-gates-$safeVersion-$stamp"
$packetDocs = Join-Path $packetRoot "docs"
$packetScripts = Join-Path $packetRoot "scripts\windows"
$packetKits = Join-Path $packetRoot "kits"

if (Test-Path -LiteralPath $packetRoot) {
    throw "Final operator gate packet already exists: $packetRoot"
}

New-Item -ItemType Directory -Force -Path $packetDocs, $packetScripts, $packetKits | Out-Null

Copy-Item -LiteralPath (Join-Path $repoRoot "SUPPORT_EMAIL") -Destination (Join-Path $packetRoot "SUPPORT_EMAIL")

$copiedMultiDeviceKit = $null
if (-not $SkipMultiDeviceKit) {
    if ([string]::IsNullOrWhiteSpace($MultiDeviceKitZip)) {
        $prepareSplat = @{}
        if ($IncludeDesktopShell) {
            $prepareSplat["IncludeDesktopShell"] = $true
        }
        $kitResult = & (Join-Path $scriptDir "prepare-multidevice-test-kit.ps1") @prepareSplat
        if (-not $kitResult -or -not $kitResult.ok) {
            throw "Failed to prepare multi-device test kit."
        }
        $MultiDeviceKitZip = [string]$kitResult.zip_path
    }
    if (-not (Test-Path -LiteralPath $MultiDeviceKitZip)) {
        throw "Multi-device kit zip not found: $MultiDeviceKitZip"
    }
    $copiedMultiDeviceKit = Join-Path $packetKits (Split-Path -Leaf $MultiDeviceKitZip)
    Copy-Item -LiteralPath $MultiDeviceKitZip -Destination $copiedMultiDeviceKit
}

$docsToCopy = @(
    "docs\RELEASE_FINAL_OPERATOR_GATES_2026_05_29.md",
    "docs\MULTI_DEVICE_RELEASE_TEST_PLAN_1_15_0_RC1_2026_05_29.md",
    "docs\BETA_RELEASE_CHECKLIST_1_15_0_RC1.md",
    "docs\DESKTOP_RELEASE_READINESS_AUDIT_2026_05_29.md",
    "docs\RELEASE_1_15_0_RC1_FINAL_QUAL_AUDIT_NEXT_STEPS_2026_05_29.md",
    "docs\MICROSOFT_STORE_RELEASE_RUN_CARD_2026_05_29.md",
    "docs\RELEASE_OPERATOR_HANDOFF_CARD_2026_05_29.md",
    "docs\STORE_SUBMISSION_METADATA_2026_05_29.md"
)
foreach ($relative in $docsToCopy) {
    $source = Join-Path $repoRoot $relative
    if (Test-Path -LiteralPath $source) {
        Copy-Item -LiteralPath $source -Destination (Join-Path $packetDocs (Split-Path -Leaf $source))
    }
}

$scriptsToCopy = @(
    "release-config.ps1",
    "record-support-mailbox-verification.ps1",
    "verify-support-mailbox-evidence.ps1",
    "record-multidevice-evidence.ps1",
    "verify-multidevice-evidence.ps1",
    "capture-msix-install-evidence.ps1",
    "collect-second-pc-handoff.ps1",
    "record-msix-install-evidence.ps1",
    "verify-msix-install-evidence.ps1",
    "record-store-release-verification.ps1",
    "verify-store-release-evidence.ps1",
    "verify-store-submission-bundle.ps1",
    "prepare-operator-action-pack.ps1",
    "verify-operator-action-pack.ps1",
    "show-final-release-handoff-status.ps1",
    "show-operator-handoff-card.ps1",
    "show-second-pc-return-card.ps1",
    "verify-final-operator-gate-packet.ps1",
    "complete-final-operator-gates.ps1",
    "write-release-candidate-manifest.ps1",
    "write-release-go-no-go.ps1"
)
foreach ($name in $scriptsToCopy) {
    Copy-Item -LiteralPath (Join-Path $scriptDir $name) -Destination (Join-Path $packetScripts $name)
}

$supportVerificationId = "musu-store-support-$safeVersion-$stamp"
$supportCommand = 'powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\record-support-mailbox-verification.ps1 -SupportEmail "{0}" -FromAddress "<sender@example.com>" -ReceivedBy "<operator-name>" -VerificationId "{1}" -Notes "Verified delivery in {0} inbox"' -f $SupportEmail, $supportVerificationId

$readme = @'
# MUSU __VERSION__ Final Operator Gate Packet

This packet contains the remaining manual release gates for MUSU __VERSION__.

Important execution boundary:

- Copy only the zip under `kits\` to the second Windows PC.
- Run all evidence recording and final go/no-go commands from the real MUSU release repo root, not from inside this packet directory.
- The `scripts\windows\` files in this packet are reference copies for review/checksums. They are not a standalone release repo.

Current machine-verifiable state before these gates:

- local artifacts: ready
- desktop shell audit: ready
- single-machine smoke evidence: recorded
- public Store metadata: live and passing

For the shortest Store/submission sequence, review:

- `docs\RELEASE_1_15_0_RC1_FINAL_QUAL_AUDIT_NEXT_STEPS_2026_05_29.md`
- `docs\MICROSOFT_STORE_RELEASE_RUN_CARD_2026_05_29.md`
- `docs\RELEASE_OPERATOR_HANDOFF_CARD_2026_05_29.md`

To print the current packet-specific support verification id, second-PC kit
name, and recording commands, run from the real MUSU release repo root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\show-operator-handoff-card.ps1
```

After the second PC returns `.local-build\second-pc-handoff\*.handoff.json`,
run this from the real MUSU release repo root to print the exact
`smoke-multidevice-beta.ps1` command from the returned `suggested_remote_addrs`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\show-second-pc-return-card.ps1 -HandoffPath .local-build\second-pc-handoff\<HANDOFF_JSON>
```

Remaining blockers:

1. clean/current MSIX install evidence from the second Windows PC
2. real second-PC multi-device evidence
3. real __SUPPORT_EMAIL__ inbox delivery evidence
4. Partner Center product name reservation, app submission, Microsoft certification, and restricted startup capability approval evidence

The multi-device kit includes `collect-second-pc-handoff.ps1`; run it on the
second PC after install to generate `.local-build\second-pc-handoff\*.handoff.json`
with candidate `RemoteAddr` values for the primary PC.

Before handoff, or after each returned evidence file, run this status command
from the real MUSU release repo root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\show-final-release-handoff-status.ps1
```

Before copying files to the operator/second-PC path, generate and verify the
operator action pack from a clean release repo root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\prepare-operator-action-pack.ps1 -Json
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\verify-operator-action-pack.ps1 -PackPath .local-build\operator-action-pack\MUSU-__SAFE_VERSION__-operator-action-pack-latest.zip -Json
```

`show-final-release-handoff-status.ps1` reports action-pack existence and
verification status. The action pack is a copy/handoff convenience only; it does
not create or satisfy release evidence.

## Gate A - Support mailbox delivery

Send a real email to:

```text
__SUPPORT_EMAIL__
```

Recommended subject:

```text
MUSU Store support verification __VERSION__ __SUPPORT_VERIFICATION_ID__
```

Keep the verification id in the message subject or body. The recorder requires
an explicit MUSU verification token so post-hoc support evidence cannot be
created with a generated id.

After the message is visible in the actual support inbox, open PowerShell in the real MUSU release repo root and fill the placeholders:

```powershell
__SUPPORT_COMMAND__
```

Then run this from the real MUSU release repo root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\write-release-go-no-go.ps1 -Json
```

Expected result: `support_mailbox_verified=true`.

## Gate B - Second-PC MSIX install evidence

Use the multi-device kit in `kits\` if this packet includes one. Copy it to the
second Windows PC, unzip it, and follow its README. Preferred path inside the
unzipped kit:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\run-second-pc-release-check.ps1
```

If certificate trust fails, rerun from elevated PowerShell with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\run-second-pc-release-check.ps1 -MachineTrust
```

Manual fallback after `install-and-verify-msix.ps1` succeeds:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\capture-msix-install-evidence.ps1
```

Return the generated `.local-build\msix-install\*.evidence.json`,
`.local-build\second-pc-handoff\*.handoff.json`, and
`.local-build\second-pc-release-check\*.release-check.json` files to the real
MUSU release repo and record install evidence from the release repo root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\record-msix-install-evidence.ps1 -EvidencePath .local-build\msix-install\<INSTALL_EVIDENCE_JSON>
```

Expected result: `msix_install_verified=true`.

## Gate C - Second-PC multi-device test

Use the multi-device kit in `kits\` if this packet includes one. Copy it to the second Windows PC, unzip it, and follow its README.

When the second-PC smoke creates `.local-build\multi-device\*.evidence.json`, return that file to the real MUSU release repo and record it from the release repo root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\record-multidevice-evidence.ps1 -EvidencePath .local-build\multi-device\<EVIDENCE_JSON>
```

Expected result: `multi_device_verified=true`.

## Gate D - Store release approval evidence

After Partner Center product name reservation, app submission, Microsoft package
certification, and restricted startup capability approval complete, record those
values with the final command below.
Before upload, verify the prepared Store submission bundle from the real MUSU
release repo root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\verify-store-submission-bundle.ps1
```

If you need to record Store approval separately before the final command, run
this from the real MUSU release repo root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\record-store-release-verification.ps1 `
  -ProductName "MUSU" `
  -ProductNameReservedAt "<partner-center-name-reserved-at>" `
  -SubmissionId "<partner-center-submission-id>" `
  -CertificationStatus "approved" `
  -RestrictedCapabilityStatus "approved" `
  -RecordedBy "<operator-name>" `
  -Notes "Microsoft Store certification and restricted capability review approved" `
  -Json
```

Expected result: `store_release_verified=true`.

## Final command

After Gate A, Gate B, Gate C, and Gate D evidence exists, run from the real MUSU release repo root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\complete-final-operator-gates.ps1 `
  -MsixInstallEvidencePath .local-build\msix-install\<INSTALL_EVIDENCE_JSON> `
  -MultiDeviceEvidencePath .local-build\multi-device\<EVIDENCE_JSON> `
  -SupportFromAddress "<sender@example.com>" `
  -SupportReceivedBy "<operator-name>" `
  -SupportVerificationId "__SUPPORT_VERIFICATION_ID__" `
  -SupportNotes "Verified delivery in __SUPPORT_EMAIL__ inbox" `
  -StoreProductName "MUSU" `
  -StoreProductNameReservedAt "<partner-center-name-reserved-at>" `
  -StoreSubmissionId "<partner-center-submission-id>" `
  -StoreCertificationStatus "approved" `
  -StoreRestrictedCapabilityStatus "approved" `
  -StoreRecordedBy "<operator-name>" `
  -StoreNotes "Microsoft Store certification and restricted capability review approved" `
  -FailOnNotReady `
  -Json
```

This records the MSIX install, multi-device, support mailbox, and Store release evidence, regenerates the release candidate manifest, and then runs the final go/no-go check.

The release can proceed only when:

- `ready_for_public_desktop_release=true`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `msix_install_verified=true`
- `multi_device_verified=true`
- `public_metadata_ok=true`
- `support_mailbox_verified=true`
- `store_release_verified=true`
- `manifest_git.dirty=false`
'@
$readme = $readme.Replace("__VERSION__", $Version).Replace("__SAFE_VERSION__", $safeVersion).Replace("__SUPPORT_EMAIL__", $SupportEmail).Replace("__SUPPORT_COMMAND__", $supportCommand).Replace("__SUPPORT_VERIFICATION_ID__", $supportVerificationId)
$readmePath = Join-Path $packetRoot "README_FINAL_OPERATOR_GATES.md"
$readme | Set-Content -LiteralPath $readmePath -Encoding UTF8

$supportTemplate = [pscustomobject]@{
    support_email = $SupportEmail
    subject = "MUSU Store support verification $Version"
    verification_id = $supportVerificationId
    record_command = $supportCommand
}
$supportTemplate | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $packetRoot "support-mailbox-record-template.json") -Encoding UTF8

$packetMetadata = [pscustomobject]@{
    schema = "musu.final_operator_gate_packet.v1"
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
}
$packetMetadata | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $packetRoot "packet-build-metadata.json") -Encoding UTF8

$checksumsPath = Join-Path $packetRoot "SHA256SUMS.txt"
Get-ChildItem -LiteralPath $packetRoot -Recurse -File |
    Where-Object { $_.FullName -ne $checksumsPath } |
    Sort-Object FullName |
    ForEach-Object {
        $relative = $_.FullName.Substring($packetRoot.Length + 1)
        $hash = Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName
        "{0}  {1}" -f $hash.Hash.ToLowerInvariant(), ($relative -replace "\\", "/")
    } | Set-Content -LiteralPath $checksumsPath -Encoding ASCII

$zipPath = "$packetRoot.zip"
Compress-Archive -Path (Join-Path $packetRoot "*") -DestinationPath $zipPath -Force
$latestZipPath = Join-Path (Resolve-Path -LiteralPath $OutputRoot).Path "musu-final-operator-gates-$safeVersion-latest.zip"
Copy-Item -LiteralPath $zipPath -Destination $latestZipPath -Force

$result = [pscustomobject]@{
    ok = $true
    version = $Version
    packet_root = (Resolve-Path -LiteralPath $packetRoot).Path
    zip_path = (Resolve-Path -LiteralPath $zipPath).Path
    latest_zip_path = (Resolve-Path -LiteralPath $latestZipPath).Path
    multi_device_kit = if ($copiedMultiDeviceKit) { (Resolve-Path -LiteralPath $copiedMultiDeviceKit).Path } else { $null }
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
