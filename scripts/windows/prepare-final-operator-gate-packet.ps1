[CmdletBinding()]
param(
    [string]$OutputRoot,
    [string]$Version,
    [string]$SupportEmail = "support@musu.pro",
    [string]$MultiDeviceKitZip,
    [switch]$IncludeDesktopShell,
    [switch]$SkipMultiDeviceKit,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path

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
    "docs\STORE_SUBMISSION_METADATA_2026_05_29.md"
)
foreach ($relative in $docsToCopy) {
    $source = Join-Path $repoRoot $relative
    if (Test-Path -LiteralPath $source) {
        Copy-Item -LiteralPath $source -Destination (Join-Path $packetDocs (Split-Path -Leaf $source))
    }
}

$scriptsToCopy = @(
    "record-support-mailbox-verification.ps1",
    "verify-support-mailbox-evidence.ps1",
    "record-multidevice-evidence.ps1",
    "verify-multidevice-evidence.ps1",
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

Current machine-verifiable state before these gates:

- local artifacts: ready
- desktop shell audit: ready
- single-machine smoke evidence: recorded
- public Store metadata: live and passing

Remaining blockers:

1. real second-PC multi-device evidence
2. real __SUPPORT_EMAIL__ inbox delivery evidence

## Gate A - Support mailbox delivery

Send a real email to:

```text
__SUPPORT_EMAIL__
```

Recommended subject:

```text
MUSU Store support verification __VERSION__
```

After the message is visible in the actual support inbox, run this from the release repo root and fill the placeholders:

```powershell
__SUPPORT_COMMAND__
```

Then run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\write-release-go-no-go.ps1 -Json
```

Expected result: `support_mailbox_verified=true`.

## Gate B - Second-PC multi-device test

Use the multi-device kit in `kits\` if this packet includes one. Copy it to the second Windows PC, unzip it, and follow its README.

When the second-PC smoke creates `.local-build\multi-device\*.evidence.json`, return that file to the release repo and record it:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\record-multidevice-evidence.ps1 -EvidencePath .local-build\multi-device\<EVIDENCE_JSON>
```

Expected result: `multi_device_verified=true`.

## Final command

After both gates:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\write-release-candidate-manifest.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\write-release-go-no-go.ps1 -Json
```

The release can proceed only when:

- `ready_for_public_desktop_release=true`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `multi_device_verified=true`
- `public_metadata_ok=true`
- `support_mailbox_verified=true`
- `manifest_git.dirty=false`
'@
$readme = $readme.Replace("__VERSION__", $Version).Replace("__SUPPORT_EMAIL__", $SupportEmail).Replace("__SUPPORT_COMMAND__", $supportCommand)
$readmePath = Join-Path $packetRoot "README_FINAL_OPERATOR_GATES.md"
$readme | Set-Content -LiteralPath $readmePath -Encoding UTF8

$supportTemplate = [pscustomobject]@{
    support_email = $SupportEmail
    subject = "MUSU Store support verification $Version"
    verification_id = $supportVerificationId
    record_command = $supportCommand
}
$supportTemplate | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $packetRoot "support-mailbox-record-template.json") -Encoding UTF8

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

$result = [pscustomobject]@{
    ok = $true
    version = $Version
    packet_root = (Resolve-Path -LiteralPath $packetRoot).Path
    zip_path = (Resolve-Path -LiteralPath $zipPath).Path
    multi_device_kit = if ($copiedMultiDeviceKit) { (Resolve-Path -LiteralPath $copiedMultiDeviceKit).Path } else { $null }
    support_email = $SupportEmail
    support_verification_id = $supportVerificationId
}

if ($Json) {
    $result | ConvertTo-Json -Depth 6
}
else {
    $result
}
