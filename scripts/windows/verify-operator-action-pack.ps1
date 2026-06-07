[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$PackPath,
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

function Resolve-PackRoot {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Action pack path not found: $Path"
    }
    $resolved = (Resolve-Path -LiteralPath $Path).Path
    if ((Get-Item -LiteralPath $resolved).PSIsContainer) {
        return $resolved
    }
    if ([System.IO.Path]::GetExtension($resolved).ToLowerInvariant() -ne ".zip") {
        throw "Action pack path must be a directory or .zip file: $resolved"
    }

    $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("musu-operator-action-pack-" + [guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null
    Expand-Archive -LiteralPath $resolved -DestinationPath $tempRoot -Force
    $script:cleanupPath = $tempRoot
    if (Test-Path -LiteralPath (Join-Path $tempRoot "action-pack-metadata.json")) {
        return $tempRoot
    }
    $candidate = Get-ChildItem -LiteralPath $tempRoot -Directory | Where-Object {
        Test-Path -LiteralPath (Join-Path $_.FullName "action-pack-metadata.json")
    } | Select-Object -First 1
    if ($candidate) {
        return $candidate.FullName
    }
    return $tempRoot
}

try {
    $packRoot = Resolve-PackRoot -Path $PackPath
    Add-Check "pack root" "pass" "action pack root resolved to $packRoot"

    $requiredFiles = @(
        "OPERATOR_ACTION_PACK_README_CURRENT.md",
        "action-pack-metadata.json",
        "SHA256SUMS.txt",
        "second-pc",
        "partner-center",
        "support-mailbox",
        "support-mailbox\SUPPORT_MAILBOX_VERIFICATION_EMAIL_CURRENT.txt",
        "support-mailbox\support-mailbox-record-template-current.json"
    )
    foreach ($relative in $requiredFiles) {
        Add-CheckFromCondition "required entry: $relative" (Test-Path -LiteralPath (Join-Path $packRoot $relative)) "$relative exists" "$relative is missing"
    }

    $metadata = $null
    $metadataPath = Join-Path $packRoot "action-pack-metadata.json"
    if (Test-Path -LiteralPath $metadataPath) {
        try {
            $metadata = Get-Content -LiteralPath $metadataPath -Raw | ConvertFrom-Json
            Add-CheckFromCondition "metadata schema" ([string]$metadata.schema -eq "musu.operator_action_pack.v1") "metadata schema is valid" "metadata schema is invalid"
            Add-CheckFromCondition "metadata version" (-not [string]::IsNullOrWhiteSpace([string]$metadata.version)) "metadata version is present" "metadata version is missing"
            Add-CheckFromCondition "metadata support email" ([string]$metadata.support_email -eq "musu@musu.pro") "metadata uses musu@musu.pro" "metadata support email is not musu@musu.pro"
            Add-CheckFromCondition "metadata support verification id" ([string]$metadata.support_verification_id -like "musu-store-support-*") "metadata includes MUSU support verification id" "metadata support verification id is missing or weak"
            Add-CheckFromCondition "metadata git" ([string]$metadata.git.commit -match "^[0-9a-fA-F]{40}$" -and -not [bool]$metadata.git.dirty) "metadata has clean source git commit" "metadata git state is missing or dirty"
            Add-CheckFromCondition "metadata final packet" ([bool]$metadata.final_packet.verified -and [string]$metadata.final_packet.source_commit -match "^[0-9a-fA-F]{40}$") "metadata references verified final packet" "metadata does not reference a verified final packet"
        }
        catch {
            Add-Check "metadata json" "fail" "metadata JSON did not parse: $($_.Exception.Message)"
        }
    }

    $readmePath = Join-Path $packRoot "OPERATOR_ACTION_PACK_README_CURRENT.md"
    if (Test-Path -LiteralPath $readmePath) {
        $readme = Get-Content -LiteralPath $readmePath -Raw
        Add-CheckFromCondition "readme second pc action" ($readme -like "*Second PC test*" -and $readme -like "*msix-install*" -and $readme -like "*second-pc-return*") "README describes second-PC action" "README missing second-PC action"
        Add-CheckFromCondition "readme support action" ($readme -like "*Support mailbox proof*" -and $readme -like "*musu@musu.pro*") "README describes support mailbox action" "README missing support mailbox action"
        Add-CheckFromCondition "readme store action" ($readme -like "*Partner Center Store submission*" -and $readme -like "*Upload the MSIX inside*") "README describes Partner Center action" "README missing Partner Center action"
        Add-CheckFromCondition "readme blockers" ($readme -like "*MSIX install evidence: missing*" -and $readme -like "*Store approval evidence: missing*") "README states remaining external gates" "README missing remaining external gate status"
    }

    $supportTemplatePath = Join-Path $packRoot "support-mailbox\support-mailbox-record-template-current.json"
    if (Test-Path -LiteralPath $supportTemplatePath) {
        try {
            $supportTemplate = Get-Content -LiteralPath $supportTemplatePath -Raw | ConvertFrom-Json
            Add-CheckFromCondition "support template email" ([string]$supportTemplate.support_email -eq "musu@musu.pro") "support template uses musu@musu.pro" "support template support email mismatch"
            Add-CheckFromCondition "support template command" ([string]$supportTemplate.record_command -like "*record-support-mailbox-verification.ps1*" -and [string]$supportTemplate.record_command -like "*-VerificationId*") "support template records explicit verification id" "support template command is missing recorder or verification id"
        }
        catch {
            Add-Check "support template json" "fail" "support template JSON did not parse: $($_.Exception.Message)"
        }
    }

    $secondPcZip = Get-ChildItem -LiteralPath (Join-Path $packRoot "second-pc") -Filter "MUSU-second-PC-transfer-*.zip" -File -ErrorAction SilentlyContinue | Select-Object -First 1
    Add-CheckFromCondition "second-pc transfer zip" ($null -ne $secondPcZip) "second-PC transfer zip exists" "second-PC transfer zip is missing"
    if ($secondPcZip) {
        try {
            Add-Type -AssemblyName System.IO.Compression.FileSystem
            $archive = [System.IO.Compression.ZipFile]::OpenRead($secondPcZip.FullName)
            try {
                $entries = @($archive.Entries | ForEach-Object { $_.FullName })
                Add-CheckFromCondition "second-pc transfer quickstart" ($entries -contains "SECOND_PC_QUICKSTART_CURRENT.txt") "second-PC transfer includes quickstart" "second-PC transfer missing quickstart"
                $quickstartEntry = $archive.GetEntry("SECOND_PC_QUICKSTART_CURRENT.txt")
                if ($quickstartEntry) {
                    $reader = [System.IO.StreamReader]::new($quickstartEntry.Open())
                    try {
                        $quickstart = $reader.ReadToEnd()
                    }
                    finally {
                        $reader.Dispose()
                    }
                    Add-CheckFromCondition "second-pc transfer return zip instructions" ($quickstart -like "*.local-build\second-pc-return\*.zip*" -and $quickstart -like "*import-second-pc-return.ps1*" -and $quickstart -like "*test-second-pc-route-preflight.ps1*" -and $quickstart -like "*.local-build\second-pc-route-preflight\*.second-pc-route-preflight.json*" -and $quickstart -like "*.local-build\runtime-cleanup\*.runtime-cleanup.json*" -and $quickstart -like "*.local-build\route-diagnostics\*.route-reachability-diagnostic.json*" -and $quickstart -like "*route_reachability_diagnostic_verified*" -and $quickstart -like "*runtime_cpu_subrole_contract_ok*" -and $quickstart -like "*process_counts_by_subrole*" -and $quickstart -like "*bridge_runtime*" -and $quickstart -like "*desktop_shell*") "second-PC transfer quickstart explains return archive, route preflight, cleanup evidence, route reachability diagnostics, and CPU subrole contract" "second-PC transfer quickstart missing return archive, route preflight, cleanup, route reachability, or CPU subrole instructions"
                }
                $nestedKit = @($entries | Where-Object { $_ -like "musu-multidevice-*.zip" })
                Add-CheckFromCondition "second-pc transfer kit" ($nestedKit.Count -eq 1) "second-PC transfer includes one kit zip" "second-PC transfer missing nested kit zip"
                if ($nestedKit.Count -eq 1) {
                    $nestedKitEntry = $archive.GetEntry($nestedKit[0])
                    if ($nestedKitEntry) {
                        $nestedStream = $nestedKitEntry.Open()
                        try {
                            $nestedArchive = [System.IO.Compression.ZipArchive]::new($nestedStream, [System.IO.Compression.ZipArchiveMode]::Read)
                            try {
                                $nestedEntries = @($nestedArchive.Entries | ForEach-Object { $_.FullName -replace "/", "\" })
                                Add-CheckFromCondition "second-pc nested kit wrapper" ($nestedEntries -contains "scripts\windows\run-second-pc-release-check.ps1") "nested kit includes run-second-pc-release-check.ps1" "nested kit missing run-second-pc-release-check.ps1"
                                Add-CheckFromCondition "second-pc nested kit runtime CPU script" ($nestedEntries -contains "scripts\windows\measure-musu-idle-cpu.ps1") "nested kit includes measure-musu-idle-cpu.ps1" "nested kit missing measure-musu-idle-cpu.ps1"
                                Add-CheckFromCondition "second-pc nested kit runtime CPU scenario matrix script" ($nestedEntries -contains "scripts\windows\measure-musu-runtime-cpu-scenarios.ps1") "nested kit includes measure-musu-runtime-cpu-scenarios.ps1" "nested kit missing measure-musu-runtime-cpu-scenarios.ps1"
                                Add-CheckFromCondition "second-pc nested kit runtime CPU scenario matrix verifier" ($nestedEntries -contains "scripts\windows\verify-runtime-cpu-scenario-matrix.ps1") "nested kit includes verify-runtime-cpu-scenario-matrix.ps1" "nested kit missing verify-runtime-cpu-scenario-matrix.ps1"
                                Add-CheckFromCondition "second-pc nested kit route reachability tools" ($nestedEntries -contains "scripts\windows\record-route-reachability-diagnostic.ps1" -and $nestedEntries -contains "scripts\windows\verify-route-reachability-diagnostic.ps1" -and $nestedEntries -contains "scripts\windows\test-second-pc-route-preflight.ps1") "nested kit includes route reachability recorder/verifier and route preflight helper" "nested kit missing route reachability recorder/verifier or route preflight helper"
                                Add-CheckFromCondition "second-pc nested kit process attribution summary" ($nestedEntries -contains "scripts\windows\show-musu-process-attribution.ps1" -and $nestedEntries -contains "scripts\windows\audit-musu-process-ownership.ps1") "nested kit includes process attribution tools" "nested kit missing process attribution tools"
                                $kitReadmeEntry = $nestedArchive.Entries | Where-Object { $_.FullName -eq "README_MULTI_DEVICE_TEST_KIT.md" } | Select-Object -First 1
                                if ($kitReadmeEntry) {
                                    $reader = [System.IO.StreamReader]::new($kitReadmeEntry.Open())
                                    try {
                                        $kitReadme = $reader.ReadToEnd()
                                    }
                                    finally {
                                        $reader.Dispose()
                                    }
                                    Add-CheckFromCondition "second-pc nested kit README wrapper" ($kitReadme -like "*run-second-pc-release-check.ps1*" -and $kitReadme -like "*.release-check.json*" -and $kitReadme -like "*.local-build\second-pc-return\*.zip*" -and $kitReadme -like "*test-second-pc-route-preflight.ps1*" -and $kitReadme -like "*.local-build\second-pc-route-preflight\*.second-pc-route-preflight.json*" -and $kitReadme -like "*measure-musu-idle-cpu.ps1*" -and $kitReadme -like "*.local-build\runtime-idle-cpu\*.evidence.json*" -and $kitReadme -like "*measure-musu-runtime-cpu-scenarios.ps1*" -and $kitReadme -like "*.local-build\runtime-cpu-scenarios\*" -and $kitReadme -like "*record-route-reachability-diagnostic.ps1*" -and $kitReadme -like "*musu.route_reachability_diagnostic.v1*" -and $kitReadme -like "*.local-build\route-diagnostics\*.route-reachability-diagnostic.json*" -and $kitReadme -like "*cpu_attribution*" -and $kitReadme -like "*top_processes*" -and $kitReadme -like "*process_counts_by_subrole*" -and $kitReadme -like "*runtime_cpu_subrole_contract_ok*" -and $kitReadme -like "*bridge_runtime*" -and $kitReadme -like "*desktop_shell*" -and $kitReadme -like "*webview2_helper*" -and $kitReadme -like "*show-musu-process-attribution.ps1*" -and $kitReadme -like "*machine-wide Node.js*" -and $kitReadme -like "*.local-build\runtime-cleanup\*.runtime-cleanup.json*" -and $kitReadme -like "*musu.second_pc_runtime_cleanup.v1*") "nested kit README explains release-check wrapper, route preflight, runtime CPU evidence, route reachability diagnostics, scenario matrix subrole attribution, process attribution, and cleanup evidence" "nested kit README missing release-check wrapper/route preflight/runtime CPU/route reachability/scenario matrix subrole attribution/process attribution/cleanup instructions"
                                }
                                else {
                                    Add-Check "second-pc nested kit README" "fail" "nested kit is missing README_MULTI_DEVICE_TEST_KIT.md"
                                }
                            }
                            finally {
                                $nestedArchive.Dispose()
                            }
                        }
                        finally {
                            $nestedStream.Dispose()
                        }
                    }
                }
            }
            finally {
                $archive.Dispose()
            }
        }
        catch {
            Add-Check "second-pc transfer inspection" "fail" "unable to inspect second-PC transfer zip: $($_.Exception.Message)"
        }
    }

    $partnerZip = Get-ChildItem -LiteralPath (Join-Path $packRoot "partner-center") -Filter "MUSU-*-store-submission-*.zip" -File -ErrorAction SilentlyContinue | Select-Object -First 1
    Add-CheckFromCondition "partner-center zip" ($null -ne $partnerZip) "Partner Center zip exists" "Partner Center zip is missing"
    if ($partnerZip) {
        try {
            Add-Type -AssemblyName System.IO.Compression.FileSystem
            $archive = [System.IO.Compression.ZipFile]::OpenRead($partnerZip.FullName)
            try {
                $entries = @($archive.Entries | ForEach-Object { $_.FullName })
                $requiredPartnerEntries = @(
                    "musu_1.15.0.0_x64_store-reviewed-immediate-registration.msix",
                    "PARTNER_CENTER_CERTIFICATION_NOTES_CLEAN.txt",
                    "PARTNER_CENTER_UPLOAD_README_CURRENT.txt",
                    "partner-center-capability-justification.md",
                    "STORE_SUBMISSION_METADATA_2026_05_29.md",
                    "SHA256SUMS.txt"
                )
                foreach ($entry in $requiredPartnerEntries) {
                    Add-CheckFromCondition "partner entry: $entry" ($entries -contains $entry) "Partner zip contains $entry" "Partner zip is missing $entry"
                }
                $pfxEntries = @($entries | Where-Object { $_ -like "*.pfx" })
                Add-CheckFromCondition "partner private key exclusion" ($pfxEntries.Count -eq 0) "Partner zip excludes private .pfx files" "Partner zip includes private .pfx files"
            }
            finally {
                $archive.Dispose()
            }
        }
        catch {
            Add-Check "partner zip inspection" "fail" "unable to inspect Partner Center zip: $($_.Exception.Message)"
        }
    }

    $pfxFiles = @(Get-ChildItem -LiteralPath $packRoot -Recurse -Filter "*.pfx" -File -ErrorAction SilentlyContinue)
    Add-CheckFromCondition "pack private key exclusion" ($pfxFiles.Count -eq 0) "action pack excludes private .pfx files" "action pack includes private .pfx files"

    $checksumsPath = Join-Path $packRoot "SHA256SUMS.txt"
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
            $filePath = Join-Path $packRoot $relative
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
        pack_path = (Resolve-Path -LiteralPath $PackPath).Path
        pack_root = $packRoot
        fail_count = $failCount
        checks = $checks.ToArray()
    }

    if ($Json) {
        $result | ConvertTo-Json -Depth 8
    }
    else {
        "MUSU operator action pack verification"
        "ok: $($result.ok)"
        "pack_path: $($result.pack_path)"
        "pack_root: $($result.pack_root)"
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
