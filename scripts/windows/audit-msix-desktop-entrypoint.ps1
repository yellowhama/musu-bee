[CmdletBinding()]
param(
    [ValidateSet("local-sideload-manual", "store-reviewed-immediate-registration")]
    [string]$StartupContract = "store-reviewed-immediate-registration",
    [string]$PackagePath,
    [string]$PackageName,
    [string]$ExpectedApplicationExecutable = "musu-desktop.exe",
    [string]$RuntimeExecutable = "musu.exe",
    [string]$StartupExecutable = "musu-startup.exe",
    [string]$OutputPath,
    [switch]$RequireInstalledPackage,
    [switch]$FailOnProblem,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $scriptDir "msix-common.ps1")

$repoRoot = Get-WindowsRepoRoot $MyInvocation.MyCommand.Path
$version = (Get-Content -LiteralPath (Join-Path $repoRoot "VERSION") -Raw).Trim()

if ([string]::IsNullOrWhiteSpace($PackagePath)) {
    $PackagePath = Find-LatestMsixArtifact -Directory (Join-Path $repoRoot ".local-build\msix\output") -StartupContract $StartupContract
}

$checks = New-Object System.Collections.Generic.List[object]
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

function Get-ManifestText {
    param(
        [xml]$Manifest,
        [string]$XPath
    )

    if (-not $Manifest) {
        return ""
    }
    $ns = New-MsixNamespaceManager -Manifest $Manifest
    $node = $Manifest.SelectSingleNode($XPath, $ns)
    if (-not $node) {
        return ""
    }
    return [string]$node.InnerText
}

function Get-MsixDesktopEntrypoint {
    param(
        [xml]$Manifest
    )

    if (-not $Manifest) {
        return $null
    }
    $ns = New-MsixNamespaceManager -Manifest $Manifest
    $application = $Manifest.SelectSingleNode("/appx:Package/appx:Applications/appx:Application", $ns)
    $aliasExtension = $Manifest.SelectSingleNode("//uap3:Extension[@Category='windows.appExecutionAlias']", $ns)
    $alias = $Manifest.SelectSingleNode("//uap3:Extension[@Category='windows.appExecutionAlias']//desktop:ExecutionAlias", $ns)
    $startupExtension = $Manifest.SelectSingleNode("//desktop:Extension[@Category='windows.startupTask']", $ns)
    $startupTask = $Manifest.SelectSingleNode("//desktop:Extension[@Category='windows.startupTask']//desktop:StartupTask", $ns)

    [pscustomobject]@{
        application_id = if ($application) { $application.GetAttribute("Id") } else { $null }
        application_executable = if ($application) { $application.GetAttribute("Executable") } else { $null }
        alias_executable = if ($aliasExtension) { $aliasExtension.GetAttribute("Executable") } else { $null }
        alias_name = if ($alias) { $alias.GetAttribute("Alias") } else { $null }
        startup_executable = if ($startupExtension) { $startupExtension.GetAttribute("Executable") } else { $null }
        startup_task_id = if ($startupTask) { $startupTask.GetAttribute("TaskId") } else { $null }
        display_name = Get-ManifestText -Manifest $Manifest -XPath "/appx:Package/appx:Properties/appx:DisplayName"
        description = Get-ManifestText -Manifest $Manifest -XPath "/appx:Package/appx:Properties/appx:Description"
    }
}

function Test-EntryContainsFile {
    param(
        [object[]]$Entries,
        [string]$FileName
    )

    if ([string]::IsNullOrWhiteSpace($FileName)) {
        return $false
    }
    $matches = @($Entries | Where-Object {
        $entryName = ([string]$_) -replace "/", "\"
        (Split-Path -Leaf $entryName) -ieq $FileName
    })
    return ($matches.Count -gt 0)
}

$packageInfo = $null
$artifactEntrypoint = $null
$pkg = $null
$installedEntrypoint = $null
$installLocation = $null
$installedManifestPath = $null
$startApp = $null
$errorText = $null

