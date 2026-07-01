[CmdletBinding()]
param(
    [string]$PublicMetadataBaseUrl = "https://musu.pro",
    [int]$MinRuntimeIdleCpuSampleSeconds = 60,
    [double]$MaxRuntimeIdleCpuOneCorePercent = 5.0,
    [int]$MinRuntimeIdleCpuMachineCount = 2,
    [int]$MinRuntimeCpuScenarioMatrixMachineCount = 2,
    [int]$MinRuntimeCpuSecondPcRouteAttemptMachineCount = 1,
    [int]$MinProcessOwnershipMachineCount = 1,
    [int]$MinStartupSingleInstanceMachineCount = 1,
    [int]$MinDesktopSingleInstanceMachineCount = 1,
    [string]$RequiredRuntimeIdleCpuScenario = "desktop-open",
    [string[]]$RequiredRuntimeCpuScenarioMatrixScenarios = @("startup-open", "runtime-started", "dashboard-open", "desktop-open", "post-route"),
    [int]$ScriptTimeoutSeconds = 120,
    [switch]$SkipPublicMetadata,
    [switch]$FailOnNotReady,
    [string]$VerifyRuntimeIdleCpuEvidencePath,
    [string]$OutputPath,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
. (Join-Path $scriptDir "release-config.ps1")
. (Join-Path $scriptDir "evidence-integrity.ps1")
$version = (Get-Content -LiteralPath (Join-Path $repoRoot "VERSION") -Raw).Trim()
$supportEmail = Get-MusuReleaseSupportEmail -RepoRoot $repoRoot
$currentGitCommit = (& git -C $repoRoot rev-parse HEAD 2>$null | Out-String).Trim()

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $OutputPath = ".local-build\go-no-go\latest.json"
}

function Resolve-GoNoGoOutputPath {
    param([Parameter(Mandatory = $true)][string]$Path)

    if ([System.IO.Path]::IsPathRooted($Path)) {
        return [System.IO.Path]::GetFullPath($Path)
    }
    return [System.IO.Path]::GetFullPath((Join-Path $repoRoot $Path))
}

$goNoGoOutputPath = Resolve-GoNoGoOutputPath -Path $OutputPath

if ($ScriptTimeoutSeconds -lt 1) {
    throw "ScriptTimeoutSeconds must be at least 1."
}

$goNoGoWatch = [Diagnostics.Stopwatch]::StartNew()
$script:goNoGoInvocations = New-Object System.Collections.Generic.List[object]

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
        [switch]$AllowFailure,
        [bool]$ExpectJson = $true
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
        $script:goNoGoInvocations.Add([pscustomobject]@{
                script = [System.IO.Path]::GetFileName($FilePath)
                path = $FilePath
                arguments = @($Arguments)
                elapsed_ms = [int]$watch.ElapsedMilliseconds
                timed_out = $false
                exit_code = -1
                json_returned = $false
                expect_json = [bool]$ExpectJson
                allow_failure = [bool]$AllowFailure
                failure_kind = "start_failed"
            }) | Out-Null
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

    $script:goNoGoInvocations.Add([pscustomobject]@{
            script = [System.IO.Path]::GetFileName($FilePath)
            path = $FilePath
            arguments = @($Arguments)
            elapsed_ms = [int]$watch.ElapsedMilliseconds
            timed_out = [bool]$timedOut
            exit_code = [int]$exitCode
            json_returned = ($null -ne $parsed)
            expect_json = [bool]$ExpectJson
            allow_failure = [bool]$AllowFailure
            failure_kind = if ($timedOut) { "timeout" } elseif ($exitCode -ne 0) { "nonzero_exit" } elseif ($ExpectJson -and $null -eq $parsed -and -not [string]::IsNullOrWhiteSpace($text)) { "json_parse_failed" } else { "" }
        }) | Out-Null

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

function Convert-PublicVersionToPackageVersion {
    param([Parameter(Mandatory = $true)][string]$PublicVersion)

    if ($PublicVersion -match '^(\d+)\.(\d+)\.(\d+)-rc\.(\d+)$') {
        return "$($Matches[1]).$($Matches[2]).$($Matches[3]).$($Matches[4])"
    }
    if ($PublicVersion -match '^\d+\.\d+\.\d+\.\d+$') {
        return $PublicVersion
    }
    throw "Cannot convert public version '$PublicVersion' to a 4-segment package version."
}

function Get-LatestJsonEvidence {
    param(
        [Parameter(Mandatory = $true)][string]$EvidenceName,
        [Parameter(Mandatory = $true)][string]$Version,
        [Parameter(Mandatory = $true)][string]$Schema,
        [string]$Filter = "*.json"
    )

    $roots = @(
        (Join-Path $repoRoot ("docs\evidence\{0}\{1}" -f $EvidenceName, $Version)),
        (Join-Path $repoRoot (".local-build\{0}" -f $EvidenceName))
    )
    $candidates = @()
    foreach ($root in $roots) {
        if (Test-Path -LiteralPath $root) {
            $candidates += @(Get-ChildItem -LiteralPath $root -Filter $Filter -File -ErrorAction SilentlyContinue)
        }
    }

    foreach ($candidate in @($candidates | Sort-Object LastWriteTime -Descending)) {
        try {
            $json = Get-Content -LiteralPath $candidate.FullName -Raw | ConvertFrom-Json
            if ($json -and $json.PSObject.Properties["schema"] -and [string]$json.schema -eq $Schema) {
                return [pscustomobject]@{
                    found = $true
                    path = $candidate.FullName
                    json = $json
                }
            }
        }
        catch {
        }
    }

    [pscustomobject]@{
        found = $false
        path = ""
        json = $null
    }
}

function Test-JsonCheckPassed {
    param(
        [AllowNull()]$Json,
        [Parameter(Mandatory = $true)][string]$Name
    )

    if (-not $Json -or -not $Json.PSObject.Properties["checks"] -or $null -eq $Json.checks) {
        return $false
    }

    foreach ($check in @($Json.checks)) {
        if ($check.PSObject.Properties["name"] -and
            [string]$check.name -eq $Name -and
            $check.PSObject.Properties["status"] -and
            [string]$check.status -eq "pass") {
            return $true
        }
    }
    return $false
}

function New-FullProductSpecLane {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][bool]$Complete,
        [Parameter(Mandatory = $true)][string]$Evidence,
        [Parameter(Mandatory = $true)][string]$Next,
        [string]$BlockerArea = "",
        [string]$BlockerMessage = "",
        [bool]$Required = $true
    )

    [pscustomobject]@{
        name = $Name
        required = [bool]$Required
        complete = [bool]$Complete
        status = if ($Complete) { "pass" } else { "fail" }
        evidence = $Evidence
        next = $Next
        blocker_area = $BlockerArea
        blocker_message = $BlockerMessage
    }
}

function New-NextAction {
    param(
        [Parameter(Mandatory = $true)][string]$Area,
        [Parameter(Mandatory = $true)][string]$Summary,
        [Parameter(Mandatory = $true)][string]$Command,
        [ValidateSet("command", "manual_then_command", "manual")]
        [string]$ActionType = "command",
        [string[]]$ManualSteps = @(),
        [string]$EvidencePath = "",
        [string]$VerificationCommand = "",
        [string]$AutomationBlockedReason = ""
    )

    $commandPlaceholders = Get-NextActionPlaceholders -Text $Command
    $verificationPlaceholders = Get-NextActionPlaceholders -Text $VerificationCommand
    $evidencePlaceholders = Get-NextActionPlaceholders -Text $EvidencePath
    $manualPlaceholders = Get-NextActionPlaceholders -Text (@($ManualSteps) -join " ")
    $placeholders = @(
        $commandPlaceholders
        $verificationPlaceholders
        $evidencePlaceholders
        $manualPlaceholders
    ) | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) } | Select-Object -Unique
    $commandIsExecutable = (-not [string]::IsNullOrWhiteSpace($Command) -and [string]$ActionType -ne "manual")
    $commandReady = ($commandIsExecutable -and @($commandPlaceholders).Count -eq 0)
    $verificationCommandReady = (-not [string]::IsNullOrWhiteSpace($VerificationCommand) -and @($verificationPlaceholders).Count -eq 0)
    $evidencePathReady = (-not [string]::IsNullOrWhiteSpace($EvidencePath) -and @($evidencePlaceholders).Count -eq 0)
    $manualStepsReady = (@($ManualSteps).Count -eq 0 -or @($manualPlaceholders).Count -eq 0)
    $automationReady = (
        [string]::IsNullOrWhiteSpace($AutomationBlockedReason) -and
        $commandReady -and
        $verificationCommandReady -and
        $evidencePathReady -and
        @($manualPlaceholders).Count -eq 0 -and
        @($ManualSteps).Count -eq 0 -and
        @($placeholders).Count -eq 0
    )

    [pscustomobject]@{
        area = $Area
        summary = $Summary
        action_type = $ActionType
        command = $Command
        command_is_executable = $commandIsExecutable
        command_ready = $commandReady
        verification_command_ready = $verificationCommandReady
        evidence_path_ready = $evidencePathReady
        manual_steps_ready = $manualStepsReady
        automation_ready = $automationReady
        command_placeholders = @($commandPlaceholders)
        verification_placeholders = @($verificationPlaceholders)
        evidence_placeholders = @($evidencePlaceholders)
        manual_placeholders = @($manualPlaceholders)
        placeholders = @($placeholders)
        manual_steps = @($ManualSteps)
        evidence_path = $EvidencePath
        verification_command = $VerificationCommand
        automation_blocked_reason = $AutomationBlockedReason
    }
}

function Get-NextActionPlaceholders {
    param([AllowNull()][string]$Text)

    if ([string]::IsNullOrWhiteSpace($Text)) {
        return @()
    }

    $matches = [regex]::Matches($Text, "<[^<>]+>|REPLACE_WITH_[A-Z0-9_]+")
    if ($matches.Count -eq 0) {
        return @()
    }
    return @($matches | ForEach-Object { $_.Value } | Select-Object -Unique)
}

