[CmdletBinding()]
param(
    [string]$OutputRoot,
    [string]$Version,
    [string]$SupportEmail,
    [string]$VerificationId,
    [string]$FromAddress,
    [string]$ReceivedBy,
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
    $OutputRoot = Join-Path $repoRoot ".local-build\support-mailbox-requests"
}

$safeVersion = $Version -replace "[^A-Za-z0-9._-]", "_"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
if ([string]::IsNullOrWhiteSpace($VerificationId)) {
    $suffix = [guid]::NewGuid().ToString("N").Substring(0, 16)
    $VerificationId = "musu-support-$safeVersion-$stamp-$suffix"
}
if ($VerificationId -notmatch "^musu-[A-Za-z0-9._-]{16,}$") {
    throw "VerificationId must match ^musu-[A-Za-z0-9._-]{16,}$."
}

$gitBranch = (& git -C $repoRoot rev-parse --abbrev-ref HEAD 2>$null | Out-String).Trim()
$gitCommit = (& git -C $repoRoot rev-parse HEAD 2>$null | Out-String).Trim()
$gitStatus = (& git -C $repoRoot status --short 2>$null | Out-String).Trim()

$requestRoot = Join-Path $OutputRoot "musu-support-mailbox-request-$safeVersion-$stamp"
if (Test-Path -LiteralPath $requestRoot) {
    throw "Support mailbox request packet already exists: $requestRoot"
}
New-Item -ItemType Directory -Force -Path $requestRoot | Out-Null

$recordFromAddress = if ([string]::IsNullOrWhiteSpace($FromAddress)) { "REPLACE_WITH_EXTERNAL_SENDER_EMAIL" } else { $FromAddress }
$recordReceivedBy = if ([string]::IsNullOrWhiteSpace($ReceivedBy)) { "REPLACE_WITH_OPERATOR_NAME" } else { $ReceivedBy }
$subject = "MUSU Store support verification $Version $VerificationId"
$recordCommand = 'powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\record-support-mailbox-verification.ps1 -SupportEmail "{0}" -FromAddress "{1}" -ReceivedBy "{2}" -VerificationId "{3}" -Notes "Verified delivery in {0} inbox" -Json' -f $SupportEmail, $recordFromAddress, $recordReceivedBy, $VerificationId
$evidenceWarning = "This request packet does not satisfy release gate status. The support-mailbox gate remains No-Go until a real delivered message is visible in the support inbox and record-support-mailbox-verification.ps1 writes verified evidence."

$body = @"
MUSU Store support mailbox verification

Verification ID: $VerificationId
Release: $Version
Support mailbox: $SupportEmail
Source commit: $gitCommit

Purpose:
This message verifies that the public MUSU support mailbox receives external
mail for the Microsoft Store release gate.
"@

$emailTemplate = @"
To: $SupportEmail
Subject: $subject

$body

After this message is visible in the actual $SupportEmail inbox, run this from
the real MUSU release repo root and fill any placeholders that remain:

$recordCommand

$evidenceWarning
"@

$operatorSteps = @(
    "Send SUPPORT_MAILBOX_VERIFICATION_EMAIL.txt to $SupportEmail from an external sender.",
    "Confirm the message is visible in the actual support inbox.",
    "Run the record command from the real MUSU release repo root, replacing any placeholders.",
    "Run scripts\windows\write-release-go-no-go.ps1 -Json and confirm support_mailbox_verified=true."
)

$request = [pscustomobject]@{
    schema = "musu.support_mailbox_verification_request.v1"
    ok = $true
    generated_at = (Get-Date).ToString("o")
    version = $Version
    support_email = $SupportEmail
    verification_id = $VerificationId
    subject = $subject
    body = $body
    record_command = $recordCommand
    operator_steps = $operatorSteps
    evidence_warning = $evidenceWarning
    release_gate_satisfied = $false
    git = [pscustomobject]@{
        branch = $gitBranch
        commit = $gitCommit
        dirty = -not [string]::IsNullOrWhiteSpace($gitStatus)
        status_short = $gitStatus
    }
}

$requestJsonPath = Join-Path $requestRoot "support-mailbox-verification-request.json"
$emailTemplatePath = Join-Path $requestRoot "SUPPORT_MAILBOX_VERIFICATION_EMAIL.txt"
$readmePath = Join-Path $requestRoot "README_SUPPORT_MAILBOX_VERIFICATION_REQUEST.md"
$request | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $requestJsonPath -Encoding UTF8
$emailTemplate | Set-Content -LiteralPath $emailTemplatePath -Encoding UTF8

$readme = @"
# MUSU Support Mailbox Verification Request

Version: $Version
Support mailbox: $SupportEmail
Verification ID: $VerificationId
Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss K')
Source commit: $gitCommit
Git dirty: $(-not [string]::IsNullOrWhiteSpace($gitStatus))

This packet prepares the support mailbox release action. It does not satisfy
release gate status and it does not create release evidence.

1. Send `SUPPORT_MAILBOX_VERIFICATION_EMAIL.txt` to $SupportEmail from an
   external sender.
2. Confirm the message is visible in the actual support inbox.
3. Run this from the real MUSU release repo root:

```powershell
$recordCommand
```

4. Re-run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\write-release-go-no-go.ps1 -Json
```

Expected result after real delivery evidence is recorded:

- `support_mailbox_verified=true`

$evidenceWarning
"@
$readme | Set-Content -LiteralPath $readmePath -Encoding UTF8

$checksumsPath = Join-Path $requestRoot "SHA256SUMS.txt"
Get-ChildItem -LiteralPath $requestRoot -File |
    Where-Object { $_.FullName -ne $checksumsPath } |
    Sort-Object FullName |
    ForEach-Object {
        $relative = $_.FullName.Substring($requestRoot.Length + 1)
        $hash = Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName
        "{0}  {1}" -f $hash.Hash.ToLowerInvariant(), ($relative -replace "\\", "/")
    } | Set-Content -LiteralPath $checksumsPath -Encoding ASCII

$zipPath = "$requestRoot.zip"
Compress-Archive -Path (Join-Path $requestRoot "*") -DestinationPath $zipPath -Force
$latestZipPath = Join-Path (Resolve-Path -LiteralPath $OutputRoot).Path "musu-support-mailbox-request-$safeVersion-latest.zip"
Copy-Item -LiteralPath $zipPath -Destination $latestZipPath -Force

$result = [pscustomobject]@{
    schema = "musu.support_mailbox_verification_request.v1"
    ok = $true
    version = $Version
    request_root = (Resolve-Path -LiteralPath $requestRoot).Path
    request_json_path = (Resolve-Path -LiteralPath $requestJsonPath).Path
    email_template_path = (Resolve-Path -LiteralPath $emailTemplatePath).Path
    readme_path = (Resolve-Path -LiteralPath $readmePath).Path
    zip_path = (Resolve-Path -LiteralPath $zipPath).Path
    latest_zip_path = (Resolve-Path -LiteralPath $latestZipPath).Path
    support_email = $SupportEmail
    subject = $subject
    verification_id = $VerificationId
    record_command = $recordCommand
    evidence_warning = $evidenceWarning
    release_gate_satisfied = $false
    git_dirty = -not [string]::IsNullOrWhiteSpace($gitStatus)
}

if ($Json) {
    $result | ConvertTo-Json -Depth 8
}
else {
    $result
}