try {
    Add-CheckFromCondition "artifact path" (-not [string]::IsNullOrWhiteSpace($PackagePath) -and (Test-Path -LiteralPath $PackagePath)) "MSIX artifact exists" "MSIX artifact is missing"
    if (-not [string]::IsNullOrWhiteSpace($PackagePath) -and (Test-Path -LiteralPath $PackagePath)) {
        $PackagePath = (Resolve-Path -LiteralPath $PackagePath).Path
        $packageInfo = Get-MsixPackageInfo -Path $PackagePath
        $artifactEntrypoint = Get-MsixDesktopEntrypoint -Manifest $packageInfo.Manifest
        if ([string]::IsNullOrWhiteSpace($PackageName)) {
            $PackageName = [string]$packageInfo.IdentityName
        }

        Add-CheckFromCondition "artifact application executable" ([string]$artifactEntrypoint.application_executable -ieq $ExpectedApplicationExecutable) "artifact application executable is $ExpectedApplicationExecutable" "artifact application executable is '$($artifactEntrypoint.application_executable)', expected '$ExpectedApplicationExecutable'"
        Add-CheckFromCondition "artifact application not runtime CLI" ([string]$artifactEntrypoint.application_executable -ine $RuntimeExecutable) "artifact Start-menu app is not the runtime CLI" "artifact Start-menu app launches $RuntimeExecutable, so this is a runtime-only MSIX"
        Add-CheckFromCondition "artifact contains desktop executable" (Test-EntryContainsFile -Entries $packageInfo.Entries -FileName $ExpectedApplicationExecutable) "artifact contains $ExpectedApplicationExecutable" "artifact does not contain $ExpectedApplicationExecutable"
        Add-CheckFromCondition "artifact contains runtime executable" (Test-EntryContainsFile -Entries $packageInfo.Entries -FileName $RuntimeExecutable) "artifact contains $RuntimeExecutable for CLI alias/runtime support" "artifact does not contain $RuntimeExecutable"
        Add-CheckFromCondition "artifact contains startup executable" (Test-EntryContainsFile -Entries $packageInfo.Entries -FileName $StartupExecutable) "artifact contains $StartupExecutable for startup task" "artifact does not contain $StartupExecutable"
        Add-CheckFromCondition "artifact alias executable" ([string]$artifactEntrypoint.alias_executable -ieq $RuntimeExecutable -and [string]$artifactEntrypoint.alias_name -ieq $RuntimeExecutable) "artifact keeps $RuntimeExecutable as the execution alias" "artifact alias is not $RuntimeExecutable"
        Add-CheckFromCondition "artifact startup executable" ([string]$artifactEntrypoint.startup_executable -ieq $StartupExecutable) "artifact startup task uses $StartupExecutable" "artifact startup task does not use $StartupExecutable"
        Add-CheckFromCondition "artifact desktop description" ([string]$artifactEntrypoint.description -notmatch "CLI and bridge runtime") "artifact description does not describe a runtime-only package" "artifact description still says '$($artifactEntrypoint.description)'"
    }

    Add-CheckFromCondition "package identity" (-not [string]::IsNullOrWhiteSpace($PackageName)) "package identity resolved" "package identity could not be resolved"
    if ([bool]$RequireInstalledPackage -and -not [string]::IsNullOrWhiteSpace($PackageName)) {
        $pkg = Get-AppxPackage -Name $PackageName -ErrorAction SilentlyContinue | Select-Object -First 1
    }

    if ($pkg) {
        $installLocation = [string]$pkg.InstallLocation
        $installedManifestPath = Join-Path $installLocation "AppxManifest.xml"
        Add-CheckFromCondition "installed manifest" (Test-Path -LiteralPath $installedManifestPath) "installed AppxManifest.xml exists" "installed AppxManifest.xml is missing"
        if (Test-Path -LiteralPath $installedManifestPath) {
            [xml]$installedManifest = Get-Content -LiteralPath $installedManifestPath
            $installedEntrypoint = Get-MsixDesktopEntrypoint -Manifest $installedManifest
            Add-CheckFromCondition "installed application executable" ([string]$installedEntrypoint.application_executable -ieq $ExpectedApplicationExecutable) "installed application executable is $ExpectedApplicationExecutable" "installed application executable is '$($installedEntrypoint.application_executable)', expected '$ExpectedApplicationExecutable'"
            Add-CheckFromCondition "installed application not runtime CLI" ([string]$installedEntrypoint.application_executable -ine $RuntimeExecutable) "installed Start-menu app is not the runtime CLI" "installed Start-menu app launches $RuntimeExecutable, so the installed package is runtime-only"
            Add-CheckFromCondition "installed desktop executable file" (Test-Path -LiteralPath (Join-Path $installLocation $ExpectedApplicationExecutable)) "installed package contains $ExpectedApplicationExecutable" "installed package does not contain $ExpectedApplicationExecutable"
            Add-CheckFromCondition "installed runtime executable file" (Test-Path -LiteralPath (Join-Path $installLocation $RuntimeExecutable)) "installed package contains $RuntimeExecutable" "installed package does not contain $RuntimeExecutable"
            Add-CheckFromCondition "installed startup executable file" (Test-Path -LiteralPath (Join-Path $installLocation $StartupExecutable)) "installed package contains $StartupExecutable" "installed package does not contain $StartupExecutable"
            Add-CheckFromCondition "installed desktop description" ([string]$installedEntrypoint.description -notmatch "CLI and bridge runtime") "installed description does not describe a runtime-only package" "installed description still says '$($installedEntrypoint.description)'"

            $expectedAppId = if ($pkg.PackageFamilyName -and $installedEntrypoint.application_id) {
                "{0}!{1}" -f $pkg.PackageFamilyName, $installedEntrypoint.application_id
            }
            else {
                $null
            }
            $startApp = if ($expectedAppId) {
                Get-StartApps -ErrorAction SilentlyContinue | Where-Object { $_.AppID -eq $expectedAppId } | Select-Object -First 1
            }
            Add-CheckFromCondition "installed Start menu entry" ($null -ne $startApp) "installed package has a Start menu entry for $expectedAppId" "installed package Start menu entry is missing"
        }
    }
    else {
        Add-CheckFromCondition "installed package" (-not [bool]$RequireInstalledPackage) "installed package is not required for this artifact audit" "package is not installed for the current user"
    }
}
catch {
    $errorText = $_.Exception.Message
    Add-Check -Name "audit error" -Status "fail" -Message $errorText
}

