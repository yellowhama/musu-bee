[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$PacketPath,
    [switch]$AllowNoMultiDeviceKit,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$checks = New-Object System.Collections.Generic.List[object]
$cleanupPath = $null

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

function Resolve-PacketRoot {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Packet path not found: $Path"
    }

    $resolved = (Resolve-Path -LiteralPath $Path).Path
    if ((Get-Item -LiteralPath $resolved).PSIsContainer) {
        return $resolved
    }

    if ([System.IO.Path]::GetExtension($resolved).ToLowerInvariant() -ne ".zip") {
        throw "Packet path must be a directory or .zip file: $resolved"
    }

    $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("musu-final-gate-packet-" + [guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null
    Expand-Archive -LiteralPath $resolved -DestinationPath $tempRoot -Force
    $script:cleanupPath = $tempRoot

    if (Test-Path -LiteralPath (Join-Path $tempRoot "README_FINAL_OPERATOR_GATES.md")) {
        return $tempRoot
    }

    $candidate = Get-ChildItem -LiteralPath $tempRoot -Directory | Where-Object {
        Test-Path -LiteralPath (Join-Path $_.FullName "README_FINAL_OPERATOR_GATES.md")
    } | Select-Object -First 1
    if ($candidate) {
        return $candidate.FullName
    }

    return $tempRoot
}

try {
    $packetRoot = Resolve-PacketRoot -Path $PacketPath
    Add-Check "packet root" "pass" "packet root resolved to $packetRoot"

    $requiredFiles = @(
        "README_FINAL_OPERATOR_GATES.md",
        "SHA256SUMS.txt",
        "support-mailbox-record-template.json",
        "docs\RELEASE_FINAL_OPERATOR_GATES_2026_05_29.md",
        "docs\MULTI_DEVICE_RELEASE_TEST_PLAN_1_15_0_RC1_2026_05_29.md",
        "docs\BETA_RELEASE_CHECKLIST_1_15_0_RC1.md",
        "docs\DESKTOP_RELEASE_READINESS_AUDIT_2026_05_29.md",
        "docs\STORE_SUBMISSION_METADATA_2026_05_29.md",
        "scripts\windows\record-support-mailbox-verification.ps1",
        "scripts\windows\verify-support-mailbox-evidence.ps1",
        "scripts\windows\record-multidevice-evidence.ps1",
        "scripts\windows\verify-multidevice-evidence.ps1",
        "scripts\windows\capture-msix-install-evidence.ps1",
        "scripts\windows\record-msix-install-evidence.ps1",
        "scripts\windows\verify-msix-install-evidence.ps1",
        "scripts\windows\record-store-release-verification.ps1",
        "scripts\windows\verify-store-release-evidence.ps1",
        "scripts\windows\show-final-release-handoff-status.ps1",
        "scripts\windows\verify-final-operator-gate-packet.ps1",
        "scripts\windows\complete-final-operator-gates.ps1",
        "scripts\windows\write-release-candidate-manifest.ps1",
        "scripts\windows\write-release-go-no-go.ps1"
    )

    foreach ($relative in $requiredFiles) {
        $exists = Test-Path -LiteralPath (Join-Path $packetRoot $relative)
        Add-CheckFromCondition "required file: $relative" $exists "$relative exists" "$relative is missing"
    }

    $readmePath = Join-Path $packetRoot "README_FINAL_OPERATOR_GATES.md"
    if (Test-Path -LiteralPath $readmePath) {
        $readme = Get-Content -LiteralPath $readmePath -Raw
        Add-CheckFromCondition "readme execution boundary" ($readme -like "*real MUSU release repo root*") "README states commands run from real release repo root" "README does not clearly state release repo root execution boundary"
        Add-CheckFromCondition "readme second pc copy boundary" ($readme.Contains('Copy only the zip under `kits\`')) "README states only the kit zip should be copied to second PC" "README does not clearly state only kit zip should be copied"
        Add-CheckFromCondition "readme support mailbox gate" ($readme -like "*support@musu.pro*") "README names support@musu.pro" "README does not name support@musu.pro"
        Add-CheckFromCondition "readme msix install gate" ($readme -like "*record-msix-install-evidence.ps1*" -and $readme -like "*msix_install_verified=true*") "README includes MSIX install evidence gate" "README missing MSIX install evidence gate"
        Add-CheckFromCondition "readme store release blocker" ($readme -like "*Partner Center product name reservation*" -and $readme -like "*app submission*" -and $readme -like "*store_release_verified=true*") "README states Store release approval is a blocker" "README does not clearly state Store release approval evidence is required"
        Add-CheckFromCondition "readme store release recorder" ($readme -like "*record-store-release-verification.ps1*") "README includes Store release evidence recorder command" "README missing Store release evidence recorder command"
        Add-CheckFromCondition "readme handoff status command" ($readme -like "*show-final-release-handoff-status.ps1*") "README includes final release handoff status command" "README missing final release handoff status command"
        Add-CheckFromCondition "readme complete runner msix params" ($readme -like "*complete-final-operator-gates.ps1*" -and $readme -like "*-MsixInstallEvidencePath*") "README final command can record MSIX install evidence" "README final command does not include MSIX install evidence parameters"
        Add-CheckFromCondition "readme complete runner store params" ($readme -like "*complete-final-operator-gates.ps1*" -and $readme -like "*-StoreProductNameReservedAt*" -and $readme -like "*-StoreSubmissionId*") "README final command can record Store release evidence with product name reservation timestamp" "README final command does not include Store release evidence parameters"
        Add-CheckFromCondition "readme complete runner fail gate" ($readme -like "*complete-final-operator-gates.ps1*" -and $readme -like "*-FailOnNotReady*") "README final command fails when final go/no-go is not ready" "README final command does not include -FailOnNotReady"
        Add-CheckFromCondition "readme go no-go gate" ($readme -like "*write-release-go-no-go.ps1*") "README includes final go/no-go command" "README missing final go/no-go command"
    }

    $templatePath = Join-Path $packetRoot "support-mailbox-record-template.json"
    if (Test-Path -LiteralPath $templatePath) {
        try {
            $template = Get-Content -LiteralPath $templatePath -Raw | ConvertFrom-Json
            Add-CheckFromCondition "support template email" ([string]$template.support_email -eq "support@musu.pro") "support template uses support@musu.pro" "support template does not use support@musu.pro"
            Add-CheckFromCondition "support template command" ([string]$template.record_command -like "*record-support-mailbox-verification.ps1*") "support template contains record command" "support template missing record command"
        }
        catch {
            Add-Check "support template json" "fail" "support template JSON did not parse: $($_.Exception.Message)"
        }
    }

    $kitZips = @(Get-ChildItem -LiteralPath (Join-Path $packetRoot "kits") -Filter "*.zip" -File -ErrorAction SilentlyContinue)
    if ($AllowNoMultiDeviceKit) {
        Add-Check "multi-device kit" "pass" "multi-device kit is optional for this verification"
    }
    else {
        Add-CheckFromCondition "multi-device kit" ($kitZips.Count -gt 0) "found $($kitZips.Count) kit zip(s)" "no multi-device kit zip found under kits"
    }

    $checksumsPath = Join-Path $packetRoot "SHA256SUMS.txt"
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
            $filePath = Join-Path $packetRoot $relative
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
        packet_path = (Resolve-Path -LiteralPath $PacketPath).Path
        packet_root = $packetRoot
        fail_count = $failCount
        kit_count = $kitZips.Count
        checks = $checks.ToArray()
    }

    if ($Json) {
        $result | ConvertTo-Json -Depth 8
    }
    else {
        "MUSU final operator gate packet verification"
        "ok: $($result.ok)"
        "packet_path: $($result.packet_path)"
        "packet_root: $($result.packet_root)"
        "kit_count: $($result.kit_count)"
        ""
        $checks | Format-Table name, status, message -Wrap
    }

    if (-not $result.ok) {
        exit 1
    }
}
finally {
    if ($cleanupPath -and (Test-Path -LiteralPath $cleanupPath)) {
        Remove-Item -LiteralPath $cleanupPath -Recurse -Force
    }
}
