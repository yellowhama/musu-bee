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
        "SUPPORT_EMAIL",
        "SHA256SUMS.txt",
        "packet-build-metadata.json",
        "support-mailbox-record-template.json",
        "docs\RELEASE_FINAL_OPERATOR_GATES_2026_05_29.md",
        "docs\MULTI_DEVICE_RELEASE_TEST_PLAN_1_15_0_RC1_2026_05_29.md",
        "docs\BETA_RELEASE_CHECKLIST_1_15_0_RC1.md",
        "docs\DESKTOP_RELEASE_READINESS_AUDIT_2026_05_29.md",
        "docs\RELEASE_1_15_0_RC1_FINAL_QUAL_AUDIT_NEXT_STEPS_2026_05_29.md",
        "docs\RELEASE_1_15_0_RC1_CURRENT_STATUS_AUDIT_2026_05_31.md",
        "docs\RELEASE_1_15_0_RC1_RUNTIME_HARDENING_RELAY_ROADMAP_2026_05_31.md",
        "docs\MUSU_PRO_P2P_CONTROL_PLANE_SPEC_2026_05_31.md",
        "docs\MUSU_RUNTIME_STABILIZATION_EXECUTION_PLAN_2026_05_31.md",
        "docs\MSIX_DESKTOP_ENTRYPOINT_AUDIT_2026_05_31.md",
        "docs\DESKTOP_SINGLE_INSTANCE_RELEASE_GATE_2026_06_02.md",
        "docs\RUNTIME_CPU_SCENARIO_MATRIX_AND_MDNS_LOG_AUDIT_2026_06_01.md",
        "docs\MICROSOFT_STORE_RELEASE_RUN_CARD_2026_05_29.md",
        "docs\RELEASE_OPERATOR_HANDOFF_CARD_2026_05_29.md",
        "docs\STORE_SUBMISSION_METADATA_2026_05_29.md",
        "scripts\windows\release-config.ps1",
        "scripts\windows\record-support-mailbox-verification.ps1",
        "scripts\windows\verify-support-mailbox-evidence.ps1",
        "scripts\windows\record-multidevice-evidence.ps1",
        "scripts\windows\verify-multidevice-evidence.ps1",
        "scripts\windows\capture-msix-install-evidence.ps1",
        "scripts\windows\collect-second-pc-handoff.ps1",
        "scripts\windows\record-msix-install-evidence.ps1",
        "scripts\windows\verify-msix-install-evidence.ps1",
        "scripts\windows\record-store-release-verification.ps1",
        "scripts\windows\verify-store-release-evidence.ps1",
        "scripts\windows\record-p2p-control-plane-evidence.ps1",
        "scripts\windows\verify-p2p-control-plane-evidence.ps1",
        "scripts\windows\verify-store-submission-bundle.ps1",
        "scripts\windows\audit-msix-desktop-entrypoint.ps1",
        "scripts\windows\measure-musu-idle-cpu.ps1",
        "scripts\windows\measure-musu-runtime-cpu-scenarios.ps1",
        "scripts\windows\verify-runtime-cpu-scenario-matrix.ps1",
        "scripts\windows\audit-musu-process-ownership.ps1",
        "scripts\windows\audit-musu-startup-single-instance.ps1",
        "scripts\windows\audit-musu-desktop-single-instance.ps1",
        "scripts\windows\prepare-operator-action-pack.ps1",
        "scripts\windows\verify-operator-action-pack.ps1",
        "scripts\windows\show-final-release-handoff-status.ps1",
        "scripts\windows\show-operator-handoff-card.ps1",
        "scripts\windows\show-second-pc-return-card.ps1",
        "scripts\windows\import-second-pc-return.ps1",
        "scripts\windows\verify-final-operator-gate-packet.ps1",
        "scripts\windows\complete-final-operator-gates.ps1",
        "scripts\windows\write-release-candidate-manifest.ps1",
        "scripts\windows\write-release-go-no-go.ps1"
    )

    foreach ($relative in $requiredFiles) {
        $exists = Test-Path -LiteralPath (Join-Path $packetRoot $relative)
        Add-CheckFromCondition "required file: $relative" $exists "$relative exists" "$relative is missing"
    }

    $expectedSupportEmail = ""
    $supportEmailConfigPath = Join-Path $packetRoot "SUPPORT_EMAIL"
    if (Test-Path -LiteralPath $supportEmailConfigPath) {
        $expectedSupportEmail = (Get-Content -LiteralPath $supportEmailConfigPath -Raw).Trim()
        Add-CheckFromCondition "support email config shape" ($expectedSupportEmail -match "^[^@\s]+@[^@\s]+\.[^@\s]+$") "SUPPORT_EMAIL is email-shaped" "SUPPORT_EMAIL is not email-shaped"
    }

    $metadataPath = Join-Path $packetRoot "packet-build-metadata.json"
    if (Test-Path -LiteralPath $metadataPath) {
        try {
            $metadata = Get-Content -LiteralPath $metadataPath -Raw | ConvertFrom-Json
            Add-CheckFromCondition "packet metadata schema" ([string]$metadata.schema -eq "musu.final_operator_gate_packet.v1") "packet metadata schema is valid" "packet metadata schema is invalid"
            Add-CheckFromCondition "packet metadata version" (-not [string]::IsNullOrWhiteSpace([string]$metadata.version)) "packet metadata includes version" "packet metadata is missing version"
            Add-CheckFromCondition "packet metadata support email" ([string]$metadata.support_email -eq $expectedSupportEmail) "packet metadata uses $expectedSupportEmail" "packet metadata support email does not match SUPPORT_EMAIL"
            Add-CheckFromCondition "packet metadata git commit" ([string]$metadata.git.commit -match "^[0-9a-fA-F]{40}$") "packet metadata includes source git commit" "packet metadata source git commit is missing or invalid"
            Add-CheckFromCondition "packet metadata clean git" (-not [bool]$metadata.git.dirty -and [string]::IsNullOrWhiteSpace([string]$metadata.git.status_short)) "packet metadata records clean git state" "packet metadata does not record clean git state"
        }
        catch {
            Add-Check "packet metadata json" "fail" "packet metadata JSON did not parse: $($_.Exception.Message)"
        }
    }

    $readmePath = Join-Path $packetRoot "README_FINAL_OPERATOR_GATES.md"
    if (Test-Path -LiteralPath $readmePath) {
        $readme = Get-Content -LiteralPath $readmePath -Raw
        Add-CheckFromCondition "readme execution boundary" ($readme -like "*real MUSU release repo root*") "README states commands run from real release repo root" "README does not clearly state release repo root execution boundary"
        Add-CheckFromCondition "readme second pc copy boundary" ($readme.Contains('Copy only the zip under `kits\`')) "README states only the kit zip should be copied to second PC" "README does not clearly state only kit zip should be copied"
        Add-CheckFromCondition "readme support mailbox gate" (-not [string]::IsNullOrWhiteSpace($expectedSupportEmail) -and $readme -like "*$expectedSupportEmail*") "README names $expectedSupportEmail" "README does not name the configured support email"
        Add-CheckFromCondition "readme second pc handoff helper" ($readme -like "*collect-second-pc-handoff.ps1*" -and $readme -like "*.handoff.json*") "README explains the second-PC handoff helper" "README missing second-PC handoff helper"
        Add-CheckFromCondition "readme final qual audit" ($readme -like "*RELEASE_1_15_0_RC1_FINAL_QUAL_AUDIT_NEXT_STEPS_2026_05_29.md*") "README points to the final qualitative audit and next steps" "README missing final qualitative audit reference"
        Add-CheckFromCondition "readme current status audit" ($readme -like "*RELEASE_1_15_0_RC1_CURRENT_STATUS_AUDIT_2026_05_31.md*") "README points to the current status audit" "README missing current status audit reference"
        Add-CheckFromCondition "readme runtime hardening roadmap" ($readme -like "*RELEASE_1_15_0_RC1_RUNTIME_HARDENING_RELAY_ROADMAP_2026_05_31.md*" -and $readme -like "*runtime_idle_cpu_verified=true*") "README points to runtime hardening and idle CPU gate" "README missing runtime hardening or idle CPU gate reference"
        Add-CheckFromCondition "readme p2p control plane spec" ($readme -like "*MUSU_PRO_P2P_CONTROL_PLANE_SPEC_2026_05_31.md*") "README points to P2P control-plane spec" "README missing P2P control-plane spec reference"
        Add-CheckFromCondition "readme stabilization execution plan" ($readme -like "*MUSU_RUNTIME_STABILIZATION_EXECUTION_PLAN_2026_05_31.md*") "README points to stabilization execution plan" "README missing stabilization execution plan reference"
        Add-CheckFromCondition "readme msix desktop entrypoint audit doc" ($readme -like "*MSIX_DESKTOP_ENTRYPOINT_AUDIT_2026_05_31.md*") "README points to MSIX desktop entrypoint audit" "README missing MSIX desktop entrypoint audit reference"
        Add-CheckFromCondition "readme desktop single-instance gate doc" ($readme -like "*DESKTOP_SINGLE_INSTANCE_RELEASE_GATE_2026_06_02.md*") "README points to desktop single-instance gate" "README missing desktop single-instance gate reference"
        Add-CheckFromCondition "readme runtime CPU scenario matrix audit" ($readme -like "*RUNTIME_CPU_SCENARIO_MATRIX_AND_MDNS_LOG_AUDIT_2026_06_01.md*" -and $readme -like "*musu.runtime_cpu_scenario_matrix.v1*") "README points to runtime CPU scenario matrix diagnostics" "README missing runtime CPU scenario matrix diagnostic reference"
        Add-CheckFromCondition "readme Store run card" ($readme -like "*MICROSOFT_STORE_RELEASE_RUN_CARD_2026_05_29.md*") "README points to the Store release run card" "README missing Store release run card reference"
        Add-CheckFromCondition "readme msix install gate" ($readme -like "*record-msix-install-evidence.ps1*" -and $readme -like "*msix_install_verified=true*") "README includes MSIX install evidence gate" "README missing MSIX install evidence gate"
        Add-CheckFromCondition "readme store release blocker" ($readme -like "*Partner Center product name reservation*" -and $readme -like "*app submission*" -and $readme -like "*store_release_verified=true*") "README states Store release approval is a blocker" "README does not clearly state Store release approval evidence is required"
        Add-CheckFromCondition "readme store release recorder" ($readme -like "*record-store-release-verification.ps1*") "README includes Store release evidence recorder command" "README missing Store release evidence recorder command"
        Add-CheckFromCondition "readme store bundle verifier" ($readme -like "*verify-store-submission-bundle.ps1*") "README includes Store submission bundle verifier command" "README missing Store submission bundle verifier command"
        Add-CheckFromCondition "readme msix desktop entrypoint audit" ($readme -like "*audit-msix-desktop-entrypoint.ps1*" -and $readme -like "*musu-desktop.exe*" -and $readme -like "*msix_desktop_entrypoint_verified=true*") "README includes MSIX desktop entrypoint gate" "README missing MSIX desktop entrypoint gate"
        Add-CheckFromCondition "readme runtime cpu measurement" ($readme -like "*measure-musu-idle-cpu.ps1*" -and $readme -like "*SampleSeconds 60*" -and $readme -like "*Scenario desktop-open*" -and $readme -like "*RequireOwnedWebView2*" -and $readme -like "*MaxOneCorePercent 5*" -and $readme -like "*MaxOwnedProcessCount 16*" -and $readme -like "*MaxOwnedWebView2ProcessCount 8*" -and $readme -like "*MaxTotalWorkingSetMb 1024*" -and $readme -like "*IncludeNode*" -and $readme -like "*IncludeWebView2*") "README includes runtime idle CPU/resource measurement command" "README missing runtime idle CPU/resource measurement command"
        Add-CheckFromCondition "readme runtime cpu scenario matrix" ($readme -like "*measure-musu-runtime-cpu-scenarios.ps1*" -and $readme -like "*runtime-started*" -and $readme -like "*dashboard-open*" -and $readme -like "*desktop-open*" -and $readme -like "*post-route*" -and $readme -like "*RunRouteProbe*" -and $readme -like "*.local-build\runtime-cpu-scenarios\*") "README includes runtime CPU scenario matrix command" "README missing runtime CPU scenario matrix command"
        Add-CheckFromCondition "readme process ownership audit" ($readme -like "*audit-musu-process-ownership.ps1*" -and $readme -like "*process_ownership_verified=true*" -and $readme -like "*bridge registry PID*") "README includes process ownership audit gate" "README missing process ownership audit gate"
        Add-CheckFromCondition "readme startup single-instance audit" ($readme -like "*audit-musu-startup-single-instance.ps1*" -and $readme -like "*startup_single_instance_verified=true*" -and $readme -like "*one bridge PID*") "README includes startup single-instance audit gate" "README missing startup single-instance audit gate"
        Add-CheckFromCondition "readme desktop single-instance audit" ($readme -like "*audit-musu-desktop-single-instance.ps1*" -and $readme -like "*desktop_single_instance_verified=true*" -and $readme -like "*musu-desktop.exe*") "README includes packaged desktop single-instance audit gate" "README missing packaged desktop single-instance audit gate"
        Add-CheckFromCondition "readme handoff status command" ($readme -like "*show-final-release-handoff-status.ps1*") "README includes final release handoff status command" "README missing final release handoff status command"
        Add-CheckFromCondition "readme action pack commands" ($readme -like "*prepare-operator-action-pack.ps1*" -and $readme -like "*verify-operator-action-pack.ps1*" -and $readme -like "*copy/handoff convenience*") "README includes operator action pack generation/verification boundary" "README missing operator action pack generation/verification boundary"
        Add-CheckFromCondition "readme operator handoff card" ($readme -like "*show-operator-handoff-card.ps1*" -or $readme -like "*RELEASE_OPERATOR_HANDOFF_CARD_2026_05_29.md*") "README includes operator handoff card path" "README missing operator handoff card reference"
        Add-CheckFromCondition "readme second pc return card" ($readme -like "*show-second-pc-return-card.ps1*" -and $readme -like "*suggested_remote_addrs*") "README includes second-PC return card command" "README missing second-PC return card command"
        Add-CheckFromCondition "readme second pc return archive" ($readme -like "*.local-build\second-pc-return\*.zip*") "README includes second-PC return archive handoff" "README missing second-PC return archive handoff"
        Add-CheckFromCondition "readme second pc importer" ($readme -like "*import-second-pc-return.ps1*" -and $readme -like "*-RecordMsixInstall*") "README includes second-PC return importer" "README missing second-PC return importer"
        Add-CheckFromCondition "readme complete runner msix params" ($readme -like "*complete-final-operator-gates.ps1*" -and $readme -like "*-MsixInstallEvidencePath*") "README final command can record MSIX install evidence" "README final command does not include MSIX install evidence parameters"
        Add-CheckFromCondition "readme complete runner store params" ($readme -like "*complete-final-operator-gates.ps1*" -and $readme -like "*-StoreProductNameReservedAt*" -and $readme -like "*-StoreSubmissionId*") "README final command can record Store release evidence with product name reservation timestamp" "README final command does not include Store release evidence parameters"
        Add-CheckFromCondition "readme complete runner fail gate" ($readme -like "*complete-final-operator-gates.ps1*" -and $readme -like "*-FailOnNotReady*") "README final command fails when final go/no-go is not ready" "README final command does not include -FailOnNotReady"
        Add-CheckFromCondition "readme go no-go gate" ($readme -like "*write-release-go-no-go.ps1*") "README includes final go/no-go command" "README missing final go/no-go command"
    }

    $handoffStatusScriptPath = Join-Path $packetRoot "scripts\windows\show-final-release-handoff-status.ps1"
    if (Test-Path -LiteralPath $handoffStatusScriptPath) {
        $handoffStatusScript = Get-Content -LiteralPath $handoffStatusScriptPath -Raw
        Add-CheckFromCondition `
            "handoff status action pack verification" `
            ($handoffStatusScript -like "*ActionPackPath*" -and $handoffStatusScript -like "*verify-operator-action-pack.ps1*" -and $handoffStatusScript -like "*action_pack*" -and $handoffStatusScript -like "*import-second-pc-return.ps1*") `
            "packet handoff status script reports action-pack verification" `
            "packet handoff status script does not report action-pack verification or second-PC return import"
        Add-CheckFromCondition `
            "handoff status process ownership gate" `
            ($handoffStatusScript -like "*audit-musu-process-ownership.ps1*" -and $handoffStatusScript -like "*process_ownership_verified*" -and $handoffStatusScript -like "*process_ownership = Get-EvidenceRootStatus*") `
            "packet handoff status script reports process ownership evidence" `
            "packet handoff status script does not report process ownership evidence"
        Add-CheckFromCondition `
            "handoff status startup single-instance gate" `
            ($handoffStatusScript -like "*audit-musu-startup-single-instance.ps1*" -and $handoffStatusScript -like "*startup_single_instance_verified*" -and $handoffStatusScript -like "*startup_single_instance = Get-EvidenceRootStatus*") `
            "packet handoff status script reports startup single-instance evidence" `
            "packet handoff status script does not report startup single-instance evidence"
        Add-CheckFromCondition `
            "handoff status desktop single-instance gate" `
            ($handoffStatusScript -like "*audit-musu-desktop-single-instance.ps1*" -and $handoffStatusScript -like "*desktop_single_instance_verified*" -and $handoffStatusScript -like "*desktop_single_instance = Get-EvidenceRootStatus*") `
            "packet handoff status script reports packaged desktop single-instance evidence" `
            "packet handoff status script does not report packaged desktop single-instance evidence"
    }

    $operatorHandoffScriptPath = Join-Path $packetRoot "scripts\windows\show-operator-handoff-card.ps1"
    if (Test-Path -LiteralPath $operatorHandoffScriptPath) {
        $operatorHandoffScript = Get-Content -LiteralPath $operatorHandoffScriptPath -Raw
        Add-CheckFromCondition `
            "operator handoff return archive" `
            ($operatorHandoffScript -like "*.local-build\second-pc-return\*.zip*") `
            "packet operator handoff card lists the second-PC return archive" `
            "packet operator handoff card does not list the second-PC return archive"
    }

    $returnImporterScriptPath = Join-Path $packetRoot "scripts\windows\import-second-pc-return.ps1"
    if (Test-Path -LiteralPath $returnImporterScriptPath) {
        $returnImporterScript = Get-Content -LiteralPath $returnImporterScriptPath -Raw
        Add-CheckFromCondition `
            "second pc return importer safety" `
            ($returnImporterScript -like "*verify-msix-install-evidence.ps1*" -and $returnImporterScript -like "*show-second-pc-return-card.ps1*" -and $returnImporterScript -like "*RecordMsixInstall*" -and $returnImporterScript -like "*musu.second_pc_return_import.v1*" -and $returnImporterScript -like "*musu.runtime_cpu_scenario_matrix.v1*") `
            "packet second-PC return importer verifies MSIX evidence and produces primary commands" `
            "packet second-PC return importer lacks verification, command, or recording support"
    }

    $goNoGoScriptPath = Join-Path $packetRoot "scripts\windows\write-release-go-no-go.ps1"
    if (Test-Path -LiteralPath $goNoGoScriptPath) {
        $goNoGoScript = Get-Content -LiteralPath $goNoGoScriptPath -Raw
        Add-CheckFromCondition `
            "go no-go dirty git blocker" `
            ($goNoGoScript -like '*Add-Blocker -List $blockers -Area "git"*' -and $goNoGoScript -like "*Working tree is dirty*" -and $goNoGoScript -notlike "*warnings.Add*") `
            "packet go/no-go script blocks dirty git state" `
            "packet go/no-go script does not block dirty git state"
        Add-CheckFromCondition `
            "go no-go support version gate" `
            ($goNoGoScript -like "*verify-support-mailbox-evidence.ps1*" -and $goNoGoScript -like "*-ExpectedVersion*" -and $goNoGoScript -like '*$version*') `
            "packet go/no-go verifies support evidence against the release version" `
            "packet go/no-go does not pass ExpectedVersion to support evidence verifier"
        Add-CheckFromCondition `
            "go no-go msix desktop entrypoint gate" `
            ($goNoGoScript -like "*msix_desktop_entrypoint_verified*" -and $goNoGoScript -like "*audit-msix-desktop-entrypoint.ps1*" -and $goNoGoScript -like "*store-reviewed-immediate-registration*" -and $goNoGoScript -like "*local-sideload-manual*" -and $goNoGoScript -like "*RequireInstalledPackage*" -and $goNoGoScript -like "*musu-desktop.exe*") `
            "packet go/no-go blocks on Store artifact and local installed MSIX desktop entrypoint evidence" `
            "packet go/no-go does not block on Store artifact plus local installed MSIX desktop entrypoint evidence"
        Add-CheckFromCondition `
            "go no-go runtime idle CPU gate" `
            ($goNoGoScript -like "*runtime_idle_cpu_verified*" -and $goNoGoScript -like "*runtime-idle-cpu*" -and $goNoGoScript -like "*MinRuntimeIdleCpuMachineCount*" -and $goNoGoScript -like "*RequiredRuntimeIdleCpuScenario*" -and $goNoGoScript -like "*require_owned_webview2*" -and $goNoGoScript -like "*max_owned_process_count*" -and $goNoGoScript -like "*max_owned_webview2_process_count*" -and $goNoGoScript -like "*max_total_working_set_mb*" -and $goNoGoScript -like "*memory_totals_by_role_mb*" -and $goNoGoScript -like "*ExpectedGitCommit*" -and $goNoGoScript -like "*Test-ReleaseEvidenceFreshnessAllowedPath*" -and $goNoGoScript -like "*Test-DocumentationOrStatusOnlyGitDelta*") `
            "packet go/no-go blocks on current runtime idle CPU and resource-budget evidence" `
            "packet go/no-go does not block on runtime idle CPU and resource-budget evidence"
        Add-CheckFromCondition `
            "go no-go runtime CPU scenario matrix gate" `
            ($goNoGoScript -like "*runtime_cpu_scenario_matrix_verified*" -and $goNoGoScript -like "*verify-runtime-cpu-scenario-matrix.ps1*" -and $goNoGoScript -like "*musu.runtime_cpu_scenario_matrix.v1*" -and $goNoGoScript -like "*RequiredRuntimeCpuScenarioMatrixScenarios*" -and $goNoGoScript -like "*runtime-started*" -and $goNoGoScript -like "*dashboard-open*" -and $goNoGoScript -like "*desktop-open*" -and $goNoGoScript -like "*post-route*" -and $goNoGoScript -like "*RequirePostRouteProbe*") `
            "packet go/no-go blocks on verified runtime CPU scenario matrix evidence" `
            "packet go/no-go does not block on verified runtime CPU scenario matrix evidence"
        Add-CheckFromCondition `
            "go no-go process ownership gate" `
            ($goNoGoScript -like "*process_ownership_verified*" -and $goNoGoScript -like "*process-ownership*" -and $goNoGoScript -like "*MinProcessOwnershipMachineCount*" -and $goNoGoScript -like "*musu.process_ownership_audit.v1*") `
            "packet go/no-go blocks on process ownership evidence" `
            "packet go/no-go does not block on process ownership evidence"
        Add-CheckFromCondition `
            "go no-go startup single-instance gate" `
            ($goNoGoScript -like "*startup_single_instance_verified*" -and $goNoGoScript -like "*startup-single-instance*" -and $goNoGoScript -like "*MinStartupSingleInstanceMachineCount*" -and $goNoGoScript -like "*musu.startup_single_instance_audit.v1*") `
            "packet go/no-go blocks on startup single-instance evidence" `
            "packet go/no-go does not block on startup single-instance evidence"
        Add-CheckFromCondition `
            "go no-go desktop single-instance gate" `
            ($goNoGoScript -like "*desktop_single_instance_verified*" -and $goNoGoScript -like "*desktop-single-instance*" -and $goNoGoScript -like "*MinDesktopSingleInstanceMachineCount*" -and $goNoGoScript -like "*musu.desktop_single_instance_audit.v1*") `
            "packet go/no-go blocks on packaged desktop single-instance evidence" `
            "packet go/no-go does not block on packaged desktop single-instance evidence"
    }

    $supportRecorderScriptPath = Join-Path $packetRoot "scripts\windows\record-support-mailbox-verification.ps1"
    if (Test-Path -LiteralPath $supportRecorderScriptPath) {
        $supportRecorderScript = Get-Content -LiteralPath $supportRecorderScriptPath -Raw
        Add-CheckFromCondition `
            "support recorder explicit verification id" `
            ($supportRecorderScript -like "*Mandatory = `$true*VerificationId*" -and $supportRecorderScript -notlike "*NewGuid*") `
            "packet support recorder requires an explicit verification id" `
            "packet support recorder can generate or omit the verification id"
    }

    $supportVerifierScriptPath = Join-Path $packetRoot "scripts\windows\verify-support-mailbox-evidence.ps1"
    if (Test-Path -LiteralPath $supportVerifierScriptPath) {
        $supportVerifierScript = Get-Content -LiteralPath $supportVerifierScriptPath -Raw
        Add-CheckFromCondition `
            "support verifier version and token gate" `
            ($supportVerifierScript -like "*ExpectedVersion*" -and $supportVerifierScript -like "*verification id shape*" -and $supportVerifierScript -like "*from address distinct*") `
            "packet support verifier checks version, token shape, and sender distinction" `
            "packet support verifier lacks version/token/sender evidence checks"
    }

    $storeRecorderScriptPath = Join-Path $packetRoot "scripts\windows\record-store-release-verification.ps1"
    if (Test-Path -LiteralPath $storeRecorderScriptPath) {
        $storeRecorderScript = Get-Content -LiteralPath $storeRecorderScriptPath -Raw
        Add-CheckFromCondition `
            "store recorder explicit reservation timestamp" `
            ($storeRecorderScript -like "*Mandatory = `$true*ProductNameReservedAt*" -and $storeRecorderScript -like "*ProductNameReservedAt is required*" -and $storeRecorderScript -notlike "*ProductNameReservedAt = `"`"*") `
            "packet Store recorder requires explicit product-name reservation timestamp" `
            "packet Store recorder can infer or omit product-name reservation timestamp"
    }

    $storeVerifierScriptPath = Join-Path $packetRoot "scripts\windows\verify-store-release-evidence.ps1"
    if (Test-Path -LiteralPath $storeVerifierScriptPath) {
        $storeVerifierScript = Get-Content -LiteralPath $storeVerifierScriptPath -Raw
        Add-CheckFromCondition `
            "store verifier timestamp safety gate" `
            ($storeVerifierScript -like "*recording order*" -and $storeVerifierScript -like "*not future*" -and $storeVerifierScript -like "*published_at*") `
            "packet Store verifier checks recording order and future timestamps" `
            "packet Store verifier lacks timestamp safety checks"
    }

    $multiDeviceVerifierScriptPath = Join-Path $packetRoot "scripts\windows\verify-multidevice-evidence.ps1"
    if (Test-Path -LiteralPath $multiDeviceVerifierScriptPath) {
        $multiDeviceVerifierScript = Get-Content -LiteralPath $multiDeviceVerifierScriptPath -Raw
        Add-CheckFromCondition `
            "multi-device verifier schema gate" `
            ($multiDeviceVerifierScript -like "*musu.multidevice_smoke_evidence.v1*" -and $multiDeviceVerifierScript -like "*ExpectedVersion*" -and $multiDeviceVerifierScript -like "*completed_at*" -and $multiDeviceVerifierScript -like "*operator user*" -and $multiDeviceVerifierScript -like "*remote address includes port*" -and $multiDeviceVerifierScript -like "*musu.route_evidence.v1*" -and $multiDeviceVerifierScript -like "*route_kind*" -and $multiDeviceVerifierScript -like "*peer_identity_verified*" -and $multiDeviceVerifierScript -like "*peer_identity_method*" -and $multiDeviceVerifierScript -like "*peer_public_key*" -and $multiDeviceVerifierScript -like "*transport_verified_by*" -and $multiDeviceVerifierScript -like "*musu_quic_tls_transport*" -and $multiDeviceVerifierScript -like "*payload_transited_musu_infra*" -and $multiDeviceVerifierScript -like "*quic_tls_1_3*" -and $multiDeviceVerifierScript -like "*route encryption release-grade*" -and $multiDeviceVerifierScript -like "*route transport proof*") `
            "packet multi-device verifier checks schema, version, completion time, operator, endpoint shape, route evidence, peer identity proof, and QUIC/TLS transport proof" `
            "packet multi-device verifier does not check schema, version, completion time, operator, endpoint shape, route evidence, peer identity proof, and QUIC/TLS transport proof"
    }

    $msixInstallVerifierScriptPath = Join-Path $packetRoot "scripts\windows\verify-msix-install-evidence.ps1"
    if (Test-Path -LiteralPath $msixInstallVerifierScriptPath) {
        $msixInstallVerifierScript = Get-Content -LiteralPath $msixInstallVerifierScriptPath -Raw
        Add-CheckFromCondition `
            "msix verifier version and capture gate" `
            ($msixInstallVerifierScript -like "*ExpectedVersion*" -and $msixInstallVerifierScript -like "*nested checks present*" -and $msixInstallVerifierScript -like "*requiredNestedChecks*" -and $msixInstallVerifierScript -like "*artifact path*" -and $msixInstallVerifierScript -like "*recorded timestamp not future*" -and $msixInstallVerifierScript -like "*operator user*") `
            "packet MSIX verifier checks version, capture checks, timestamp, and operator metadata" `
            "packet MSIX verifier lacks version/capture/timestamp/operator evidence checks"
    }

    $packetVerifierScriptPath = Join-Path $packetRoot "scripts\windows\verify-final-operator-gate-packet.ps1"
    if (Test-Path -LiteralPath $packetVerifierScriptPath) {
        $packetVerifierScript = Get-Content -LiteralPath $packetVerifierScriptPath -Raw
        Add-CheckFromCondition `
            "packet verifier release safety checks" `
            ($packetVerifierScript -like "*go no-go dirty git blocker*" -and $packetVerifierScript -like "*go no-go process ownership gate*" -and $packetVerifierScript -like "*go no-go startup single-instance gate*" -and $packetVerifierScript -like "*multi-device verifier schema gate*" -and $packetVerifierScript -like "*msix verifier version and capture gate*" -and $packetVerifierScript -like "*support verifier version and token gate*" -and $packetVerifierScript -like "*store recorder explicit reservation timestamp*" -and $packetVerifierScript -like "*operator handoff return archive*" -and $packetVerifierScript -like "*second pc return importer safety*" -and $packetVerifierScript -like "*runtime CPU scenario matrix*") `
            "packet verifier checks dirty git, process ownership, startup single-instance, MSIX, multi-device, support, and Store evidence rules" `
            "packet verifier does not check all release evidence rules"
    }

    $templatePath = Join-Path $packetRoot "support-mailbox-record-template.json"
    if (Test-Path -LiteralPath $templatePath) {
        try {
            $template = Get-Content -LiteralPath $templatePath -Raw | ConvertFrom-Json
            Add-CheckFromCondition "support template email" ([string]$template.support_email -eq $expectedSupportEmail) "support template uses $expectedSupportEmail" "support template does not use the configured support email"
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
    foreach ($kitZip in $kitZips) {
        try {
            Add-Type -AssemblyName System.IO.Compression.FileSystem
            $archive = [System.IO.Compression.ZipFile]::OpenRead($kitZip.FullName)
            try {
                $entries = @($archive.Entries | ForEach-Object { $_.FullName -replace "/", "\" })
                $requiredKitEntries = @(
                    "README_MULTI_DEVICE_TEST_KIT.md",
                    "VERSION",
                    "SHA256SUMS.txt",
                    ".local-build\msix\output\musu_1.15.0.0_x64_local-sideload-manual.msix",
                    ".local-build\msix\output\Yellowhama.MUSU_cert.cer",
                    "scripts\windows\install-and-verify-msix.ps1",
                    "scripts\windows\capture-msix-install-evidence.ps1",
                    "scripts\windows\measure-musu-idle-cpu.ps1",
                    "scripts\windows\measure-musu-runtime-cpu-scenarios.ps1",
                    "scripts\windows\collect-second-pc-handoff.ps1",
                    "scripts\windows\run-second-pc-release-check.ps1",
                    "scripts\windows\smoke-multidevice-beta.ps1",
                    "scripts\windows\verify-msix-install-evidence.ps1",
                    "scripts\windows\record-msix-install-evidence.ps1",
                    "scripts\windows\verify-multidevice-evidence.ps1",
                    "scripts\windows\record-multidevice-evidence.ps1"
                )
                foreach ($requiredKitEntry in $requiredKitEntries) {
                    Add-CheckFromCondition `
                        "kit required entry: $($kitZip.Name): $requiredKitEntry" `
                        ($entries -contains $requiredKitEntry) `
                        "kit contains $requiredKitEntry" `
                        "kit is missing $requiredKitEntry"
                }

                Add-CheckFromCondition `
                    "kit handoff helper: $($kitZip.Name)" `
                    ($entries -contains "scripts\windows\collect-second-pc-handoff.ps1") `
                    "kit contains collect-second-pc-handoff.ps1" `
                    "kit is missing collect-second-pc-handoff.ps1"
                Add-CheckFromCondition `
                    "kit second-PC wrapper: $($kitZip.Name)" `
                    ($entries -contains "scripts\windows\run-second-pc-release-check.ps1") `
                    "kit contains run-second-pc-release-check.ps1" `
                    "kit is missing run-second-pc-release-check.ps1"

                $readmeEntry = $archive.Entries | Where-Object { $_.FullName -eq "README_MULTI_DEVICE_TEST_KIT.md" } | Select-Object -First 1
                if ($readmeEntry) {
                    $reader = [System.IO.StreamReader]::new($readmeEntry.Open())
                    try {
                        $kitReadme = $reader.ReadToEnd()
                    }
                    finally {
                        $reader.Dispose()
                    }
                    Add-CheckFromCondition `
                        "kit readme handoff helper: $($kitZip.Name)" `
                        ($kitReadme -like "*collect-second-pc-handoff.ps1*" -and $kitReadme -like "*suggested_remote_addrs*") `
                        "kit README explains suggested_remote_addrs handoff" `
                        "kit README does not explain second-PC handoff helper"
                    Add-CheckFromCondition `
                        "kit readme install evidence: $($kitZip.Name)" `
                        ($kitReadme -like "*install-and-verify-msix.ps1*" -and $kitReadme -like "*capture-msix-install-evidence.ps1*" -and $kitReadme -like "*run-second-pc-release-check.ps1*" -and $kitReadme -like "*.local-build\msix-install\*.evidence.json*" -and $kitReadme -like "*.local-build\second-pc-return\*.zip*") `
                        "kit README explains MSIX install evidence capture" `
                        "kit README does not explain MSIX install evidence capture"
                    Add-CheckFromCondition `
                        "kit readme runtime CPU evidence: $($kitZip.Name)" `
                        ($kitReadme -like "*measure-musu-idle-cpu.ps1*" -and $kitReadme -like "*Scenario desktop-open*" -and $kitReadme -like "*RequireOwnedWebView2*" -and $kitReadme -like "*.local-build\runtime-idle-cpu\*.evidence.json*" -and $kitReadme -like "*SkipRuntimeIdleCpu*") `
                        "kit README explains second-PC runtime idle CPU evidence capture" `
                        "kit README does not explain second-PC runtime idle CPU evidence capture"
                    Add-CheckFromCondition `
                        "kit readme runtime CPU scenario matrix: $($kitZip.Name)" `
                        ($kitReadme -like "*measure-musu-runtime-cpu-scenarios.ps1*" -and $kitReadme -like "*musu.runtime_cpu_scenario_matrix.v1*" -and $kitReadme -like "*runtime-started*" -and $kitReadme -like "*dashboard-open*" -and $kitReadme -like "*desktop-open*" -and $kitReadme -like "*post-route*" -and $kitReadme -like "*RunRouteProbe*" -and $kitReadme -like "*.local-build\runtime-cpu-scenarios\*") `
                        "kit README explains runtime CPU scenario matrix diagnostics" `
                        "kit README does not explain runtime CPU scenario matrix diagnostics"
                    Add-CheckFromCondition `
                        "kit readme multi-device evidence: $($kitZip.Name)" `
                        ($kitReadme -like "*smoke-multidevice-beta.ps1*" -and $kitReadme -like "*record-multidevice-evidence.ps1*" -and $kitReadme -like "*.local-build\multi-device\*.evidence.json*" -and $kitReadme -like "*musu.route_evidence.v1*" -and $kitReadme -like "*peer identity verification*") `
                        "kit README explains multi-device smoke and route evidence" `
                        "kit README does not explain multi-device smoke and route evidence"
                }
                else {
                    Add-Check "kit readme: $($kitZip.Name)" "fail" "kit is missing README_MULTI_DEVICE_TEST_KIT.md"
                }
            }
            finally {
                $archive.Dispose()
            }
        }
        catch {
            Add-Check "kit inspection: $($kitZip.Name)" "fail" "unable to inspect kit zip: $($_.Exception.Message)"
        }
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
