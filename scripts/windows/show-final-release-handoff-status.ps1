[CmdletBinding()]
param(
    [string]$PublicMetadataBaseUrl = "https://musu.pro",
    [switch]$SkipPublicMetadata,
    [string]$PacketPath,
    [switch]$SkipPacketVerification,
    [string]$ActionPackPath,
    [switch]$SkipActionPackVerification,
    [ValidateSet("quick", "deep", "skip")]
    [string]$PacketVerificationMode = "quick",
    [ValidateSet("quick", "deep", "skip")]
    [string]$ActionPackVerificationMode = "quick",
    [int]$ScriptTimeoutSeconds = 120,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
. (Join-Path $scriptDir "release-config.ps1")
$version = (Get-Content -LiteralPath (Join-Path $repoRoot "VERSION") -Raw).Trim()
$supportEmail = Get-MusuReleaseSupportEmail -RepoRoot $repoRoot
$safeVersion = $version -replace "[^A-Za-z0-9._-]", "_"

if ($ScriptTimeoutSeconds -lt 1) {
    throw "ScriptTimeoutSeconds must be at least 1."
}

if ([string]::IsNullOrWhiteSpace($PacketPath)) {
    $PacketPath = Join-Path $repoRoot ".local-build\final-operator-gates\musu-final-operator-gates-$safeVersion-latest.zip"
}
if ([string]::IsNullOrWhiteSpace($ActionPackPath)) {
    $ActionPackPath = Join-Path $repoRoot ".local-build\operator-action-pack\MUSU-$safeVersion-operator-action-pack-latest.zip"
}
if ($SkipPacketVerification) {
    $PacketVerificationMode = "skip"
}
if ($SkipActionPackVerification) {
    $ActionPackVerificationMode = "skip"
}

function Get-CurrentPowerShellExecutable {
    $currentProcessPath = $null
    try {
        $currentProcessPath = [System.Diagnostics.Process]::GetCurrentProcess().MainModule.FileName
    }
    catch {
        $currentProcessPath = $null
    }

    if (-not [string]::IsNullOrWhiteSpace($currentProcessPath) -and (Test-Path -LiteralPath $currentProcessPath)) {
        return $currentProcessPath
    }

    $edition = if ($PSVersionTable.ContainsKey("PSEdition")) { [string]$PSVersionTable.PSEdition } else { "" }
    if ($edition -eq "Core") {
        return "pwsh"
    }
    return "powershell.exe"
}

function Invoke-JsonScript {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [string[]]$Arguments = @(),
        [switch]$AllowFailure
    )

    $processArgs = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $FilePath) + $Arguments

    function ConvertTo-ProcessArgument {
        param([Parameter(Mandatory = $true)][AllowEmptyString()][string]$Value)

        if ([string]::IsNullOrEmpty($Value)) {
            return '""'
        }
        if ($Value -notmatch '[\s"]') {
            return $Value
        }
        return '"' + ($Value.Replace('"', '\"')) + '"'
    }

    $watch = [Diagnostics.Stopwatch]::StartNew()
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = Get-CurrentPowerShellExecutable
    $startInfo.Arguments = (($processArgs | ForEach-Object { ConvertTo-ProcessArgument -Value ([string]$_) }) -join " ")
    $startInfo.WorkingDirectory = $repoRoot
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.CreateNoWindow = $true

    $process = $null
    $startError = $null
    try {
        $process = [System.Diagnostics.Process]::Start($startInfo)
    }
    catch {
        $startError = $_.Exception.Message
    }

    if (-not $process) {
        $watch.Stop()
        if (-not $AllowFailure) {
            throw "Script failed to start: $FilePath`n$startError"
        }
        return [pscustomobject]@{
            exit_code = -1
            timed_out = $false
            elapsed_ms = [int]$watch.ElapsedMilliseconds
            json = $null
            raw = $startError
            stderr = $startError
        }
    }

    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    $completed = $process.WaitForExit($ScriptTimeoutSeconds * 1000)
    $timedOut = -not $completed
    if ($timedOut) {
        try {
            $process.Kill()
        }
        catch {
        }
        $process.WaitForExit()
    }
    $watch.Stop()

    $exitCode = if ($timedOut) { -1 } else { $process.ExitCode }
    try { $stdoutTask.Wait(5000) | Out-Null } catch { }
    try { $stderrTask.Wait(5000) | Out-Null } catch { }
    $text = if ($stdoutTask.IsCompleted) { ([string]$stdoutTask.Result).Trim() } else { "" }
    $stderr = if ($stderrTask.IsCompleted) { ([string]$stderrTask.Result).Trim() } else { "" }
    $rawText = @($text, $stderr) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
    $raw = ($rawText -join "`n").Trim()
    $parsed = $null

    if (-not [string]::IsNullOrWhiteSpace($text)) {
        try {
            $parsed = $text | ConvertFrom-Json
        }
        catch {
            if (-not $AllowFailure) {
                throw "Script did not return parseable JSON: $FilePath`n$raw"
            }
        }
    }

    if ($timedOut -and -not $AllowFailure) {
        throw "Script timed out after ${ScriptTimeoutSeconds}s: $FilePath"
    }

    if ($exitCode -ne 0 -and -not $AllowFailure) {
        throw "Script failed with exit code ${exitCode}: $FilePath`n$raw"
    }

    [pscustomobject]@{
        exit_code = $exitCode
        timed_out = [bool]$timedOut
        elapsed_ms = [int]$watch.ElapsedMilliseconds
        json = $parsed
        raw = $raw
        stderr = $stderr
    }
}