$failCount = @($checks | Where-Object { $_.status -eq "fail" }).Count
$evidence = [pscustomobject]@{
    schema = "musu.msix_desktop_entrypoint_audit.v1"
    ok = ($failCount -eq 0)
    version = $version
    recorded_at = (Get-Date).ToString("o")
    operator_machine = $env:COMPUTERNAME
    operator_user = $env:USERNAME
    repo_root = $repoRoot
    startup_contract = $StartupContract
    package_path = $PackagePath
    package_name = $PackageName
    expected_application_executable = $ExpectedApplicationExecutable
    runtime_executable = $RuntimeExecutable
    startup_executable = $StartupExecutable
    require_installed_package = [bool]$RequireInstalledPackage
    artifact = if ($packageInfo) {
        [pscustomobject]@{
            identity_name = [string]$packageInfo.IdentityName
            version = [string]$packageInfo.Version
            application_id = $artifactEntrypoint.application_id
            application_executable = $artifactEntrypoint.application_executable
            alias_executable = $artifactEntrypoint.alias_executable
            alias_name = $artifactEntrypoint.alias_name
            startup_executable = $artifactEntrypoint.startup_executable
            startup_task_id = $artifactEntrypoint.startup_task_id
            display_name = $artifactEntrypoint.display_name
            description = $artifactEntrypoint.description
            contains_expected_application_executable = Test-EntryContainsFile -Entries $packageInfo.Entries -FileName $ExpectedApplicationExecutable
            contains_runtime_executable = Test-EntryContainsFile -Entries $packageInfo.Entries -FileName $RuntimeExecutable
            contains_startup_executable = Test-EntryContainsFile -Entries $packageInfo.Entries -FileName $StartupExecutable
        }
    }
    else {
        $null
    }
    installed = if ($pkg) {
        [pscustomobject]@{
            package_full_name = [string]$pkg.PackageFullName
            package_family_name = [string]$pkg.PackageFamilyName
            install_location = $installLocation
            manifest_path = $installedManifestPath
            application_id = if ($installedEntrypoint) { $installedEntrypoint.application_id } else { $null }
            application_executable = if ($installedEntrypoint) { $installedEntrypoint.application_executable } else { $null }
            alias_executable = if ($installedEntrypoint) { $installedEntrypoint.alias_executable } else { $null }
            alias_name = if ($installedEntrypoint) { $installedEntrypoint.alias_name } else { $null }
            startup_executable = if ($installedEntrypoint) { $installedEntrypoint.startup_executable } else { $null }
            startup_task_id = if ($installedEntrypoint) { $installedEntrypoint.startup_task_id } else { $null }
            display_name = if ($installedEntrypoint) { $installedEntrypoint.display_name } else { $null }
            description = if ($installedEntrypoint) { $installedEntrypoint.description } else { $null }
            contains_expected_application_executable = if ($installLocation) { Test-Path -LiteralPath (Join-Path $installLocation $ExpectedApplicationExecutable) } else { $false }
            contains_runtime_executable = if ($installLocation) { Test-Path -LiteralPath (Join-Path $installLocation $RuntimeExecutable) } else { $false }
            contains_startup_executable = if ($installLocation) { Test-Path -LiteralPath (Join-Path $installLocation $StartupExecutable) } else { $false }
            start_menu_entry = [bool]$startApp
        }
    }
    else {
        $null
    }
    fail_count = $failCount
    checks = $checks.ToArray()
    error = $errorText
}

if (-not [string]::IsNullOrWhiteSpace($OutputPath)) {
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutputPath) | Out-Null
    $evidence | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $OutputPath -Encoding UTF8
}

if ($Json) {
    $evidence | ConvertTo-Json -Depth 8
}
else {
    "MUSU MSIX desktop entrypoint audit"
    "ok: $($evidence.ok)"
    "package_path: $($evidence.package_path)"
    "expected_application_executable: $ExpectedApplicationExecutable"
    if (-not [string]::IsNullOrWhiteSpace($OutputPath)) {
        "evidence_path: $((Resolve-Path -LiteralPath $OutputPath).Path)"
    }
    ""
    $checks | Format-Table name, status, message -Wrap
}

if ($FailOnProblem -and -not $evidence.ok) {
    exit 1
}