function Get-ReleaseNextActions {
    param(
        [Parameter(Mandatory = $true)][object[]]$Blockers,
        [Parameter(Mandatory = $true)][string]$Version,
        [Parameter(Mandatory = $true)][string]$SupportEmail,
        [Parameter(Mandatory = $true)][string]$PublicMetadataBaseUrl
    )

    $actions = New-Object System.Collections.Generic.List[object]
    $areas = @($Blockers | ForEach-Object { [string]$_.area } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique)
    foreach ($area in $areas) {
        switch ($area) {
            "design-approval" {
                $actions.Add((New-NextAction -Area $area -Summary "Capture explicit product/design approval before claiming PR #34 or the full product spec is complete." -ActionType "manual" -ManualSteps @("Get an explicit approval comment on issue #35.", "Record the approval URL in PR #34 and update the PR body from Design: Pending to Design: Approved.", "Optionally record docs\evidence\design-approval\$Version\*.json with schema musu.design_approval.v1, ok=true, status=Design: Approved, and approval_url.") -Command "manual: record issue #35 approval URL and update PR #34 design status" -EvidencePath "docs\evidence\design-approval\$Version\*.json" -VerificationCommand "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\write-release-go-no-go.ps1 -Json" -AutomationBlockedReason "Design approval is an external human gate and cannot be inferred from code, docs, or direct fleet proof.")) | Out-Null
                break
            }
            "fleet-proof" {
                $actions.Add((New-NextAction -Area $area -Summary "Run the hosted fleet proof on a physical node and commit the returned JSON evidence." -ActionType "manual_then_command" -ManualSteps @("Install the current public package on the physical node.", "Run the hosted fleet proof with the expected node and direct peer names.", "Save the JSON under docs\evidence\fleet-proof\$Version.", "Rerun go/no-go after committing the evidence.") -Command "& ([scriptblock]::Create((irm https://musu.pro/fleet-proof.ps1))) -ExpectedNodeName <NODE_NAME> -ExpectedDirectPeerName <PEER_NAME> -RequireBrainToken -Json" -EvidencePath "docs\evidence\fleet-proof\$Version\*.fleet-proof.json" -VerificationCommand "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\write-release-go-no-go.ps1 -Json" -AutomationBlockedReason "A real installed physical PC must produce the proof JSON; repo-local scripts alone do not satisfy the installed fleet claim.")) | Out-Null
                break
            }
            "direct-route" {
                $actions.Add((New-NextAction -Area $area -Summary "Record packaged direct delegated-work route evidence; fleet health alone is not work-targetability." -ActionType "manual_then_command" -ManualSteps @("Install the rebuilt current package and verify the WindowsApps alias resolves to that package.", "Start the packaged bridge.", "Run a real task route from this physical PC to the expected direct peer with --wait and --route-evidence-path.", "Save the successful route evidence under docs\evidence\direct-route\$Version.", "Rerun go/no-go after committing the evidence and current MSIX install proof.") -Command "musu route --target <PEER_NAME> --adapter echo --wait --wait-timeout-sec 60 --route-evidence-path docs\evidence\direct-route\$Version\<STAMP>-<SOURCE>-to-<PEER>.packaged-direct-route-evidence.json `"Reply exactly: MUSU_PACKAGED_DIRECT_ROUTE_OK_<STAMP>`"" -EvidencePath "docs\evidence\direct-route\$Version\*.packaged-direct-route-evidence.json" -VerificationCommand "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\verify-direct-route-evidence.ps1 -EvidencePath <DIRECT_ROUTE_JSON> -ExpectedVersion $Version -Json" -AutomationBlockedReason "A real packaged CLI route must queue and complete a delegated task on a physical peer; route --explain or fleet health is insufficient.")) | Out-Null
                break
            }
            "relay-transport" {
                $actions.Add((New-NextAction -Area $area -Summary "Implement and prove real delegated-work relay transport; relay display alone is not a work route." -ActionType "manual_then_command" -ManualSteps @("Run the separate relay transport design gate: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\audit-release-relay-transport-design-gate.ps1 -BaseUrl $PublicMetadataBaseUrl -Json", "Keep RELAY_TUNNEL_RUNTIME_IMPLEMENTED=false until the gate reports runtime_marker_can_be_flipped=true after real quic_relay_tunnel byte transit exists.", "Implement router direct-failure to relay fallback and release-grade relay payload transport.", "Record owner-scoped relay transport and route evidence with bound transport proof.", "Run a two-PC failure-injection proof with direct blocked and relay task execution succeeding.") -Command "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\audit-release-relay-transport-design-gate.ps1 -BaseUrl $PublicMetadataBaseUrl -Json" -EvidencePath "docs\evidence\p2p-control-plane\$Version\*.evidence.json" -VerificationCommand "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\record-p2p-control-plane-evidence.ps1 -BaseUrl $PublicMetadataBaseUrl -Json" -AutomationBlockedReason "Relay transport remains a separate implementation lane until the design gate, route evidence, relay transport proof, and payload delivery proof all prove real quic_relay_tunnel byte transit.")) | Out-Null
                break
            }
            "brain-product-proof" {
                $actions.Add((New-NextAction -Area $area -Summary "Capture release-grade hidden brain proof beyond token ACL: health, source ingest, recall/capture, and version coherence." -ActionType "manual_then_command" -ManualSteps @("Launch the packaged desktop so the brain sidecar starts under ~/.musu/brain.", "Run the brain product proof recorder against the product-owned loopback sidecar.", "Confirm the proof created a real task source, processed it, and recalled it.", "Confirm the proof created a real capture clip, processed it, and recalled it.", "Save the passing JSON under docs\evidence\brain-product\$Version.") -Command "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\record-brain-product-proof.ps1 -OutputRoot docs\evidence\brain-product\$Version -Json" -EvidencePath "docs\evidence\brain-product\$Version\*.brain-product-proof.json" -VerificationCommand "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\verify-brain-product-proof.ps1 -EvidencePath <BRAIN_PRODUCT_JSON> -ExpectedVersion $Version -Json" -AutomationBlockedReason "The recorder requires the packaged desktop to have started the hidden brain sidecar; token ACL alone does not satisfy the product spec.")) | Out-Null
                break
            }
            "v34-stale-self-heal" {
                $actions.Add((New-NextAction -Area $area -Summary "Prove V34 stale registry/cache/manual-peer self-heal on physical machines." -ActionType "manual_then_command" -ManualSteps @("Inject stale registry/cache/manual peer evidence for the current version.", "Prove heartbeat TTL hides stale cloud rows and capture a musu.v34_ttl_prune_source.v1 source artifact.", "Prove boot reconcile cleans stale local state and capture a musu.v34_boot_reconcile_source.v1 source artifact.", "Prove route preflight chooses a reachable candidate before a stale first candidate without duplicate task execution.", "Run record-v34-source-artifacts.ps1, then record the physical proof with record-v34-self-heal-proof.ps1; do not hand-write release evidence JSON.") -Command "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\record-v34-self-heal-proof.ps1 -SourceNodeName <SOURCE_NODE> -TargetNodeName <TARGET_NODE> -SelectedCandidateAddr <ROUTABLE_ADDR> -RouteEvidencePath <ROUTE_EVIDENCE_JSON> -TtlSourceEvidencePath <V34_TTL_SOURCE_JSON> -BootSourceEvidencePath <V34_BOOT_SOURCE_JSON> -TtlStaleRowInjected `$true -TtlRegistryCurrentExcludesStaleRows `$true -TtlExpiredRowsHidden `$true -TtlStaleRowCountBefore <N> -TtlStaleRowCountAfter 0 -TtlHeartbeatTtlSec <TTL_SEC> -TtlStaleRowLastSeenAt <ISO8601> -BootCacheAvailable `$true -BootStaleManualPeerRemoved `$true -BootLanOnlyManualPeerPreserved `$true -BootSameNameCurrentCandidatePreserved `$true -BootManualPeerCountBefore <N> -BootManualPeerCountAfter <N> -BootPrunedManualPeerCount <N> -RoutePhysicalTwoNodeEvidence `$true -RouteStaleCandidateInjected `$true -RouteStaleCandidateWasFirst `$true -RouteSelectedReachableCandidateBeforeStale `$true -RouteDuplicateTaskExecutionPrevented `$true -RouteChecked `$true -RouteTaskPostCount 1 -OutputRoot docs\evidence\v34-self-heal\$Version -Json" -EvidencePath "docs\evidence\v34-self-heal\$Version\*.v34-self-heal-proof.json" -VerificationCommand "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\verify-v34-self-heal-proof.ps1 -EvidencePath <V34_SELF_HEAL_JSON> -ExpectedVersion $Version -Json" -AutomationBlockedReason "This is a physical E2E proof lane; current candidate/TTL code is not enough without stale-state evidence.")) | Out-Null
                break
            }
            "multi-device" {
                $actions.Add((New-NextAction -Area $area -Summary "Generate the second-PC kit, run it on the other physical PC, bring the returned evidence back, then record it." -ActionType "manual_then_command" -ManualSteps @("Run the kit generator on the primary machine.", "Move the generated kit to the second physical Windows PC.", "Run the kit on that second physical PC with the current MUSU build installed.", "Bring the returned evidence JSON back to this workspace.", "Replace <EVIDENCE_JSON> with the actual returned evidence path before recording it.") -Command "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\prepare-multidevice-test-kit.ps1 -Json" -EvidencePath ".local-build\multi-device\<EVIDENCE_JSON>" -VerificationCommand "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\record-multidevice-evidence.ps1 -EvidencePath .local-build\multi-device\<EVIDENCE_JSON>" -AutomationBlockedReason "A real second physical PC must run the generated kit and return evidence before the multi-device gate can be recorded.")) | Out-Null
                break
            }
            "private-mesh-packaged-release-proof" {
                $privateMeshImportCommand = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\import-private-mesh-release-proof-archive.ps1 -LatestFromMusuHome -Json"
                $actions.Add((New-NextAction -Area $area -Summary "Run the strict Private Mesh release proof from the installed MUSU desktop app on real hardware; standalone PowerShell/CLI archives are diagnostic only and do not satisfy the packaged desktop claim." -ActionType "manual_then_command" -ManualSteps @("Open the installed MUSU desktop app.", "Choose the real target PC in Fleet.", "Paste target-generated physical-peer evidence JSON plus its .sha256 sidecar.", "Click Release proof in the packaged desktop app.", "Use -MusuHome <PATH> only if the packaged app used a non-default MUSU_HOME.", "Do not use scripts\windows\run-private-mesh-release-proof.ps1 for this final packaged desktop gate.") -Command $privateMeshImportCommand -EvidencePath "%USERPROFILE%\.musu\private-mesh-release-proof\**\private-mesh-release-proof.archive.json or <MUSU_HOME>\private-mesh-release-proof\**\private-mesh-release-proof.archive.json" -VerificationCommand $privateMeshImportCommand)) | Out-Null
                break
            }
            "runtime-idle-cpu" {
                $actions.Add((New-NextAction -Area $area -Summary "Capture 60s packaged desktop-open idle CPU evidence on each required machine, including owned WebView2/process/resource budgets and fail-on-hot enforcement." -ActionType "manual_then_command" -ManualSteps @("Run the idle CPU capture on every required physical machine, including the second PC.", "Promote or import each passing capture into the accepted release evidence path.", "Rerun go/no-go only after evidence exists for the required machine count.") -Command "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\measure-musu-idle-cpu.ps1 -SampleSeconds 60 -Scenario desktop-open -RequireOwnedWebView2 -MaxOneCorePercent 5 -MaxOwnedProcessCount 16 -MaxOwnedWebView2ProcessCount 8 -MaxTotalWorkingSetMb 1024 -IncludeNode -IncludeWebView2 -FailOnHot -Json" -EvidencePath ".local-build\runtime-idle-cpu\musu-idle-cpu-*.json; accepted release path: docs\evidence\runtime-idle-cpu\$Version\*.json" -VerificationCommand "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\write-release-go-no-go.ps1 -Json" -AutomationBlockedReason "This command captures only the machine where it runs; release readiness still requires passing idle CPU evidence from every required physical machine.")) | Out-Null
                break
            }
            "runtime-cpu-scenario-matrix" {
                $actions.Add((New-NextAction -Area $area -Summary "Capture the full packaged runtime CPU scenario matrix on each required machine with the desktop app opened and an explicit peer route target." -ActionType "manual_then_command" -ManualSteps @("Choose the real peer name from the live fleet.", "Run the matrix capture on every required physical machine with the installed packaged desktop app.", "Replace <PEER_NAME> with the real peer before capture.", "Replace <MATRIX_JSON> with the actual matrix path before verifier replay.", "Promote or import each passing matrix into the accepted release evidence path.") -Command "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\measure-musu-runtime-cpu-scenarios.ps1 -Scenario startup-open,runtime-started,dashboard-open,desktop-open,post-route -SampleSeconds 60 -OpenDesktopApp -RunRouteProbe -RouteTarget <PEER_NAME> -AllowFailedRouteProbe -Json" -EvidencePath ".local-build\runtime-cpu-scenarios\*\*.runtime-cpu-scenario-matrix.json; accepted release path: docs\evidence\runtime-cpu-scenarios\$Version\*.runtime-cpu-scenario-matrix.json" -VerificationCommand "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\verify-runtime-cpu-scenario-matrix.ps1 -EvidencePath <MATRIX_JSON> -Json" -AutomationBlockedReason "A real peer target and passing matrix evidence from every required physical machine are required before the runtime CPU matrix gate can close.")) | Out-Null
                break
            }
            "runtime-cpu-second-pc-route-attempt" {
                $actions.Add((New-NextAction -Area $area -Summary "Capture post-route CPU after a targeted second-PC route attempt using the same packaged matrix command; failed route is allowed only when per-attempt metadata is preserved." -ActionType "manual_then_command" -ManualSteps @("Choose the real second-PC peer name from the live fleet.", "Replace <PEER_NAME> before running the matrix command.", "Run the packaged matrix capture so the post-route scenario records per-attempt route metadata.", "Rerun go/no-go only after the targeted route-attempt matrix evidence is present.") -Command "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\measure-musu-runtime-cpu-scenarios.ps1 -Scenario startup-open,runtime-started,dashboard-open,desktop-open,post-route -SampleSeconds 60 -OpenDesktopApp -RunRouteProbe -RouteTarget <PEER_NAME> -AllowFailedRouteProbe -Json" -EvidencePath ".local-build\runtime-cpu-scenarios\*\*.runtime-cpu-scenario-matrix.json; accepted release path: docs\evidence\runtime-cpu-scenarios\$Version\*.runtime-cpu-scenario-matrix.json" -VerificationCommand "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\write-release-go-no-go.ps1 -Json" -AutomationBlockedReason "A real second-PC peer target and post-route matrix evidence are required before the second-PC route-attempt CPU gate can close.")) | Out-Null
                break
            }
            "store-public-metadata" {
                $actions.Add((New-NextAction `
                    -Area $area `
                    -Summary "Plan and repair the canonical apex DNS/TLS path before rerunning public metadata verification." `
                    -ActionType "manual_then_command" `
                    -ManualSteps @(
                        "Run the public metadata DNS/TLS repair planner first.",
                        "Run vercel domains inspect for the exact Vercel-recommended DNS records.",
                        "Choose one DNS authority path: Vercel nameservers or Cloudflare/third-party external DNS, then repair apex DNS/TLS.",
                        "If staying on Cloudflare/third-party DNS, run the Cloudflare DNS apply helper in dry-run mode before any DNS mutation: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\apply-musu-pro-public-metadata-cloudflare-dns.ps1 -BaseUrl $PublicMetadataBaseUrl -Json",
                        "Only after reviewing the dry-run, provide a scoped Cloudflare token and rerun the helper with -ConfirmApply: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\apply-musu-pro-public-metadata-cloudflare-dns.ps1 -BaseUrl $PublicMetadataBaseUrl -ConfirmApply -Json",
                        "Repair the apex DNS/TLS path, then run the public metadata verifier command."
                    ) `
                    -Command "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\plan-musu-pro-public-metadata-dns-repair.ps1 -BaseUrl $PublicMetadataBaseUrl -Json" `
                    -EvidencePath ".local-build\public-metadata-dns-repair\*.json; $PublicMetadataBaseUrl/privacy, $PublicMetadataBaseUrl/support, $PublicMetadataBaseUrl/api/public-config" `
                    -VerificationCommand "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\verify-store-public-metadata.ps1 -BaseUrl $PublicMetadataBaseUrl -Json" `
                    -AutomationBlockedReason "The planner is diagnostic and does not mutate DNS/provider settings; the Cloudflare helper must be dry-run reviewed and explicitly rerun with -ConfirmApply before live DNS mutation. Live DNS/TLS repair is required before this verifier can pass.")) | Out-Null
                break
            }
            "support-mailbox" {
                $actions.Add((New-NextAction -Area $area -Summary "Close the support/operator lane by recording real inbox delivery evidence or the formal support mailbox delivery gate retirement." -ActionType "manual_then_command" -ManualSteps @("Preferred current path: run record-support-operator-gate-retirement.ps1 to verify live public support metadata and retire only the historical mailbox delivery proof.", "Alternative legacy path: run prepare-support-mailbox-verification-request.ps1 -Json, send the generated verification email from an external mailbox into $SupportEmail, then record it with record-support-mailbox-verification.ps1.", "Do not retire support availability: the support page, privacy page, public-config support email, and release metadata must remain live and verified.") -Command "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\record-support-operator-gate-retirement.ps1 -Json" -EvidencePath "docs\evidence\support-operator-gate-retirement\$Version\*.support-operator-gate-retirement.json" -VerificationCommand "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\verify-support-operator-gate-retirement.ps1 -EvidencePath <SUPPORT_OPERATOR_GATE_RETIREMENT_JSON> -ExpectedVersion $Version -Json" -AutomationBlockedReason "External email delivery into $SupportEmail is no longer the only accepted closure path; formal retirement still requires current public support metadata proof.")) | Out-Null
                break
            }
            "store-release" {
                $actions.Add((New-NextAction -Area $area -Summary "Verify the Store bundle, then record Partner Center approval plus Store-signed install and desktop launch evidence." -ActionType "manual_then_command" -ManualSteps @("Run the local Store submission bundle verifier.", "Reserve or confirm the MUSU product name in Partner Center.", "Submit the Store package for Microsoft certification.", "Wait for certification approval and restricted capability approval.", "Install the approved Microsoft Store package on a physical Windows machine, not a local sideload package.", "Capture Store-signed install evidence with capture-msix-install-evidence.ps1 -StartupContract store-reviewed-immediate-registration.", "Capture Store desktop entrypoint evidence with audit-msix-desktop-entrypoint.ps1 -StartupContract store-reviewed-immediate-registration -RequireInstalledPackage -Json.", "Replace the verification command placeholders with the real Partner Center timestamps, submission id, Store install/launch evidence paths, and operator name.") -Command "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\verify-store-submission-bundle.ps1" -EvidencePath "docs\evidence\store-release\$Version\*.json" -VerificationCommand "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\record-store-release-verification.ps1 -ProductName `"MUSU`" -ProductNameReservedAt `"<partner-center-name-reserved-at>`" -SubmissionId `"<partner-center-submission-id>`" -CertificationStatus `"approved`" -RestrictedCapabilityStatus `"approved`" -StoreSignedInstallEvidencePath `"<store-signed-msix-install-evidence-json>`" -StoreDesktopEntrypointEvidencePath `"<store-desktop-entrypoint-evidence-json>`" -StoreInstallObservedAt `"<store-install-observed-at>`" -StoreLaunchObservedAt `"<store-launch-observed-at>`" -RecordedBy `"<operator-name>`" -Notes `"Microsoft Store certification, restricted capability review, and Store-signed install/launch evidence approved`" -Json" -AutomationBlockedReason "Partner Center reservation, certification, restricted capability approval, and Store-signed install/launch evidence must exist before Store release evidence can be recorded.")) | Out-Null
                break
            }
            "p2p-control-plane" {
                $actions.Add((New-NextAction -Area $area -Summary "Inspect source/env/live relay blockers, then record live P2P control-plane evidence only after release-grade relay transport is actually implemented and configured." -Command "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\show-musu-pro-p2p-env-status.ps1 -Json" -EvidencePath "docs\evidence\p2p-control-plane\$Version\*.evidence.json" -VerificationCommand "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\record-p2p-control-plane-evidence.ps1 -BaseUrl $PublicMetadataBaseUrl -Json" -AutomationBlockedReason "Release-grade relay payload endpoint and relay tunnel runtime are not implemented/proven yet; this command is diagnostic until those source/env/live gates pass.")) | Out-Null
                break
            }
            "git" {
                $actions.Add((New-NextAction -Area $area -Summary "Review the dirty worktree, commit only after all intended changes and release evidence are present, then regenerate release manifests." -ActionType "manual_then_command" -ManualSteps @("Review git status and the full diff for unrelated or accidental changes.", "Do not commit just to clear the git blocker while required release evidence is still missing.", "After every non-git blocker has valid evidence, commit the intended changes and regenerate go/no-go/release manifests from the clean commit.") -Command "git status --short" -EvidencePath ".local-build\go-no-go\latest.json" -VerificationCommand "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\write-release-go-no-go.ps1 -Json" -AutomationBlockedReason "The git blocker can only close after all intended changes and required release evidence are present; git status is diagnostic only.")) | Out-Null
                break
            }
            "release-candidate-manifest" {
                $actions.Add((New-NextAction -Area $area -Summary "Regenerate the release candidate manifest after required package artifacts exist; go/no-go must report this as a blocker instead of crashing." -ActionType "manual_then_command" -ManualSteps @("Build or restore the current local/store MSIX artifacts, public certificate, Store submission bundle, Tauri desktop bundles, and multi-device kit.", "Run the release candidate manifest writer directly to inspect missing artifact paths.", "Rerun go/no-go and confirm the manifest blocker is gone only after the manifest is generated.") -Command "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\write-release-candidate-manifest.ps1" -EvidencePath ".local-build\release-candidates\$Version\release-candidate-manifest.json" -VerificationCommand "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\write-release-go-no-go.ps1 -Json" -AutomationBlockedReason "Missing release artifacts require build or operator evidence; the readiness gate can diagnose them but cannot fabricate a manifest.")) | Out-Null
                break
            }
        }
    }
    return $actions.ToArray()
}

function Format-PublicMetadataFailureSummary {
    param(
        $PublicMetadata,
        [Parameter(Mandatory = $true)][string]$BaseUrl
    )

    if (-not $PublicMetadata) {
        return "Public privacy/support metadata verification failed for $BaseUrl; verifier returned no JSON."
    }

    $details = New-Object System.Collections.Generic.List[string]
    if ($PublicMetadata.PSObject.Properties["failure_kinds"] -and $PublicMetadata.failure_kinds) {
        $failureKinds = @($PublicMetadata.failure_kinds | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) })
        if ($failureKinds.Count -gt 0) {
            $details.Add("failure_kinds=$($failureKinds -join ',')") | Out-Null
        }
    }

    if ($PublicMetadata.PSObject.Properties["dns_diagnostics"] -and $PublicMetadata.dns_diagnostics) {
        $dns = $PublicMetadata.dns_diagnostics
        $dnsApplicable = ($dns.PSObject.Properties["nameserver_check_applicable"] -and [bool]$dns.nameserver_check_applicable)
        $dnsMatchesExpected = ($dns.PSObject.Properties["nameserver_matches_expected"] -and [bool]$dns.nameserver_matches_expected)
        if ($dnsApplicable -and -not $dnsMatchesExpected) {
            $currentNs = @()
            if ($dns.PSObject.Properties["current_nameservers"] -and $dns.current_nameservers) {
                $currentNs = @($dns.current_nameservers | Select-Object -First 4 | ForEach-Object { [string]$_ })
            }
            $expectedNs = @()
            if ($dns.PSObject.Properties["expected_nameservers"] -and $dns.expected_nameservers) {
                $expectedNs = @($dns.expected_nameservers | Select-Object -First 4 | ForEach-Object { [string]$_ })
            }
            $providerGuess = if ($dns.PSObject.Properties["provider_guess"]) { [string]$dns.provider_guess } else { "unknown" }
            $details.Add("dns nameserver_mismatch provider=$providerGuess current=[$($currentNs -join ', ')] expected=[$($expectedNs -join ', ')]") | Out-Null
        }
    }

    if ($PublicMetadata.PSObject.Properties["pages"] -and $PublicMetadata.pages) {
        foreach ($page in @($PublicMetadata.pages | Where-Object { -not [bool]$_.ok })) {
            $name = if ($page.PSObject.Properties["name"]) { [string]$page.name } else { "page" }
            $status = if ($page.PSObject.Properties["status_code"] -and $null -ne $page.status_code) {
                "HTTP $([int]$page.status_code)"
            }
            else {
                "no_status"
            }
            $kind = if ($page.PSObject.Properties["failure_kind"] -and -not [string]::IsNullOrWhiteSpace([string]$page.failure_kind)) {
                [string]$page.failure_kind
            }
            else {
                "unknown_failure"
            }
            $missing = @()
            if ($page.PSObject.Properties["missing_text"] -and $page.missing_text) {
                $missing = @($page.missing_text | Select-Object -First 4 | ForEach-Object { [string]$_ })
            }
            $missingSummary = if ($missing.Count -gt 0) { " missing=[$($missing -join ', ')]" } else { "" }
            $details.Add("${name} ${status} ${kind}${missingSummary}") | Out-Null
        }
    }

    if ($PublicMetadata.PSObject.Properties["public_config"] -and $PublicMetadata.public_config -and -not [bool]$PublicMetadata.public_config.ok) {
        $config = $PublicMetadata.public_config
        $status = if ($config.PSObject.Properties["status_code"] -and $null -ne $config.status_code) {
            "HTTP $([int]$config.status_code)"
        }
        else {
            "no_status"
        }
        $kind = if ($config.PSObject.Properties["failure_kind"] -and -not [string]::IsNullOrWhiteSpace([string]$config.failure_kind)) {
            [string]$config.failure_kind
        }
        else {
            "unknown_failure"
        }
        $missingFields = @()
        if ($config.PSObject.Properties["missing_fields"] -and $config.missing_fields) {
            $missingFields = @($config.missing_fields | Select-Object -First 8 | ForEach-Object { [string]$_ })
        }
        $mismatchedFields = @()
        if ($config.PSObject.Properties["mismatched_fields"] -and $config.mismatched_fields) {
            $mismatchedFields = @($config.mismatched_fields | Select-Object -First 8 | ForEach-Object { [string]$_.name })
        }
        $fieldDetails = @()
        if ($missingFields.Count -gt 0) {
            $fieldDetails += "missing_fields=[$($missingFields -join ', ')]"
        }
        if ($mismatchedFields.Count -gt 0) {
            $fieldDetails += "mismatched_fields=[$($mismatchedFields -join ', ')]"
        }
        $fieldSummary = if ($fieldDetails.Count -gt 0) { " $($fieldDetails -join ' ')" } else { "" }
        $details.Add("public-config ${status} ${kind}${fieldSummary}") | Out-Null
    }

    if ($details.Count -eq 0) {
        return "Public privacy/support metadata verification failed for $BaseUrl."
    }
    return "Public privacy/support metadata verification failed for ${BaseUrl}: $($details -join '; ')."
}

function New-Check {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Status,
        [Parameter(Mandatory = $true)][string]$Message
    )

    [pscustomobject]@{
        name = $Name
        status = $Status
        message = $Message
    }
}

function Test-ObjectHasPropertyNames {
    param(
        $Object,
        [Parameter(Mandatory = $true)][string[]]$Names
    )

    if ($null -eq $Object) {
        return $false
    }

    foreach ($name in $Names) {
        if (-not $Object.PSObject.Properties[$name]) {
            return $false
        }
    }
    return $true
}

function Test-AuditCheckPassed {
    param(
        $Audit,
        [Parameter(Mandatory = $true)][string]$Scope,
        [Parameter(Mandatory = $true)][string]$Name
    )

    if (-not $Audit -or -not $Audit.PSObject.Properties["checks"] -or $null -eq $Audit.checks) {
        return $false
    }

    return @($Audit.checks | Where-Object {
            [string]$_.scope -eq $Scope -and
            [string]$_.name -eq $Name -and
            [string]$_.status -eq "pass"
        }).Count -gt 0
}

function New-IdleBusyLoopCandidateStatus {
    param(
        [Parameter(Mandatory = $true)][string]$Candidate,
        [Parameter(Mandatory = $true)][string]$AuditName,
        $Audit,
        [Parameter(Mandatory = $true)][object[]]$RequiredChecks,
        [Parameter(Mandatory = $true)][string]$Evidence
    )

    $checkResults = @($RequiredChecks | ForEach-Object {
            $passed = Test-AuditCheckPassed -Audit $Audit -Scope ([string]$_.scope) -Name ([string]$_.name)
            [pscustomobject]@{
                scope = [string]$_.scope
                name = [string]$_.name
                passed = [bool]$passed
            }
        })

    [pscustomobject]@{
        candidate = $Candidate
        verified = @($checkResults | Where-Object { -not [bool]$_.passed }).Count -eq 0
        audit = $AuditName
        evidence = $Evidence
        checks = $checkResults
    }
}

function Test-ReleaseEvidenceFreshnessAllowedPath {
    param([Parameter(Mandatory = $true)][string]$Path)

    $normalizedPath = $Path.Replace("\", "/")
    if ($normalizedPath -like "docs/*" -or $normalizedPath -like "musu-bee/docs/*" -or $normalizedPath -like "*.md") {
        return $true
    }

    $serverOnlyControlPlanePaths = @(
        "musu-bee/src/app/api/v1/p2p/*",
        "musu-bee/src/app/api/v1/relay/*",
        "musu-bee/src/app/api/rooms/*",
        "musu-bee/src/lib/publicRelease.ts",
        "musu-bee/src/lib/routeEvidence*.ts",
        "musu-bee/src/lib/p2p*.ts"
    )
    foreach ($pattern in $serverOnlyControlPlanePaths) {
        if ($normalizedPath -like $pattern) {
            return $true
        }
    }

    $testOnlyPathPatterns = @(
        "*.test.ts",
        "*.test.tsx",
        "*.spec.ts",
        "*.spec.tsx"
    )
    foreach ($pattern in $testOnlyPathPatterns) {
        if ($normalizedPath -like $pattern) {
            return $true
        }
    }

    $statusOnlyScripts = @(
        ".github/workflows/deploy-musu-bee.yml",
        "scripts/windows/audit-desktop-release-readiness.ps1",
        "scripts/windows/audit-frontend-polling-contract.ps1",
        "scripts/windows/audit-rust-background-loop-contract.ps1",
        "scripts/windows/audit-local-api-auth-contract.ps1",
        "scripts/windows/audit-operator-api-security-contract.ps1",
        "scripts/windows/audit-degraded-mode-contract.ps1",
        "scripts/windows/audit-musu-crash-recovery-contract.ps1",
        "scripts/windows/audit-musu-process-ownership.ps1",
        "scripts/windows/audit-musu-startup-single-instance.ps1",
        "scripts/windows/audit-p2p-store-forward-relay-contract.ps1",
        "scripts/windows/audit-secret-storage-contract.ps1",
        "scripts/windows/capture-msix-install-evidence.ps1",
        "scripts/windows/check-msix-legacy-conflicts.ps1",
        "scripts/windows/canary-desktop-release.ps1",
        "scripts/windows/complete-final-operator-gates.ps1",
        "scripts/windows/configure-musu-pro-p2p-env.ps1",
        "scripts/windows/import-second-pc-return.ps1",
        "scripts/windows/import-private-mesh-release-proof-archive.ps1",
        "scripts/windows/measure-musu-runtime-cpu-scenarios.ps1",
        "scripts/windows/evidence-integrity.ps1",
        "scripts/windows/msix-common.ps1",
        "scripts/windows/prepare-final-operator-gate-packet.ps1",
        "scripts/windows/prepare-multidevice-test-kit.ps1",
        "scripts/windows/prepare-operator-action-pack.ps1",
        "scripts/windows/publish-desktop-latest-assets.ps1",
        "scripts/windows/prepare-support-mailbox-verification-request.ps1",
        "scripts/windows/repair-packaged-local-runtime-state.ps1",
        "scripts/windows/record-route-reachability-diagnostic.ps1",
        "scripts/windows/record-msix-install-evidence.ps1",
        "scripts/windows/record-multidevice-evidence.ps1",
        "scripts/windows/record-external-release-gate-recheck.ps1",
        "scripts/windows/record-p2p-control-plane-evidence.ps1",
        "scripts/windows/record-single-machine-evidence.ps1",
        "scripts/windows/record-support-mailbox-verification.ps1",
        "scripts/windows/record-support-operator-gate-retirement.ps1",
        "scripts/windows/plan-musu-pro-public-metadata-dns-repair.ps1",
        "scripts/windows/verify-store-public-metadata.ps1",
        "scripts/windows/record-brain-product-proof.ps1",
        "scripts/windows/run-private-mesh-release-proof.ps1",
        "scripts/windows/archive-private-mesh-release-proof-bundle.ps1",
        "scripts/windows/run-second-pc-release-check.ps1",
        "scripts/windows/test-second-pc-route-preflight.ps1",
        "scripts/windows/smoke-multidevice-beta.ps1",
        "scripts/windows/smoke-single-machine-beta.ps1",
        "scripts/windows/verify-installed-msix-package.ps1",
        "scripts/windows/verify-final-operator-gate-packet.ps1",
        "scripts/windows/verify-msix-install-evidence.ps1",
        "scripts/windows/verify-multidevice-evidence.ps1",
        "scripts/windows/verify-operator-action-pack.ps1",
        "scripts/windows/verify-p2p-control-plane-evidence.ps1",
        "scripts/windows/verify-private-mesh-release-proof-archive.ps1",
        "scripts/windows/verify-private-mesh-release-proof-bundle.ps1",
        "scripts/windows/verify-route-reachability-diagnostic.ps1",
        "scripts/windows/verify-direct-route-evidence.ps1",
        "scripts/windows/verify-runtime-cpu-scenario-matrix.ps1",
        "scripts/windows/verify-single-machine-evidence.ps1",
        "scripts/windows/verify-support-mailbox-evidence.ps1",
        "scripts/windows/verify-support-operator-gate-retirement.ps1",
        "scripts/windows/verify-brain-product-proof.ps1",
        "scripts/windows/verify-v34-self-heal-proof.ps1",
        "scripts/windows/verify-store-submission-bundle.ps1",
        "scripts/windows/show-final-release-handoff-status.ps1",
        "scripts/windows/show-operator-handoff-card.ps1",
        "scripts/windows/write-release-go-no-go.ps1",
        "scripts/windows/write-release-candidate-manifest.ps1",
        "scripts/windows/test-release-evidence-verifiers.ps1",
        "scripts/windows/show-musu-process-attribution.ps1",
        "scripts/windows/verify-process-attribution-summary.ps1",
        "scripts/windows/show-musu-pro-p2p-env-status.ps1"
    )
    return ($statusOnlyScripts -contains $normalizedPath)
}

function Test-ReleaseEvidenceFreshnessAllowedDiff {
    param(
        [Parameter(Mandatory = $true)][string]$FromCommit,
        [Parameter(Mandatory = $true)][string]$ToCommit,
        [Parameter(Mandatory = $true)][string]$Path
    )

    $normalizedPath = $Path.Replace("\", "/")
    if ($normalizedPath -notin @(".github/workflows/test.yml", "musu-bee/package.json")) {
        return $false
    }

    $diffText = (& git -C $repoRoot diff --unified=0 $FromCommit $ToCommit -- $Path 2>$null | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($diffText)) {
        return $false
    }

    $changedLines = @(
        $diffText -split "`r?`n" |
            Where-Object { ($_ -match "^[+-]") -and ($_ -notmatch "^\+\+\+") -and ($_ -notmatch "^---") }
    )
    if ($changedLines.Count -eq 0) {
        return $true
    }

    if ($normalizedPath -eq ".github/workflows/test.yml") {
        $allowed = @(
            '^\+\s*- name: P2P control-plane tests\s*$',
            '^\+\s*run: npm run test:p2p\s*$',
            '^\+\s*$'
        )
        return (@($changedLines | Where-Object {
            $line = [string]$_
            -not (@($allowed | Where-Object { $line -match $_ }).Count -gt 0)
        }).Count -eq 0)
    }

    if ($normalizedPath -eq "musu-bee/package.json") {
        return (@($changedLines | Where-Object {
            $line = [string]$_
            $line -notmatch '^\+\s*"test:p2p":\s*"tsx --test src/lib/p2pKvEnv\.test\.ts src/app/api/v1/p2p/route-evidence/route\.test\.ts src/app/api/v1/p2p/rendezvous/route\.test\.ts src/app/api/v1/p2p/relay/lease/route\.test\.ts src/app/api/v1/p2p/relay/transport/route\.test\.ts",\s*$'
        }).Count -eq 0)
    }

    return $false
}

function Test-DocumentationOrStatusOnlyGitDelta {
    param(
        [Parameter(Mandatory = $true)][string]$FromCommit,
        [Parameter(Mandatory = $true)][string]$ToCommit
    )

    if ($FromCommit -notmatch "^[0-9a-f]{40}$" -or $ToCommit -notmatch "^[0-9a-f]{40}$") {
        return $false
    }

    $changedPathsText = (& git -C $repoRoot diff --name-only $FromCommit $ToCommit 2>$null | Out-String).Trim()
    if ($LASTEXITCODE -ne 0) {
        return $false
    }
    if ([string]::IsNullOrWhiteSpace($changedPathsText)) {
        return $true
    }

    $changedPaths = @($changedPathsText -split "`r?`n" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    $runtimeAffectingPaths = @($changedPaths | Where-Object {
        $path = [string]$_
        -not (Test-ReleaseEvidenceFreshnessAllowedPath -Path $path) -and
        -not (Test-ReleaseEvidenceFreshnessAllowedDiff -FromCommit $FromCommit -ToCommit $ToCommit -Path $path)
    })
    return ($runtimeAffectingPaths.Count -eq 0)
}

function Select-LatestEvidenceCandidatesByMachine {
    param(
        [object[]]$Candidates = @(),
        [int]$MaxPerMachine = 3,
        [int]$MaxUnknown = 6
    )

    $selected = New-Object System.Collections.Generic.List[object]
    $byMachine = @{}
    $unknownCount = 0

    foreach ($candidate in @($Candidates | Sort-Object LastWriteTime -Descending)) {
        $machine = $null
        try {
            $candidateJson = Get-Content -LiteralPath $candidate.FullName -Raw | ConvertFrom-Json
            $machine = [string]$candidateJson.operator_machine
            if ([string]::IsNullOrWhiteSpace($machine) -and $candidateJson.measurement) {
                $machine = [string]$candidateJson.measurement.operator_machine
            }
        }
        catch {
            $machine = $null
        }

        if ([string]::IsNullOrWhiteSpace($machine)) {
            if ($unknownCount -lt $MaxUnknown) {
                $selected.Add($candidate) | Out-Null
                $unknownCount += 1
            }
            continue
        }

        if (-not $byMachine.ContainsKey($machine)) {
            $byMachine[$machine] = 0
        }
        if ([int]$byMachine[$machine] -lt $MaxPerMachine) {
            $selected.Add($candidate) | Out-Null
            $byMachine[$machine] = [int]$byMachine[$machine] + 1
        }
    }

    @($selected.ToArray() | Sort-Object LastWriteTime -Descending)
}

function Test-StringSetContainsAll {
    param(
        [string[]]$Values = @(),
        [string[]]$Required = @()
    )

    $set = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
    foreach ($value in @($Values)) {
        if (-not [string]::IsNullOrWhiteSpace($value)) {
            [void]$set.Add([string]$value)
        }
    }
    foreach ($requiredValue in @($Required)) {
        if ([string]::IsNullOrWhiteSpace($requiredValue)) {
            continue
        }
        if (-not $set.Contains([string]$requiredValue)) {
            return $false
        }
    }
    return $true
}

function Get-RuntimeCpuScenarioMatrixCandidateShape {
    param([Parameter(Mandatory = $true)]$Candidate)

    try {
        $matrix = Get-Content -LiteralPath $Candidate.FullName -Raw | ConvertFrom-Json
    }
    catch {
        return [pscustomobject]@{
            parsed = $false
            parse_error = $_.Exception.Message
            schema = ""
            version = ""
            matrix_ok = $false
            git_commit = ""
            git_commit_valid = $false
            git_dirty_present = $false
            git_dirty = $true
            operator_machine = ""
            sample_seconds = 0.0
            scenario_names = @()
            has_target_post_route_probe = $false
        }
    }

    $scenarioEntries = @()
    if ($matrix.PSObject.Properties["scenarios"] -and $null -ne $matrix.scenarios) {
        $scenarioEntries = @($matrix.scenarios)
    }
    $scenarioNames = @($scenarioEntries | ForEach-Object {
            if ($_.PSObject.Properties["scenario"]) {
                [string]$_.scenario
            }
        } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })

    $postRouteEntry = @($scenarioEntries | Where-Object {
            $_.PSObject.Properties["scenario"] -and [string]$_.scenario -eq "post-route"
        } | Select-Object -First 1)
    $routeProbe = $null
    if ($postRouteEntry.Count -gt 0 -and
        $postRouteEntry[0].PSObject.Properties["preparation"] -and
        $postRouteEntry[0].preparation -and
        $postRouteEntry[0].preparation.PSObject.Properties["route_probe"]) {
        $routeProbe = $postRouteEntry[0].preparation.route_probe
    }

    [pscustomobject]@{
        parsed = $true
        parse_error = ""
        schema = if ($matrix.PSObject.Properties["schema"]) { [string]$matrix.schema } else { "" }
        version = if ($matrix.PSObject.Properties["version"]) { [string]$matrix.version } else { "" }
        matrix_ok = ($matrix.PSObject.Properties["ok"] -and [bool]$matrix.ok)
        git_commit = if ($matrix.PSObject.Properties["git_commit"]) { [string]$matrix.git_commit } else { "" }
        git_commit_valid = ($matrix.PSObject.Properties["git_commit"] -and [string]$matrix.git_commit -match "^[0-9a-f]{40}$")
        git_dirty_present = [bool]$matrix.PSObject.Properties["git_dirty"]
        git_dirty = (-not [bool]$matrix.PSObject.Properties["git_dirty"] -or [bool]$matrix.git_dirty)
        operator_machine = if ($matrix.PSObject.Properties["operator_machine"]) { [string]$matrix.operator_machine } else { "" }
        sample_seconds = if ($matrix.PSObject.Properties["sample_seconds"]) { [double]$matrix.sample_seconds } else { 0.0 }
        scenario_names = @($scenarioNames)
        has_target_post_route_probe = (
            $null -ne $routeProbe -and
            $routeProbe.PSObject.Properties["target"] -and
            -not [string]::IsNullOrWhiteSpace([string]$routeProbe.target)
        )
    }
}

function Test-RuntimeCpuScenarioMatrixCandidatePreflight {
    param(
        [Parameter(Mandatory = $true)]$Shape,
        [Parameter(Mandatory = $true)][string]$ExpectedVersion,
        [Parameter(Mandatory = $true)][string]$ExpectedGitCommit,
        [Parameter(Mandatory = $true)][string[]]$RequiredScenarios,
        [Parameter(Mandatory = $true)][int]$MinSampleSeconds,
        [switch]$RequireTargetPostRoute
    )

    if (-not [bool]$Shape.parsed) {
        return [pscustomobject]@{ ok = $false; reason = "parse_failed"; detail = [string]$Shape.parse_error }
    }
    if ([string]$Shape.schema -ne "musu.runtime_cpu_scenario_matrix.v1") {
        return [pscustomobject]@{ ok = $false; reason = "schema_mismatch"; detail = "schema='$($Shape.schema)'" }
    }
    if ([string]$Shape.version -ne $ExpectedVersion) {
        return [pscustomobject]@{ ok = $false; reason = "version_mismatch"; detail = "version='$($Shape.version)', expected='$ExpectedVersion'" }
    }
    if (-not [bool]$Shape.matrix_ok) {
        return [pscustomobject]@{ ok = $false; reason = "matrix_not_ok"; detail = "matrix ok=false" }
    }
    if (-not [bool]$Shape.git_commit_valid) {
        return [pscustomobject]@{ ok = $false; reason = "git_commit_invalid"; detail = "git_commit='$($Shape.git_commit)'" }
    }
    if ([bool]$Shape.git_dirty) {
        return [pscustomobject]@{ ok = $false; reason = "git_dirty"; detail = "matrix was captured dirty or lacks git_dirty=false" }
    }
    if ([double]$Shape.sample_seconds -lt [double]$MinSampleSeconds) {
        return [pscustomobject]@{ ok = $false; reason = "sample_duration_too_short"; detail = "sample_seconds=$($Shape.sample_seconds), expected>=$MinSampleSeconds" }
    }
    if (-not (Test-StringSetContainsAll -Values $Shape.scenario_names -Required $RequiredScenarios)) {
        return [pscustomobject]@{ ok = $false; reason = "required_scenarios_missing"; detail = "required='$($RequiredScenarios -join ',')'" }
    }
    if ($RequireTargetPostRoute -and -not [bool]$Shape.has_target_post_route_probe) {
        return [pscustomobject]@{ ok = $false; reason = "target_post_route_probe_missing"; detail = "post-route target is missing" }
    }

    if (-not [string]::IsNullOrWhiteSpace($ExpectedGitCommit) -and [string]$Shape.git_commit -ne $ExpectedGitCommit) {
        $gitDeltaCacheKey = "$($Shape.git_commit)..$ExpectedGitCommit"
        if (-not $script:runtimeCpuScenarioMatrixGitDeltaCache.ContainsKey($gitDeltaCacheKey)) {
            $documentationOrStatusOnlyGitDelta = $false
            if ($ExpectedGitCommit -match "^[0-9a-f]{40}$") {
                $documentationOrStatusOnlyGitDelta = Test-DocumentationOrStatusOnlyGitDelta -FromCommit ([string]$Shape.git_commit) -ToCommit $ExpectedGitCommit
            }
            $script:runtimeCpuScenarioMatrixGitDeltaCache[$gitDeltaCacheKey] = $documentationOrStatusOnlyGitDelta
        }
        if (-not [bool]$script:runtimeCpuScenarioMatrixGitDeltaCache[$gitDeltaCacheKey]) {
            return [pscustomobject]@{ ok = $false; reason = "runtime_affecting_git_delta"; detail = "git_commit='$($Shape.git_commit)', expected='$ExpectedGitCommit'" }
        }
    }

    [pscustomobject]@{ ok = $true; reason = ""; detail = "" }
}

function New-RuntimeCpuScenarioMatrixPrefilteredResult {
    param(
        [Parameter(Mandatory = $true)]$Candidate,
        [Parameter(Mandatory = $true)]$Shape,
        [Parameter(Mandatory = $true)]$Preflight
    )

    [pscustomobject]@{
        ok = $false
        evidence_path = $Candidate.FullName
        operator_machine = [string]$Shape.operator_machine
        preflight_skipped = $true
        failure_kind = "cheap_prefilter"
        skip_reason = [string]$Preflight.reason
        skip_detail = [string]$Preflight.detail
    }
}

function Select-RuntimeCpuScenarioMatrixCandidates {
    param(
        [object[]]$Candidates = @(),
        [string[]]$RequiredScenarios = @(),
        [int]$MaxPerMachine = 12,
        [int]$MaxUnknown = 12
    )

    $selectedByPath = @{}
    function Add-UniqueRuntimeCpuCandidate {
        param([object[]]$Items = @())
        foreach ($item in @($Items)) {
            if ($null -eq $item -or [string]::IsNullOrWhiteSpace([string]$item.FullName)) {
                continue
            }
            $key = [string]$item.FullName
            if (-not $selectedByPath.ContainsKey($key)) {
                $selectedByPath[$key] = $item
            }
        }
    }

    Add-UniqueRuntimeCpuCandidate -Items (
        Select-LatestEvidenceCandidatesByMachine -Candidates $Candidates -MaxPerMachine $MaxPerMachine -MaxUnknown $MaxUnknown
    )

    $completeScenarioCandidates = @($Candidates | Where-Object {
            $shape = Get-RuntimeCpuScenarioMatrixCandidateShape -Candidate $_
            Test-StringSetContainsAll -Values $shape.scenario_names -Required $RequiredScenarios
        })
    Add-UniqueRuntimeCpuCandidate -Items (
        Select-LatestEvidenceCandidatesByMachine -Candidates $completeScenarioCandidates -MaxPerMachine $MaxPerMachine -MaxUnknown $MaxUnknown
    )

    $targetRouteCandidates = @($Candidates | Where-Object {
            $shape = Get-RuntimeCpuScenarioMatrixCandidateShape -Candidate $_
            [bool]$shape.has_target_post_route_probe
        })
    Add-UniqueRuntimeCpuCandidate -Items (
        Select-LatestEvidenceCandidatesByMachine -Candidates $targetRouteCandidates -MaxPerMachine $MaxPerMachine -MaxUnknown $MaxUnknown
    )

    @($selectedByPath.Values | Sort-Object LastWriteTime -Descending)
}

function Test-RuntimeIdleCpuEvidence {
    param(
        [Parameter(Mandatory = $true)][string]$EvidencePath,
        [Parameter(Mandatory = $true)][string]$ExpectedVersion,
        [Parameter(Mandatory = $true)][string]$ExpectedGitCommit,
        [Parameter(Mandatory = $true)][int]$MinSampleSeconds,
        [Parameter(Mandatory = $true)][double]$MaxOneCorePercent
    )

    $checks = New-Object System.Collections.Generic.List[object]
    $cpuAttributionRoleNames = @("musu", "node", "webview2", "other")
    $cpuAttributionSubroleNames = @("musu_runtime", "bridge_runtime", "desktop_shell", "node_helper", "webview2_helper", "other")
    $doctorBackgroundFieldNames = @(
        "mdns_enabled",
        "clipboard_sync_enabled",
        "cloud_registration_enabled",
        "cloud_heartbeat_interval_sec",
        "cloud_heartbeat_floor_sec",
        "relay_payload_poller_enabled",
        "relay_payload_poller_interval_sec",
        "relay_payload_poller_interval_floor_sec",
        "planner_enabled",
        "planner_interval_sec",
        "planner_interval_floor_sec",
        "planner_command_timeout_sec",
        "planner_command_timeout_floor_sec",
        "planner_command_timeout_ceiling_sec",
        "auto_update_supervise_enabled",
        "auto_update_check_interval_minutes",
        "auto_update_check_interval_floor_minutes",
        "auto_update_health_poll_initial_ms",
        "auto_update_health_poll_max_ms",
        "bridge_health_poll_initial_ms",
        "bridge_health_poll_max_ms",
        "runtime_loop_candidates",
        "active_runtime_loop_candidate_count",
        "active_runtime_loop_candidate_keys"
    )
    $evidence = $null
    try {
        $evidence = Get-Content -LiteralPath $EvidencePath -Raw | ConvertFrom-Json
        $checks.Add((New-Check -Name "parse" -Status "pass" -Message "runtime idle CPU evidence parses")) | Out-Null
    }
    catch {
        $checks.Add((New-Check -Name "parse" -Status "fail" -Message "runtime idle CPU evidence does not parse: $($_.Exception.Message)")) | Out-Null
    }

    if ($evidence) {
        $schema = [string]$evidence.schema
        $checks.Add((New-Check -Name "schema" -Status ($(if ($schema -eq "musu.runtime_idle_cpu_evidence.v1") { "pass" } else { "fail" })) -Message ($(if ($schema -eq "musu.runtime_idle_cpu_evidence.v1") { "schema is valid" } else { "schema is '$schema'" })))) | Out-Null

        $versionValue = [string]$evidence.version
        $checks.Add((New-Check -Name "version" -Status ($(if ($versionValue -eq $ExpectedVersion) { "pass" } else { "fail" })) -Message ($(if ($versionValue -eq $ExpectedVersion) { "version matches $ExpectedVersion" } else { "version is '$versionValue'" })))) | Out-Null

        $gitCommit = if ($evidence.PSObject.Properties["git_commit"]) { [string]$evidence.git_commit } else { "" }
        $gitCommitValid = ($gitCommit -match "^[0-9a-f]{40}$")
        $checks.Add((New-Check -Name "git commit present" -Status ($(if ($gitCommitValid) { "pass" } else { "fail" })) -Message ($(if ($gitCommitValid) { "git commit is recorded" } else { "git commit is missing or invalid" })))) | Out-Null

        $gitCommitMatchesExpected = ($gitCommit -eq $ExpectedGitCommit)
        $documentationOrStatusOnlyGitDelta = $false
        if (-not $gitCommitMatchesExpected -and $gitCommitValid -and $ExpectedGitCommit -match "^[0-9a-f]{40}$") {
            $documentationOrStatusOnlyGitDelta = Test-DocumentationOrStatusOnlyGitDelta -FromCommit $gitCommit -ToCommit $ExpectedGitCommit
        }
        $checks.Add((New-Check -Name "expected git commit" -Status ($(if ($gitCommitMatchesExpected -or $documentationOrStatusOnlyGitDelta) { "pass" } else { "fail" })) -Message ($(if ($gitCommitMatchesExpected) { "git commit matches current HEAD $ExpectedGitCommit" } elseif ($documentationOrStatusOnlyGitDelta) { "git commit differs from current HEAD $ExpectedGitCommit only by documentation/evidence/status/tooling-only commits" } else { "git commit is '$gitCommit', expected current HEAD '$ExpectedGitCommit' with no runtime-affecting changes after the evidence commit" })))) | Out-Null

        $gitDirty = ($evidence.PSObject.Properties["git_dirty"] -and [bool]$evidence.git_dirty)
        $checks.Add((New-Check -Name "git clean during sample" -Status ($(if (-not $gitDirty -and $evidence.PSObject.Properties["git_dirty"]) { "pass" } else { "fail" })) -Message ($(if (-not $gitDirty -and $evidence.PSObject.Properties["git_dirty"]) { "runtime idle sample was captured from a clean git state" } elseif ($gitDirty) { "runtime idle sample was captured from a dirty git state" } else { "git cleanliness is missing" })))) | Out-Null

        $okValue = [bool]$evidence.ok
        $checks.Add((New-Check -Name "evidence ok" -Status ($(if ($okValue) { "pass" } else { "fail" })) -Message ($(if ($okValue) { "evidence reports ok=true" } else { "evidence reports ok=false" })))) | Out-Null

        $scenario = if ($evidence.PSObject.Properties["scenario"]) { [string]$evidence.scenario } else { "" }
        $checks.Add((New-Check -Name "runtime scenario" -Status ($(if ($scenario -eq $RequiredRuntimeIdleCpuScenario) { "pass" } else { "fail" })) -Message ($(if ($scenario -eq $RequiredRuntimeIdleCpuScenario) { "runtime scenario is $scenario" } else { "runtime scenario is '$scenario', expected '$RequiredRuntimeIdleCpuScenario'" })))) | Out-Null

        $requireOwnedWebView2 = ($evidence.PSObject.Properties["require_owned_webview2"] -and [bool]$evidence.require_owned_webview2)
        $checks.Add((New-Check -Name "owned WebView2 required" -Status ($(if ($requireOwnedWebView2) { "pass" } else { "fail" })) -Message ($(if ($requireOwnedWebView2) { "desktop-open evidence requires owned WebView2" } else { "desktop-open evidence did not set -RequireOwnedWebView2" })))) | Out-Null

        $includeNode = ($evidence.PSObject.Properties["include_node"] -and [bool]$evidence.include_node)
        $checks.Add((New-Check -Name "Node.js budget included" -Status ($(if ($includeNode) { "pass" } else { "fail" })) -Message ($(if ($includeNode) { "evidence includes Node.js helper processes" } else { "evidence did not run with -IncludeNode" })))) | Out-Null

        $includeWebView2 = ($evidence.PSObject.Properties["include_webview2"] -and [bool]$evidence.include_webview2)
        $checks.Add((New-Check -Name "WebView2 budget included" -Status ($(if ($includeWebView2) { "pass" } else { "fail" })) -Message ($(if ($includeWebView2) { "evidence includes WebView2 helper processes" } else { "evidence did not run with -IncludeWebView2" })))) | Out-Null

        $helperScope = if ($evidence.PSObject.Properties["helper_process_scope"]) { [string]$evidence.helper_process_scope } else { "" }
        $helperScopeValid = $helperScope -in @("musu_process_tree_or_repo_related", "all_matching_process_names")
        $checks.Add((New-Check -Name "helper process scope" -Status ($(if ($helperScopeValid) { "pass" } else { "fail" })) -Message ($(if ($helperScopeValid) { "helper process scope is $helperScope" } else { "helper process scope is missing or invalid" })))) | Out-Null

        $includeUnrelatedHelpers = ($evidence.PSObject.Properties["include_unrelated_helpers"] -and [bool]$evidence.include_unrelated_helpers)
        $metadataTimedOut = ($evidence.PSObject.Properties["process_metadata_timed_out"] -and [bool]$evidence.process_metadata_timed_out)
        $checks.Add((New-Check -Name "process metadata timeout" -Status ($(if (-not $metadataTimedOut) { "pass" } else { "fail" })) -Message ($(if (-not $metadataTimedOut) { "process ownership metadata did not time out" } else { "process ownership metadata timed out" })))) | Out-Null

        $metadataAvailable = ($evidence.PSObject.Properties["process_metadata_available"] -and [bool]$evidence.process_metadata_available)
        $needsMetadata = (($includeNode -or $includeWebView2) -and -not $includeUnrelatedHelpers)
        $checks.Add((New-Check -Name "process ownership metadata" -Status ($(if (-not $needsMetadata -or $metadataAvailable) { "pass" } else { "fail" })) -Message ($(if (-not $needsMetadata) { "all matching helper processes were intentionally included" } elseif ($metadataAvailable) { "process ownership metadata is available" } else { "process ownership metadata is missing; helper ownership cannot be proven" })))) | Out-Null

        $operatorMachine = ""
        if ($evidence.PSObject.Properties["operator_machine"]) {
            $operatorMachine = [string]$evidence.operator_machine
        }
        $checks.Add((New-Check -Name "operator machine" -Status ($(if (-not [string]::IsNullOrWhiteSpace($operatorMachine)) { "pass" } else { "fail" })) -Message ($(if (-not [string]::IsNullOrWhiteSpace($operatorMachine)) { "operator_machine is present" } else { "operator_machine is missing" })))) | Out-Null

        $sampleSeconds = [double]$evidence.sample_seconds
        $checks.Add((New-Check -Name "sample duration" -Status ($(if ($sampleSeconds -ge $MinSampleSeconds) { "pass" } else { "fail" })) -Message ($(if ($sampleSeconds -ge $MinSampleSeconds) { "sample duration is at least ${MinSampleSeconds}s" } else { "sample duration is ${sampleSeconds}s, expected at least ${MinSampleSeconds}s" })))) | Out-Null

        $hotCount = [int]$evidence.hot_process_count
        $checks.Add((New-Check -Name "hot process count" -Status ($(if ($hotCount -eq 0) { "pass" } else { "fail" })) -Message ($(if ($hotCount -eq 0) { "no hot processes reported" } else { "$hotCount hot process(es) reported" })))) | Out-Null

        $musuProcessCountAfter = 0
        if ($evidence.PSObject.Properties["musu_process_count_after"]) {
            $musuProcessCountAfter = [int]$evidence.musu_process_count_after
        }
        elseif ($evidence.PSObject.Properties["process_count_after"]) {
            $musuProcessCountAfter = [int]$evidence.process_count_after
        }
        $checks.Add((New-Check -Name "MUSU process running" -Status ($(if ($musuProcessCountAfter -gt 0) { "pass" } else { "fail" })) -Message ($(if ($musuProcessCountAfter -gt 0) { "$musuProcessCountAfter MUSU runtime process(es) were running at the end of the sample" } else { "no MUSU runtime process was running during the sample" })))) | Out-Null

        $sampleCount = @($evidence.samples).Count
        $checks.Add((New-Check -Name "cpu samples present" -Status ($(if ($sampleCount -gt 0) { "pass" } else { "fail" })) -Message ($(if ($sampleCount -gt 0) { "$sampleCount CPU sample(s) recorded" } else { "no CPU samples were recorded" })))) | Out-Null

        $maxOwnedProcessCount = if ($evidence.PSObject.Properties["max_owned_process_count"]) { [int]$evidence.max_owned_process_count } else { 0 }
        $checks.Add((New-Check -Name "owned process count budget present" -Status ($(if ($maxOwnedProcessCount -gt 0) { "pass" } else { "fail" })) -Message ($(if ($maxOwnedProcessCount -gt 0) { "owned process count budget is $maxOwnedProcessCount" } else { "owned process count budget is missing" })))) | Out-Null

        $processCountAfter = if ($evidence.PSObject.Properties["process_count_after"]) { [int]$evidence.process_count_after } else { 0 }
        $checks.Add((New-Check -Name "owned process count budget" -Status ($(if ($maxOwnedProcessCount -gt 0 -and $processCountAfter -le $maxOwnedProcessCount) { "pass" } else { "fail" })) -Message ($(if ($maxOwnedProcessCount -gt 0 -and $processCountAfter -le $maxOwnedProcessCount) { "owned process count $processCountAfter <= $maxOwnedProcessCount" } else { "owned process count $processCountAfter exceeds or lacks budget $maxOwnedProcessCount" })))) | Out-Null

        $maxOwnedWebView2ProcessCount = if ($evidence.PSObject.Properties["max_owned_webview2_process_count"]) { [int]$evidence.max_owned_webview2_process_count } else { -1 }
        $checks.Add((New-Check -Name "WebView2 process budget present" -Status ($(if ($maxOwnedWebView2ProcessCount -ge 0) { "pass" } else { "fail" })) -Message ($(if ($maxOwnedWebView2ProcessCount -ge 0) { "WebView2 process budget is $maxOwnedWebView2ProcessCount" } else { "WebView2 process budget is missing" })))) | Out-Null

        $ownedWebView2ProcessCount = 0
        if ($evidence.PSObject.Properties["process_counts_by_role"] -and $evidence.process_counts_by_role.PSObject.Properties["webview2"]) {
            $ownedWebView2ProcessCount = [int]$evidence.process_counts_by_role.webview2
        }
        $checks.Add((New-Check -Name "WebView2 process budget" -Status ($(if ($maxOwnedWebView2ProcessCount -ge 0 -and $ownedWebView2ProcessCount -le $maxOwnedWebView2ProcessCount) { "pass" } else { "fail" })) -Message ($(if ($maxOwnedWebView2ProcessCount -ge 0 -and $ownedWebView2ProcessCount -le $maxOwnedWebView2ProcessCount) { "owned WebView2 process count $ownedWebView2ProcessCount <= $maxOwnedWebView2ProcessCount" } else { "owned WebView2 process count $ownedWebView2ProcessCount exceeds or lacks budget $maxOwnedWebView2ProcessCount" })))) | Out-Null

        $maxTotalWorkingSetMb = if ($evidence.PSObject.Properties["max_total_working_set_mb"]) { [double]$evidence.max_total_working_set_mb } else { 0.0 }
        $totalWorkingSetMbAfter = if ($evidence.PSObject.Properties["total_working_set_mb_after"]) { [double]$evidence.total_working_set_mb_after } else { 0.0 }
        $checks.Add((New-Check -Name "working set budget present" -Status ($(if ($maxTotalWorkingSetMb -gt 0.0 -and $evidence.PSObject.Properties["total_working_set_mb_after"]) { "pass" } else { "fail" })) -Message ($(if ($maxTotalWorkingSetMb -gt 0.0 -and $evidence.PSObject.Properties["total_working_set_mb_after"]) { "working set budget is ${maxTotalWorkingSetMb}MB" } else { "working set budget or total working set is missing" })))) | Out-Null
        $checks.Add((New-Check -Name "working set budget" -Status ($(if ($maxTotalWorkingSetMb -gt 0.0 -and $totalWorkingSetMbAfter -le $maxTotalWorkingSetMb) { "pass" } else { "fail" })) -Message ($(if ($maxTotalWorkingSetMb -gt 0.0 -and $totalWorkingSetMbAfter -le $maxTotalWorkingSetMb) { "total working set ${totalWorkingSetMbAfter}MB <= ${maxTotalWorkingSetMb}MB" } else { "total working set ${totalWorkingSetMbAfter}MB exceeds or lacks budget ${maxTotalWorkingSetMb}MB" })))) | Out-Null

        $privateMemoryPresent = $evidence.PSObject.Properties["total_private_memory_mb_after"]
        $checks.Add((New-Check -Name "private memory total present" -Status ($(if ($privateMemoryPresent) { "pass" } else { "fail" })) -Message ($(if ($privateMemoryPresent) { "total private memory is recorded" } else { "total private memory is missing" })))) | Out-Null

        $memoryByRolePresent = $evidence.PSObject.Properties["memory_totals_by_role_mb"]
        $checks.Add((New-Check -Name "memory by role present" -Status ($(if ($memoryByRolePresent) { "pass" } else { "fail" })) -Message ($(if ($memoryByRolePresent) { "memory totals by role are recorded" } else { "memory totals by role are missing" })))) | Out-Null

        $memoryBySubrolePresent = $evidence.PSObject.Properties["memory_totals_by_subrole_mb"]
        $checks.Add((New-Check -Name "memory by subrole present" -Status ($(if ($memoryBySubrolePresent) { "pass" } else { "fail" })) -Message ($(if ($memoryBySubrolePresent) { "memory totals by bridge/runtime/desktop/helper subrole are recorded" } else { "memory totals by subrole are missing" })))) | Out-Null

        $matchingProcessInventory = if ($evidence.PSObject.Properties["matching_process_inventory"]) { $evidence.matching_process_inventory } else { $null }
        $matchingProcessInventoryPresent = ($null -ne $matchingProcessInventory)
        $checks.Add((New-Check -Name "matching process inventory present" -Status ($(if ($matchingProcessInventoryPresent) { "pass" } else { "fail" })) -Message ($(if ($matchingProcessInventoryPresent) { "runtime idle CPU evidence records matching process inventory for machine-wide and MUSU-owned helper attribution" } else { "runtime idle CPU evidence is missing matching_process_inventory" })))) | Out-Null
        if ($matchingProcessInventoryPresent) {
            $matchingProcessInventoryBuckets = if ($matchingProcessInventory.PSObject.Properties["counts_by_bucket"]) { $matchingProcessInventory.counts_by_bucket } else { $matchingProcessInventory }
            $matchingInventoryTopLevelPresent = Test-ObjectHasPropertyNames -Object $matchingProcessInventoryBuckets -Names @("musu", "node", "webview2", "other")
            $checks.Add((New-Check -Name "matching process inventory top-level fields" -Status ($(if ($matchingInventoryTopLevelPresent) { "pass" } else { "fail" })) -Message ($(if ($matchingInventoryTopLevelPresent) { "matching process inventory includes MUSU/node/WebView2/other role buckets" } else { "matching process inventory is missing MUSU/node/WebView2/other role buckets" })))) | Out-Null
            if ($matchingInventoryTopLevelPresent) {
                $nodeMatchingInventoryPresent = Test-ObjectHasPropertyNames -Object $matchingProcessInventoryBuckets.node -Names @("machine_wide", "owned_by_musu_process_tree", "repo_related_unowned", "unowned_other")
                $checks.Add((New-Check -Name "matching process inventory node buckets" -Status ($(if ($nodeMatchingInventoryPresent) { "pass" } else { "fail" })) -Message ($(if ($nodeMatchingInventoryPresent) { "matching process inventory records machine-wide, MUSU-owned, repo-related, and unowned node helper counts" } else { "matching process inventory is missing node helper ownership buckets" })))) | Out-Null
                if ($nodeMatchingInventoryPresent) {
                    $repoRelatedUnownedNodeHelpers = [int]$matchingProcessInventoryBuckets.node.repo_related_unowned
                    $checks.Add((New-Check -Name "matching process inventory repo-related node helpers" -Status ($(if ($repoRelatedUnownedNodeHelpers -eq 0) { "pass" } else { "fail" })) -Message ($(if ($repoRelatedUnownedNodeHelpers -eq 0) { "matching process inventory records no repo-related unowned node helpers" } else { "matching process inventory records $repoRelatedUnownedNodeHelpers repo-related unowned node helper(s)" })))) | Out-Null
                }

                $webview2MatchingInventoryPresent = Test-ObjectHasPropertyNames -Object $matchingProcessInventoryBuckets.webview2 -Names @("machine_wide", "owned_by_musu_process_tree", "unowned_other")
                $checks.Add((New-Check -Name "matching process inventory WebView2 buckets" -Status ($(if ($webview2MatchingInventoryPresent) { "pass" } else { "fail" })) -Message ($(if ($webview2MatchingInventoryPresent) { "matching process inventory records machine-wide, MUSU-owned, and unowned WebView2 helper counts" } else { "matching process inventory is missing WebView2 helper ownership buckets" })))) | Out-Null
            }
        }

        $doctorBackgroundSnapshot = if ($evidence.PSObject.Properties["doctor_background_snapshot"]) { $evidence.doctor_background_snapshot } else { $null }
        $doctorBackgroundSnapshotPresent = ($null -ne $doctorBackgroundSnapshot)
        $checks.Add((New-Check -Name "doctor background snapshot present" -Status ($(if ($doctorBackgroundSnapshotPresent) { "pass" } else { "fail" })) -Message ($(if ($doctorBackgroundSnapshotPresent) { "runtime idle CPU evidence captures a MUSU doctor background snapshot" } else { "runtime idle CPU evidence is missing doctor_background_snapshot" })))) | Out-Null
        if ($doctorBackgroundSnapshotPresent) {
            $doctorSnapshotSchema = if ($doctorBackgroundSnapshot.PSObject.Properties["schema"]) { [string]$doctorBackgroundSnapshot.schema } else { "" }
            $checks.Add((New-Check -Name "doctor background snapshot schema" -Status ($(if ($doctorSnapshotSchema -eq "musu.runtime_cpu_background_snapshot.v1") { "pass" } else { "fail" })) -Message ($(if ($doctorSnapshotSchema -eq "musu.runtime_cpu_background_snapshot.v1") { "doctor background snapshot schema is valid" } else { "doctor background snapshot schema is '$doctorSnapshotSchema'" })))) | Out-Null

            $doctorSnapshotCommand = if ($doctorBackgroundSnapshot.PSObject.Properties["command"]) { [string]$doctorBackgroundSnapshot.command } else { "" }
            $checks.Add((New-Check -Name "doctor background snapshot command" -Status ($(if ($doctorSnapshotCommand -eq "musu doctor --json") { "pass" } else { "fail" })) -Message ($(if ($doctorSnapshotCommand -eq "musu doctor --json") { "doctor background snapshot records the MUSU doctor command" } else { "doctor background snapshot command is '$doctorSnapshotCommand'" })))) | Out-Null

            $doctorSchemaComplete = ($doctorBackgroundSnapshot.PSObject.Properties["doctor_schema_complete"] -and [bool]$doctorBackgroundSnapshot.doctor_schema_complete)
            $missingDoctorBackgroundFields = if ($doctorBackgroundSnapshot.PSObject.Properties["missing_background_fields"]) {
                @($doctorBackgroundSnapshot.missing_background_fields | ForEach-Object { [string]$_ } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
            }
            else {
                @()
            }
            $missingDoctorRuntimeLoopCandidateKeys = if ($doctorBackgroundSnapshot.PSObject.Properties["missing_runtime_loop_candidate_keys"]) {
                @($doctorBackgroundSnapshot.missing_runtime_loop_candidate_keys | ForEach-Object { [string]$_ } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
            }
            else {
                @()
            }
            $checks.Add((New-Check -Name "doctor background snapshot completeness" -Status ($(if ($doctorSchemaComplete) { "pass" } else { "fail" })) -Message ($(if ($doctorSchemaComplete) { "doctor background snapshot came from a package that exposes the complete loop-attribution schema" } else { "doctor background snapshot required fallback defaults; missing fields: $($missingDoctorBackgroundFields -join ', '); missing runtime loop candidate keys: $($missingDoctorRuntimeLoopCandidateKeys -join ', ')" })))) | Out-Null

            $doctorBackground = if ($doctorBackgroundSnapshot.PSObject.Properties["background"]) { $doctorBackgroundSnapshot.background } else { $null }
            $doctorBackgroundPresent = ($null -ne $doctorBackground)
            $checks.Add((New-Check -Name "doctor background fields present" -Status ($(if ($doctorBackgroundPresent) { "pass" } else { "fail" })) -Message ($(if ($doctorBackgroundPresent) { "doctor background snapshot includes background feature fields" } else { "doctor background snapshot is missing background feature fields" })))) | Out-Null
            if ($doctorBackgroundPresent) {
                $missingBackgroundFields = @($doctorBackgroundFieldNames | Where-Object { -not $doctorBackground.PSObject.Properties[$_] })
                $checks.Add((New-Check -Name "doctor background required fields" -Status ($(if ($missingBackgroundFields.Count -eq 0) { "pass" } else { "fail" })) -Message ($(if ($missingBackgroundFields.Count -eq 0) { "doctor background snapshot includes the required loop-attribution fields" } else { "doctor background snapshot is missing fields: $($missingBackgroundFields -join ', ')" })))) | Out-Null
                if ($missingBackgroundFields.Count -eq 0) {
                    $cloudHeartbeatIntervalSec = [uint64]$doctorBackground.cloud_heartbeat_interval_sec
                    $cloudHeartbeatFloorSec = [uint64]$doctorBackground.cloud_heartbeat_floor_sec
                    $checks.Add((New-Check -Name "doctor background cloud heartbeat floor" -Status ($(if ($cloudHeartbeatIntervalSec -ge $cloudHeartbeatFloorSec -and $cloudHeartbeatFloorSec -ge 60) { "pass" } else { "fail" })) -Message ($(if ($cloudHeartbeatIntervalSec -ge $cloudHeartbeatFloorSec -and $cloudHeartbeatFloorSec -ge 60) { "doctor background snapshot records a low-duty cloud heartbeat floor" } else { "doctor background snapshot records invalid cloud heartbeat interval/floor values" })))) | Out-Null

                    $relayPollerIntervalSec = [uint64]$doctorBackground.relay_payload_poller_interval_sec
                    $relayPollerFloorSec = [uint64]$doctorBackground.relay_payload_poller_interval_floor_sec
                    $checks.Add((New-Check -Name "doctor background relay poller floor" -Status ($(if ($relayPollerIntervalSec -ge $relayPollerFloorSec) { "pass" } else { "fail" })) -Message ($(if ($relayPollerIntervalSec -ge $relayPollerFloorSec) { "doctor background snapshot records bounded relay payload poller cadence" } else { "doctor background snapshot records invalid relay payload poller interval/floor values" })))) | Out-Null

                    $plannerIntervalSec = [uint64]$doctorBackground.planner_interval_sec
                    $plannerIntervalFloorSec = [uint64]$doctorBackground.planner_interval_floor_sec
                    $checks.Add((New-Check -Name "doctor background planner floor" -Status ($(if ($plannerIntervalSec -ge $plannerIntervalFloorSec) { "pass" } else { "fail" })) -Message ($(if ($plannerIntervalSec -ge $plannerIntervalFloorSec) { "doctor background snapshot records bounded planner cadence" } else { "doctor background snapshot records invalid planner interval/floor values" })))) | Out-Null

                    $plannerTimeoutSec = [uint64]$doctorBackground.planner_command_timeout_sec
                    $plannerTimeoutFloorSec = [uint64]$doctorBackground.planner_command_timeout_floor_sec
                    $plannerTimeoutCeilingSec = [uint64]$doctorBackground.planner_command_timeout_ceiling_sec
                    $checks.Add((New-Check -Name "doctor background planner timeout bounds" -Status ($(if ($plannerTimeoutSec -ge $plannerTimeoutFloorSec -and $plannerTimeoutSec -le $plannerTimeoutCeilingSec) { "pass" } else { "fail" })) -Message ($(if ($plannerTimeoutSec -ge $plannerTimeoutFloorSec -and $plannerTimeoutSec -le $plannerTimeoutCeilingSec) { "doctor background snapshot records bounded planner command timeout" } else { "doctor background snapshot records invalid planner timeout bounds" })))) | Out-Null

                    $autoUpdateIntervalMinutes = [uint64]$doctorBackground.auto_update_check_interval_minutes
                    $autoUpdateIntervalFloorMinutes = [uint64]$doctorBackground.auto_update_check_interval_floor_minutes
                    $checks.Add((New-Check -Name "doctor background auto-update interval floor" -Status ($(if ($autoUpdateIntervalMinutes -ge $autoUpdateIntervalFloorMinutes -and $autoUpdateIntervalFloorMinutes -ge 5) { "pass" } else { "fail" })) -Message ($(if ($autoUpdateIntervalMinutes -ge $autoUpdateIntervalFloorMinutes -and $autoUpdateIntervalFloorMinutes -ge 5) { "doctor background snapshot records bounded auto-update supervisor cadence" } else { "doctor background snapshot records invalid auto-update interval/floor values" })))) | Out-Null

                    $autoUpdateHealthPollInitialMs = [uint64]$doctorBackground.auto_update_health_poll_initial_ms
                    $autoUpdateHealthPollMaxMs = [uint64]$doctorBackground.auto_update_health_poll_max_ms
                    $checks.Add((New-Check -Name "doctor background auto-update health poll bounds" -Status ($(if ($autoUpdateHealthPollInitialMs -ge 250 -and $autoUpdateHealthPollInitialMs -le $autoUpdateHealthPollMaxMs -and $autoUpdateHealthPollMaxMs -le 2000) { "pass" } else { "fail" })) -Message ($(if ($autoUpdateHealthPollInitialMs -ge 250 -and $autoUpdateHealthPollInitialMs -le $autoUpdateHealthPollMaxMs -and $autoUpdateHealthPollMaxMs -le 2000) { "doctor background snapshot records bounded auto-update health polling backoff" } else { "doctor background snapshot records invalid auto-update health polling bounds" })))) | Out-Null

                    $bridgeHealthPollInitialMs = [uint64]$doctorBackground.bridge_health_poll_initial_ms
                    $bridgeHealthPollMaxMs = [uint64]$doctorBackground.bridge_health_poll_max_ms
                    $checks.Add((New-Check -Name "doctor background bridge health poll bounds" -Status ($(if ($bridgeHealthPollInitialMs -ge 250 -and $bridgeHealthPollInitialMs -le $bridgeHealthPollMaxMs -and $bridgeHealthPollMaxMs -le 2000) { "pass" } else { "fail" })) -Message ($(if ($bridgeHealthPollInitialMs -ge 250 -and $bridgeHealthPollInitialMs -le $bridgeHealthPollMaxMs -and $bridgeHealthPollMaxMs -le 2000) { "doctor background snapshot records bounded bridge readiness polling backoff" } else { "doctor background snapshot records invalid bridge readiness polling bounds" })))) | Out-Null

                    $expectedRuntimeLoopCandidateKeys = @(
                        "mdns_discovery",
                        "clipboard_polling",
                        "cloud_heartbeat",
                        "file_sync_watch",
                        "relay_target_polling",
                        "autonomous_planner",
                        "health_check_retry",
                        "auto_update_supervisor",
                        "bridge_readiness_wait",
                        "log_telemetry_flush"
                    )
                    $runtimeLoopCandidates = @($doctorBackground.runtime_loop_candidates)
                    $runtimeLoopCandidateKeys = @(
                        $runtimeLoopCandidates |
                            ForEach-Object {
                                if ($_.PSObject.Properties["key"]) {
                                    [string]$_.key
                                }
                            } |
                            Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
                    )
                    $missingRuntimeLoopCandidateKeys = @($expectedRuntimeLoopCandidateKeys | Where-Object { $_ -notin $runtimeLoopCandidateKeys })
                    $checks.Add((New-Check -Name "doctor background runtime loop candidates" -Status ($(if ($runtimeLoopCandidates.Count -eq $expectedRuntimeLoopCandidateKeys.Count) { "pass" } else { "fail" })) -Message ($(if ($runtimeLoopCandidates.Count -eq $expectedRuntimeLoopCandidateKeys.Count) { "doctor background snapshot records the expected runtime loop candidate summary" } else { "doctor background snapshot records $($runtimeLoopCandidates.Count) runtime loop candidates; expected $($expectedRuntimeLoopCandidateKeys.Count)" })))) | Out-Null
                    $checks.Add((New-Check -Name "doctor background runtime loop candidate keys" -Status ($(if ($missingRuntimeLoopCandidateKeys.Count -eq 0) { "pass" } else { "fail" })) -Message ($(if ($missingRuntimeLoopCandidateKeys.Count -eq 0) { "doctor background snapshot includes the expected runtime loop candidate keys" } else { "doctor background snapshot is missing runtime loop candidate keys: $($missingRuntimeLoopCandidateKeys -join ', ')" })))) | Out-Null

                    $activeRuntimeLoopCandidateKeys = @(
                        @($doctorBackground.active_runtime_loop_candidate_keys) |
                            ForEach-Object { [string]$_ } |
                            Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
                    )
                    $calculatedActiveRuntimeLoopCandidateKeys = @(
                        $runtimeLoopCandidates |
                            Where-Object { $_.PSObject.Properties["active"] -and [bool]$_.active } |
                            ForEach-Object { [string]$_.key }
                    )
                    $activeRuntimeLoopCandidateKeySetsMatch = (@(Compare-Object -ReferenceObject $activeRuntimeLoopCandidateKeys -DifferenceObject $calculatedActiveRuntimeLoopCandidateKeys).Count -eq 0)
                    $activeRuntimeLoopCandidateCount = [int]$doctorBackground.active_runtime_loop_candidate_count
                    $checks.Add((New-Check -Name "doctor background active runtime loop candidate count" -Status ($(if ($activeRuntimeLoopCandidateCount -eq $calculatedActiveRuntimeLoopCandidateKeys.Count) { "pass" } else { "fail" })) -Message ($(if ($activeRuntimeLoopCandidateCount -eq $calculatedActiveRuntimeLoopCandidateKeys.Count) { "doctor background snapshot records a consistent active runtime loop candidate count" } else { "doctor background snapshot active runtime loop candidate count $activeRuntimeLoopCandidateCount does not match calculated count $($calculatedActiveRuntimeLoopCandidateKeys.Count)" })))) | Out-Null
                    $checks.Add((New-Check -Name "doctor background active runtime loop candidate keys" -Status ($(if ($activeRuntimeLoopCandidateKeySetsMatch) { "pass" } else { "fail" })) -Message ($(if ($activeRuntimeLoopCandidateKeySetsMatch) { "doctor background snapshot records the active runtime loop candidate keys" } else { "doctor background snapshot active runtime loop candidate keys do not match the runtime loop candidate summary" })))) | Out-Null
                }
            }
        }

        $processCountsByRole = if ($evidence.PSObject.Properties["process_counts_by_role"]) { $evidence.process_counts_by_role } else { $null }
        $processCountsByRolePresent = Test-ObjectHasPropertyNames -Object $processCountsByRole -Names $cpuAttributionRoleNames
        $checks.Add((New-Check -Name "process counts by role present" -Status ($(if ($processCountsByRolePresent) { "pass" } else { "fail" })) -Message ($(if ($processCountsByRolePresent) { "process counts by MUSU/node/WebView2/other role are recorded" } else { "process counts by role are missing MUSU/node/WebView2/other fields" })))) | Out-Null

        $processCountsBySubrole = if ($evidence.PSObject.Properties["process_counts_by_subrole"]) { $evidence.process_counts_by_subrole } else { $null }
        $processCountsBySubrolePresent = Test-ObjectHasPropertyNames -Object $processCountsBySubrole -Names $cpuAttributionSubroleNames
        $checks.Add((New-Check -Name "process counts by subrole present" -Status ($(if ($processCountsBySubrolePresent) { "pass" } else { "fail" })) -Message ($(if ($processCountsBySubrolePresent) { "process counts by bridge/runtime/desktop/helper subrole are recorded" } else { "process counts by subrole are missing or incomplete" })))) | Out-Null

        $bridgeRuntimeProcessCount = if ($processCountsBySubrolePresent -and $processCountsBySubrole.PSObject.Properties["bridge_runtime"]) { [int]$processCountsBySubrole.bridge_runtime } else { 0 }
        $checks.Add((New-Check -Name "bridge runtime process separated" -Status ($(if ($bridgeRuntimeProcessCount -ge 1) { "pass" } else { "fail" })) -Message ($(if ($bridgeRuntimeProcessCount -ge 1) { "bridge runtime process is separated from generic MUSU role" } else { "bridge runtime process was not separated in process_counts_by_subrole" })))) | Out-Null

        $desktopShellProcessCount = if ($processCountsBySubrolePresent -and $processCountsBySubrole.PSObject.Properties["desktop_shell"]) { [int]$processCountsBySubrole.desktop_shell } else { 0 }
        $checks.Add((New-Check -Name "desktop shell process separated" -Status ($(if ($desktopShellProcessCount -ge 1) { "pass" } else { "fail" })) -Message ($(if ($desktopShellProcessCount -ge 1) { "desktop shell process is separated from bridge/runtime" } else { "desktop shell process was not separated in process_counts_by_subrole" })))) | Out-Null

        $resourceBudgetViolations = @(
            if ($evidence.PSObject.Properties["resource_budget_violations"]) {
                @($evidence.resource_budget_violations)
            }
            else {
                "resource budget violations field missing"
            }
        )
        $checks.Add((New-Check -Name "resource budget violations" -Status ($(if ($resourceBudgetViolations.Count -eq 0) { "pass" } else { "fail" })) -Message ($(if ($resourceBudgetViolations.Count -eq 0) { "no resource budget violations reported" } else { "resource budget violation(s): $($resourceBudgetViolations -join '; ')" })))) | Out-Null

        $maxSample = 0.0
        if ($evidence.samples) {
            foreach ($sample in @($evidence.samples)) {
                $value = [double]$sample.cpu_pct_one_core
                if ($value -gt $maxSample) {
                    $maxSample = $value
                }
            }
        }
        $checks.Add((New-Check -Name "max one-core CPU" -Status ($(if ($maxSample -le $MaxOneCorePercent) { "pass" } else { "fail" })) -Message ($(if ($maxSample -le $MaxOneCorePercent) { "max one-core CPU $maxSample <= $MaxOneCorePercent" } else { "max one-core CPU $maxSample > $MaxOneCorePercent" })))) | Out-Null

        $cpuAttribution = if ($evidence.PSObject.Properties["cpu_attribution"]) { $evidence.cpu_attribution } else { $null }
        $cpuAttributionPresent = ($null -ne $cpuAttribution)
        $checks.Add((New-Check -Name "CPU attribution present" -Status ($(if ($cpuAttributionPresent) { "pass" } else { "fail" })) -Message ($(if ($cpuAttributionPresent) { "runtime idle evidence includes PID/role CPU attribution summary" } else { "runtime idle evidence is missing cpu_attribution" })))) | Out-Null
        if ($cpuAttributionPresent) {
            $attributionSchema = if ($cpuAttribution.PSObject.Properties["schema"]) { [string]$cpuAttribution.schema } else { "" }
            $checks.Add((New-Check -Name "CPU attribution schema" -Status ($(if ($attributionSchema -eq "musu.runtime_idle_cpu_attribution.v1") { "pass" } else { "fail" })) -Message ($(if ($attributionSchema -eq "musu.runtime_idle_cpu_attribution.v1") { "CPU attribution schema is valid" } else { "CPU attribution schema is '$attributionSchema'" })))) | Out-Null

            $attributionSampleCount = if ($cpuAttribution.PSObject.Properties["sample_count"]) { [int]$cpuAttribution.sample_count } else { -1 }
            $checks.Add((New-Check -Name "CPU attribution sample count" -Status ($(if ($attributionSampleCount -eq $sampleCount -and $attributionSampleCount -gt 0) { "pass" } else { "fail" })) -Message ($(if ($attributionSampleCount -eq $sampleCount -and $attributionSampleCount -gt 0) { "CPU attribution sample count matches samples" } else { "CPU attribution sample count $attributionSampleCount does not match samples $sampleCount" })))) | Out-Null

            $sampleCountByRole = if ($cpuAttribution.PSObject.Properties["sample_count_by_role"]) { $cpuAttribution.sample_count_by_role } else { $null }
            $sampleCountByRolePresent = Test-ObjectHasPropertyNames -Object $sampleCountByRole -Names $cpuAttributionRoleNames
            $checks.Add((New-Check -Name "CPU attribution role counts" -Status ($(if ($sampleCountByRolePresent) { "pass" } else { "fail" })) -Message ($(if ($sampleCountByRolePresent) { "CPU attribution records MUSU/node/WebView2/other sample counts by role" } else { "CPU attribution is missing MUSU/node/WebView2/other role sample counts" })))) | Out-Null

            $sampleCountBySubrole = if ($cpuAttribution.PSObject.Properties["sample_count_by_subrole"]) { $cpuAttribution.sample_count_by_subrole } else { $null }
            $sampleCountBySubrolePresent = Test-ObjectHasPropertyNames -Object $sampleCountBySubrole -Names $cpuAttributionSubroleNames
            $checks.Add((New-Check -Name "CPU attribution subrole counts" -Status ($(if ($sampleCountBySubrolePresent) { "pass" } else { "fail" })) -Message ($(if ($sampleCountBySubrolePresent) { "CPU attribution records sample counts by bridge/runtime/desktop/helper subrole" } else { "CPU attribution is missing subrole sample counts" })))) | Out-Null

            $totalCpuByRole = if ($cpuAttribution.PSObject.Properties["total_cpu_seconds_by_role"]) { $cpuAttribution.total_cpu_seconds_by_role } else { $null }
            $totalCpuByRolePresent = Test-ObjectHasPropertyNames -Object $totalCpuByRole -Names $cpuAttributionRoleNames
            $checks.Add((New-Check -Name "CPU attribution totals by role" -Status ($(if ($totalCpuByRolePresent) { "pass" } else { "fail" })) -Message ($(if ($totalCpuByRolePresent) { "CPU attribution records MUSU/node/WebView2/other CPU totals by role" } else { "CPU attribution is missing MUSU/node/WebView2/other CPU totals by role" })))) | Out-Null

            $totalCpuBySubrole = if ($cpuAttribution.PSObject.Properties["total_cpu_seconds_by_subrole"]) { $cpuAttribution.total_cpu_seconds_by_subrole } else { $null }
            $totalCpuBySubrolePresent = Test-ObjectHasPropertyNames -Object $totalCpuBySubrole -Names $cpuAttributionSubroleNames
            $checks.Add((New-Check -Name "CPU attribution totals by subrole" -Status ($(if ($totalCpuBySubrolePresent) { "pass" } else { "fail" })) -Message ($(if ($totalCpuBySubrolePresent) { "CPU attribution records total CPU seconds by bridge/runtime/desktop/helper subrole" } else { "CPU attribution is missing CPU totals by subrole" })))) | Out-Null

            $maxCpuByRole = if ($cpuAttribution.PSObject.Properties["max_one_core_percent_by_role"]) { $cpuAttribution.max_one_core_percent_by_role } else { $null }
            $maxCpuByRolePresent = Test-ObjectHasPropertyNames -Object $maxCpuByRole -Names $cpuAttributionRoleNames
            $checks.Add((New-Check -Name "CPU attribution max by role" -Status ($(if ($maxCpuByRolePresent) { "pass" } else { "fail" })) -Message ($(if ($maxCpuByRolePresent) { "CPU attribution records MUSU/node/WebView2/other max one-core CPU by role" } else { "CPU attribution is missing MUSU/node/WebView2/other max CPU by role" })))) | Out-Null

            $maxCpuBySubrole = if ($cpuAttribution.PSObject.Properties["max_one_core_percent_by_subrole"]) { $cpuAttribution.max_one_core_percent_by_subrole } else { $null }
            $maxCpuBySubrolePresent = Test-ObjectHasPropertyNames -Object $maxCpuBySubrole -Names $cpuAttributionSubroleNames
            $checks.Add((New-Check -Name "CPU attribution max by subrole" -Status ($(if ($maxCpuBySubrolePresent) { "pass" } else { "fail" })) -Message ($(if ($maxCpuBySubrolePresent) { "CPU attribution records max one-core CPU by bridge/runtime/desktop/helper subrole" } else { "CPU attribution is missing max CPU by subrole" })))) | Out-Null

            $requiredRoles = if ($cpuAttribution.PSObject.Properties["required_roles_present"]) { $cpuAttribution.required_roles_present } else { $null }
            $musuRolePresent = ($requiredRoles -and $requiredRoles.PSObject.Properties["musu"] -and [bool]$requiredRoles.musu)
            $checks.Add((New-Check -Name "CPU attribution MUSU role" -Status ($(if ($musuRolePresent) { "pass" } else { "fail" })) -Message ($(if ($musuRolePresent) { "CPU attribution includes MUSU process role" } else { "CPU attribution is missing MUSU process role" })))) | Out-Null
            $webView2RoleRequiredAndPresent = (-not $requireOwnedWebView2 -or ($requiredRoles -and $requiredRoles.PSObject.Properties["webview2"] -and [bool]$requiredRoles.webview2))
            $checks.Add((New-Check -Name "CPU attribution WebView2 role" -Status ($(if ($webView2RoleRequiredAndPresent) { "pass" } else { "fail" })) -Message ($(if ($webView2RoleRequiredAndPresent) { "CPU attribution includes required owned WebView2 role" } else { "CPU attribution is missing required owned WebView2 role" })))) | Out-Null

            $requiredSubroles = if ($cpuAttribution.PSObject.Properties["required_subroles_present"]) { $cpuAttribution.required_subroles_present } else { $null }
            $bridgeRuntimeSubrolePresent = ($requiredSubroles -and $requiredSubroles.PSObject.Properties["bridge_runtime"] -and [bool]$requiredSubroles.bridge_runtime)
            $checks.Add((New-Check -Name "CPU attribution bridge subrole" -Status ($(if ($bridgeRuntimeSubrolePresent) { "pass" } else { "fail" })) -Message ($(if ($bridgeRuntimeSubrolePresent) { "CPU attribution includes bridge runtime subrole" } else { "CPU attribution is missing bridge runtime subrole" })))) | Out-Null
            $desktopShellSubrolePresent = ($requiredSubroles -and $requiredSubroles.PSObject.Properties["desktop_shell"] -and [bool]$requiredSubroles.desktop_shell)
            $checks.Add((New-Check -Name "CPU attribution desktop shell subrole" -Status ($(if ($desktopShellSubrolePresent) { "pass" } else { "fail" })) -Message ($(if ($desktopShellSubrolePresent) { "CPU attribution includes desktop shell subrole" } else { "CPU attribution is missing desktop shell subrole" })))) | Out-Null

            $topProcesses = @(
                if ($cpuAttribution.PSObject.Properties["top_processes"]) {
                    @($cpuAttribution.top_processes)
                }
            )
            $topProcessesPresent = ($topProcesses.Count -gt 0)
            $checks.Add((New-Check -Name "CPU attribution top processes" -Status ($(if ($topProcessesPresent) { "pass" } else { "fail" })) -Message ($(if ($topProcessesPresent) { "$($topProcesses.Count) top CPU process attribution row(s) recorded" } else { "CPU attribution top_processes is empty" })))) | Out-Null

            $badTopProcessRows = @(
                foreach ($row in $topProcesses) {
                    $rowId = if ($row.PSObject.Properties["id"]) { [int]$row.id } else { 0 }
                    $rowName = if ($row.PSObject.Properties["process_name"]) { [string]$row.process_name } else { "" }
                    $rowRole = if ($row.PSObject.Properties["process_role"]) { [string]$row.process_role } else { "" }
                    $rowSubrole = if ($row.PSObject.Properties["process_subrole"]) { [string]$row.process_subrole } else { "" }
                    $hasCpuDelta = $row.PSObject.Properties["cpu_seconds_delta"]
                    $hasCpuPct = $row.PSObject.Properties["cpu_pct_one_core"]
                    if ($rowId -le 0 -or [string]::IsNullOrWhiteSpace($rowName) -or ($rowRole -notin @("musu", "node", "webview2", "other")) -or ($rowSubrole -notin $cpuAttributionSubroleNames) -or -not $hasCpuDelta -or -not $hasCpuPct) {
                        $row
                    }
                }
            )
            $checks.Add((New-Check -Name "CPU attribution top process fields" -Status ($(if ($badTopProcessRows.Count -eq 0 -and $topProcessesPresent) { "pass" } else { "fail" })) -Message ($(if ($badTopProcessRows.Count -eq 0 -and $topProcessesPresent) { "top CPU process rows include PID, role, subrole, and CPU delta fields" } else { "$($badTopProcessRows.Count) top CPU process row(s) are missing required attribution fields" })))) | Out-Null
        }
    }

    $failCount = @($checks | Where-Object { $_.status -eq "fail" }).Count
    [pscustomobject]@{
        ok = ($failCount -eq 0)
        evidence_path = $EvidencePath
        fail_count = $failCount
        operator_machine = if ($evidence -and $evidence.PSObject.Properties["operator_machine"]) { [string]$evidence.operator_machine } else { $null }
        min_sample_seconds = $MinSampleSeconds
        max_one_core_percent = $MaxOneCorePercent
        checks = $checks.ToArray()
    }
}

if (-not [string]::IsNullOrWhiteSpace($VerifyRuntimeIdleCpuEvidencePath)) {
    $runtimeIdleEvidencePath = if ([System.IO.Path]::IsPathRooted($VerifyRuntimeIdleCpuEvidencePath)) {
        [System.IO.Path]::GetFullPath($VerifyRuntimeIdleCpuEvidencePath)
    }
    else {
        [System.IO.Path]::GetFullPath((Join-Path $repoRoot $VerifyRuntimeIdleCpuEvidencePath))
    }

    $verification = Test-RuntimeIdleCpuEvidence `
        -EvidencePath $runtimeIdleEvidencePath `
        -ExpectedVersion $version `
        -ExpectedGitCommit $currentGitCommit `
        -MinSampleSeconds $MinRuntimeIdleCpuSampleSeconds `
        -MaxOneCorePercent $MaxRuntimeIdleCpuOneCorePercent

    if ($Json) {
        $verification | ConvertTo-Json -Depth 10
    }
    else {
        $verification
    }

    if (-not [bool]$verification.ok) {
        exit 1
    }

    exit 0
}

function Test-ProcessOwnershipEvidence {
    param(
        [Parameter(Mandatory = $true)][string]$EvidencePath,
        [Parameter(Mandatory = $true)][string]$ExpectedVersion,
        [Parameter(Mandatory = $true)][string]$ExpectedGitCommit
    )

    $checks = New-Object System.Collections.Generic.List[object]
    $evidence = $null
    try {
        $evidence = Get-Content -LiteralPath $EvidencePath -Raw | ConvertFrom-Json
        $checks.Add((New-Check -Name "parse" -Status "pass" -Message "process ownership evidence parses")) | Out-Null
    }
    catch {
        $checks.Add((New-Check -Name "parse" -Status "fail" -Message "process ownership evidence does not parse: $($_.Exception.Message)")) | Out-Null
    }

    if ($evidence) {
        $schema = [string]$evidence.schema
        $checks.Add((New-Check -Name "schema" -Status ($(if ($schema -eq "musu.process_ownership_audit.v1") { "pass" } else { "fail" })) -Message ($(if ($schema -eq "musu.process_ownership_audit.v1") { "schema is valid" } else { "schema is '$schema'" })))) | Out-Null

        $versionValue = [string]$evidence.version
        $checks.Add((New-Check -Name "version" -Status ($(if ($versionValue -eq $ExpectedVersion) { "pass" } else { "fail" })) -Message ($(if ($versionValue -eq $ExpectedVersion) { "version matches $ExpectedVersion" } else { "version is '$versionValue'" })))) | Out-Null

        $gitCommit = if ($evidence.PSObject.Properties["git_commit"]) { [string]$evidence.git_commit } else { "" }
        $gitCommitValid = ($gitCommit -match "^[0-9a-f]{40}$")
        $checks.Add((New-Check -Name "git commit present" -Status ($(if ($gitCommitValid) { "pass" } else { "fail" })) -Message ($(if ($gitCommitValid) { "git commit is recorded" } else { "git commit is missing or invalid" })))) | Out-Null

        $gitCommitMatchesExpected = ($gitCommit -eq $ExpectedGitCommit)
        $documentationOrStatusOnlyGitDelta = $false
        if (-not $gitCommitMatchesExpected -and $gitCommitValid -and $ExpectedGitCommit -match "^[0-9a-f]{40}$") {
            $documentationOrStatusOnlyGitDelta = Test-DocumentationOrStatusOnlyGitDelta -FromCommit $gitCommit -ToCommit $ExpectedGitCommit
        }
        $checks.Add((New-Check -Name "expected git commit" -Status ($(if ($gitCommitMatchesExpected -or $documentationOrStatusOnlyGitDelta) { "pass" } else { "fail" })) -Message ($(if ($gitCommitMatchesExpected) { "git commit matches current HEAD $ExpectedGitCommit" } elseif ($documentationOrStatusOnlyGitDelta) { "git commit differs from current HEAD $ExpectedGitCommit only by documentation/evidence/status/tooling-only commits" } else { "git commit is '$gitCommit', expected current HEAD '$ExpectedGitCommit' with no runtime-affecting changes after the process ownership evidence commit" })))) | Out-Null

        $okValue = [bool]$evidence.ok
        $checks.Add((New-Check -Name "evidence ok" -Status ($(if ($okValue) { "pass" } else { "fail" })) -Message ($(if ($okValue) { "evidence reports ok=true" } else { "evidence reports ok=false" })))) | Out-Null

        $operatorMachine = ""
        if ($evidence.PSObject.Properties["operator_machine"]) {
            $operatorMachine = [string]$evidence.operator_machine
        }
        $checks.Add((New-Check -Name "operator machine" -Status ($(if (-not [string]::IsNullOrWhiteSpace($operatorMachine)) { "pass" } else { "fail" })) -Message ($(if (-not [string]::IsNullOrWhiteSpace($operatorMachine)) { "operator_machine is present" } else { "operator_machine is missing" })))) | Out-Null

        $recordedAtOk = $false
        if ($evidence.PSObject.Properties["recorded_at"]) {
            try {
                [void][datetimeoffset]::Parse([string]$evidence.recorded_at)
                $recordedAtOk = $true
            }
            catch {
                $recordedAtOk = $false
            }
        }
        $checks.Add((New-Check -Name "recorded timestamp" -Status ($(if ($recordedAtOk) { "pass" } else { "fail" })) -Message ($(if ($recordedAtOk) { "recorded_at parses" } else { "recorded_at is missing or invalid" })))) | Out-Null

        $failCountValue = if ($evidence.PSObject.Properties["fail_count"]) { [int]$evidence.fail_count } else { 1 }
        $checks.Add((New-Check -Name "nested fail count" -Status ($(if ($failCountValue -eq 0) { "pass" } else { "fail" })) -Message ($(if ($failCountValue -eq 0) { "nested process ownership checks passed" } else { "nested process ownership fail_count is $failCountValue" })))) | Out-Null

        $counts = $evidence.process_counts
        $musuRuntimeCount = if ($counts -and $counts.PSObject.Properties["musu_runtime"]) { [int]$counts.musu_runtime } else { 0 }
        $checks.Add((New-Check -Name "MUSU runtime count" -Status ($(if ($musuRuntimeCount -eq 1) { "pass" } else { "fail" })) -Message ($(if ($musuRuntimeCount -eq 1) { "exactly one MUSU runtime process was observed" } else { "$musuRuntimeCount MUSU runtime processes were observed" })))) | Out-Null

        $orphanRepoHelpers = if ($counts -and $counts.PSObject.Properties["orphan_repo_helpers"]) { [int]$counts.orphan_repo_helpers } else { 1 }
        $checks.Add((New-Check -Name "orphan repo helpers" -Status ($(if ($orphanRepoHelpers -eq 0) { "pass" } else { "fail" })) -Message ($(if ($orphanRepoHelpers -eq 0) { "no repo-related orphan Node/WebView2 helpers" } else { "$orphanRepoHelpers repo-related orphan helper(s)" })))) | Out-Null

        $nonPackagedRuntime = if ($counts -and $counts.PSObject.Properties["non_packaged_runtime"]) { [int]$counts.non_packaged_runtime } else { 1 }
        $checks.Add((New-Check -Name "packaged runtime identity" -Status ($(if ($nonPackagedRuntime -eq 0) { "pass" } else { "fail" })) -Message ($(if ($nonPackagedRuntime -eq 0) { "all MUSU runtime processes were packaged WindowsApps runtime(s)" } else { "$nonPackagedRuntime MUSU runtime process(es) were not packaged WindowsApps runtime(s)" })))) | Out-Null

        $nonPackagedDesktop = if ($counts -and $counts.PSObject.Properties["non_packaged_desktop_shell"]) { [int]$counts.non_packaged_desktop_shell } else { 1 }
        $checks.Add((New-Check -Name "packaged desktop shell identity" -Status ($(if ($nonPackagedDesktop -eq 0) { "pass" } else { "fail" })) -Message ($(if ($nonPackagedDesktop -eq 0) { "desktop shell processes were packaged WindowsApps runtime(s) or absent" } else { "$nonPackagedDesktop MUSU desktop shell process(es) were not packaged WindowsApps runtime(s)" })))) | Out-Null

        $bridge = $evidence.bridge_registry
        $bridgePidAlive = ($bridge -and $bridge.PSObject.Properties["pid_alive"] -and [bool]$bridge.pid_alive)
        $checks.Add((New-Check -Name "bridge registry pid alive" -Status ($(if ($bridgePidAlive) { "pass" } else { "fail" })) -Message ($(if ($bridgePidAlive) { "bridge registry pid is alive" } else { "bridge registry pid is missing or dead" })))) | Out-Null

        $bridgeHealthOk = ($bridge -and $bridge.PSObject.Properties["health"] -and [bool]$bridge.health.ok)
        $checks.Add((New-Check -Name "bridge health" -Status ($(if ($bridgeHealthOk) { "pass" } else { "fail" })) -Message ($(if ($bridgeHealthOk) { "bridge /health passed" } else { "bridge /health did not pass" })))) | Out-Null

        $identity = if ($evidence.PSObject.Properties["packaged_runtime_identity"]) { $evidence.packaged_runtime_identity } else { $null }
        $bridgePackagedRuntime = ($identity -and $identity.PSObject.Properties["bridge_pid_packaged_runtime"] -and [bool]$identity.bridge_pid_packaged_runtime)
        $checks.Add((New-Check -Name "bridge packaged runtime identity" -Status ($(if ($bridgePackagedRuntime) { "pass" } else { "fail" })) -Message ($(if ($bridgePackagedRuntime) { "bridge registry PID belongs to the packaged WindowsApps runtime" } else { "bridge registry PID is not proven to belong to the packaged WindowsApps runtime" })))) | Out-Null

        $dashboardRepoRelated = if ($identity -and $identity.PSObject.Properties["dashboard_pid_repo_related"]) { [bool]$identity.dashboard_pid_repo_related } else { $true }
        $checks.Add((New-Check -Name "dashboard server identity" -Status ($(if (-not $dashboardRepoRelated) { "pass" } else { "fail" })) -Message ($(if (-not $dashboardRepoRelated) { "dashboard listener is absent or not repo/workspace-backed" } else { "dashboard listener is repo/workspace-backed or identity evidence is missing" })))) | Out-Null
    }

    $failCount = @($checks | Where-Object { $_.status -eq "fail" }).Count
    [pscustomobject]@{
        ok = ($failCount -eq 0)
        evidence_path = $EvidencePath
        fail_count = $failCount
        git_commit = if ($evidence -and $evidence.PSObject.Properties["git_commit"]) { [string]$evidence.git_commit } else { $null }
        operator_machine = if ($evidence -and $evidence.PSObject.Properties["operator_machine"]) { [string]$evidence.operator_machine } else { $null }
        checks = $checks.ToArray()
    }
}

function Test-StartupSingleInstanceEvidence {
    param(
        [Parameter(Mandatory = $true)][string]$EvidencePath,
        [Parameter(Mandatory = $true)][string]$ExpectedVersion,
        [Parameter(Mandatory = $true)][string]$ExpectedGitCommit
    )

    $checks = New-Object System.Collections.Generic.List[object]
    $evidence = $null
    try {
        $evidence = Get-Content -LiteralPath $EvidencePath -Raw | ConvertFrom-Json
        $checks.Add((New-Check -Name "parse" -Status "pass" -Message "startup single-instance evidence parses")) | Out-Null
    }
    catch {
        $checks.Add((New-Check -Name "parse" -Status "fail" -Message "startup single-instance evidence does not parse: $($_.Exception.Message)")) | Out-Null
    }

    if ($evidence) {
        $schema = [string]$evidence.schema
        $checks.Add((New-Check -Name "schema" -Status ($(if ($schema -eq "musu.startup_single_instance_audit.v1") { "pass" } else { "fail" })) -Message ($(if ($schema -eq "musu.startup_single_instance_audit.v1") { "schema is valid" } else { "schema is '$schema'" })))) | Out-Null

        $versionValue = [string]$evidence.version
        $checks.Add((New-Check -Name "version" -Status ($(if ($versionValue -eq $ExpectedVersion) { "pass" } else { "fail" })) -Message ($(if ($versionValue -eq $ExpectedVersion) { "version matches $ExpectedVersion" } else { "version is '$versionValue'" })))) | Out-Null

        $gitCommit = if ($evidence.PSObject.Properties["git_commit"]) { [string]$evidence.git_commit } else { "" }
        $gitCommitValid = ($gitCommit -match "^[0-9a-f]{40}$")
        $checks.Add((New-Check -Name "git commit present" -Status ($(if ($gitCommitValid) { "pass" } else { "fail" })) -Message ($(if ($gitCommitValid) { "git commit is recorded" } else { "git commit is missing or invalid" })))) | Out-Null

        $gitCommitMatchesExpected = ($gitCommit -eq $ExpectedGitCommit)
        $documentationOrStatusOnlyGitDelta = $false
        if (-not $gitCommitMatchesExpected -and $gitCommitValid -and $ExpectedGitCommit -match "^[0-9a-f]{40}$") {
            $documentationOrStatusOnlyGitDelta = Test-DocumentationOrStatusOnlyGitDelta -FromCommit $gitCommit -ToCommit $ExpectedGitCommit
        }
        $checks.Add((New-Check -Name "expected git commit" -Status ($(if ($gitCommitMatchesExpected -or $documentationOrStatusOnlyGitDelta) { "pass" } else { "fail" })) -Message ($(if ($gitCommitMatchesExpected) { "git commit matches current HEAD $ExpectedGitCommit" } elseif ($documentationOrStatusOnlyGitDelta) { "git commit differs from current HEAD $ExpectedGitCommit only by documentation/evidence/status/tooling-only commits" } else { "git commit is '$gitCommit', expected current HEAD '$ExpectedGitCommit' with no runtime-affecting changes after the startup single-instance evidence commit" })))) | Out-Null

        $okValue = [bool]$evidence.ok
        $checks.Add((New-Check -Name "evidence ok" -Status ($(if ($okValue) { "pass" } else { "fail" })) -Message ($(if ($okValue) { "evidence reports ok=true" } else { "evidence reports ok=false" })))) | Out-Null

        $musuExe = if ($evidence.PSObject.Properties["musu_exe"]) { [string]$evidence.musu_exe } else { "" }
        $musuExeLower = $musuExe.ToLowerInvariant()
        $startupUsesPackagedCommand = (
            $musuExeLower.Contains("\microsoft\windowsapps\musu.exe") -or
            $musuExeLower.Contains("\windowsapps\yellowhama.musu_") -or
            $musuExeLower.Contains("\program files\windowsapps\yellowhama.musu_") -or
            $musuExeLower.Contains("\windowsapps\blossompark.musu_") -or
            $musuExeLower.Contains("\program files\windowsapps\blossompark.musu_")
        )
        $checks.Add((New-Check -Name "startup executable release identity" -Status ($(if ($startupUsesPackagedCommand) { "pass" } else { "fail" })) -Message ($(if ($startupUsesPackagedCommand) { "startup evidence used the packaged WindowsApps MUSU command" } else { "startup evidence used a non-packaged MUSU command: '$musuExe'" })))) | Out-Null

        $operatorMachine = ""
        if ($evidence.PSObject.Properties["operator_machine"]) {
            $operatorMachine = [string]$evidence.operator_machine
        }
        $checks.Add((New-Check -Name "operator machine" -Status ($(if (-not [string]::IsNullOrWhiteSpace($operatorMachine)) { "pass" } else { "fail" })) -Message ($(if (-not [string]::IsNullOrWhiteSpace($operatorMachine)) { "operator_machine is present" } else { "operator_machine is missing" })))) | Out-Null

        $repeatCount = if ($evidence.PSObject.Properties["repeat_count"]) { [int]$evidence.repeat_count } else { 0 }
        $checks.Add((New-Check -Name "repeat count" -Status ($(if ($repeatCount -ge 2) { "pass" } else { "fail" })) -Message ($(if ($repeatCount -ge 2) { "repeat_count is $repeatCount" } else { "repeat_count is $repeatCount; expected at least 2" })))) | Out-Null

        $failCountValue = if ($evidence.PSObject.Properties["fail_count"]) { [int]$evidence.fail_count } else { 1 }
        $checks.Add((New-Check -Name "nested fail count" -Status ($(if ($failCountValue -eq 0) { "pass" } else { "fail" })) -Message ($(if ($failCountValue -eq 0) { "nested startup checks passed" } else { "nested startup fail_count is $failCountValue" })))) | Out-Null

        $counts = $evidence.process_counts
        $afterRuntime = if ($counts -and $counts.PSObject.Properties["after_musu_runtime"]) { [int]$counts.after_musu_runtime } else { 0 }
        $checks.Add((New-Check -Name "runtime count after startup" -Status ($(if ($afterRuntime -eq 1) { "pass" } else { "fail" })) -Message ($(if ($afterRuntime -eq 1) { "exactly one MUSU runtime after repeated startup" } else { "$afterRuntime MUSU runtime process(es) after repeated startup" })))) | Out-Null

        $observedBridgePidCount = if ($counts -and $counts.PSObject.Properties["observed_bridge_pid_count"]) { [int]$counts.observed_bridge_pid_count } else { 0 }
        $checks.Add((New-Check -Name "stable bridge pid" -Status ($(if ($observedBridgePidCount -eq 1) { "pass" } else { "fail" })) -Message ($(if ($observedBridgePidCount -eq 1) { "one stable bridge pid observed" } else { "$observedBridgePidCount bridge pid(s) observed" })))) | Out-Null

        $repeatedSpawnCount = if ($counts -and $counts.PSObject.Properties["repeated_spawn_count"]) { [int]$counts.repeated_spawn_count } else { 1 }
        $checks.Add((New-Check -Name "no repeated spawn" -Status ($(if ($repeatedSpawnCount -eq 0) { "pass" } else { "fail" })) -Message ($(if ($repeatedSpawnCount -eq 0) { "no bridge spawn after the first startup call" } else { "$repeatedSpawnCount repeated bridge spawn(s)" })))) | Out-Null

        $failedInvocationCount = if ($counts -and $counts.PSObject.Properties["failed_invocation_count"]) { [int]$counts.failed_invocation_count } else { 1 }
        $checks.Add((New-Check -Name "startup invocation failures" -Status ($(if ($failedInvocationCount -eq 0) { "pass" } else { "fail" })) -Message ($(if ($failedInvocationCount -eq 0) { "all startup invocations passed" } else { "$failedInvocationCount startup invocation(s) failed" })))) | Out-Null

        $ownership = if ($evidence.PSObject.Properties["process_ownership"]) { $evidence.process_ownership } else { $null }
        $ownershipOk = ($ownership -and $ownership.PSObject.Properties["ok"] -and [bool]$ownership.ok)
        $checks.Add((New-Check -Name "process ownership nested" -Status ($(if ($ownershipOk) { "pass" } else { "fail" })) -Message ($(if ($ownershipOk) { "nested process ownership audit passed" } else { "nested process ownership audit missing or failed" })))) | Out-Null
    }

    $failCount = @($checks | Where-Object { $_.status -eq "fail" }).Count
    [pscustomobject]@{
        ok = ($failCount -eq 0)
        evidence_path = $EvidencePath
        fail_count = $failCount
        git_commit = if ($evidence -and $evidence.PSObject.Properties["git_commit"]) { [string]$evidence.git_commit } else { $null }
        operator_machine = if ($evidence -and $evidence.PSObject.Properties["operator_machine"]) { [string]$evidence.operator_machine } else { $null }
        checks = $checks.ToArray()
    }
}

function Test-DesktopSingleInstanceEvidence {
    param(
        [Parameter(Mandatory = $true)][string]$EvidencePath,
        [Parameter(Mandatory = $true)][string]$ExpectedVersion,
        [Parameter(Mandatory = $true)][string]$ExpectedGitCommit
    )

    $checks = New-Object System.Collections.Generic.List[object]
    $evidence = $null
    try {
        $evidence = Get-Content -LiteralPath $EvidencePath -Raw | ConvertFrom-Json
        $checks.Add((New-Check -Name "parse" -Status "pass" -Message "desktop single-instance evidence parses")) | Out-Null
    }
    catch {
        $checks.Add((New-Check -Name "parse" -Status "fail" -Message "desktop single-instance evidence does not parse: $($_.Exception.Message)")) | Out-Null
    }

    if ($evidence) {
        $schema = [string]$evidence.schema
        $checks.Add((New-Check -Name "schema" -Status ($(if ($schema -eq "musu.desktop_single_instance_audit.v1") { "pass" } else { "fail" })) -Message ($(if ($schema -eq "musu.desktop_single_instance_audit.v1") { "schema is valid" } else { "schema is '$schema'" })))) | Out-Null

        $versionValue = [string]$evidence.version
        $checks.Add((New-Check -Name "version" -Status ($(if ($versionValue -eq $ExpectedVersion) { "pass" } else { "fail" })) -Message ($(if ($versionValue -eq $ExpectedVersion) { "version matches $ExpectedVersion" } else { "version is '$versionValue'" })))) | Out-Null

        $gitCommit = if ($evidence.PSObject.Properties["git_commit"]) { [string]$evidence.git_commit } else { "" }
        $gitCommitValid = ($gitCommit -match "^[0-9a-f]{40}$")
        $checks.Add((New-Check -Name "git commit present" -Status ($(if ($gitCommitValid) { "pass" } else { "fail" })) -Message ($(if ($gitCommitValid) { "git commit is recorded" } else { "git commit is missing or invalid" })))) | Out-Null

        $gitCommitMatchesExpected = ($gitCommit -eq $ExpectedGitCommit)
        $documentationOrStatusOnlyGitDelta = $false
        if (-not $gitCommitMatchesExpected -and $gitCommitValid -and $ExpectedGitCommit -match "^[0-9a-f]{40}$") {
            $documentationOrStatusOnlyGitDelta = Test-DocumentationOrStatusOnlyGitDelta -FromCommit $gitCommit -ToCommit $ExpectedGitCommit
        }
        $checks.Add((New-Check -Name "expected git commit" -Status ($(if ($gitCommitMatchesExpected -or $documentationOrStatusOnlyGitDelta) { "pass" } else { "fail" })) -Message ($(if ($gitCommitMatchesExpected) { "git commit matches current HEAD $ExpectedGitCommit" } elseif ($documentationOrStatusOnlyGitDelta) { "git commit differs from current HEAD $ExpectedGitCommit only by documentation/evidence/status/tooling-only commits" } else { "git commit is '$gitCommit', expected current HEAD '$ExpectedGitCommit' with no runtime-affecting changes after the desktop single-instance evidence commit" })))) | Out-Null

        $okValue = [bool]$evidence.ok
        $checks.Add((New-Check -Name "evidence ok" -Status ($(if ($okValue) { "pass" } else { "fail" })) -Message ($(if ($okValue) { "evidence reports ok=true" } else { "evidence reports ok=false" })))) | Out-Null

        $operatorMachine = ""
        if ($evidence.PSObject.Properties["operator_machine"]) {
            $operatorMachine = [string]$evidence.operator_machine
        }
        $checks.Add((New-Check -Name "operator machine" -Status ($(if (-not [string]::IsNullOrWhiteSpace($operatorMachine)) { "pass" } else { "fail" })) -Message ($(if (-not [string]::IsNullOrWhiteSpace($operatorMachine)) { "operator_machine is present" } else { "operator_machine is missing" })))) | Out-Null

        $recordedAtOk = $false
        if ($evidence.PSObject.Properties["recorded_at"]) {
            try {
                [void][datetimeoffset]::Parse([string]$evidence.recorded_at)
                $recordedAtOk = $true
            }
            catch {
                $recordedAtOk = $false
            }
        }
        $checks.Add((New-Check -Name "recorded timestamp" -Status ($(if ($recordedAtOk) { "pass" } else { "fail" })) -Message ($(if ($recordedAtOk) { "recorded_at parses" } else { "recorded_at is missing or invalid" })))) | Out-Null

        $appUserModelId = if ($evidence.PSObject.Properties["app_user_model_id"]) { [string]$evidence.app_user_model_id } else { "" }
        $checks.Add((New-Check -Name "AppUserModelId" -Status ($(if (-not [string]::IsNullOrWhiteSpace($appUserModelId)) { "pass" } else { "fail" })) -Message ($(if (-not [string]::IsNullOrWhiteSpace($appUserModelId)) { "AppUserModelId is recorded" } else { "AppUserModelId is missing" })))) | Out-Null

        $repeatCount = if ($evidence.PSObject.Properties["repeat_count"]) { [int]$evidence.repeat_count } else { 0 }
        $checks.Add((New-Check -Name "repeat count" -Status ($(if ($repeatCount -ge 2) { "pass" } else { "fail" })) -Message ($(if ($repeatCount -ge 2) { "repeat_count is $repeatCount" } else { "repeat_count is $repeatCount; expected at least 2" })))) | Out-Null

        $failCountValue = if ($evidence.PSObject.Properties["fail_count"]) { [int]$evidence.fail_count } else { 1 }
        $checks.Add((New-Check -Name "nested fail count" -Status ($(if ($failCountValue -eq 0) { "pass" } else { "fail" })) -Message ($(if ($failCountValue -eq 0) { "nested desktop activation checks passed" } else { "nested desktop activation fail_count is $failCountValue" })))) | Out-Null

        $counts = $evidence.process_counts
        $maxDesktopProcessCount = if ($evidence.PSObject.Properties["max_desktop_process_count"]) { [int]$evidence.max_desktop_process_count } else { 1 }
        $afterDesktopShell = if ($counts -and $counts.PSObject.Properties["after_desktop_shell"]) { [int]$counts.after_desktop_shell } else { 999 }
        $checks.Add((New-Check -Name "desktop shell count after activation" -Status ($(if ($afterDesktopShell -le $maxDesktopProcessCount) { "pass" } else { "fail" })) -Message ($(if ($afterDesktopShell -le $maxDesktopProcessCount) { "desktop shell count $afterDesktopShell <= $maxDesktopProcessCount" } else { "desktop shell count $afterDesktopShell exceeds $maxDesktopProcessCount" })))) | Out-Null

        $newDesktopShell = if ($counts -and $counts.PSObject.Properties["new_desktop_shell"]) { [int]$counts.new_desktop_shell } else { 999 }
        $checks.Add((New-Check -Name "new desktop shell count" -Status ($(if ($newDesktopShell -le $maxDesktopProcessCount) { "pass" } else { "fail" })) -Message ($(if ($newDesktopShell -le $maxDesktopProcessCount) { "new desktop shell count $newDesktopShell <= $maxDesktopProcessCount" } else { "new desktop shell count $newDesktopShell exceeds $maxDesktopProcessCount" })))) | Out-Null

        $activationFailureCount = if ($counts -and $counts.PSObject.Properties["activation_failure_count"]) { [int]$counts.activation_failure_count } else { 1 }
        $checks.Add((New-Check -Name "activation failures" -Status ($(if ($activationFailureCount -eq 0) { "pass" } else { "fail" })) -Message ($(if ($activationFailureCount -eq 0) { "all desktop activation attempts succeeded" } else { "$activationFailureCount desktop activation attempt(s) failed" })))) | Out-Null
    }

    $failCount = @($checks | Where-Object { $_.status -eq "fail" }).Count
    [pscustomobject]@{
        ok = ($failCount -eq 0)
        evidence_path = $EvidencePath
        fail_count = $failCount
        git_commit = if ($evidence -and $evidence.PSObject.Properties["git_commit"]) { [string]$evidence.git_commit } else { $null }
        operator_machine = if ($evidence -and $evidence.PSObject.Properties["operator_machine"]) { [string]$evidence.operator_machine } else { $null }
        checks = $checks.ToArray()
    }
}

$auditScript = Join-Path $scriptDir "audit-desktop-release-readiness.ps1"
$frontendPollingAuditScript = Join-Path $scriptDir "audit-frontend-polling-contract.ps1"
$rustBackgroundLoopAuditScript = Join-Path $scriptDir "audit-rust-background-loop-contract.ps1"
$localApiAuthAuditScript = Join-Path $scriptDir "audit-local-api-auth-contract.ps1"
$operatorApiSecurityAuditScript = Join-Path $scriptDir "audit-operator-api-security-contract.ps1"
$degradedModeAuditScript = Join-Path $scriptDir "audit-degraded-mode-contract.ps1"
$crashRecoveryAuditScript = Join-Path $scriptDir "audit-musu-crash-recovery-contract.ps1"
$p2pStoreForwardRelayAuditScript = Join-Path $scriptDir "audit-p2p-store-forward-relay-contract.ps1"
$secretStorageAuditScript = Join-Path $scriptDir "audit-secret-storage-contract.ps1"
$metadataScript = Join-Path $scriptDir "verify-store-public-metadata.ps1"
$manifestScript = Join-Path $scriptDir "write-release-candidate-manifest.ps1"
$supportMailboxVerifierScript = Join-Path $scriptDir "verify-support-mailbox-evidence.ps1"
$supportOperatorGateRetirementVerifierScript = Join-Path $scriptDir "verify-support-operator-gate-retirement.ps1"
$msixInstallVerifierScript = Join-Path $scriptDir "verify-msix-install-evidence.ps1"
$msixDesktopEntrypointAuditScript = Join-Path $scriptDir "audit-msix-desktop-entrypoint.ps1"
$msixLegacyConflictsScript = Join-Path $scriptDir "check-msix-legacy-conflicts.ps1"
$storeReleaseVerifierScript = Join-Path $scriptDir "verify-store-release-evidence.ps1"
$runtimeCpuScenarioMatrixVerifierScript = Join-Path $scriptDir "verify-runtime-cpu-scenario-matrix.ps1"
$p2pControlPlaneVerifierScript = Join-Path $scriptDir "verify-p2p-control-plane-evidence.ps1"
$directRouteVerifierScript = Join-Path $scriptDir "verify-direct-route-evidence.ps1"
$brainProductVerifierScript = Join-Path $scriptDir "verify-brain-product-proof.ps1"
$v34SelfHealVerifierScript = Join-Path $scriptDir "verify-v34-self-heal-proof.ps1"
$privateMeshReleaseProofArchiveVerifierScript = Join-Path $scriptDir "verify-private-mesh-release-proof-archive.ps1"
$p2pEnvStatusScript = Join-Path $scriptDir "show-musu-pro-p2p-env-status.ps1"
$manifestPath = Join-Path $repoRoot ".local-build\release-candidates\$version\release-candidate-manifest.json"
$goNoGoScratchRoot = Join-Path $repoRoot ".local-build\go-no-go\scratch"
$goNoGoScratchDir = Join-Path $goNoGoScratchRoot ("run-{0}-{1}" -f $PID, [guid]::NewGuid().ToString("N"))

$auditResult = Invoke-JsonScript -FilePath $auditScript -Arguments @("-Json")
$audit = $auditResult.json
$frontendPollingAuditResult = Invoke-JsonScript -FilePath $frontendPollingAuditScript -Arguments @("-Json") -AllowFailure
$frontendPollingContractVerified = ($frontendPollingAuditResult.json -and [bool]$frontendPollingAuditResult.json.ok)
$rustBackgroundLoopAuditResult = Invoke-JsonScript -FilePath $rustBackgroundLoopAuditScript -Arguments @("-Json") -AllowFailure
$rustBackgroundLoopContractVerified = ($rustBackgroundLoopAuditResult.json -and [bool]$rustBackgroundLoopAuditResult.json.ok)
$localApiAuthAuditResult = Invoke-JsonScript -FilePath $localApiAuthAuditScript -Arguments @("-Json") -AllowFailure
$localApiAuthContractVerified = ($localApiAuthAuditResult.json -and [bool]$localApiAuthAuditResult.json.ok)
$operatorApiSecurityAuditResult = Invoke-JsonScript -FilePath $operatorApiSecurityAuditScript -Arguments @("-Json") -AllowFailure
$operatorApiSecurityContractVerified = ($operatorApiSecurityAuditResult.json -and [bool]$operatorApiSecurityAuditResult.json.ok)
$degradedModeAuditResult = Invoke-JsonScript -FilePath $degradedModeAuditScript -Arguments @("-Json") -AllowFailure
$degradedModeContractVerified = ($degradedModeAuditResult.json -and [bool]$degradedModeAuditResult.json.ok)
$crashRecoveryAuditResult = Invoke-JsonScript -FilePath $crashRecoveryAuditScript -Arguments @("-Json") -AllowFailure
$crashRecoveryContractVerified = ($crashRecoveryAuditResult.json -and [bool]$crashRecoveryAuditResult.json.ok)
$p2pStoreForwardRelayAuditResult = Invoke-JsonScript -FilePath $p2pStoreForwardRelayAuditScript -Arguments @("-Json") -AllowFailure
$p2pStoreForwardRelayContractVerified = ($p2pStoreForwardRelayAuditResult.json -and [bool]$p2pStoreForwardRelayAuditResult.json.ok)
$secretStorageAuditResult = Invoke-JsonScript -FilePath $secretStorageAuditScript -Arguments @("-Json") -AllowFailure
$secretStorageContractVerified = ($secretStorageAuditResult.json -and [bool]$secretStorageAuditResult.json.ok)
$msixStoreDesktopEntrypointArtifactAuditResult = Invoke-JsonScript `
    -FilePath $msixDesktopEntrypointAuditScript `
    -Arguments @("-StartupContract", "store-reviewed-immediate-registration", "-ExpectedApplicationExecutable", "musu-desktop.exe", "-Json") `
    -AllowFailure
$msixLocalDesktopEntrypointInstalledAuditResult = Invoke-JsonScript `
    -FilePath $msixDesktopEntrypointAuditScript `
    -Arguments @("-StartupContract", "local-sideload-manual", "-ExpectedApplicationExecutable", "musu-desktop.exe", "-RequireInstalledPackage", "-Json") `
    -AllowFailure
$msixLegacyConflictsResult = Invoke-JsonScript `
    -FilePath $msixLegacyConflictsScript `
    -Arguments @("-Json") `
    -AllowFailure
$msixCurrentLegacyConflictsOk = ($msixLegacyConflictsResult.json -and [bool]$msixLegacyConflictsResult.json.ok)
$msixDesktopEntrypointVerified = (
    $msixStoreDesktopEntrypointArtifactAuditResult.json -and
    [bool]$msixStoreDesktopEntrypointArtifactAuditResult.json.ok -and
    $msixLocalDesktopEntrypointInstalledAuditResult.json -and
    [bool]$msixLocalDesktopEntrypointInstalledAuditResult.json.ok
)

New-Item -ItemType Directory -Force -Path $goNoGoScratchDir | Out-Null
$readinessAuditForManifestPath = Join-Path $goNoGoScratchDir "readiness-audit-for-manifest.json"
$audit | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $readinessAuditForManifestPath -Encoding UTF8

$manifestResult = Invoke-JsonScript `
    -FilePath $manifestScript `
    -Arguments @("-ReadinessAuditJsonPath", $readinessAuditForManifestPath) `
    -AllowFailure `
    -ExpectJson $false
$manifestGenerationError = ""
if ($manifestResult.timed_out) {
    $manifestGenerationError = "Release candidate manifest generation timed out after ${ScriptTimeoutSeconds}s."
}
elseif ($manifestResult.exit_code -ne 0) {
    $manifestRawLines = @(
        ([string]$manifestResult.raw) -split "\r?\n" |
            Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) }
    )
    $manifestSummary = if ($manifestRawLines.Count -gt 0) {
        [string]$manifestRawLines[0]
    }
    else {
        "exit_code=$($manifestResult.exit_code)"
    }
    $manifestGenerationError = "Release candidate manifest generation failed: $manifestSummary"
}
$manifestGenerationOk = [string]::IsNullOrWhiteSpace($manifestGenerationError)
$manifest = if ($manifestGenerationOk -and (Test-Path -LiteralPath $manifestPath)) {
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
            -Arguments @("-EvidencePath", $supportMailboxEvidenceCandidate.FullName, "-ExpectedVersion", $version, "-Json") `
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

$supportOperatorGateRetirementLookup = Get-LatestJsonEvidence `
    -EvidenceName "support-operator-gate-retirement" `
    -Version $version `
    -Schema "musu.support_operator_gate_retirement.v1" `
    -Filter "*.support-operator-gate-retirement.json"
$supportOperatorGateRetirementEvidence = $supportOperatorGateRetirementLookup.json
$supportOperatorGateRetirementVerificationResult = $null
if ([bool]$supportOperatorGateRetirementLookup.found) {
    $supportOperatorGateRetirementVerificationResult = Invoke-JsonScript `
        -FilePath $supportOperatorGateRetirementVerifierScript `
        -Arguments @(
            "-EvidencePath", $supportOperatorGateRetirementLookup.path,
            "-ExpectedVersion", $version,
            "-ExpectedSupportEmail", $supportEmail,
            "-Json"
        ) `
        -AllowFailure
}
$supportOperatorGateRetirementVerified = (
    $supportOperatorGateRetirementVerificationResult -and
    $supportOperatorGateRetirementVerificationResult.json -and
    [bool]$supportOperatorGateRetirementVerificationResult.json.ok
)
$supportOperatorEvidenceVerified = ([bool]$supportMailboxVerified -or [bool]$supportOperatorGateRetirementVerified)

$msixInstallVerified = $false
$msixInstallEvidence = $null
$msixInstallEvidenceCandidates = @()
$msixInstallEvidenceResults = @()
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
        $msixInstallEvidenceCandidates += @(Get-ChildItem -LiteralPath $root.path -Filter $root.filter -File -ErrorAction SilentlyContinue)
    }
}

$msixInstallSelectedCandidates = Select-LatestEvidenceCandidatesByMachine -Candidates $msixInstallEvidenceCandidates -MaxPerMachine 6 -MaxUnknown 6
foreach ($candidate in @($msixInstallSelectedCandidates | Sort-Object LastWriteTime -Descending)) {
    $msixInstallEvidenceResult = Invoke-JsonScript `
        -FilePath $msixInstallVerifierScript `
        -Arguments @("-EvidencePath", $candidate.FullName, "-ExpectedVersion", $version, "-Json") `
        -AllowFailure
    if ($msixInstallEvidenceResult.json) {
        $msixInstallEvidenceResults += $msixInstallEvidenceResult.json
    }
    else {
        $msixInstallEvidenceResults += [pscustomobject]@{
            ok = $false
            evidence_path = $candidate.FullName
            raw = $msixInstallEvidenceResult.raw
        }
    }
    if ($msixInstallEvidenceResult.json -and [bool]$msixInstallEvidenceResult.json.ok) {
        $msixInstallVerified = $true
        $msixInstallEvidence = $msixInstallEvidenceResult.json
        break
    }
}

if (-not $msixInstallVerified) {
    if ($msixInstallEvidenceResults.Count -gt 0) {
        $msixInstallEvidence = [pscustomobject]@{
            ok = $false
            candidate_count = $msixInstallEvidenceResults.Count
            available_candidate_count = @($msixInstallEvidenceCandidates).Count
            candidate_selection = "latest-per-machine-up-to-6"
            candidates = $msixInstallEvidenceResults
        }
    }
    elseif (@($msixInstallEvidenceCandidates).Count -gt 0) {
        $msixInstallEvidence = [pscustomobject]@{
            ok = $false
            candidate_count = 0
            available_candidate_count = @($msixInstallEvidenceCandidates).Count
            candidate_selection = "latest-per-machine-up-to-6"
            candidates = @()
        }
    }
}

$runtimeIdleCpuVerified = $false
$runtimeIdleCpuEvidence = $null
$runtimeIdleCpuEvidenceCandidates = @()
$runtimeIdleCpuEvidenceRoots = @(
    [pscustomobject]@{
        path = (Join-Path $repoRoot ("docs\evidence\runtime-idle-cpu\{0}" -f $version))
        filter = "*.json"
    },
    [pscustomobject]@{
        path = (Join-Path $repoRoot ".local-build\runtime-idle-cpu")
        filter = "*.json"
    }
)

foreach ($root in $runtimeIdleCpuEvidenceRoots) {
    if (Test-Path -LiteralPath $root.path) {
        $runtimeIdleCpuEvidenceCandidates += @(Get-ChildItem -LiteralPath $root.path -Filter $root.filter -File -ErrorAction SilentlyContinue)
    }
}

$runtimeIdleCpuEvidenceResults = @()
$runtimeIdleCpuMachines = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
$runtimeIdleCpuSelectedCandidates = Select-LatestEvidenceCandidatesByMachine -Candidates $runtimeIdleCpuEvidenceCandidates -MaxPerMachine 12 -MaxUnknown 12
foreach ($candidate in @($runtimeIdleCpuSelectedCandidates | Sort-Object LastWriteTime -Descending)) {
    $verification = Test-RuntimeIdleCpuEvidence `
        -EvidencePath $candidate.FullName `
        -ExpectedVersion $version `
        -ExpectedGitCommit $currentGitCommit `
        -MinSampleSeconds $MinRuntimeIdleCpuSampleSeconds `
        -MaxOneCorePercent $MaxRuntimeIdleCpuOneCorePercent
    $runtimeIdleCpuEvidenceResults += $verification
    if ([bool]$verification.ok -and -not [string]::IsNullOrWhiteSpace([string]$verification.operator_machine)) {
        [void]$runtimeIdleCpuMachines.Add([string]$verification.operator_machine)
    }
}

$runtimeIdleCpuVerified = ($runtimeIdleCpuMachines.Count -ge $MinRuntimeIdleCpuMachineCount)
$runtimeIdleCpuEvidence = [pscustomobject]@{
    ok = [bool]$runtimeIdleCpuVerified
    min_machine_count = $MinRuntimeIdleCpuMachineCount
    valid_machine_count = $runtimeIdleCpuMachines.Count
    valid_machines = @($runtimeIdleCpuMachines)
    candidate_count = $runtimeIdleCpuEvidenceResults.Count
    available_candidate_count = @($runtimeIdleCpuEvidenceCandidates).Count
    candidate_selection = "latest-per-machine-up-to-12"
    candidates = $runtimeIdleCpuEvidenceResults
}

$runtimeCpuScenarioMatrixVerified = $false
$runtimeCpuScenarioMatrixEvidence = $null
$runtimeCpuScenarioMatrixCandidates = @()
# Release gate for musu.runtime_cpu_scenario_matrix.v1 evidence.
$runtimeCpuScenarioMatrixRoots = @(
    [pscustomobject]@{
        path = (Join-Path $repoRoot ("docs\evidence\runtime-cpu-scenarios\{0}" -f $version))
        filter = "*.runtime-cpu-scenario-matrix.json"
        recurse = $false
    },
    [pscustomobject]@{
        path = (Join-Path $repoRoot ".local-build\runtime-cpu-scenarios")
        filter = "*.runtime-cpu-scenario-matrix.json"
        recurse = $true
    }
)

foreach ($root in $runtimeCpuScenarioMatrixRoots) {
    if (Test-Path -LiteralPath $root.path) {
        $runtimeCpuScenarioMatrixCandidates += @(
            Get-ChildItem -LiteralPath $root.path -Filter $root.filter -File -Recurse:([bool]$root.recurse) -ErrorAction SilentlyContinue
        )
    }
}

$runtimeCpuScenarioMatrixResults = @()
$runtimeCpuScenarioMatrixMachines = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
$script:runtimeCpuScenarioMatrixGitDeltaCache = @{}
$runtimeCpuScenarioMatrixSelectedCandidates = Select-RuntimeCpuScenarioMatrixCandidates -Candidates $runtimeCpuScenarioMatrixCandidates -RequiredScenarios $RequiredRuntimeCpuScenarioMatrixScenarios -MaxPerMachine 12 -MaxUnknown 12
$runtimeCpuScenarioMatrixShapeCache = @{}
function Get-SelectedRuntimeCpuScenarioMatrixShape {
    param([Parameter(Mandatory = $true)]$Candidate)

    $key = [string]$Candidate.FullName
    if (-not $runtimeCpuScenarioMatrixShapeCache.ContainsKey($key)) {
        $runtimeCpuScenarioMatrixShapeCache[$key] = Get-RuntimeCpuScenarioMatrixCandidateShape -Candidate $Candidate
    }
    return $runtimeCpuScenarioMatrixShapeCache[$key]
}

$runtimeCpuScenarioMatrixVerificationCandidates = @(
    $runtimeCpuScenarioMatrixSelectedCandidates | Where-Object {
        $shape = Get-SelectedRuntimeCpuScenarioMatrixShape -Candidate $_
        Test-StringSetContainsAll -Values $shape.scenario_names -Required $RequiredRuntimeCpuScenarioMatrixScenarios
    }
)
$runtimeCpuScenarioMatrixPrefilteredCount = 0
foreach ($candidate in @($runtimeCpuScenarioMatrixVerificationCandidates | Sort-Object LastWriteTime -Descending)) {
    $shape = Get-SelectedRuntimeCpuScenarioMatrixShape -Candidate $candidate
    $preflight = Test-RuntimeCpuScenarioMatrixCandidatePreflight `
        -Shape $shape `
        -ExpectedVersion $version `
        -ExpectedGitCommit $currentGitCommit `
        -RequiredScenarios $RequiredRuntimeCpuScenarioMatrixScenarios `
        -MinSampleSeconds $MinRuntimeIdleCpuSampleSeconds
    if (-not [bool]$preflight.ok) {
        $runtimeCpuScenarioMatrixResults += New-RuntimeCpuScenarioMatrixPrefilteredResult -Candidate $candidate -Shape $shape -Preflight $preflight
        $runtimeCpuScenarioMatrixPrefilteredCount += 1
        continue
    }

    $matrixArgs = @(
        "-EvidencePath", $candidate.FullName,
        "-ExpectedVersion", $version,
        "-ExpectedGitCommit", $currentGitCommit,
        "-RequiredScenarios", ($RequiredRuntimeCpuScenarioMatrixScenarios -join ",")
    ) + @(
        "-MinSampleSeconds", ([string]$MinRuntimeIdleCpuSampleSeconds),
        "-MaxOneCorePercent", ([string]$MaxRuntimeIdleCpuOneCorePercent),
        "-RequirePostRouteProbe",
        "-Json"
    )
    $verification = Invoke-JsonScript `
        -FilePath $runtimeCpuScenarioMatrixVerifierScript `
        -Arguments $matrixArgs `
        -AllowFailure
    $runtimeCpuScenarioMatrixResults += if ($verification.json) {
        $verification.json
    }
    else {
        [pscustomobject]@{
            ok = $false
            evidence_path = $candidate.FullName
            raw = $verification.raw
        }
    }
    $latestMatrixResult = $runtimeCpuScenarioMatrixResults | Select-Object -Last 1
    if ([bool]$latestMatrixResult.ok -and -not [string]::IsNullOrWhiteSpace([string]$latestMatrixResult.operator_machine)) {
        [void]$runtimeCpuScenarioMatrixMachines.Add([string]$latestMatrixResult.operator_machine)
    }
}

$runtimeCpuScenarioMatrixVerified = ($runtimeCpuScenarioMatrixMachines.Count -ge $MinRuntimeCpuScenarioMatrixMachineCount)
$runtimeCpuScenarioMatrixEvidence = [pscustomobject]@{
    ok = [bool]$runtimeCpuScenarioMatrixVerified
    min_machine_count = $MinRuntimeCpuScenarioMatrixMachineCount
    valid_machine_count = $runtimeCpuScenarioMatrixMachines.Count
    valid_machines = @($runtimeCpuScenarioMatrixMachines)
    candidate_count = $runtimeCpuScenarioMatrixResults.Count
    available_candidate_count = @($runtimeCpuScenarioMatrixCandidates).Count
    selected_candidate_count = @($runtimeCpuScenarioMatrixSelectedCandidates).Count
    verifier_candidate_count = @($runtimeCpuScenarioMatrixVerificationCandidates).Count
    preflight_skipped_candidate_count = $runtimeCpuScenarioMatrixPrefilteredCount
    candidate_selection = "latest-per-machine-up-to-12-plus-complete-scenario-and-target-route-candidates-prefiltered-by-required-scenarios"
    required_scenarios = @($RequiredRuntimeCpuScenarioMatrixScenarios)
    candidates = $runtimeCpuScenarioMatrixResults
}

$runtimeCpuSecondPcRouteAttemptVerified = $false
$runtimeCpuSecondPcRouteAttemptResults = @()
$runtimeCpuSecondPcRouteAttemptMachines = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
$runtimeCpuSecondPcRouteAttemptRequiredScenarios = @("post-route")
$runtimeCpuSecondPcRouteAttemptSelectedCandidates = @(
    $runtimeCpuScenarioMatrixSelectedCandidates | Where-Object {
        $shape = Get-SelectedRuntimeCpuScenarioMatrixShape -Candidate $_
        [bool]$shape.has_target_post_route_probe
    }
)
$runtimeCpuSecondPcRouteAttemptPrefilteredCount = 0
foreach ($candidate in @($runtimeCpuSecondPcRouteAttemptSelectedCandidates | Sort-Object LastWriteTime -Descending)) {
    $shape = Get-SelectedRuntimeCpuScenarioMatrixShape -Candidate $candidate
    $preflight = Test-RuntimeCpuScenarioMatrixCandidatePreflight `
        -Shape $shape `
        -ExpectedVersion $version `
        -ExpectedGitCommit $currentGitCommit `
        -RequiredScenarios $runtimeCpuSecondPcRouteAttemptRequiredScenarios `
        -MinSampleSeconds $MinRuntimeIdleCpuSampleSeconds `
        -RequireTargetPostRoute
    if (-not [bool]$preflight.ok) {
        $runtimeCpuSecondPcRouteAttemptResults += New-RuntimeCpuScenarioMatrixPrefilteredResult -Candidate $candidate -Shape $shape -Preflight $preflight
        $runtimeCpuSecondPcRouteAttemptPrefilteredCount += 1
        continue
    }

    $targetAttemptArgs = @(
        "-EvidencePath", $candidate.FullName,
        "-ExpectedVersion", $version,
        "-ExpectedGitCommit", $currentGitCommit,
        "-RequiredScenarios", ($runtimeCpuSecondPcRouteAttemptRequiredScenarios -join ",")
    ) + @(
        "-MinSampleSeconds", ([string]$MinRuntimeIdleCpuSampleSeconds),
        "-MaxOneCorePercent", ([string]$MaxRuntimeIdleCpuOneCorePercent),
        "-RequirePostRouteProbe",
        "-RequirePostRouteTarget",
        "-RejectSelfPostRouteTarget",
        "-RejectLocalPostRouteTarget",
        "-AllowFailedPostRouteProbe",
        "-Json"
    )
    $verification = Invoke-JsonScript `
        -FilePath $runtimeCpuScenarioMatrixVerifierScript `
        -Arguments $targetAttemptArgs `
        -AllowFailure
    $runtimeCpuSecondPcRouteAttemptResults += if ($verification.json) {
        $verification.json
    }
    else {
        [pscustomobject]@{
            ok = $false
            evidence_path = $candidate.FullName
            raw = $verification.raw
        }
    }
    $latestTargetAttemptResult = $runtimeCpuSecondPcRouteAttemptResults | Select-Object -Last 1
    if ([bool]$latestTargetAttemptResult.ok -and -not [string]::IsNullOrWhiteSpace([string]$latestTargetAttemptResult.operator_machine)) {
        [void]$runtimeCpuSecondPcRouteAttemptMachines.Add([string]$latestTargetAttemptResult.operator_machine)
    }
}

$runtimeCpuSecondPcRouteAttemptVerified = ($runtimeCpuSecondPcRouteAttemptMachines.Count -ge $MinRuntimeCpuSecondPcRouteAttemptMachineCount)
$runtimeCpuSecondPcRouteAttemptEvidence = [pscustomobject]@{
    ok = [bool]$runtimeCpuSecondPcRouteAttemptVerified
    min_machine_count = $MinRuntimeCpuSecondPcRouteAttemptMachineCount
    valid_machine_count = $runtimeCpuSecondPcRouteAttemptMachines.Count
    valid_machines = @($runtimeCpuSecondPcRouteAttemptMachines)
    candidate_count = $runtimeCpuSecondPcRouteAttemptResults.Count
    available_candidate_count = @($runtimeCpuScenarioMatrixCandidates).Count
    selected_candidate_count = @($runtimeCpuScenarioMatrixSelectedCandidates).Count
    verifier_candidate_count = @($runtimeCpuSecondPcRouteAttemptSelectedCandidates).Count
    preflight_skipped_candidate_count = $runtimeCpuSecondPcRouteAttemptPrefilteredCount
    candidate_selection = "latest-per-machine-up-to-12-plus-complete-scenario-and-target-route-candidates-prefiltered-by-target-post-route"
    required_scenarios = @($runtimeCpuSecondPcRouteAttemptRequiredScenarios)
    route_probe = "post-route target route attempt, success or explicitly allowed failure"
    candidates = $runtimeCpuSecondPcRouteAttemptResults
}

$processOwnershipVerified = $false
$processOwnershipEvidence = $null
$processOwnershipEvidenceCandidates = @()
$processOwnershipEvidenceRoots = @(
    [pscustomobject]@{
        path = (Join-Path $repoRoot ("docs\evidence\process-ownership\{0}" -f $version))
        filter = "*.json"
    },
    [pscustomobject]@{
        path = (Join-Path $repoRoot ".local-build\process-ownership")
        filter = "*.json"
    }
)

foreach ($root in $processOwnershipEvidenceRoots) {
    if (Test-Path -LiteralPath $root.path) {
        $processOwnershipEvidenceCandidates += @(Get-ChildItem -LiteralPath $root.path -Filter $root.filter -File -ErrorAction SilentlyContinue)
    }
}

$processOwnershipEvidenceResults = @()
$processOwnershipMachines = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
$processOwnershipSelectedCandidates = Select-LatestEvidenceCandidatesByMachine -Candidates $processOwnershipEvidenceCandidates -MaxPerMachine 3 -MaxUnknown 6
foreach ($candidate in @($processOwnershipSelectedCandidates | Sort-Object LastWriteTime -Descending)) {
    $verification = Test-ProcessOwnershipEvidence `
        -EvidencePath $candidate.FullName `
        -ExpectedVersion $version `
        -ExpectedGitCommit $currentGitCommit
    $processOwnershipEvidenceResults += $verification
    if ([bool]$verification.ok -and -not [string]::IsNullOrWhiteSpace([string]$verification.operator_machine)) {
        [void]$processOwnershipMachines.Add([string]$verification.operator_machine)
    }
}

$processOwnershipVerified = ($processOwnershipMachines.Count -ge $MinProcessOwnershipMachineCount)
$processOwnershipEvidence = [pscustomobject]@{
    ok = [bool]$processOwnershipVerified
    min_machine_count = $MinProcessOwnershipMachineCount
    valid_machine_count = $processOwnershipMachines.Count
    valid_machines = @($processOwnershipMachines)
    candidate_count = $processOwnershipEvidenceResults.Count
    available_candidate_count = @($processOwnershipEvidenceCandidates).Count
    candidate_selection = "latest-per-machine"
    candidates = $processOwnershipEvidenceResults
}

$startupSingleInstanceVerified = $false
$startupSingleInstanceEvidence = $null
$startupSingleInstanceEvidenceCandidates = @()
$startupSingleInstanceEvidenceRoots = @(
    [pscustomobject]@{
        path = (Join-Path $repoRoot ("docs\evidence\startup-single-instance\{0}" -f $version))
        filter = "*.json"
    },
    [pscustomobject]@{
        path = (Join-Path $repoRoot ".local-build\startup-single-instance")
        filter = "*.json"
    }
)

foreach ($root in $startupSingleInstanceEvidenceRoots) {
    if (Test-Path -LiteralPath $root.path) {
        $startupSingleInstanceEvidenceCandidates += @(
            Get-ChildItem -LiteralPath $root.path -Filter $root.filter -File -ErrorAction SilentlyContinue |
                Where-Object { $_.Name -notlike "*.process-ownership.json" }
        )
    }
}

$startupSingleInstanceEvidenceResults = @()
$startupSingleInstanceMachines = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
$startupSingleInstanceSelectedCandidates = Select-LatestEvidenceCandidatesByMachine -Candidates $startupSingleInstanceEvidenceCandidates -MaxPerMachine 3 -MaxUnknown 6
foreach ($candidate in @($startupSingleInstanceSelectedCandidates | Sort-Object LastWriteTime -Descending)) {
    $verification = Test-StartupSingleInstanceEvidence `
        -EvidencePath $candidate.FullName `
        -ExpectedVersion $version `
        -ExpectedGitCommit $currentGitCommit
    $startupSingleInstanceEvidenceResults += $verification
    if ([bool]$verification.ok -and -not [string]::IsNullOrWhiteSpace([string]$verification.operator_machine)) {
        [void]$startupSingleInstanceMachines.Add([string]$verification.operator_machine)
    }
}

$startupSingleInstanceVerified = ($startupSingleInstanceMachines.Count -ge $MinStartupSingleInstanceMachineCount)
$startupSingleInstanceEvidence = [pscustomobject]@{
    ok = [bool]$startupSingleInstanceVerified
    min_machine_count = $MinStartupSingleInstanceMachineCount
    valid_machine_count = $startupSingleInstanceMachines.Count
    valid_machines = @($startupSingleInstanceMachines)
    candidate_count = $startupSingleInstanceEvidenceResults.Count
    available_candidate_count = @($startupSingleInstanceEvidenceCandidates).Count
    candidate_selection = "latest-per-machine"
    candidates = $startupSingleInstanceEvidenceResults
}

$desktopSingleInstanceVerified = $false
$desktopSingleInstanceEvidence = $null
$desktopSingleInstanceEvidenceCandidates = @()
$desktopSingleInstanceEvidenceRoots = @(
    [pscustomobject]@{
        path = (Join-Path $repoRoot ("docs\evidence\desktop-single-instance\{0}" -f $version))
        filter = "*.json"
    },
    [pscustomobject]@{
        path = (Join-Path $repoRoot ".local-build\desktop-single-instance")
        filter = "*.json"
    }
)

foreach ($root in $desktopSingleInstanceEvidenceRoots) {
    if (Test-Path -LiteralPath $root.path) {
        $desktopSingleInstanceEvidenceCandidates += @(
            Get-ChildItem -LiteralPath $root.path -Filter $root.filter -File -ErrorAction SilentlyContinue
        )
    }
}

$desktopSingleInstanceEvidenceResults = @()
$desktopSingleInstanceMachines = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
$desktopSingleInstanceSelectedCandidates = Select-LatestEvidenceCandidatesByMachine -Candidates $desktopSingleInstanceEvidenceCandidates -MaxPerMachine 3 -MaxUnknown 6
foreach ($candidate in @($desktopSingleInstanceSelectedCandidates | Sort-Object LastWriteTime -Descending)) {
    $verification = Test-DesktopSingleInstanceEvidence `
        -EvidencePath $candidate.FullName `
        -ExpectedVersion $version `
        -ExpectedGitCommit $currentGitCommit
    $desktopSingleInstanceEvidenceResults += $verification
    if ([bool]$verification.ok -and -not [string]::IsNullOrWhiteSpace([string]$verification.operator_machine)) {
        [void]$desktopSingleInstanceMachines.Add([string]$verification.operator_machine)
    }
}

$desktopSingleInstanceVerified = ($desktopSingleInstanceMachines.Count -ge $MinDesktopSingleInstanceMachineCount)
$desktopSingleInstanceEvidence = [pscustomobject]@{
    ok = [bool]$desktopSingleInstanceVerified
    min_machine_count = $MinDesktopSingleInstanceMachineCount
    valid_machine_count = $desktopSingleInstanceMachines.Count
    valid_machines = @($desktopSingleInstanceMachines)
    candidate_count = $desktopSingleInstanceEvidenceResults.Count
    available_candidate_count = @($desktopSingleInstanceEvidenceCandidates).Count
    candidate_selection = "latest-per-machine"
    candidates = $desktopSingleInstanceEvidenceResults
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

$p2pControlPlaneVerified = $false
$p2pControlPlaneEvidence = $null
$p2pControlPlaneEvidenceCandidate = $null
$p2pControlPlaneEvidenceIntegrity = $null
$p2pControlPlaneEvidenceRoots = @(
    [pscustomobject]@{
        path = (Join-Path $repoRoot ("docs\evidence\p2p-control-plane\{0}" -f $version))
        filter = "*.evidence.json"
    },
    [pscustomobject]@{
        path = (Join-Path $repoRoot ".local-build\p2p-control-plane")
        filter = "*.evidence.json"
    }
)

foreach ($root in $p2pControlPlaneEvidenceRoots) {
    if (Test-Path -LiteralPath $root.path) {
        $candidate = Get-ChildItem -LiteralPath $root.path -Filter $root.filter -File -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending |
            Select-Object -First 1
        if ($candidate) {
            $p2pControlPlaneEvidenceCandidate = $candidate
            break
        }
    }
}

if ($p2pControlPlaneEvidenceCandidate) {
    # H9: detect tampering of the evidence file between recording and trust by
    # recomputing its SHA256 and comparing against the integrity sidecar.
    $p2pControlPlaneEvidenceIntegrity = Test-EvidenceIntegritySidecar -EvidencePath $p2pControlPlaneEvidenceCandidate.FullName
    $p2pControlPlaneEvidenceResult = Invoke-JsonScript `
        -FilePath $p2pControlPlaneVerifierScript `
        -Arguments @("-EvidencePath", $p2pControlPlaneEvidenceCandidate.FullName, "-ExpectedVersion", $version, "-ExpectedBaseUrl", $PublicMetadataBaseUrl, "-Json") `
        -AllowFailure
    if ($p2pControlPlaneEvidenceResult.json -and [bool]$p2pControlPlaneEvidenceResult.json.ok -and ($p2pControlPlaneEvidenceIntegrity.status -ne "tampered" -and $p2pControlPlaneEvidenceIntegrity.status -ne "malformed")) {
        $p2pControlPlaneVerified = $true
        $p2pControlPlaneEvidence = $p2pControlPlaneEvidenceResult.json
    }
    elseif ($p2pControlPlaneEvidenceResult.json) {
        $p2pControlPlaneEvidence = $p2pControlPlaneEvidenceResult.json
    }
    else {
        $p2pControlPlaneEvidence = [pscustomobject]@{
            ok = $false
            evidence_path = $p2pControlPlaneEvidenceCandidate.FullName
            raw = $p2pControlPlaneEvidenceResult.raw
        }
    }
}

$privateMeshPackagedReleaseProofVerified = $false
$privateMeshPackagedReleaseProofEvidence = $null
$privateMeshPackagedReleaseProofEvidenceResults = New-Object System.Collections.Generic.List[object]
$privateMeshPackagedReleaseProofEvidenceCandidates = @()
$privateMeshPackagedReleaseProofEvidenceRoots = @(
    [pscustomobject]@{
        path = (Join-Path $repoRoot ("docs\evidence\private-mesh-release-proof\{0}" -f $version))
        filter = "private-mesh-release-proof.archive.json"
        recurse = $true
    },
    [pscustomobject]@{
        path = (Join-Path $repoRoot ".local-build\private-mesh-release-proof")
        filter = "private-mesh-release-proof.archive.json"
        recurse = $true
    }
)

foreach ($root in $privateMeshPackagedReleaseProofEvidenceRoots) {
    if (Test-Path -LiteralPath $root.path) {
        $privateMeshPackagedReleaseProofEvidenceCandidates += @(
            Get-ChildItem -LiteralPath $root.path -Filter $root.filter -File -Recurse:([bool]$root.recurse) -ErrorAction SilentlyContinue
        )
    }
}

$privateMeshPackagedReleaseProofSelectedCandidates = @(
    $privateMeshPackagedReleaseProofEvidenceCandidates |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 6
)

foreach ($candidate in $privateMeshPackagedReleaseProofSelectedCandidates) {
    $verification = Invoke-JsonScript `
        -FilePath $privateMeshReleaseProofArchiveVerifierScript `
        -Arguments @("-ArchiveManifestPath", $candidate.FullName, "-Json") `
        -AllowFailure
    $verificationJson = $verification.json
    $verificationOk = (
        $verificationJson -and
        $verificationJson.PSObject.Properties["ok"] -and
        [bool]$verificationJson.ok
    )
    $desktopRuntimeKind = if ($verificationJson -and $verificationJson.PSObject.Properties["desktop_runtime_kind"]) {
        [string]$verificationJson.desktop_runtime_kind
    }
    else {
        ""
    }
    $desktopRuntimePackaged = (
        $verificationJson -and
        $verificationJson.PSObject.Properties["desktop_runtime_packaged"] -and
        [bool]$verificationJson.desktop_runtime_packaged
    )
    $candidateOk = ($verificationOk -and $desktopRuntimePackaged -and $desktopRuntimeKind -eq "packaged_desktop")
    $privateMeshPackagedReleaseProofEvidenceResults.Add([pscustomobject]@{
            ok = [bool]$candidateOk
            archive_manifest_path = $candidate.FullName
            archive_verifier_ok = [bool]$verificationOk
            desktop_runtime_kind = $desktopRuntimeKind
            desktop_runtime_packaged = [bool]$desktopRuntimePackaged
            verifier_exit_code = $verification.exit_code
            verifier_timed_out = $verification.timed_out
            archive_verification = $verificationJson
            raw = if ($verificationJson) { $null } else { $verification.raw }
        }) | Out-Null

    if ($candidateOk -and -not $privateMeshPackagedReleaseProofVerified) {
        $privateMeshPackagedReleaseProofVerified = $true
        $privateMeshPackagedReleaseProofEvidence = $verificationJson
    }
}

if (-not $privateMeshPackagedReleaseProofEvidence) {
    $privateMeshPackagedReleaseProofAvailableCandidateCount = @($privateMeshPackagedReleaseProofEvidenceCandidates).Count
    $privateMeshPackagedReleaseProofCheckedCandidateCount = @($privateMeshPackagedReleaseProofSelectedCandidates).Count
    $privateMeshPackagedReleaseProofCandidateResults = @($privateMeshPackagedReleaseProofEvidenceResults.ToArray())

    $privateMeshPackagedReleaseProofEvidence = [pscustomobject]@{
        ok = $false
        required_desktop_runtime_kind = "packaged_desktop"
        required_desktop_runtime_packaged = $true
        candidate_selection = "latest-6-archive-manifests"
        available_candidate_count = $privateMeshPackagedReleaseProofAvailableCandidateCount
        checked_candidate_count = $privateMeshPackagedReleaseProofCheckedCandidateCount
        candidates = $privateMeshPackagedReleaseProofCandidateResults
    }
}

$p2pEnvStatusArguments = @("-BaseUrl", $PublicMetadataBaseUrl, "-Version", $version, "-Json")
if ($p2pControlPlaneEvidenceCandidate) {
    $p2pEnvStatusArguments += @("-EvidencePath", $p2pControlPlaneEvidenceCandidate.FullName)
}
$p2pEnvStatusResult = Invoke-JsonScript `
    -FilePath $p2pEnvStatusScript `
    -Arguments $p2pEnvStatusArguments `
    -AllowFailure
$p2pEnvStatus = if ($p2pEnvStatusResult.json) {
    $p2pEnvStatusResult.json
}
else {
    [pscustomobject]@{
        ok = $false
        raw = $p2pEnvStatusResult.raw
        exit_code = $p2pEnvStatusResult.exit_code
        timed_out = $p2pEnvStatusResult.timed_out
    }
}
$p2pEnvStatusReady = ($p2pEnvStatus -and $p2pEnvStatus.PSObject.Properties["ok"] -and [bool]$p2pEnvStatus.ok)
$p2pEnvStatusBlockers = @()
if ($p2pEnvStatus -and $p2pEnvStatus.PSObject.Properties["blockers"] -and $null -ne $p2pEnvStatus.blockers) {
    $p2pEnvStatusBlockers = @($p2pEnvStatus.blockers | ForEach-Object { [string]$_ } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
}

$p2pRelayTransportWired = $false
$p2pRelayRouteEvidenceOk = $false
$p2pRelayRouteEvidenceCount = -1
$p2pRelayRouteMetadataRequiredCount = 0
$p2pRelayRouteMetadataValidCount = 0
$p2pRelayRouteMetadataInvalidCount = 0
$p2pRelayRouteTransportProofRequiredCount = 0
$p2pRelayRouteTransportProofValidCount = 0
$p2pRelayRouteTransportProofInvalidCount = 0
$p2pRelayPayloadTransportProven = $false
$p2pRelayPayloadDeliveryProofRequiredCount = 0
$p2pRelayPayloadDeliveryProofValidCount = 0
$p2pRelayPayloadDeliveryProofInvalidCount = 0
$p2pRelayLeaseStoreReleaseGrade = $false
$p2pRelayStatusTransportPreflightOk = $false
$p2pRelayStatusTransportDescriptorWired = $false
$p2pRelayStatusPayloadEndpointWired = $false
$p2pRelayTransportPayloadEndpointWired = $false
$p2pOwnerScopeVerified = $false
if ($p2pControlPlaneEvidence) {
    if ($p2pControlPlaneEvidence.PSObject.Properties["relay_transport_wired"]) {
        $p2pRelayTransportWired = [bool]$p2pControlPlaneEvidence.relay_transport_wired
    }
    if ($p2pControlPlaneEvidence.PSObject.Properties["relay_status_transport_preflight_ok"]) {
        $p2pRelayStatusTransportPreflightOk = [bool]$p2pControlPlaneEvidence.relay_status_transport_preflight_ok
    }
    if ($p2pControlPlaneEvidence.PSObject.Properties["relay_status_transport_descriptor_wired"]) {
        $p2pRelayStatusTransportDescriptorWired = [bool]$p2pControlPlaneEvidence.relay_status_transport_descriptor_wired
    }
    if ($p2pControlPlaneEvidence.PSObject.Properties["relay_status_payload_endpoint_wired"]) {
        $p2pRelayStatusPayloadEndpointWired = [bool]$p2pControlPlaneEvidence.relay_status_payload_endpoint_wired
    }
    if ($p2pControlPlaneEvidence.PSObject.Properties["relay_transport_payload_endpoint_wired"]) {
        $p2pRelayTransportPayloadEndpointWired = [bool]$p2pControlPlaneEvidence.relay_transport_payload_endpoint_wired
    }
    if ($p2pControlPlaneEvidence.PSObject.Properties["relay_route_evidence_ok"]) {
        $p2pRelayRouteEvidenceOk = [bool]$p2pControlPlaneEvidence.relay_route_evidence_ok
    }
    if ($p2pControlPlaneEvidence.PSObject.Properties["relay_route_evidence_count"]) {
        $p2pRelayRouteEvidenceCount = [int]$p2pControlPlaneEvidence.relay_route_evidence_count
    }
    if ($p2pControlPlaneEvidence.PSObject.Properties["relay_route_metadata_required_count"]) {
        $p2pRelayRouteMetadataRequiredCount = [int]$p2pControlPlaneEvidence.relay_route_metadata_required_count
    }
    if ($p2pControlPlaneEvidence.PSObject.Properties["relay_route_metadata_valid_count"]) {
        $p2pRelayRouteMetadataValidCount = [int]$p2pControlPlaneEvidence.relay_route_metadata_valid_count
    }
    if ($p2pControlPlaneEvidence.PSObject.Properties["relay_route_metadata_invalid_count"]) {
        $p2pRelayRouteMetadataInvalidCount = [int]$p2pControlPlaneEvidence.relay_route_metadata_invalid_count
    }
    if ($p2pControlPlaneEvidence.PSObject.Properties["relay_route_transport_proof_required_count"]) {
        $p2pRelayRouteTransportProofRequiredCount = [int]$p2pControlPlaneEvidence.relay_route_transport_proof_required_count
    }
    if ($p2pControlPlaneEvidence.PSObject.Properties["relay_route_transport_proof_valid_count"]) {
        $p2pRelayRouteTransportProofValidCount = [int]$p2pControlPlaneEvidence.relay_route_transport_proof_valid_count
    }
    if ($p2pControlPlaneEvidence.PSObject.Properties["relay_route_transport_proof_invalid_count"]) {
        $p2pRelayRouteTransportProofInvalidCount = [int]$p2pControlPlaneEvidence.relay_route_transport_proof_invalid_count
    }
    if ($p2pControlPlaneEvidence.PSObject.Properties["relay_payload_transport_proven"]) {
        $p2pRelayPayloadTransportProven = [bool]$p2pControlPlaneEvidence.relay_payload_transport_proven
    }
    if ($p2pControlPlaneEvidence.PSObject.Properties["relay_payload_delivery_proof_required_count"]) {
        $p2pRelayPayloadDeliveryProofRequiredCount = [int]$p2pControlPlaneEvidence.relay_payload_delivery_proof_required_count
    }
    if ($p2pControlPlaneEvidence.PSObject.Properties["relay_payload_delivery_proof_valid_count"]) {
        $p2pRelayPayloadDeliveryProofValidCount = [int]$p2pControlPlaneEvidence.relay_payload_delivery_proof_valid_count
    }
    if ($p2pControlPlaneEvidence.PSObject.Properties["relay_payload_delivery_proof_invalid_count"]) {
        $p2pRelayPayloadDeliveryProofInvalidCount = [int]$p2pControlPlaneEvidence.relay_payload_delivery_proof_invalid_count
    }
    if ($p2pControlPlaneEvidence.PSObject.Properties["relay_lease_store_release_grade"]) {
        $p2pRelayLeaseStoreReleaseGrade = [bool]$p2pControlPlaneEvidence.relay_lease_store_release_grade
    }
    if ($p2pControlPlaneEvidence.PSObject.Properties["owner_scope_verified"]) {
        $p2pOwnerScopeVerified = [bool]$p2pControlPlaneEvidence.owner_scope_verified
    }
}

$expectedPackageVersion = Convert-PublicVersionToPackageVersion -PublicVersion $version
$fleetNodeProofLookup = Get-LatestJsonEvidence `
    -EvidenceName "fleet-proof" `
    -Version $version `
    -Schema "musu.fleet_node_proof.v1" `
    -Filter "*.fleet-proof.json"
$fleetNodeProofEvidence = $fleetNodeProofLookup.json
$fleetNodeProofVerified = (
    [bool]$fleetNodeProofLookup.found -and
    $fleetNodeProofEvidence -and
    $fleetNodeProofEvidence.PSObject.Properties["ok"] -and
    [bool]$fleetNodeProofEvidence.ok -and
    $fleetNodeProofEvidence.PSObject.Properties["fail_count"] -and
    [int]$fleetNodeProofEvidence.fail_count -eq 0 -and
    $fleetNodeProofEvidence.PSObject.Properties["installed_package_version"] -and
    [string]$fleetNodeProofEvidence.installed_package_version -eq $expectedPackageVersion -and
    $fleetNodeProofEvidence.PSObject.Properties["expected_direct_peer_name"] -and
    -not [string]::IsNullOrWhiteSpace([string]$fleetNodeProofEvidence.expected_direct_peer_name) -and
    $fleetNodeProofEvidence.PSObject.Properties["direct_healthy_nodes"] -and
    [int]$fleetNodeProofEvidence.direct_healthy_nodes -ge 2 -and
    $fleetNodeProofEvidence.PSObject.Properties["remote_cloud_warning_count"] -and
    [int]$fleetNodeProofEvidence.remote_cloud_warning_count -eq 0
)
$fleetInstallChannelProofVerified = (
    $fleetNodeProofVerified -and
    (Test-JsonCheckPassed -Json $fleetNodeProofEvidence -Name "public_install_channel_validate_release") -and
    (Test-JsonCheckPassed -Json $fleetNodeProofEvidence -Name "installed_package_version_matches_release")
)
$fleetBrainTokenAclVerified = (
    $fleetNodeProofVerified -and
    $fleetNodeProofEvidence.PSObject.Properties["brain_token_required"] -and
    [bool]$fleetNodeProofEvidence.brain_token_required -and
    $fleetNodeProofEvidence.PSObject.Properties["brain_token_present"] -and
    [bool]$fleetNodeProofEvidence.brain_token_present -and
    (Test-JsonCheckPassed -Json $fleetNodeProofEvidence -Name "brain_ingest_token_acl_restricted")
)

$directRouteLookup = Get-LatestJsonEvidence `
    -EvidenceName "direct-route" `
    -Version $version `
    -Schema "musu.route_evidence.v1" `
    -Filter "*.packaged-direct-route-evidence.json"
$directRouteEvidence = $directRouteLookup.json
$directRouteVerificationResult = $null
if ([bool]$directRouteLookup.found) {
    $directRouteVerificationResult = Invoke-JsonScript `
        -FilePath $directRouteVerifierScript `
        -Arguments @(
            "-EvidencePath", $directRouteLookup.path,
            "-ExpectedVersion", $version,
            "-Json"
        ) `
        -AllowFailure
}
$directRouteVerified = (
    $directRouteVerificationResult -and
    $directRouteVerificationResult.json -and
    [bool]$directRouteVerificationResult.json.ok
)

$designApprovalLookup = Get-LatestJsonEvidence `
    -EvidenceName "design-approval" `
    -Version $version `
    -Schema "musu.design_approval.v1"
$designApprovalEvidence = $designApprovalLookup.json
$designApprovalVerified = (
    [bool]$designApprovalLookup.found -and
    $designApprovalEvidence -and
    $designApprovalEvidence.PSObject.Properties["ok"] -and
    [bool]$designApprovalEvidence.ok -and
    $designApprovalEvidence.PSObject.Properties["status"] -and
    [string]$designApprovalEvidence.status -eq "Design: Approved" -and
    $designApprovalEvidence.PSObject.Properties["approval_url"] -and
    -not [string]::IsNullOrWhiteSpace([string]$designApprovalEvidence.approval_url)
)

$brainProductLookup = Get-LatestJsonEvidence `
    -EvidenceName "brain-product" `
    -Version $version `
    -Schema "musu.brain_product_proof.v1"
$brainProductEvidence = $brainProductLookup.json
$brainProductVerificationResult = $null
if ([bool]$brainProductLookup.found) {
    $brainProductVerificationResult = Invoke-JsonScript `
        -FilePath $brainProductVerifierScript `
        -Arguments @(
            "-EvidencePath", $brainProductLookup.path,
            "-ExpectedVersion", $version,
            "-ExpectedPackageVersion", $expectedPackageVersion,
            "-Json"
        ) `
        -AllowFailure
}
$brainProductVerified = (
    $brainProductVerificationResult -and
    $brainProductVerificationResult.json -and
    [bool]$brainProductVerificationResult.json.ok
)

$v34SelfHealLookup = Get-LatestJsonEvidence `
    -EvidenceName "v34-self-heal" `
    -Version $version `
    -Schema "musu.v34_self_heal_proof.v1"
$v34SelfHealEvidence = $v34SelfHealLookup.json
$v34SelfHealVerificationResult = $null
if ([bool]$v34SelfHealLookup.found) {
    $v34SelfHealVerificationResult = Invoke-JsonScript `
        -FilePath $v34SelfHealVerifierScript `
        -Arguments @(
            "-EvidencePath", $v34SelfHealLookup.path,
            "-ExpectedVersion", $version,
            "-ExpectedPackageVersion", $expectedPackageVersion,
            "-Json"
        ) `
        -AllowFailure
}
$v34SelfHealVerified = (
    $v34SelfHealVerificationResult -and
    $v34SelfHealVerificationResult.json -and
    [bool]$v34SelfHealVerificationResult.json.ok
)

$relayTransportProductVerified = (
    [bool]$p2pControlPlaneVerified -and
    [bool]$p2pRelayTransportWired -and
    [bool]$p2pRelayPayloadTransportProven -and
    $p2pRelayRouteTransportProofValidCount -gt 0 -and
    $p2pRelayPayloadDeliveryProofValidCount -gt 0
)

$fullProductSpecLanes = @(
    New-FullProductSpecLane -Name "design_approval" -Complete $designApprovalVerified -Evidence ($(if ($designApprovalVerified) { "Design approval evidence: $($designApprovalLookup.path)" } else { "Missing docs/evidence/design-approval/$version/*.json with schema musu.design_approval.v1 and Design: Approved approval_url." })) -Next "Record explicit approval on issue #35 and preserve approval evidence." -BlockerArea "design-approval" -BlockerMessage "Full product spec requires explicit design approval evidence; Design: Pending cannot satisfy completion."
    New-FullProductSpecLane -Name "install_channel_and_package" -Complete $fleetInstallChannelProofVerified -Evidence ($(if ($fleetInstallChannelProofVerified) { "Hosted fleet proof validates install channel and installed package: $($fleetNodeProofLookup.path)" } else { "Missing current fleet proof with public_install_channel_validate_release and installed_package_version_matches_release." })) -Next "Run hosted fleet-proof.ps1 from the installed package and save the current-version JSON." -BlockerArea "fleet-proof" -BlockerMessage "Full product spec requires current hosted fleet proof for install channel and installed package version."
    New-FullProductSpecLane -Name "direct_two_pc_fleet" -Complete $fleetNodeProofVerified -Evidence ($(if ($fleetNodeProofVerified) { "Current fleet proof has direct_healthy_nodes=$([int]$fleetNodeProofEvidence.direct_healthy_nodes), remote_cloud_warning_count=0: $($fleetNodeProofLookup.path)" } else { "Missing current two-PC direct fleet proof with direct_healthy_nodes >= 2 and no remote cloud warnings." })) -Next "Run hosted fleet-proof.ps1 with -ExpectedDirectPeerName on the physical main/second PC pair." -BlockerArea "fleet-proof" -BlockerMessage "Full product spec requires current two-PC direct fleet proof before direct readiness can be claimed."
    New-FullProductSpecLane -Name "direct_delegated_work_route" -Complete ([bool]$directRouteVerified -and [bool]$msixInstallVerified) -Evidence ($(if ($directRouteVerified -and $msixInstallVerified) { "Packaged direct route proof: $($directRouteLookup.path); current MSIX install proof verified." } elseif ($directRouteVerified) { "Direct route proof exists at $($directRouteLookup.path), but current MSIX install proof is missing." } elseif ([bool]$directRouteLookup.found) { "Direct route proof candidate failed verification: $($directRouteLookup.path)" } else { "Missing packaged direct route evidence under docs/evidence/direct-route/$version/." })) -Next "Rebuild/reinstall the current package, start the packaged bridge, run a real --wait route to the direct peer, and commit the route evidence." -BlockerArea "direct-route" -BlockerMessage "Full product spec requires a visible online direct peer to be work-targetable; fleet health alone is not enough."
    New-FullProductSpecLane -Name "relay_transport" -Complete $relayTransportProductVerified -Evidence ($(if ($relayTransportProductVerified) { "P2P control-plane evidence proves relay transport and payload delivery." } else { "Relay display/control-plane is not enough; relay transport/payload proof is missing or invalid." })) -Next "Implement and record release-grade relay transport route evidence with payload delivery proof." -BlockerArea "relay-transport" -BlockerMessage "Full product spec requires real delegated-work relay transport proof; display-only relay is not a work route."
    New-FullProductSpecLane -Name "brain_product" -Complete $brainProductVerified -Evidence ($(if ($brainProductVerified) { "Brain product proof: $($brainProductLookup.path)" } elseif ($fleetBrainTokenAclVerified) { "Fleet proof proves brain token ACL only: $($fleetNodeProofLookup.path)" } else { "Missing brain token ACL and/or full brain health/ingest/UX evidence." })) -Next "Record health, real task source ingest, cockpit recall/capture UX, and version-coherence evidence." -BlockerArea "brain-product-proof" -BlockerMessage "Full product spec requires full hidden brain proof; token ACL alone is not enough."
    New-FullProductSpecLane -Name "v34_stale_self_heal" -Complete $v34SelfHealVerified -Evidence ($(if ($v34SelfHealVerified) { "V34 self-heal proof: $($v34SelfHealLookup.path)" } else { "Missing V34 TTL prune, boot reconcile, and stale-candidate physical E2E proof." })) -Next "Record stale registry/cache/manual-peer self-heal evidence under docs/evidence/v34-self-heal." -BlockerArea "v34-stale-self-heal" -BlockerMessage "Full product spec requires V34 stale self-heal proof, not only candidate/TTL code."
    New-FullProductSpecLane -Name "store_distribution" -Complete $storeReleaseVerified -Evidence ($(if ($storeReleaseVerified) { "Store release evidence is verified." } else { "Missing Partner Center, certification, restricted capability, Store-signed install, and installed desktop launch evidence." })) -Next "Prepare/verify Store bundle and record Microsoft approval plus Store-signed install/launch evidence." -BlockerArea "store-release" -BlockerMessage "Full product spec requires Store or trusted distribution evidence."
    New-FullProductSpecLane -Name "support_operator_evidence" -Complete $supportOperatorEvidenceVerified -Evidence ($(if ($supportMailboxVerified) { "$supportEmail support mailbox evidence is verified." } elseif ($supportOperatorGateRetirementVerified) { "Historical support mailbox delivery gate is formally retired by $($supportOperatorGateRetirementLookup.path)." } else { "$supportEmail delivery evidence is missing or the historical support gate must be formally retired." })) -Next "Record support mailbox evidence or retire the gate in docs/tooling." -BlockerArea "support-mailbox" -BlockerMessage "Full product spec requires support/operator evidence or a formal retirement of the support mailbox gate."
)

$idleBusyLoopCandidateStatuses = @(
    New-IdleBusyLoopCandidateStatus `
        -Candidate "clipboard polling" `
        -AuditName "rust-background-loop" `
        -Audit $rustBackgroundLoopAuditResult.json `
        -RequiredChecks @(
            [pscustomobject]@{ scope = "clipboard"; name = "clipboard opt-in env gate" },
            [pscustomobject]@{ scope = "clipboard"; name = "clipboard monitor cancellation token" },
            [pscustomobject]@{ scope = "clipboard"; name = "clipboard monitor ctrl-c cancellation" },
            [pscustomobject]@{ scope = "clipboard"; name = "clipboard monitor sleep" },
            [pscustomobject]@{ scope = "clipboard"; name = "clipboard monitor exits after cancellation" }
        ) `
        -Evidence "Clipboard sync is off by default and, when explicitly enabled, sleeps between polls and exits through an explicit cancellation token."
    New-IdleBusyLoopCandidateStatus `
        -Candidate "mDNS discovery" `
        -AuditName "rust-background-loop" `
        -Audit $rustBackgroundLoopAuditResult.json `
        -RequiredChecks @(
            [pscustomobject]@{ scope = "mdns"; name = "mDNS opt-in env gate" },
            [pscustomobject]@{ scope = "mdns"; name = "mDNS auto-register cancellation token" },
            [pscustomobject]@{ scope = "mdns"; name = "IPv6 separate opt-in" },
            [pscustomobject]@{ scope = "mdns"; name = "Tailscale separate opt-in" },
            [pscustomobject]@{ scope = "mdns"; name = "virtual interfaces separate opt-in" },
            [pscustomobject]@{ scope = "mdns"; name = "browse bounded by deadline" },
            [pscustomobject]@{ scope = "mdns"; name = "browse cancellation token" },
            [pscustomobject]@{ scope = "mdns"; name = "browse cancellation select" },
            [pscustomobject]@{ scope = "mdns"; name = "auto-register cancellation wrapper" },
            [pscustomobject]@{ scope = "mdns"; name = "recv timeout bounded" },
            [pscustomobject]@{ scope = "mdns"; name = "disconnect breaks browse" }
        ) `
        -Evidence "mDNS is opt-in, noisy interface classes are separately gated, explicit discovery is bounded, and bridge auto-registration exits on the cloud loop cancellation token."
    New-IdleBusyLoopCandidateStatus `
        -Candidate "health check retry loop" `
        -AuditName "rust-background-loop" `
        -Audit $rustBackgroundLoopAuditResult.json `
        -RequiredChecks @(
            [pscustomobject]@{ scope = "auto-update"; name = "health poll initial backoff" },
            [pscustomobject]@{ scope = "auto-update"; name = "health poll max backoff" },
            [pscustomobject]@{ scope = "auto-update"; name = "health poll sleep" }
        ) `
        -Evidence "Auto-update health polling has bounded initial delay, max backoff, and sleeps between checks."
    New-IdleBusyLoopCandidateStatus `
        -Candidate "bridge readiness wait loop" `
        -AuditName "rust-background-loop" `
        -Audit $rustBackgroundLoopAuditResult.json `
        -RequiredChecks @(
            [pscustomobject]@{ scope = "cli-bridge-health"; name = "bridge health poll initial backoff" },
            [pscustomobject]@{ scope = "cli-bridge-health"; name = "bridge health poll max backoff" },
            [pscustomobject]@{ scope = "cli-bridge-health"; name = "bridge readiness deadline" },
            [pscustomobject]@{ scope = "cli-bridge-health"; name = "bridge readiness backoff sleep" }
        ) `
        -Evidence "CLI bridge readiness waits are bounded by caller timeout and sleep with capped backoff between health checks."
    New-IdleBusyLoopCandidateStatus `
        -Candidate "frontend interval/refetch" `
        -AuditName "frontend-polling" `
        -Audit $frontendPollingAuditResult.json `
        -RequiredChecks @(
            [pscustomobject]@{ scope = "source"; name = "no direct setInterval in non-test frontend source" },
            [pscustomobject]@{ scope = "source"; name = "visibilitychange owned only by shared poller" },
            [pscustomobject]@{ scope = "source"; name = "low-duty polling call-site inventory" },
            [pscustomobject]@{ scope = "poller"; name = "minimum interval clamp" },
            [pscustomobject]@{ scope = "poller"; name = "cleanup aborts task" },
            [pscustomobject]@{ scope = "poller"; name = "no interval timer in shared poller" }
        ) `
        -Evidence "Frontend polling uses shared one-shot low-duty polling with abort cleanup; direct intervals are banned."
    New-IdleBusyLoopCandidateStatus `
        -Candidate "relay payload target poller" `
        -AuditName "rust-background-loop" `
        -Audit $rustBackgroundLoopAuditResult.json `
        -RequiredChecks @(
            [pscustomobject]@{ scope = "relay-payload-poller"; name = "relay payload poller opt-in env gate" },
            [pscustomobject]@{ scope = "relay-payload-poller"; name = "poller default low duty interval" },
            [pscustomobject]@{ scope = "relay-payload-poller"; name = "poller minimum interval" },
            [pscustomobject]@{ scope = "relay-payload-poller"; name = "poller empty backoff cap" },
            [pscustomobject]@{ scope = "relay-payload-poller"; name = "poller hard backoff ceiling" },
            [pscustomobject]@{ scope = "relay-payload-poller"; name = "poller cancellation-aware sleep" }
        ) `
        -Evidence "Target-side relay polling is opt-in and uses bounded interval/backoff/cancellation."
    New-IdleBusyLoopCandidateStatus `
        -Candidate "autonomous planner loop" `
        -AuditName "rust-background-loop" `
        -Audit $rustBackgroundLoopAuditResult.json `
        -RequiredChecks @(
            [pscustomobject]@{ scope = "planner"; name = "planner opt-in env gate" },
            [pscustomobject]@{ scope = "planner"; name = "planner cancellation token" },
            [pscustomobject]@{ scope = "planner"; name = "planner ctrl-c cancellation" },
            [pscustomobject]@{ scope = "planner"; name = "planner default low duty interval" },
            [pscustomobject]@{ scope = "planner"; name = "planner minimum interval" },
            [pscustomobject]@{ scope = "planner"; name = "planner command timeout cap" },
            [pscustomobject]@{ scope = "planner"; name = "planner cancellation-aware sleep" },
            [pscustomobject]@{ scope = "planner"; name = "planner exits after cancellation" }
        ) `
        -Evidence "Autonomous planner work is opt-in, low-duty, timeout-bound, and exits through an explicit cancellation path."
    New-IdleBusyLoopCandidateStatus `
        -Candidate "cloud heartbeat" `
        -AuditName "rust-background-loop" `
        -Audit $rustBackgroundLoopAuditResult.json `
        -RequiredChecks @(
            [pscustomobject]@{ scope = "cloud-heartbeat"; name = "heartbeat default" },
            [pscustomobject]@{ scope = "cloud-heartbeat"; name = "heartbeat minimum floor" },
            [pscustomobject]@{ scope = "cloud-heartbeat"; name = "failure backoff exponent" },
            [pscustomobject]@{ scope = "cloud-heartbeat"; name = "failure backoff sleep" }
        ) `
        -Evidence "Cloud heartbeat defaults to low-duty cadence and sleeps with failure backoff."
    New-IdleBusyLoopCandidateStatus `
        -Candidate "auto-update supervisor loop" `
        -AuditName "rust-background-loop" `
        -Audit $rustBackgroundLoopAuditResult.json `
        -RequiredChecks @(
            [pscustomobject]@{ scope = "auto-update"; name = "config minimum interval" },
            [pscustomobject]@{ scope = "auto-update"; name = "first tick skipped" },
            [pscustomobject]@{ scope = "auto-update"; name = "health poll initial backoff" },
            [pscustomobject]@{ scope = "auto-update"; name = "health poll max backoff" },
            [pscustomobject]@{ scope = "auto-update"; name = "health poll sleep" }
        ) `
        -Evidence "Auto-update supervision refuses tight cadences, skips an immediate boot-time tick, and health polling uses bounded sleep/backoff."
    New-IdleBusyLoopCandidateStatus `
        -Candidate "log/telemetry flush loop" `
        -AuditName "rust-background-loop" `
        -Audit $rustBackgroundLoopAuditResult.json `
        -RequiredChecks @(
            [pscustomobject]@{ scope = "source"; name = "new rust loops must be audited" },
            [pscustomobject]@{ scope = "logging-telemetry"; name = "no background telemetry flush worker primitives" }
        ) `
        -Evidence "Rust source has no unaudited loop constructs and no background telemetry/log flush worker primitives."
)
$idleBusyLoopCandidateContractVerified = @($idleBusyLoopCandidateStatuses | Where-Object { -not [bool]$_.verified }).Count -eq 0

$gitStatus = (& git -C $repoRoot status --short 2>$null | Out-String).Trim()
$blockers = New-Object System.Collections.Generic.List[object]
$warnings = New-Object System.Collections.Generic.List[object]

if (-not [bool]$audit.runtime_package_ready) {
    Add-Blocker -List $blockers -Area "runtime-package" -Message "Runtime package readiness is false."
}
if (-not $msixDesktopEntrypointVerified) {
    Add-Blocker -List $blockers -Area "msix-desktop-entrypoint" -Message "Store/MSIX package does not yet prove that Start-menu activation launches the Tauri desktop shell instead of the runtime CLI."
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
if (-not $msixCurrentLegacyConflictsOk) {
    $aliasShadowedBy = if ($msixLegacyConflictsResult.json -and $msixLegacyConflictsResult.json.PSObject.Properties["alias_shadowing"]) {
        (@($msixLegacyConflictsResult.json.alias_shadowing) | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) }) -join "; "
    }
    else {
        ""
    }
    $aliasRemediation = if ($msixLegacyConflictsResult.json -and $msixLegacyConflictsResult.json.PSObject.Properties["alias_remediation"]) {
        [string]$msixLegacyConflictsResult.json.alias_remediation
    }
    else {
        "Run scripts/windows/check-msix-legacy-conflicts.ps1 and clear active startup helpers, scheduled tasks, legacy bins, or PATH alias shadowing before release."
    }
    Add-Blocker -List $blockers -Area "msix-current-legacy-conflicts" -Message "Current Windows install state has legacy startup, bin, scheduled-task, or PATH alias conflicts. Shadowing: '$aliasShadowedBy'. $aliasRemediation"
}
if (-not $manifestGenerationOk) {
    Add-Blocker -List $blockers -Area "release-candidate-manifest" -Message $manifestGenerationError
}
if (-not [bool]$audit.multi_device_verified) {
    Add-Blocker -List $blockers -Area "multi-device" -Message "Real second-PC multi-device evidence has not been recorded."
}
if (-not $privateMeshPackagedReleaseProofVerified) {
    Add-Blocker -List $blockers -Area "private-mesh-packaged-release-proof" -Message "Packaged desktop Private Mesh release proof archive with desktop_runtime_packaged=true and desktop_runtime_kind=packaged_desktop has not been verified."
}
if (-not $runtimeIdleCpuVerified) {
    Add-Blocker -List $blockers -Area "runtime-idle-cpu" -Message "Runtime idle CPU evidence has not passed on at least ${MinRuntimeIdleCpuMachineCount} machine(s) for ${MinRuntimeIdleCpuSampleSeconds}s at <= ${MaxRuntimeIdleCpuOneCorePercent}% of one logical CPU in scenario '${RequiredRuntimeIdleCpuScenario}' with owned WebView2 required."
}
if (-not $runtimeCpuScenarioMatrixVerified) {
    Add-Blocker -List $blockers -Area "runtime-cpu-scenario-matrix" -Message "Runtime CPU scenario matrix evidence has not passed on at least ${MinRuntimeCpuScenarioMatrixMachineCount} machine(s) for scenarios '$($RequiredRuntimeCpuScenarioMatrixScenarios -join ', ')' with a successful post-route probe."
}
if (-not $runtimeCpuSecondPcRouteAttemptVerified) {
    Add-Blocker -List $blockers -Area "runtime-cpu-second-pc-route-attempt" -Message "Runtime CPU matrix evidence has not recorded a post-route CPU sample after a targeted second-PC route attempt on at least ${MinRuntimeCpuSecondPcRouteAttemptMachineCount} machine(s). Run measure-musu-runtime-cpu-scenarios.ps1 with -RunRouteProbe -RouteTarget <PEER_NAME> -AllowFailedRouteProbe."
}
if (-not $frontendPollingContractVerified) {
    Add-Blocker -List $blockers -Area "frontend-polling" -Message "Frontend polling contract audit (musu.frontend_polling_contract.v1) failed; dashboard/refetch/SSE loops are not proven to use cancellable low-duty polling and bounded reconnect."
}
if (-not $rustBackgroundLoopContractVerified) {
    Add-Blocker -List $blockers -Area "rust-background-loops" -Message "Rust background loop contract audit (musu.rust_background_loop_contract.v1) failed; bridge/planner/mDNS/clipboard/sync/auto-update loops are not proven to be opt-in, low-duty, timeout-bound, or allowlisted."
}
if (-not $idleBusyLoopCandidateContractVerified) {
    Add-Blocker -List $blockers -Area "idle-busy-loop-candidates" -Message "Idle busy-loop candidate contract summary failed; clipboard, mDNS, health check retry, bridge readiness wait, frontend polling, relay target polling, planner, cloud heartbeat, auto-update supervisor, and log/telemetry flush loops are not all proven gated, low-duty, bounded, cancellable, or absent."
}
if (-not $localApiAuthContractVerified) {
    Add-Blocker -List $blockers -Area "local-api-auth" -Message "Local API auth contract audit (musu.local_api_auth_contract.v1) failed; localhost bridge requests are not proven to require bearer auth by default with only an explicit trusted local bypass."
}
if (-not $operatorApiSecurityContractVerified) {
    Add-Blocker -List $blockers -Area "operator-api-security" -Message "Operator API security contract audit (musu.operator_api_security_contract.v1) failed; web-driven local control routes are not proven to require authenticated operators, command allowlists, explicit process-kill enablement, and audit logging."
}
if (-not $degradedModeContractVerified) {
    Add-Blocker -List $blockers -Area "degraded-mode" -Message "Degraded mode contract audit (musu.degraded_mode_contract.v1) failed; agents, device-status, nodes mesh, and COS synthesis surfaces are not proven to expose unavailable/stale/fallback state instead of presenting fabricated healthy state."
}
if (-not $crashRecoveryContractVerified) {
    Add-Blocker -List $blockers -Area "crash-recovery" -Message "Crash-recovery contract audit (musu.crash_recovery_contract.v1) failed; `musu up`, `musu down`, service registry cleanup, startup single-instance, and process ownership are not proven to recover from stale bridge registry records."
}
if (-not $p2pStoreForwardRelayContractVerified) {
    Add-Blocker -List $blockers -Area "p2p-store-forward-relay" -Message "P2P store-forward relay contract audit (musu.p2p_store_forward_relay_contract.v1) failed; queue fallback is not proven owner-scoped, lease-bound, non-default, non-release-grade, and separated from release tunnel transport."
}
if (-not $secretStorageContractVerified) {
    Add-Blocker -List $blockers -Area "secret-storage" -Message "Secret storage contract audit (musu.secret_storage_contract.v1) failed; bridge/account tokens, P2P secret helpers, evidence redaction, or production backup docs are not proven safe."
}
if (-not $processOwnershipVerified) {
    Add-Blocker -List $blockers -Area "process-ownership" -Message "Process ownership evidence has not passed on at least ${MinProcessOwnershipMachineCount} machine(s)."
}
if (-not $startupSingleInstanceVerified) {
    Add-Blocker -List $blockers -Area "startup-single-instance" -Message "Startup single-instance evidence has not passed on at least ${MinStartupSingleInstanceMachineCount} machine(s)."
}
if (-not $desktopSingleInstanceVerified) {
    Add-Blocker -List $blockers -Area "desktop-single-instance" -Message "Packaged desktop repeated activation evidence has not passed on at least ${MinDesktopSingleInstanceMachineCount} machine(s)."
}
if (-not $SkipPublicMetadata) {
    if (-not $publicMetadataResult.json -or -not [bool]$publicMetadataResult.json.ok) {
        Add-Blocker -List $blockers -Area "store-public-metadata" -Message (Format-PublicMetadataFailureSummary -PublicMetadata $publicMetadataResult.json -BaseUrl $PublicMetadataBaseUrl)
    }
}
else {
    Add-Blocker -List $blockers -Area "store-public-metadata" -Message "Public privacy/support metadata verification was skipped."
}
if (-not $supportOperatorEvidenceVerified) {
    Add-Blocker -List $blockers -Area "support-mailbox" -Message "$supportEmail delivery has not been operator-verified and the historical support mailbox delivery gate has not been formally retired."
}
if (-not $storeReleaseVerified) {
    Add-Blocker -List $blockers -Area "store-release" -Message "Partner Center product name reservation, app submission, Microsoft certification, and restricted capability approval evidence has not been recorded."
}
if (-not $p2pControlPlaneVerified) {
    $p2pEnvBlockerSummary = if ($p2pEnvStatusBlockers.Count -gt 0) {
        " P2P env blockers: $(@($p2pEnvStatusBlockers | Select-Object -First 12) -join ', ')."
    }
    else {
        ""
    }
    Add-Blocker -List $blockers -Area "p2p-control-plane" -Message "Live $PublicMetadataBaseUrl P2P control-plane evidence has not verified owner-scoped release-grade relay lease storage, relay_default_data_path=false, relay status/transport descriptor and payload endpoint wired=true, and owner-scoped release-grade relay route evidence with relay_payload_transport_proven=true, count > 0, relay_route_metadata_valid_count > 0, relay_route_transport_proof_valid_count > 0, and relay_payload_delivery_proof present.$p2pEnvBlockerSummary"
}
if ($p2pControlPlaneEvidenceIntegrity) {
    # H9: a tampered or malformed integrity sidecar is a hard blocker (the
    # evidence file no longer matches the hash recorded when it was written).
    # A missing sidecar is only a warning so pre-H9 evidence still drains.
    if ($p2pControlPlaneEvidenceIntegrity.status -eq "tampered" -or $p2pControlPlaneEvidenceIntegrity.status -eq "malformed") {
        Add-Blocker -List $blockers -Area "p2p-control-plane-integrity" -Message "P2P control-plane evidence failed integrity verification ($($p2pControlPlaneEvidenceIntegrity.status)): $($p2pControlPlaneEvidenceIntegrity.message). Re-record evidence with scripts/windows/record-p2p-control-plane-evidence.ps1; do not edit evidence files by hand."
    }
    elseif ($p2pControlPlaneEvidenceIntegrity.status -eq "missing") {
        $warnings.Add([pscustomobject]@{
            area = "p2p-control-plane-integrity"
            message = "P2P control-plane evidence has no integrity sidecar (.sha256). Re-record with the current recorder to enable tamper detection."
        }) | Out-Null
    }
}
if (-not [string]::IsNullOrWhiteSpace($gitStatus)) {
    Add-Blocker -List $blockers -Area "git" -Message "Working tree is dirty; commit and regenerate manifest before final handoff."
}

$fullProductSpecIncompleteLanes = @(
    $fullProductSpecLanes |
        Where-Object { [bool]$_.required -and -not [bool]$_.complete }
)
foreach ($lane in $fullProductSpecIncompleteLanes) {
    $area = [string]$lane.blocker_area
    if ([string]::IsNullOrWhiteSpace($area)) {
        $area = "full-product-spec"
    }
    $alreadyBlocked = @($blockers | Where-Object { [string]$_.area -eq $area }).Count -gt 0
    if (-not $alreadyBlocked) {
        $message = [string]$lane.blocker_message
        if ([string]::IsNullOrWhiteSpace($message)) {
            $message = "Full product spec lane '$($lane.name)' is incomplete: $($lane.next)"
        }
        Add-Blocker -List $blockers -Area $area -Message $message
    }
}
$fullProductSpecReady = ($fullProductSpecIncompleteLanes.Count -eq 0)

$nextActions = Get-ReleaseNextActions `
    -Blockers $blockers.ToArray() `
    -Version $version `
    -SupportEmail $supportEmail `
    -PublicMetadataBaseUrl $PublicMetadataBaseUrl

$manualExternalGates = @(
    "PR #34 explicit design approval and design approval evidence",
    "Second-PC clean/current MSIX install verification",
    "Second-PC multi-device route verification",
    "$supportEmail inbox delivery verification",
    "Partner Center product name reservation",
    "Partner Center app submission",
    "Microsoft app certification",
    "Microsoft restricted capability review"
)

$manualInternalGates = @(
    "Full product spec lane evidence surfaced by write-release-go-no-go.ps1",
    "Release-grade relay transport proof with payload delivery evidence",
    "Hidden brain product proof for health, source ingest, recall/capture UX, and version coherence",
    "V34 stale registry/cache/manual-peer self-heal physical E2E proof",
    "MSIX desktop entrypoint audit for Store package activation",
    "Runtime idle CPU verification on primary Windows PC",
    "Runtime idle CPU verification on second Windows PC",
    "Runtime CPU scenario matrix verification for startup-open/runtime-started/dashboard-open/desktop-open/post-route on primary and second Windows PC",
    "Current MSIX legacy conflict live check for startup helpers, scheduled tasks, legacy bins, and PATH alias shadowing",
    "Frontend polling contract audit for cancellable low-duty dashboard/refetch/SSE loops",
    "Rust background loop contract audit for opt-in mDNS/clipboard/planner and bounded bridge/sync/update loops",
    "Idle busy-loop candidate summary for clipboard, mDNS, health check retry, bridge readiness wait, frontend polling, relay target polling, planner, cloud heartbeat, auto-update supervisor, and log/telemetry flush loops",
    "Local API auth contract audit for default bearer-token enforcement on localhost bridge requests",
    "Operator API security contract audit for authenticated, allowlisted, audit-logged web-driven local control routes",
    "Degraded mode contract audit for explicit unavailable/stale/fallback state on agents, device-status, nodes mesh, and COS synthesis surfaces",
    "Crash-recovery contract audit for stale bridge registry cleanup and single-instance recovery",
    "P2P store-forward relay contract audit for lease-bound non-default queue fallback and release tunnel separation",
    "Secret storage contract audit for token-file ACLs, raw-token redaction, and secret-safe operator docs",
    "Process ownership audit on primary Windows PC",
    "Second-PC runtime/startup ownership verification",
    "Startup single-instance repeat audit",
    "Packaged desktop repeated activation audit",
    "Packaged desktop Private Mesh release proof archive with desktop_runtime_packaged=true",
    "musu.pro registry/rendezvous/relay-control live evidence"
)

$ready = ($blockers.Count -eq 0)
$goNoGoWatch.Stop()
$goNoGoInvocations = @($script:goNoGoInvocations.ToArray())
$result = [pscustomobject]@{
    schema = "musu.release_go_no_go.v1"
    generated_at = (Get-Date).ToString("o")
    version = $version
    repo_root = $repoRoot
    elapsed_ms = [int]$goNoGoWatch.ElapsedMilliseconds
    invocation_count = [int]$goNoGoInvocations.Count
    go_no_go_invocations = $goNoGoInvocations
    ready_for_public_desktop_release = $ready
    full_product_spec_ready = [bool]$fullProductSpecReady
    full_product_spec = [pscustomobject]@{
        schema = "musu.full_product_spec_readiness.v1"
        roadmap_path = "docs/MUSU_FULL_PRODUCT_SPEC_COMPLETION_ROADMAP_2026_06_27.md"
        ready = [bool]$fullProductSpecReady
        expected_package_version = $expectedPackageVersion
        complete_lane_count = @($fullProductSpecLanes | Where-Object { [bool]$_.complete }).Count
        incomplete_lane_count = [int]$fullProductSpecIncompleteLanes.Count
        incomplete_lanes = @($fullProductSpecIncompleteLanes | ForEach-Object { [string]$_.name })
        lanes = @($fullProductSpecLanes)
        evidence = [pscustomobject]@{
            fleet_node_proof = [pscustomobject]@{
                found = [bool]$fleetNodeProofLookup.found
                path = [string]$fleetNodeProofLookup.path
                verified = [bool]$fleetNodeProofVerified
                install_channel_verified = [bool]$fleetInstallChannelProofVerified
                brain_token_acl_verified = [bool]$fleetBrainTokenAclVerified
            }
            direct_route = [pscustomobject]@{
                found = [bool]$directRouteLookup.found
                path = [string]$directRouteLookup.path
                verified = [bool]$directRouteVerified
                packaged_install_verified = [bool]$msixInstallVerified
                verification = if ($directRouteVerificationResult -and $directRouteVerificationResult.json) { $directRouteVerificationResult.json } else { $null }
                verification_error = if ($directRouteVerificationResult -and -not $directRouteVerificationResult.json) { [string]$directRouteVerificationResult.raw } else { "" }
            }
            design_approval = [pscustomobject]@{
                found = [bool]$designApprovalLookup.found
                path = [string]$designApprovalLookup.path
                verified = [bool]$designApprovalVerified
            }
            relay_transport = [pscustomobject]@{
                verified = [bool]$relayTransportProductVerified
                p2p_control_plane_verified = [bool]$p2pControlPlaneVerified
                relay_transport_wired = [bool]$p2pRelayTransportWired
                payload_transport_proven = [bool]$p2pRelayPayloadTransportProven
                route_transport_proof_valid_count = [int]$p2pRelayRouteTransportProofValidCount
                payload_delivery_proof_valid_count = [int]$p2pRelayPayloadDeliveryProofValidCount
            }
            brain_product = [pscustomobject]@{
                found = [bool]$brainProductLookup.found
                path = [string]$brainProductLookup.path
                verified = [bool]$brainProductVerified
                verification = if ($brainProductVerificationResult -and $brainProductVerificationResult.json) { $brainProductVerificationResult.json } else { $null }
                verification_error = if ($brainProductVerificationResult -and -not $brainProductVerificationResult.json) { [string]$brainProductVerificationResult.raw } else { "" }
            }
            v34_stale_self_heal = [pscustomobject]@{
                found = [bool]$v34SelfHealLookup.found
                path = [string]$v34SelfHealLookup.path
                verified = [bool]$v34SelfHealVerified
                verification = if ($v34SelfHealVerificationResult -and $v34SelfHealVerificationResult.json) { $v34SelfHealVerificationResult.json } else { $null }
                verification_error = if ($v34SelfHealVerificationResult -and -not $v34SelfHealVerificationResult.json) { [string]$v34SelfHealVerificationResult.raw } else { "" }
            }
        }
    }
    expected_package_version = $expectedPackageVersion
    fleet_node_proof_verified = [bool]$fleetNodeProofVerified
    fleet_install_channel_proof_verified = [bool]$fleetInstallChannelProofVerified
    fleet_brain_token_acl_verified = [bool]$fleetBrainTokenAclVerified
    direct_route_verified = [bool]$directRouteVerified
    design_approval_verified = [bool]$designApprovalVerified
    relay_transport_product_verified = [bool]$relayTransportProductVerified
    brain_product_verified = [bool]$brainProductVerified
    v34_stale_self_heal_verified = [bool]$v34SelfHealVerified
    local_artifacts_ready = ([bool]$audit.runtime_package_ready -and [bool]$audit.desktop_shell_ready)
    single_machine_verified = [bool]$audit.single_machine_verified
    multi_device_verified = [bool]$audit.multi_device_verified
    private_mesh_packaged_release_proof_verified = [bool]$privateMeshPackagedReleaseProofVerified
    private_mesh_packaged_release_proof_evidence = $privateMeshPackagedReleaseProofEvidence
    public_metadata_checked = -not [bool]$SkipPublicMetadata
    public_metadata_ok = if ($SkipPublicMetadata) { $null } elseif ($publicMetadataResult.json) { [bool]$publicMetadataResult.json.ok } else { $false }
    msix_install_verified = [bool]$msixInstallVerified
    msix_install_evidence = $msixInstallEvidence
    msix_desktop_entrypoint_verified = [bool]$msixDesktopEntrypointVerified
    msix_desktop_entrypoint_audit = [pscustomobject]@{
        ok = [bool]$msixDesktopEntrypointVerified
        store_reviewed_artifact = if ($msixStoreDesktopEntrypointArtifactAuditResult.json) {
            $msixStoreDesktopEntrypointArtifactAuditResult.json
        }
        else {
            [pscustomobject]@{ ok = $false; raw = $msixStoreDesktopEntrypointArtifactAuditResult.raw }
        }
        local_sideload_installed = if ($msixLocalDesktopEntrypointInstalledAuditResult.json) {
            $msixLocalDesktopEntrypointInstalledAuditResult.json
        }
        else {
            [pscustomobject]@{ ok = $false; raw = $msixLocalDesktopEntrypointInstalledAuditResult.raw }
        }
    }
    msix_current_legacy_conflicts_ok = [bool]$msixCurrentLegacyConflictsOk
    msix_current_legacy_conflicts = if ($msixLegacyConflictsResult.json) {
        $msixLegacyConflictsResult.json
    }
    else {
        [pscustomobject]@{ ok = $false; raw = $msixLegacyConflictsResult.raw }
    }
    release_candidate_manifest_generated = [bool]$manifestGenerationOk
    release_candidate_manifest_error = $manifestGenerationError
    runtime_idle_cpu_verified = [bool]$runtimeIdleCpuVerified
    required_runtime_idle_cpu_scenario = $RequiredRuntimeIdleCpuScenario
    runtime_idle_cpu_min_machine_count = $runtimeIdleCpuEvidence.min_machine_count
    runtime_idle_cpu_valid_machine_count = $runtimeIdleCpuEvidence.valid_machine_count
    runtime_idle_cpu_valid_machines = @($runtimeIdleCpuEvidence.valid_machines)
    runtime_idle_cpu_candidate_count = $runtimeIdleCpuEvidence.candidate_count
    runtime_idle_cpu_evidence = $runtimeIdleCpuEvidence
    runtime_cpu_scenario_matrix_verified = [bool]$runtimeCpuScenarioMatrixVerified
    runtime_cpu_scenario_matrix_min_machine_count = $runtimeCpuScenarioMatrixEvidence.min_machine_count
    runtime_cpu_scenario_matrix_valid_machine_count = $runtimeCpuScenarioMatrixEvidence.valid_machine_count
    runtime_cpu_scenario_matrix_valid_machines = @($runtimeCpuScenarioMatrixEvidence.valid_machines)
    runtime_cpu_scenario_matrix_candidate_count = $runtimeCpuScenarioMatrixEvidence.candidate_count
    runtime_cpu_scenario_matrix_required_scenarios = @($runtimeCpuScenarioMatrixEvidence.required_scenarios)
    runtime_cpu_scenario_matrix_evidence = $runtimeCpuScenarioMatrixEvidence
    runtime_cpu_second_pc_route_attempt_verified = [bool]$runtimeCpuSecondPcRouteAttemptVerified
    runtime_cpu_second_pc_route_attempt_min_machine_count = $runtimeCpuSecondPcRouteAttemptEvidence.min_machine_count
    runtime_cpu_second_pc_route_attempt_valid_machine_count = $runtimeCpuSecondPcRouteAttemptEvidence.valid_machine_count
    runtime_cpu_second_pc_route_attempt_valid_machines = @($runtimeCpuSecondPcRouteAttemptEvidence.valid_machines)
    runtime_cpu_second_pc_route_attempt_candidate_count = $runtimeCpuSecondPcRouteAttemptEvidence.candidate_count
    runtime_cpu_second_pc_route_attempt_evidence = $runtimeCpuSecondPcRouteAttemptEvidence
    frontend_polling_contract_verified = [bool]$frontendPollingContractVerified
    frontend_polling_contract_audit = if ($frontendPollingAuditResult.json) {
        $frontendPollingAuditResult.json
    }
    else {
        [pscustomobject]@{
            ok = $false
            exit_code = $frontendPollingAuditResult.exit_code
            timed_out = $frontendPollingAuditResult.timed_out
            raw = $frontendPollingAuditResult.raw
        }
    }
    rust_background_loop_contract_verified = [bool]$rustBackgroundLoopContractVerified
    rust_background_loop_contract_audit = if ($rustBackgroundLoopAuditResult.json) {
        $rustBackgroundLoopAuditResult.json
    }
    else {
        [pscustomobject]@{
            ok = $false
            exit_code = $rustBackgroundLoopAuditResult.exit_code
            timed_out = $rustBackgroundLoopAuditResult.timed_out
            raw = $rustBackgroundLoopAuditResult.raw
        }
    }
    idle_busy_loop_candidate_contract_verified = [bool]$idleBusyLoopCandidateContractVerified
    idle_busy_loop_candidate_count = @($idleBusyLoopCandidateStatuses).Count
    idle_busy_loop_candidate_verified_count = @($idleBusyLoopCandidateStatuses | Where-Object { [bool]$_.verified }).Count
    idle_busy_loop_candidate_unverified_count = @($idleBusyLoopCandidateStatuses | Where-Object { -not [bool]$_.verified }).Count
    idle_busy_loop_candidate_status = @($idleBusyLoopCandidateStatuses)
    local_api_auth_contract_verified = [bool]$localApiAuthContractVerified
    local_api_auth_contract_audit = if ($localApiAuthAuditResult.json) {
        $localApiAuthAuditResult.json
    }
    else {
        [pscustomobject]@{
            ok = $false
            exit_code = $localApiAuthAuditResult.exit_code
            timed_out = $localApiAuthAuditResult.timed_out
            raw = $localApiAuthAuditResult.raw
        }
    }
    operator_api_security_contract_verified = [bool]$operatorApiSecurityContractVerified
    operator_api_security_contract_audit = if ($operatorApiSecurityAuditResult.json) {
        $operatorApiSecurityAuditResult.json
    }
    else {
        [pscustomobject]@{
            ok = $false
            exit_code = $operatorApiSecurityAuditResult.exit_code
            timed_out = $operatorApiSecurityAuditResult.timed_out
            raw = $operatorApiSecurityAuditResult.raw
        }
    }
    degraded_mode_contract_verified = [bool]$degradedModeContractVerified
    degraded_mode_contract_audit = if ($degradedModeAuditResult.json) {
        $degradedModeAuditResult.json
    }
    else {
        [pscustomobject]@{
            ok = $false
            exit_code = $degradedModeAuditResult.exit_code
            timed_out = $degradedModeAuditResult.timed_out
            raw = $degradedModeAuditResult.raw
        }
    }
    crash_recovery_contract_verified = [bool]$crashRecoveryContractVerified
    crash_recovery_contract_audit = if ($crashRecoveryAuditResult.json) {
        $crashRecoveryAuditResult.json
    }
    else {
        [pscustomobject]@{
            ok = $false
            exit_code = $crashRecoveryAuditResult.exit_code
            timed_out = $crashRecoveryAuditResult.timed_out
            raw = $crashRecoveryAuditResult.raw
        }
    }
    p2p_store_forward_relay_contract_verified = [bool]$p2pStoreForwardRelayContractVerified
    p2p_store_forward_relay_contract_audit = if ($p2pStoreForwardRelayAuditResult.json) {
        $p2pStoreForwardRelayAuditResult.json
    }
    else {
        [pscustomobject]@{
            ok = $false
            exit_code = $p2pStoreForwardRelayAuditResult.exit_code
            timed_out = $p2pStoreForwardRelayAuditResult.timed_out
            raw = $p2pStoreForwardRelayAuditResult.raw
        }
    }
    secret_storage_contract_verified = [bool]$secretStorageContractVerified
    secret_storage_contract_audit = if ($secretStorageAuditResult.json) {
        $secretStorageAuditResult.json
    }
    else {
        [pscustomobject]@{
            ok = $false
            exit_code = $secretStorageAuditResult.exit_code
            timed_out = $secretStorageAuditResult.timed_out
            raw = $secretStorageAuditResult.raw
        }
    }
    process_ownership_verified = [bool]$processOwnershipVerified
    process_ownership_evidence = $processOwnershipEvidence
    startup_single_instance_verified = [bool]$startupSingleInstanceVerified
    startup_single_instance_evidence = $startupSingleInstanceEvidence
    desktop_single_instance_verified = [bool]$desktopSingleInstanceVerified
    desktop_single_instance_evidence = $desktopSingleInstanceEvidence
    support_mailbox_verified = [bool]$supportMailboxVerified
    support_mailbox_evidence = $supportMailboxEvidence
    support_operator_gate_retirement_verified = [bool]$supportOperatorGateRetirementVerified
    support_operator_gate_retirement_evidence = if ($supportOperatorGateRetirementVerificationResult -and $supportOperatorGateRetirementVerificationResult.json) { $supportOperatorGateRetirementVerificationResult.json } else { $supportOperatorGateRetirementEvidence }
    support_operator_evidence_verified = [bool]$supportOperatorEvidenceVerified
    store_release_verified = [bool]$storeReleaseVerified
    store_release_evidence = $storeReleaseEvidence
    p2p_control_plane_verified = [bool]$p2pControlPlaneVerified
    p2p_control_plane_evidence_integrity_status = if ($p2pControlPlaneEvidenceIntegrity) { [string]$p2pControlPlaneEvidenceIntegrity.status } else { "none" }
    p2p_control_plane_evidence_integrity_ok = if ($p2pControlPlaneEvidenceIntegrity) { [bool]$p2pControlPlaneEvidenceIntegrity.ok } else { $false }
    p2p_control_plane_env_ready = [bool]$p2pEnvStatusReady
    p2p_control_plane_env_blockers = @($p2pEnvStatusBlockers)
    p2p_control_plane_env_status = $p2pEnvStatus
    p2p_owner_scope_verified = [bool]$p2pOwnerScopeVerified
    p2p_relay_lease_store_release_grade = [bool]$p2pRelayLeaseStoreReleaseGrade
    p2p_relay_transport_wired = [bool]$p2pRelayTransportWired
    p2p_relay_status_transport_preflight_ok = [bool]$p2pRelayStatusTransportPreflightOk
    p2p_relay_status_transport_descriptor_wired = [bool]$p2pRelayStatusTransportDescriptorWired
    p2p_relay_status_payload_endpoint_wired = [bool]$p2pRelayStatusPayloadEndpointWired
    p2p_relay_transport_payload_endpoint_wired = [bool]$p2pRelayTransportPayloadEndpointWired
    p2p_relay_route_evidence_ok = [bool]$p2pRelayRouteEvidenceOk
    p2p_relay_route_evidence_count = [int]$p2pRelayRouteEvidenceCount
    p2p_relay_route_metadata_required_count = [int]$p2pRelayRouteMetadataRequiredCount
    p2p_relay_route_metadata_valid_count = [int]$p2pRelayRouteMetadataValidCount
    p2p_relay_route_metadata_invalid_count = [int]$p2pRelayRouteMetadataInvalidCount
    p2p_relay_route_transport_proof_required_count = [int]$p2pRelayRouteTransportProofRequiredCount
    p2p_relay_route_transport_proof_valid_count = [int]$p2pRelayRouteTransportProofValidCount
    p2p_relay_route_transport_proof_invalid_count = [int]$p2pRelayRouteTransportProofInvalidCount
    p2p_relay_payload_transport_proven = [bool]$p2pRelayPayloadTransportProven
    p2p_relay_payload_delivery_proof_required_count = [int]$p2pRelayPayloadDeliveryProofRequiredCount
    p2p_relay_payload_delivery_proof_valid_count = [int]$p2pRelayPayloadDeliveryProofValidCount
    p2p_relay_payload_delivery_proof_invalid_count = [int]$p2pRelayPayloadDeliveryProofInvalidCount
    p2p_control_plane_evidence = $p2pControlPlaneEvidence
    blockers = $blockers.ToArray()
    next_actions = $nextActions
    warnings = $warnings.ToArray()
    manual_internal_gates = $manualInternalGates
    manual_external_gates = $manualExternalGates
    readiness_audit = $audit
    public_metadata = if ($publicMetadataResult) { $publicMetadataResult.json } else { $null }
    manifest_path = if ($manifest) { (Resolve-Path -LiteralPath $manifestPath).Path } else { $null }
    manifest_git = if ($manifest) { $manifest.git } else { $null }
    go_no_go_output_path = $goNoGoOutputPath
}

$resultJson = $result | ConvertTo-Json -Depth 8
$outputParent = Split-Path -Parent $goNoGoOutputPath
if (-not [string]::IsNullOrWhiteSpace($outputParent)) {
    New-Item -ItemType Directory -Force -Path $outputParent | Out-Null
}
$tempPath = "$goNoGoOutputPath.tmp"
$resultJson | Set-Content -LiteralPath $tempPath -Encoding UTF8
Move-Item -LiteralPath $tempPath -Destination $goNoGoOutputPath -Force
# H9: record an integrity sidecar for the go/no-go manifest so downstream
# consumers can detect tampering of the final release decision artifact.
Write-EvidenceIntegritySidecar -EvidencePath $goNoGoOutputPath | Out-Null

if ($Json) {
    $resultJson
}
else {
    "MUSU release go/no-go"
    "go_no_go_output_path: $($result.go_no_go_output_path)"
    "elapsed_ms: $($result.elapsed_ms)"
    "invocation_count: $($result.invocation_count)"
    "ready_for_public_desktop_release: $($result.ready_for_public_desktop_release)"
    "full_product_spec_ready: $($result.full_product_spec_ready)"
    "full_product_spec_complete_lanes: $($result.full_product_spec.complete_lane_count)/$((@($result.full_product_spec.lanes)).Count)"
    "full_product_spec_incomplete_lanes: $((@($result.full_product_spec.incomplete_lanes) -join ', '))"
    "fleet_node_proof_verified: $($result.fleet_node_proof_verified)"
    "fleet_install_channel_proof_verified: $($result.fleet_install_channel_proof_verified)"
    "fleet_brain_token_acl_verified: $($result.fleet_brain_token_acl_verified)"
    "direct_route_verified: $($result.direct_route_verified)"
    "design_approval_verified: $($result.design_approval_verified)"
    "relay_transport_product_verified: $($result.relay_transport_product_verified)"
    "brain_product_verified: $($result.brain_product_verified)"
    "v34_stale_self_heal_verified: $($result.v34_stale_self_heal_verified)"
    "release_candidate_manifest_generated: $($result.release_candidate_manifest_generated)"
    "local_artifacts_ready: $($result.local_artifacts_ready)"
    "single_machine_verified: $($result.single_machine_verified)"
    "msix_install_verified: $($result.msix_install_verified)"
    "msix_desktop_entrypoint_verified: $($result.msix_desktop_entrypoint_verified)"
    "runtime_idle_cpu_verified: $($result.runtime_idle_cpu_verified)"
    "runtime_idle_cpu_valid_machines: $($result.runtime_idle_cpu_valid_machine_count)/$($result.runtime_idle_cpu_min_machine_count) [$((@($result.runtime_idle_cpu_valid_machines) -join ', '))]"
    "runtime_cpu_scenario_matrix_verified: $($result.runtime_cpu_scenario_matrix_verified)"
    "runtime_cpu_scenario_matrix_valid_machines: $($result.runtime_cpu_scenario_matrix_valid_machine_count)/$($result.runtime_cpu_scenario_matrix_min_machine_count) [$((@($result.runtime_cpu_scenario_matrix_valid_machines) -join ', '))]"
    "runtime_cpu_second_pc_route_attempt_verified: $($result.runtime_cpu_second_pc_route_attempt_verified)"
    "runtime_cpu_second_pc_route_attempt_valid_machines: $($result.runtime_cpu_second_pc_route_attempt_valid_machine_count)/$($result.runtime_cpu_second_pc_route_attempt_min_machine_count) [$((@($result.runtime_cpu_second_pc_route_attempt_valid_machines) -join ', '))]"
    "frontend_polling_contract_verified: $($result.frontend_polling_contract_verified)"
    "rust_background_loop_contract_verified: $($result.rust_background_loop_contract_verified)"
    "idle_busy_loop_candidate_contract_verified: $($result.idle_busy_loop_candidate_contract_verified)"
    "idle_busy_loop_candidate_verified_count: $($result.idle_busy_loop_candidate_verified_count)/$($result.idle_busy_loop_candidate_count)"
    "local_api_auth_contract_verified: $($result.local_api_auth_contract_verified)"
    "operator_api_security_contract_verified: $($result.operator_api_security_contract_verified)"
    "degraded_mode_contract_verified: $($result.degraded_mode_contract_verified)"
    "crash_recovery_contract_verified: $($result.crash_recovery_contract_verified)"
    "p2p_store_forward_relay_contract_verified: $($result.p2p_store_forward_relay_contract_verified)"
    "secret_storage_contract_verified: $($result.secret_storage_contract_verified)"
    "process_ownership_verified: $($result.process_ownership_verified)"
    "startup_single_instance_verified: $($result.startup_single_instance_verified)"
    "desktop_single_instance_verified: $($result.desktop_single_instance_verified)"
    "multi_device_verified: $($result.multi_device_verified)"
    "public_metadata_ok: $($result.public_metadata_ok)"
    "support_mailbox_verified: $($result.support_mailbox_verified)"
    "support_operator_gate_retirement_verified: $($result.support_operator_gate_retirement_verified)"
    "support_operator_evidence_verified: $($result.support_operator_evidence_verified)"
    "store_release_verified: $($result.store_release_verified)"
    "p2p_control_plane_verified: $($result.p2p_control_plane_verified)"
    "p2p_control_plane_evidence_integrity_status: $($result.p2p_control_plane_evidence_integrity_status)"
    "p2p_control_plane_env_ready: $($result.p2p_control_plane_env_ready)"
    "p2p_control_plane_env_blockers: $((@($result.p2p_control_plane_env_blockers) -join ', '))"
    "p2p_owner_scope_verified: $($result.p2p_owner_scope_verified)"
    "p2p_relay_lease_store_release_grade: $($result.p2p_relay_lease_store_release_grade)"
    "p2p_relay_transport_wired: $($result.p2p_relay_transport_wired)"
    "p2p_relay_status_transport_preflight_ok: $($result.p2p_relay_status_transport_preflight_ok)"
    "p2p_relay_status_transport_descriptor_wired: $($result.p2p_relay_status_transport_descriptor_wired)"
    "p2p_relay_status_payload_endpoint_wired: $($result.p2p_relay_status_payload_endpoint_wired)"
    "p2p_relay_transport_payload_endpoint_wired: $($result.p2p_relay_transport_payload_endpoint_wired)"
    "p2p_relay_route_evidence_ok: $($result.p2p_relay_route_evidence_ok)"
    "p2p_relay_route_evidence_count: $($result.p2p_relay_route_evidence_count)"
    "p2p_relay_route_metadata_valid_count: $($result.p2p_relay_route_metadata_valid_count)"
    "p2p_relay_route_transport_proof_required_count: $($result.p2p_relay_route_transport_proof_required_count)"
    "p2p_relay_route_transport_proof_valid_count: $($result.p2p_relay_route_transport_proof_valid_count)"
    "p2p_relay_route_transport_proof_invalid_count: $($result.p2p_relay_route_transport_proof_invalid_count)"
    "p2p_relay_payload_transport_proven: $($result.p2p_relay_payload_transport_proven)"
    "p2p_relay_payload_delivery_proof_required_count: $($result.p2p_relay_payload_delivery_proof_required_count)"
    "p2p_relay_payload_delivery_proof_valid_count: $($result.p2p_relay_payload_delivery_proof_valid_count)"
    "p2p_relay_payload_delivery_proof_invalid_count: $($result.p2p_relay_payload_delivery_proof_invalid_count)"
    ""
    "Blockers"
    $blockers | Format-Table area, message -Wrap
    ""
    "Next actions"
    $nextActions | Format-Table area, action_type, command_ready, verification_command_ready, automation_ready, summary, command -Wrap
    ""
    "Slow invocations"
    $goNoGoInvocations | Sort-Object elapsed_ms -Descending | Select-Object -First 8 script, elapsed_ms, timed_out, exit_code, failure_kind | Format-Table -AutoSize
    $placeholderNextActions = @($nextActions | Where-Object { $_.PSObject.Properties["placeholders"] -and @($_.placeholders).Count -gt 0 })
    if ($placeholderNextActions.Count -gt 0) {
        ""
        "Placeholders"
        foreach ($action in $placeholderNextActions) {
            "- $($action.area): $(@($action.placeholders) -join ', ')"
        }
    }
    $manualNextActions = @($nextActions | Where-Object { $_.PSObject.Properties["manual_steps"] -and @($_.manual_steps).Count -gt 0 })
    if ($manualNextActions.Count -gt 0) {
        ""
        "Manual steps"
        foreach ($action in $manualNextActions) {
            "- $($action.area)"
            foreach ($step in @($action.manual_steps)) {
                "  - $step"
            }
        }
    }
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