function New-CheckList {
    New-Object System.Collections.Generic.List[object]
}

function Add-Check {
    param(
        [Parameter(Mandatory = $true)]
        [AllowEmptyCollection()]
        [System.Collections.Generic.List[object]]$Checks,
        [Parameter(Mandatory = $true)][string]$Name,
        [ValidateSet("pass", "fail")]
        [Parameter(Mandatory = $true)][string]$Status,
        [Parameter(Mandatory = $true)][string]$Message
    )

    $Checks.Add([pscustomobject]@{
        name = $Name
        status = $Status
        message = $Message
    }) | Out-Null
}

function Add-CheckFromCondition {
    param(
        [Parameter(Mandatory = $true)]
        [AllowEmptyCollection()]
        [System.Collections.Generic.List[object]]$Checks,
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][bool]$Condition,
        [Parameter(Mandatory = $true)][string]$PassMessage,
        [Parameter(Mandatory = $true)][string]$FailMessage
    )

    if ($Condition) {
        Add-Check -Checks $Checks -Name $Name -Status "pass" -Message $PassMessage
    }
    else {
        Add-Check -Checks $Checks -Name $Name -Status "fail" -Message $FailMessage
    }
}

function Get-ArchiveEntryNames {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        return @()
    }

    $resolved = (Resolve-Path -LiteralPath $Path).Path
    $item = Get-Item -LiteralPath $resolved
    if ($item.PSIsContainer) {
        $prefixLength = $item.FullName.TrimEnd("\").Length + 1
        return @(Get-ChildItem -LiteralPath $item.FullName -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object {
            $_.FullName.Substring($prefixLength) -replace "/", "\"
        })
    }

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [System.IO.Compression.ZipFile]::OpenRead($resolved)
    try {
        return @($archive.Entries | Where-Object { -not [string]::IsNullOrWhiteSpace($_.Name) } | ForEach-Object {
            $_.FullName -replace "/", "\"
        })
    }
    finally {
        $archive.Dispose()
    }
}

