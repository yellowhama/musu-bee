[CmdletBinding()]
param(
    [string]$PacketPath,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
$version = (Get-Content -LiteralPath (Join-Path $repoRoot "VERSION") -Raw).Trim()
$safeVersion = $version -replace "[^A-Za-z0-9._-]", "_"
$cleanupPath = $null

if ([string]::IsNullOrWhiteSpace($PacketPath)) {
    $PacketPath = Join-Path $repoRoot ".local-build\final-operator-gates\musu-final-operator-gates-$safeVersion-latest.zip"
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

    $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("musu-operator-handoff-" + [guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null
    Expand-Archive -LiteralPath $resolved -DestinationPath $tempRoot -Force
    $script:cleanupPath = $tempRoot

    if (Test-Path -LiteralPath (Join-Path $tempRoot "packet-build-metadata.json")) {
        return $tempRoot
    }

    $candidate = Get-ChildItem -LiteralPath $tempRoot -Directory | Where-Object {
        Test-Path -LiteralPath (Join-Path $_.FullName "packet-build-metadata.json")
    } | Select-Object -First 1
    if ($candidate) {
        return $candidate.FullName
    }

    throw "Packet metadata not found in $resolved"
}

try {
    $packetRoot = Resolve-PacketRoot -Path $PacketPath
    $metadata = Get-Content -LiteralPath (Join-Path $packetRoot "packet-build-metadata.json") -Raw | ConvertFrom-Json
    $supportTemplate = Get-Content -LiteralPath (Join-Path $packetRoot "support-mailbox-record-template.json") -Raw | ConvertFrom-Json
    $kitZip = Get-ChildItem -LiteralPath (Join-Path $packetRoot "kits") -Filter "*.zip" -File -ErrorAction SilentlyContinue |
        Sort-Object Name |
        Select-Object -First 1

    $supportEmail = [string]$metadata.support_email
    $supportVerificationId = [string]$metadata.support_verification_id
    $supportSubject = "MUSU Store support verification $version $supportVerificationId"

    $commands = [pscustomobject]@{
        show_status = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\show-final-release-handoff-status.ps1"
        verify_packet = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\verify-final-operator-gate-packet.ps1 -PacketPath .local-build\final-operator-gates\musu-final-operator-gates-$safeVersion-latest.zip -Json"
        record_support = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\record-support-mailbox-verification.ps1 -SupportEmail `"$supportEmail`" -FromAddress `"<sender@example.com>`" -ReceivedBy `"<operator-name>`" -VerificationId `"$supportVerificationId`" -Notes `"Verified delivery in $supportEmail inbox`" -Json"
        record_msix_install = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\record-msix-install-evidence.ps1 -EvidencePath .local-build\msix-install\<INSTALL_EVIDENCE_JSON> -Json"
        show_second_pc_return_card = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\show-second-pc-return-card.ps1 -HandoffPath .local-build\second-pc-handoff\<HANDOFF_JSON>"
        run_multidevice_smoke = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\smoke-multidevice-beta.ps1 -RemoteAddr <SECOND_PC_IP_OR_TAILSCALE_IP>:<BRIDGE_PORT> -RemoteName <SECOND_PC_NODE_NAME> -RouteTarget <SECOND_PC_NODE_NAME>"
        record_multidevice = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\record-multidevice-evidence.ps1 -EvidencePath .local-build\multi-device\<EVIDENCE_JSON> -Json"
        record_store_release = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\record-store-release-verification.ps1 -ProductName `"MUSU`" -ProductNameReservedAt `"<partner-center-name-reserved-at>`" -SubmissionId `"<partner-center-submission-id>`" -CertificationStatus `"approved`" -RestrictedCapabilityStatus `"approved`" -RecordedBy `"<operator-name>`" -Notes `"Microsoft Store certification and restricted capability review approved`" -Json"
    }

    $secondPcCommands = @(
        "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\install-and-verify-msix.ps1 -StartupContract local-sideload-manual -ReplaceExisting",
        "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\capture-msix-install-evidence.ps1 -StartupContract local-sideload-manual",
        "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\collect-second-pc-handoff.ps1"
    )

    $result = [pscustomobject]@{
        schema = "musu.operator_handoff_card.v1"
        generated_at = (Get-Date).ToString("o")
        version = $version
        packet_path = (Resolve-Path -LiteralPath $PacketPath).Path
        packet_source_commit = [string]$metadata.git.commit
        packet_source_dirty = [bool]$metadata.git.dirty
        support_email = $supportEmail
        support_verification_id = $supportVerificationId
        support_subject = $supportSubject
        support_template_subject = [string]$supportTemplate.subject
        second_pc_kit_name = if ($kitZip) { $kitZip.Name } else { $null }
        second_pc_kit_packet_path = if ($kitZip) { "kits\$($kitZip.Name)" } else { $null }
        second_pc_commands = $secondPcCommands
        primary_commands = $commands
        return_files = @(
            ".local-build\msix-install\*.evidence.json",
            ".local-build\second-pc-handoff\*.handoff.json",
            ".local-build\multi-device\*.evidence.json"
        )
        remaining_evidence_gates = @(
            "Second-PC clean/current MSIX install evidence",
            "Real second-PC multi-device evidence",
            "$supportEmail inbox delivery evidence",
            "Partner Center product-name reservation, app submission, Microsoft certification, and restricted capability approval evidence"
        )
    }

    if ($Json) {
        $result | ConvertTo-Json -Depth 8
    }
    else {
        "MUSU operator handoff card"
        "version: $($result.version)"
        "packet: $($result.packet_path)"
        "packet_source_commit: $($result.packet_source_commit)"
        "support_email: $($result.support_email)"
        "support_subject: $($result.support_subject)"
        "second_pc_kit: $($result.second_pc_kit_packet_path)"
        ""
        "Return files from second PC"
        $result.return_files | ForEach-Object { "- $_" }
        ""
        "Second PC commands"
        $result.second_pc_commands | ForEach-Object { $_ }
        ""
        "Primary repo commands"
        $result.primary_commands.PSObject.Properties | ForEach-Object {
            "[$($_.Name)] $($_.Value)"
        }
    }
}
finally {
    if ($cleanupPath -and (Test-Path -LiteralPath $cleanupPath)) {
        Remove-Item -LiteralPath $cleanupPath -Recurse -Force
    }
}