function Read-ArchiveText {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$RelativePath
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        return $null
    }

    $resolved = (Resolve-Path -LiteralPath $Path).Path
    $item = Get-Item -LiteralPath $resolved
    if ($item.PSIsContainer) {
        $filePath = Join-Path $item.FullName $RelativePath
        if (-not (Test-Path -LiteralPath $filePath)) {
            return $null
        }
        return Get-Content -LiteralPath $filePath -Raw
    }

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [System.IO.Compression.ZipFile]::OpenRead($resolved)
    try {
        $target = $RelativePath -replace "/", "\"
        $entry = $archive.Entries | Where-Object { ($_.FullName -replace "/", "\") -eq $target } | Select-Object -First 1
        if (-not $entry) {
            return $null
        }
        $reader = [System.IO.StreamReader]::new($entry.Open())
        try {
            return $reader.ReadToEnd()
        }
        finally {
            $reader.Dispose()
        }
    }
    finally {
        $archive.Dispose()
    }
}

function Test-EntryLike {
    param(
        [Parameter(Mandatory = $true)][string[]]$Entries,
        [Parameter(Mandatory = $true)][string]$Pattern
    )

    @($Entries | Where-Object { $_ -like $Pattern }).Count -gt 0
}

function Get-QuickPacketVerification {
    param([Parameter(Mandatory = $true)][string]$Path)

    $checks = New-CheckList
    $entries = @(Get-ArchiveEntryNames -Path $Path)
    Add-CheckFromCondition -Checks $checks -Name "quick packet entries" -Condition ($entries.Count -gt 0) -PassMessage "packet entries are readable" -FailMessage "packet entries are not readable"

    foreach ($required in @(
        "README_FINAL_OPERATOR_GATES.md",
        "packet-build-metadata.json",
        "support-mailbox-record-template.json",
        "SUPPORT_EMAIL",
        "SHA256SUMS.txt"
    )) {
        Add-CheckFromCondition -Checks $checks -Name "quick packet entry: $required" -Condition ($entries -contains $required) -PassMessage "$required exists" -FailMessage "$required is missing"
    }

    $kitCount = @($entries | Where-Object { $_ -like "kits\musu-multidevice-*.zip" }).Count
    Add-CheckFromCondition -Checks $checks -Name "quick packet kit count" -Condition ($kitCount -eq 1) -PassMessage "packet contains one multi-device kit" -FailMessage "packet does not contain exactly one multi-device kit"

    $pfxCount = @($entries | Where-Object { $_ -like "*.pfx" }).Count
    Add-CheckFromCondition -Checks $checks -Name "quick packet private key exclusion" -Condition ($pfxCount -eq 0) -PassMessage "packet excludes private .pfx files" -FailMessage "packet includes private .pfx files"

    $metadata = $null
    $metadataText = Read-ArchiveText -Path $Path -RelativePath "packet-build-metadata.json"
    if ([string]::IsNullOrWhiteSpace($metadataText)) {
        Add-Check -Checks $checks -Name "quick packet metadata parse" -Status "fail" -Message "packet metadata is missing"
    }
    else {
        try {
            $metadata = $metadataText | ConvertFrom-Json
            Add-CheckFromCondition -Checks $checks -Name "quick packet metadata schema" -Condition ([string]$metadata.schema -eq "musu.final_operator_gate_packet.v1") -PassMessage "packet metadata schema is valid" -FailMessage "packet metadata schema is invalid"
            Add-CheckFromCondition -Checks $checks -Name "quick packet metadata git" -Condition ([string]$metadata.git.commit -match "^[0-9a-fA-F]{40}$" -and -not [bool]$metadata.git.dirty) -PassMessage "packet metadata has clean git state" -FailMessage "packet metadata git state is missing or dirty"
            Add-CheckFromCondition -Checks $checks -Name "quick packet metadata support email" -Condition ([string]$metadata.support_email -eq $supportEmail) -PassMessage "packet metadata uses $supportEmail" -FailMessage "packet metadata support email does not match $supportEmail"
        }
        catch {
            Add-Check -Checks $checks -Name "quick packet metadata parse" -Status "fail" -Message "packet metadata JSON did not parse: $($_.Exception.Message)"
        }
    }

    $failCount = @($checks | Where-Object { $_.status -eq "fail" }).Count
    [pscustomobject]@{
        ok = ($failCount -eq 0)
        mode = "quick"
        fail_count = $failCount
        kit_count = $kitCount
        checks = $checks.ToArray()
    }
}

function Get-QuickActionPackVerification {
    param([Parameter(Mandatory = $true)][string]$Path)

    $checks = New-CheckList
    $entries = @(Get-ArchiveEntryNames -Path $Path)
    Add-CheckFromCondition -Checks $checks -Name "quick action-pack entries" -Condition ($entries.Count -gt 0) -PassMessage "action-pack entries are readable" -FailMessage "action-pack entries are not readable"

    foreach ($required in @(
        "OPERATOR_ACTION_PACK_README_CURRENT.md",
        "action-pack-metadata.json",
        "SHA256SUMS.txt",
        "support-mailbox\SUPPORT_MAILBOX_VERIFICATION_EMAIL_CURRENT.txt",
        "support-mailbox\support-mailbox-record-template-current.json"
    )) {
        Add-CheckFromCondition -Checks $checks -Name "quick action-pack entry: $required" -Condition ($entries -contains $required) -PassMessage "$required exists" -FailMessage "$required is missing"
    }

    Add-CheckFromCondition -Checks $checks -Name "quick action-pack second-PC transfer" -Condition (Test-EntryLike -Entries $entries -Pattern "second-pc\MUSU-second-PC-transfer-*.zip") -PassMessage "second-PC transfer zip exists" -FailMessage "second-PC transfer zip is missing"
    Add-CheckFromCondition -Checks $checks -Name "quick action-pack Partner Center zip" -Condition (Test-EntryLike -Entries $entries -Pattern "partner-center\MUSU-*-store-submission-*.zip") -PassMessage "Partner Center zip exists" -FailMessage "Partner Center zip is missing"

    $pfxCount = @($entries | Where-Object { $_ -like "*.pfx" }).Count
    Add-CheckFromCondition -Checks $checks -Name "quick action-pack private key exclusion" -Condition ($pfxCount -eq 0) -PassMessage "action pack excludes private .pfx files" -FailMessage "action pack includes private .pfx files"

    $metadataText = Read-ArchiveText -Path $Path -RelativePath "action-pack-metadata.json"
    if ([string]::IsNullOrWhiteSpace($metadataText)) {
        Add-Check -Checks $checks -Name "quick action-pack metadata parse" -Status "fail" -Message "action-pack metadata is missing"
    }
    else {
        try {
            $metadata = $metadataText | ConvertFrom-Json
            Add-CheckFromCondition -Checks $checks -Name "quick action-pack metadata schema" -Condition ([string]$metadata.schema -eq "musu.operator_action_pack.v1") -PassMessage "action-pack metadata schema is valid" -FailMessage "action-pack metadata schema is invalid"
            Add-CheckFromCondition -Checks $checks -Name "quick action-pack metadata support email" -Condition ([string]$metadata.support_email -eq $supportEmail) -PassMessage "action-pack metadata uses $supportEmail" -FailMessage "action-pack metadata support email does not match $supportEmail"
            Add-CheckFromCondition -Checks $checks -Name "quick action-pack metadata support id" -Condition ([string]$metadata.support_verification_id -like "musu-store-support-*") -PassMessage "action-pack metadata includes support verification id" -FailMessage "action-pack metadata support verification id is missing"
            Add-CheckFromCondition -Checks $checks -Name "quick action-pack metadata git" -Condition ([string]$metadata.git.commit -match "^[0-9a-fA-F]{40}$" -and -not [bool]$metadata.git.dirty) -PassMessage "action-pack metadata has clean git state" -FailMessage "action-pack metadata git state is missing or dirty"
            Add-CheckFromCondition -Checks $checks -Name "quick action-pack metadata final packet" -Condition ([bool]$metadata.final_packet.verified) -PassMessage "action-pack metadata references verified final packet" -FailMessage "action-pack metadata final packet is not verified"
        }
        catch {
            Add-Check -Checks $checks -Name "quick action-pack metadata parse" -Status "fail" -Message "action-pack metadata JSON did not parse: $($_.Exception.Message)"
        }
    }

    $failCount = @($checks | Where-Object { $_.status -eq "fail" }).Count
    [pscustomobject]@{
        ok = ($failCount -eq 0)
        mode = "quick"
        fail_count = $failCount
        checks = $checks.ToArray()
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
$goNoGoArgs += @("-ScriptTimeoutSeconds", ([string]$ScriptTimeoutSeconds))
$goNoGo = (Invoke-JsonScript -FilePath (Join-Path $scriptDir "write-release-go-no-go.ps1") -Arguments $goNoGoArgs).json

$packetExists = Test-Path -LiteralPath $PacketPath
$resolvedPacketPath = if ($packetExists) { (Resolve-Path -LiteralPath $PacketPath).Path } else { $PacketPath }
$packetVerification = $null
$packetVerified = $null
if ($packetExists -and $PacketVerificationMode -ne "skip") {
    if ($PacketVerificationMode -eq "deep") {
        $packetVerificationResult = Invoke-JsonScript `
            -FilePath (Join-Path $scriptDir "verify-final-operator-gate-packet.ps1") `
            -Arguments @("-PacketPath", $resolvedPacketPath, "-Json") `
            -AllowFailure
        $packetVerification = $packetVerificationResult.json
        $packetVerified = ($packetVerificationResult.json -and [bool]$packetVerificationResult.json.ok)
    }
    else {
        $packetVerification = Get-QuickPacketVerification -Path $resolvedPacketPath
        $packetVerified = [bool]$packetVerification.ok
    }
}

$actionPackExists = Test-Path -LiteralPath $ActionPackPath
$resolvedActionPackPath = if ($actionPackExists) { (Resolve-Path -LiteralPath $ActionPackPath).Path } else { $ActionPackPath }
$actionPackVerification = $null
$actionPackVerified = $null
if ($actionPackExists -and $ActionPackVerificationMode -ne "skip") {
    if ($ActionPackVerificationMode -eq "deep") {
        $actionPackVerificationResult = Invoke-JsonScript `
            -FilePath (Join-Path $scriptDir "verify-operator-action-pack.ps1") `
            -Arguments @("-PackPath", $resolvedActionPackPath, "-Json") `
            -AllowFailure
        $actionPackVerification = $actionPackVerificationResult.json
        $actionPackVerified = ($actionPackVerificationResult.json -and [bool]$actionPackVerificationResult.json.ok)
    }
    else {
        $actionPackVerification = Get-QuickActionPackVerification -Path $resolvedActionPackPath
        $actionPackVerified = [bool]$actionPackVerification.ok
    }
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
$msixInstallRoots = @(
    [pscustomobject]@{
        path = (Join-Path $repoRoot ("docs\evidence\msix-install\{0}" -f $version))
        filter = "*.evidence.json"
    },
    [pscustomobject]@{
        path = (Join-Path $repoRoot ".local-build\msix-install")
        filter = "*.evidence.json"
    }
)
$msixDesktopEntrypointRoots = @(
    [pscustomobject]@{
        path = (Join-Path $repoRoot ("docs\evidence\msix-desktop-entrypoint\{0}" -f $version))
        filter = "*.json"
    },
    [pscustomobject]@{
        path = (Join-Path $repoRoot ".local-build\msix-desktop-entrypoint")
        filter = "*.json"
    }
)
$runtimeIdleCpuRoots = @(
    [pscustomobject]@{
        path = (Join-Path $repoRoot ("docs\evidence\runtime-idle-cpu\{0}" -f $version))
        filter = "*.json"
    },
    [pscustomobject]@{
        path = (Join-Path $repoRoot ".local-build\runtime-idle-cpu")
        filter = "*.json"
    }
)
$runtimeCpuScenarioMatrixRoots = @(
    [pscustomobject]@{
        path = (Join-Path $repoRoot ("docs\evidence\runtime-cpu-scenarios\{0}" -f $version))
        filter = "*.runtime-cpu-scenario-matrix.json"
    },
    [pscustomobject]@{
        path = (Join-Path $repoRoot ".local-build\runtime-cpu-scenarios")
        filter = "*.runtime-cpu-scenario-matrix.json"
    }
)
$processOwnershipRoots = @(
    [pscustomobject]@{
        path = (Join-Path $repoRoot ("docs\evidence\process-ownership\{0}" -f $version))
        filter = "*.json"
    },
    [pscustomobject]@{
        path = (Join-Path $repoRoot ".local-build\process-ownership")
        filter = "*.json"
    }
)
$startupSingleInstanceRoots = @(
    [pscustomobject]@{
        path = (Join-Path $repoRoot ("docs\evidence\startup-single-instance\{0}" -f $version))
        filter = "*.json"
    },
    [pscustomobject]@{
        path = (Join-Path $repoRoot ".local-build\startup-single-instance")
        filter = "*.json"
    }
)
$desktopSingleInstanceRoots = @(
    [pscustomobject]@{
        path = (Join-Path $repoRoot ("docs\evidence\desktop-single-instance\{0}" -f $version))
        filter = "*.json"
    },
    [pscustomobject]@{
        path = (Join-Path $repoRoot ".local-build\desktop-single-instance")
        filter = "*.json"
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
$p2pControlPlaneRoots = @(
    [pscustomobject]@{
        path = (Join-Path $repoRoot ("docs\evidence\p2p-control-plane\{0}" -f $version))
        filter = "*.evidence.json"
    },
    [pscustomobject]@{
        path = (Join-Path $repoRoot ".local-build\p2p-control-plane")
        filter = "*.evidence.json"
    }
)

$commands = [pscustomobject]@{
    show_status = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\show-final-release-handoff-status.ps1 -ScriptTimeoutSeconds $ScriptTimeoutSeconds"
    show_status_deep = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\show-final-release-handoff-status.ps1 -PacketVerificationMode deep -ActionPackVerificationMode deep -ScriptTimeoutSeconds $ScriptTimeoutSeconds"
    prepare_packet = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\prepare-final-operator-gate-packet.ps1 -IncludeDesktopShell"
    verify_packet = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\verify-final-operator-gate-packet.ps1 -PacketPath .local-build\final-operator-gates\musu-final-operator-gates-$safeVersion-latest.zip -Json"
    prepare_action_pack = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\prepare-operator-action-pack.ps1 -Json"
    verify_action_pack = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\verify-operator-action-pack.ps1 -PackPath .local-build\operator-action-pack\MUSU-$safeVersion-operator-action-pack-latest.zip -Json"
    audit_msix_desktop_entrypoint = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\audit-msix-desktop-entrypoint.ps1 -StartupContract store-reviewed-immediate-registration -ExpectedApplicationExecutable musu-desktop.exe -RequireInstalledPackage -Json"
    audit_frontend_polling_contract = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\audit-frontend-polling-contract.ps1 -FailOnProblem -Json"
    audit_rust_background_loop_contract = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\audit-rust-background-loop-contract.ps1 -FailOnProblem -Json"
    audit_local_api_auth_contract = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\audit-local-api-auth-contract.ps1 -FailOnProblem -Json"
    audit_operator_api_security_contract = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\audit-operator-api-security-contract.ps1 -FailOnProblem -Json"
    audit_degraded_mode_contract = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\audit-degraded-mode-contract.ps1 -FailOnProblem -Json"
    audit_crash_recovery_contract = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\audit-musu-crash-recovery-contract.ps1 -FailOnProblem -Json"
    audit_p2p_store_forward_relay_contract = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\audit-p2p-store-forward-relay-contract.ps1 -FailOnProblem -Json"
    audit_secret_storage_contract = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\audit-secret-storage-contract.ps1 -FailOnProblem -Json"
    measure_runtime_idle_cpu = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\measure-musu-idle-cpu.ps1 -SampleSeconds 60 -Scenario desktop-open -RequireOwnedWebView2 -MaxOneCorePercent 5 -MaxOwnedProcessCount 16 -MaxOwnedWebView2ProcessCount 8 -MaxTotalWorkingSetMb 1024 -IncludeNode -IncludeWebView2 -FailOnHot -Json"
    measure_runtime_cpu_scenario_matrix = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\measure-musu-runtime-cpu-scenarios.ps1 -Scenario startup-open,runtime-started,dashboard-open,desktop-open,post-route -SampleSeconds 60 -OpenDesktopApp -RunRouteProbe -Json"
    measure_runtime_cpu_scenario_matrix_target_attempt = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\measure-musu-runtime-cpu-scenarios.ps1 -Scenario startup-open,runtime-started,dashboard-open,desktop-open,post-route -SampleSeconds 60 -OpenDesktopApp -RunRouteProbe -RouteTarget <PEER_NAME> -AllowFailedRouteProbe -Json"
    audit_process_ownership = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\audit-musu-process-ownership.ps1 -FailOnProblem -Json"
    audit_startup_single_instance = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\audit-musu-startup-single-instance.ps1 -RepeatCount 3 -FailOnProblem -Json"
    repair_packaged_local_runtime = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\repair-packaged-local-runtime-state.ps1 -StopRepoOrphanHelpers -FailOnProblem -Json"
    audit_desktop_single_instance = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\audit-musu-desktop-single-instance.ps1 -RequireInstalledPackage -RepeatCount 3 -FailOnProblem -Json"
    show_musu_pro_p2p_env_status = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\show-musu-pro-p2p-env-status.ps1 -Json"
    record_p2p_control_plane = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\record-p2p-control-plane-evidence.ps1 -Json"
    final_completion = @"
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\complete-final-operator-gates.ps1 `
  -MsixInstallEvidencePath .local-build\msix-install\<INSTALL_EVIDENCE_JSON> `
  -MultiDeviceEvidencePath .local-build\multi-device\<EVIDENCE_JSON> `
  -SupportFromAddress "<sender@example.com>" `
  -SupportReceivedBy "<operator-name>" `
  -SupportVerificationId "<support-verification-id>" `
  -SupportNotes "Verified delivery in $supportEmail inbox" `
  -StoreProductName "MUSU" `
  -StoreProductNameReservedAt "<partner-center-name-reserved-at>" `
  -StoreSubmissionId "<partner-center-submission-id>" `
  -StoreCertificationStatus "approved" `
  -StoreRestrictedCapabilityStatus "approved" `
  -StoreRecordedBy "<operator-name>" `
  -StoreNotes "Microsoft Store certification and restricted capability review approved" `
  -FailOnNotReady `
  -Json
"@
    go_no_go = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\write-release-go-no-go.ps1 -ScriptTimeoutSeconds $ScriptTimeoutSeconds -Json"
}

$operatorSteps = New-Object System.Collections.Generic.List[object]
if (-not $packetExists) {
    Add-OperatorStep `
        -List $operatorSteps `
        -Gate "handoff-packet" `
        -Summary "Generate the final operator packet before handoff." `
        -Command $commands.prepare_packet
}
elseif ($PacketVerificationMode -ne "skip" -and -not $packetVerified) {
    Add-OperatorStep `
        -List $operatorSteps `
        -Gate "handoff-packet" `
        -Summary "Regenerate or fix the final operator packet; packet verification is not passing." `
        -Command $commands.verify_packet
}
if (-not $actionPackExists) {
    Add-OperatorStep `
        -List $operatorSteps `
        -Gate "operator-action-pack" `
        -Summary "Generate the operator action pack so second-PC, support-mailbox, and Partner Center handoff files are in one verified archive." `
        -Command $commands.prepare_action_pack
}
elseif ($ActionPackVerificationMode -ne "skip" -and -not $actionPackVerified) {
    Add-OperatorStep `
        -List $operatorSteps `
        -Gate "operator-action-pack" `
        -Summary "Regenerate or fix the operator action pack; action pack verification is not passing." `
        -Command $commands.verify_action_pack
}

if (-not [bool]$goNoGo.msix_install_verified) {
    Add-OperatorStep `
        -List $operatorSteps `
        -Gate "msix-install" `
        -Summary "Run the second-PC kit, return `.local-build\second-pc-return\*.zip`, import it, and record the MSIX install evidence." `
        -Command "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\import-second-pc-return.ps1 -ReturnZipPath .local-build\second-pc-return\<RETURN_ZIP> -RecordMsixInstall -Json"
}
if (-not [bool]$goNoGo.msix_desktop_entrypoint_verified) {
    Add-OperatorStep `
        -List $operatorSteps `
        -Gate "msix-desktop-entrypoint" `
        -Summary "Fix or rebuild the Store/MSIX package so Start-menu activation launches the Tauri desktop shell instead of only the runtime CLI." `
        -Command $commands.audit_msix_desktop_entrypoint
}
if (-not [bool]$goNoGo.multi_device_verified) {
    Add-OperatorStep `
        -List $operatorSteps `
        -Gate "multi-device" `
        -Summary "Run the second-PC kit, return `.local-build\multi-device\*.json`, then record it." `
        -Command "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\record-multidevice-evidence.ps1 -EvidencePath .local-build\multi-device\<EVIDENCE_JSON>"
}
if (-not [bool]$goNoGo.runtime_idle_cpu_verified) {
    Add-OperatorStep `
        -List $operatorSteps `
        -Gate "runtime-idle-cpu" `
        -Summary "Run a 60s idle CPU sample on the primary and second PC with MUSU installed/app-open/runtime-started, then bring both JSON files back." `
        -Command $commands.measure_runtime_idle_cpu
}
if (-not [bool]$goNoGo.runtime_cpu_scenario_matrix_verified) {
    Add-OperatorStep `
        -List $operatorSteps `
        -Gate "runtime-cpu-scenario-matrix" `
        -Summary "Run the 60s startup/runtime/dashboard/desktop/post-route CPU matrix on the primary and second PC, then bring both JSON files back." `
        -Command $commands.measure_runtime_cpu_scenario_matrix
}
if (-not [bool]$goNoGo.frontend_polling_contract_verified) {
    Add-OperatorStep `
        -List $operatorSteps `
        -Gate "frontend-polling" `
        -Summary "Fix dashboard/refetch/SSE polling so frontend loops use cancellable low-duty polling and bounded reconnect, then rerun the audit." `
        -Command $commands.audit_frontend_polling_contract
}
if (-not [bool]$goNoGo.rust_background_loop_contract_verified) {
    Add-OperatorStep `
        -List $operatorSteps `
        -Gate "rust-background-loops" `
        -Summary "Fix bridge/runtime background loops so default mDNS/clipboard/planner remain opt-in and active loops are sleep/backoff/timeout bounded, then rerun the audit." `
        -Command $commands.audit_rust_background_loop_contract
}
if (-not [bool]$goNoGo.local_api_auth_contract_verified) {
    Add-OperatorStep `
        -List $operatorSteps `
        -Gate "local-api-auth" `
        -Summary "Fix the local bridge auth contract so localhost requests require bearer auth by default and only an explicit trusted local bypass can disable it, then rerun the audit." `
        -Command $commands.audit_local_api_auth_contract
}
if (-not [bool]$goNoGo.operator_api_security_contract_verified) {
    Add-OperatorStep `
        -List $operatorSteps `
        -Gate "operator-api-security" `
        -Summary "Fix web-driven local control routes so they require authenticated operators, command allowlists, explicit process-kill enablement, and audit logging, then rerun the audit." `
        -Command $commands.audit_operator_api_security_contract
}
if (-not [bool]$goNoGo.degraded_mode_contract_verified) {
    Add-OperatorStep `
        -List $operatorSteps `
        -Gate "degraded-mode" `
        -Summary "Fix agents, device-status, nodes mesh, or COS synthesis surfaces so unavailable/stale/fallback state is shown as degraded/offline instead of fabricated healthy state, then rerun the audit." `
        -Command $commands.audit_degraded_mode_contract
}
if (-not [bool]$goNoGo.crash_recovery_contract_verified) {
    Add-OperatorStep `
        -List $operatorSteps `
        -Gate "crash-recovery" `
        -Summary "Fix `musu up`/`musu down` stale bridge registry cleanup and single-instance recovery wiring, then rerun the audit." `
        -Command $commands.audit_crash_recovery_contract
}
if (-not [bool]$goNoGo.secret_storage_contract_verified) {
    Add-OperatorStep `
        -List $operatorSteps `
        -Gate "secret-storage" `
        -Summary "Fix token storage, raw-token redaction, or production backup docs so bridge/account/P2P secrets stay out of ordinary output and support bundles, then rerun the audit." `
        -Command $commands.audit_secret_storage_contract
}
if (-not [bool]$goNoGo.p2p_store_forward_relay_contract_verified) {
    Add-OperatorStep `
        -List $operatorSteps `
        -Gate "p2p-store-forward-relay" `
        -Summary "Fix the P2P store-forward relay queue contract so fallback payload transit is owner-scoped, lease-bound, non-default, non-release-grade, and separated from release tunnel transport." `
        -Command $commands.audit_p2p_store_forward_relay_contract
}
if ((-not [bool]$goNoGo.process_ownership_verified) -or (-not [bool]$goNoGo.startup_single_instance_verified)) {
    Add-OperatorStep `
        -List $operatorSteps `
        -Gate "packaged-local-runtime-state" `
        -Summary "Reset the live local runtime boundary to the installed packaged MUSU app, clear explicit repo/workspace orphan helpers, restart through the WindowsApps alias, and rerun process ownership evidence." `
        -Command $commands.repair_packaged_local_runtime
}
if (-not [bool]$goNoGo.process_ownership_verified) {
    Add-OperatorStep `
        -List $operatorSteps `
        -Gate "process-ownership" `
        -Summary "Audit the live MUSU process tree so Node/WebView2 helpers are counted only when owned by MUSU, and bridge registry PID/health are verified." `
        -Command $commands.audit_process_ownership
}
if (-not [bool]$goNoGo.startup_single_instance_verified) {
    Add-OperatorStep `
        -List $operatorSteps `
        -Gate "startup-single-instance" `
        -Summary "Run repeated startup audit so `musu up`/desktop start reuses one bridge PID instead of spawning duplicate runtimes." `
        -Command $commands.audit_startup_single_instance
}
if (-not [bool]$goNoGo.desktop_single_instance_verified) {
    Add-OperatorStep `
        -List $operatorSteps `
        -Gate "desktop-single-instance" `
        -Summary "Run repeated installed desktop activation from AppsFolder/Start-menu so the packaged app proves it does not spawn duplicate Tauri shells." `
        -Command $commands.audit_desktop_single_instance
}
if (-not [bool]$goNoGo.support_mailbox_verified) {
    Add-OperatorStep `
        -List $operatorSteps `
        -Gate "support-mailbox" `
        -Summary "Send a real email to $supportEmail with a MUSU verification token, confirm inbox delivery, then record the operator evidence." `
        -Command "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\record-support-mailbox-verification.ps1 -FromAddress `"<sender@example.com>`" -ReceivedBy `"<operator-name>`" -VerificationId `"musu-support-mailbox-<unique-token>`" -Notes `"Verified delivery in $supportEmail inbox`" -Json"
}
if (-not [bool]$goNoGo.store_release_verified) {
    Add-OperatorStep `
        -List $operatorSteps `
        -Gate "store-release" `
        -Summary "Verify the Store submission bundle, reserve the Partner Center product name, submit the package, wait for Microsoft certification/restricted capability approval, then record Store release evidence." `
        -Command 'powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\verify-store-submission-bundle.ps1; powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\record-store-release-verification.ps1 -ProductName "MUSU" -ProductNameReservedAt "<partner-center-name-reserved-at>" -SubmissionId "<partner-center-submission-id>" -CertificationStatus "approved" -RestrictedCapabilityStatus "approved" -RecordedBy "<operator-name>" -Notes "Microsoft Store certification and restricted capability review approved" -Json'
}
if (-not [bool]$goNoGo.p2p_control_plane_verified) {
    Add-OperatorStep `
        -List $operatorSteps `
        -Gate "p2p-control-plane" `
        -Summary "Provision production KV/Upstash storage, real relay payload transport, and per-record delivery proof for https://musu.pro, then record owner-scoped release-grade P2P control-plane evidence." `
        -Command $commands.show_musu_pro_p2p_env_status
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
        verification_mode = $PacketVerificationMode
        verification = $packetVerification
    }
    action_pack = [pscustomobject]@{
        path = $resolvedActionPackPath
        exists = [bool]$actionPackExists
        verified = $actionPackVerified
        verification_mode = $ActionPackVerificationMode
        verification = $actionPackVerification
    }
    gates = [pscustomobject]@{
        local_artifacts_ready = [bool]$goNoGo.local_artifacts_ready
        single_machine_verified = [bool]$goNoGo.single_machine_verified
        msix_install_verified = [bool]$goNoGo.msix_install_verified
        msix_desktop_entrypoint_verified = [bool]$goNoGo.msix_desktop_entrypoint_verified
        runtime_idle_cpu_verified = [bool]$goNoGo.runtime_idle_cpu_verified
        runtime_idle_cpu_min_machine_count = $goNoGo.runtime_idle_cpu_min_machine_count
        runtime_idle_cpu_valid_machine_count = $goNoGo.runtime_idle_cpu_valid_machine_count
        runtime_idle_cpu_valid_machines = @($goNoGo.runtime_idle_cpu_valid_machines)
        runtime_idle_cpu_candidate_count = $goNoGo.runtime_idle_cpu_candidate_count
        runtime_cpu_scenario_matrix_verified = [bool]$goNoGo.runtime_cpu_scenario_matrix_verified
        runtime_cpu_scenario_matrix_min_machine_count = $goNoGo.runtime_cpu_scenario_matrix_min_machine_count
        runtime_cpu_scenario_matrix_valid_machine_count = $goNoGo.runtime_cpu_scenario_matrix_valid_machine_count
        runtime_cpu_scenario_matrix_valid_machines = @($goNoGo.runtime_cpu_scenario_matrix_valid_machines)
        runtime_cpu_scenario_matrix_candidate_count = $goNoGo.runtime_cpu_scenario_matrix_candidate_count
        runtime_cpu_scenario_matrix_required_scenarios = @($goNoGo.runtime_cpu_scenario_matrix_required_scenarios)
        runtime_cpu_second_pc_route_attempt_verified = [bool]$goNoGo.runtime_cpu_second_pc_route_attempt_verified
        runtime_cpu_second_pc_route_attempt_min_machine_count = $goNoGo.runtime_cpu_second_pc_route_attempt_min_machine_count
        runtime_cpu_second_pc_route_attempt_valid_machine_count = $goNoGo.runtime_cpu_second_pc_route_attempt_valid_machine_count
        runtime_cpu_second_pc_route_attempt_valid_machines = @($goNoGo.runtime_cpu_second_pc_route_attempt_valid_machines)
        runtime_cpu_second_pc_route_attempt_candidate_count = $goNoGo.runtime_cpu_second_pc_route_attempt_candidate_count
        frontend_polling_contract_verified = [bool]$goNoGo.frontend_polling_contract_verified
        rust_background_loop_contract_verified = [bool]$goNoGo.rust_background_loop_contract_verified
        local_api_auth_contract_verified = [bool]$goNoGo.local_api_auth_contract_verified
        operator_api_security_contract_verified = [bool]$goNoGo.operator_api_security_contract_verified
        degraded_mode_contract_verified = [bool]$goNoGo.degraded_mode_contract_verified
        crash_recovery_contract_verified = [bool]$goNoGo.crash_recovery_contract_verified
        p2p_store_forward_relay_contract_verified = [bool]$goNoGo.p2p_store_forward_relay_contract_verified
        secret_storage_contract_verified = [bool]$goNoGo.secret_storage_contract_verified
        process_ownership_verified = [bool]$goNoGo.process_ownership_verified
        startup_single_instance_verified = [bool]$goNoGo.startup_single_instance_verified
        desktop_single_instance_verified = [bool]$goNoGo.desktop_single_instance_verified
        multi_device_verified = [bool]$goNoGo.multi_device_verified
        public_metadata_ok = $goNoGo.public_metadata_ok
        support_mailbox_verified = [bool]$goNoGo.support_mailbox_verified
        store_release_verified = [bool]$goNoGo.store_release_verified
        p2p_control_plane_verified = [bool]$goNoGo.p2p_control_plane_verified
        p2p_owner_scope_verified = [bool]$goNoGo.p2p_owner_scope_verified
        p2p_relay_lease_store_release_grade = [bool]$goNoGo.p2p_relay_lease_store_release_grade
        p2p_relay_transport_wired = [bool]$goNoGo.p2p_relay_transport_wired
        p2p_relay_route_evidence_ok = [bool]$goNoGo.p2p_relay_route_evidence_ok
        p2p_relay_route_evidence_count = [int]$goNoGo.p2p_relay_route_evidence_count
        p2p_relay_route_metadata_required_count = [int]$goNoGo.p2p_relay_route_metadata_required_count
        p2p_relay_route_metadata_valid_count = [int]$goNoGo.p2p_relay_route_metadata_valid_count
        p2p_relay_route_metadata_invalid_count = [int]$goNoGo.p2p_relay_route_metadata_invalid_count
        p2p_relay_route_transport_proof_valid_count = [int]$goNoGo.p2p_relay_route_transport_proof_valid_count
        p2p_relay_payload_transport_proven = [bool]$goNoGo.p2p_relay_payload_transport_proven
        p2p_relay_payload_delivery_proof_valid_count = [int]$goNoGo.p2p_relay_payload_delivery_proof_valid_count
        manifest_git_dirty = if ($goNoGo.manifest_git) { [bool]$goNoGo.manifest_git.dirty } else { $null }
    }
    blockers = $goNoGo.blockers
    warnings = $goNoGo.warnings
    evidence_roots = [pscustomobject]@{
        msix_install = Get-EvidenceRootStatus -Roots $msixInstallRoots
        msix_desktop_entrypoint = Get-EvidenceRootStatus -Roots $msixDesktopEntrypointRoots
        runtime_idle_cpu = Get-EvidenceRootStatus -Roots $runtimeIdleCpuRoots
        runtime_cpu_scenario_matrix = Get-EvidenceRootStatus -Roots $runtimeCpuScenarioMatrixRoots
        process_ownership = Get-EvidenceRootStatus -Roots $processOwnershipRoots
        startup_single_instance = Get-EvidenceRootStatus -Roots $startupSingleInstanceRoots
        desktop_single_instance = Get-EvidenceRootStatus -Roots $desktopSingleInstanceRoots
        multi_device = Get-EvidenceRootStatus -Roots $multiDeviceRoots
        support_mailbox = Get-EvidenceRootStatus -Roots $supportRoots
        store_release = Get-EvidenceRootStatus -Roots $storeRoots
        p2p_control_plane = Get-EvidenceRootStatus -Roots $p2pControlPlaneRoots
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
    "packet_verification_mode: $($result.packet.verification_mode)"
    "packet_path: $($result.packet.path)"
    "action_pack_exists: $($result.action_pack.exists)"
    "action_pack_verified: $($result.action_pack.verified)"
    "action_pack_verification_mode: $($result.action_pack.verification_mode)"
    "action_pack_path: $($result.action_pack.path)"
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
