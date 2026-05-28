function Get-WindowsRepoRoot([string]$ScriptPath) {
    return (Resolve-Path (Join-Path (Split-Path -Parent $ScriptPath) "..\..")).Path
}

function Find-LatestArtifact([string]$Directory, [string]$Filter) {
    if (-not (Test-Path -LiteralPath $Directory)) {
        return $null
    }
    Get-ChildItem -LiteralPath $Directory -Filter $Filter -File |
        Sort-Object LastWriteTime -Descending |
        Select-Object -ExpandProperty FullName -First 1
}

function Get-StartupContractArtifactSuffix([string]$StartupContract) {
    switch ($StartupContract) {
        "local-sideload-manual" { return "local-sideload-manual" }
        "store-reviewed-immediate-registration" { return "store-reviewed-immediate-registration" }
        default { throw "Unknown StartupContract '$StartupContract'" }
    }
}

function Find-LatestMsixArtifact([string]$Directory, [string]$StartupContract) {
    $suffix = Get-StartupContractArtifactSuffix $StartupContract
    return Find-LatestArtifact -Directory $Directory -Filter ("*_{0}.msix" -f $suffix)
}

function Test-IsAdministrator() {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-MsixPackageInfo([string]$Path) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem

    $archive = [System.IO.Compression.ZipFile]::OpenRead($Path)
    try {
        $entry = $archive.Entries | Where-Object {
            $_.FullName -eq "AppxManifest.xml" -or $_.FullName -eq "Package.appxmanifest"
        } | Select-Object -First 1

        if (-not $entry) {
            throw "Unable to locate Appx manifest inside $Path"
        }

        $reader = [System.IO.StreamReader]::new($entry.Open())
        try {
            [xml]$manifest = $reader.ReadToEnd()
        }
        finally {
            $reader.Dispose()
        }

        $identity = $manifest.Package.Identity
        if (-not $identity -or [string]::IsNullOrWhiteSpace($identity.Name)) {
            throw "Unable to read package identity from $Path"
        }

        return @{
            Manifest     = $manifest
            Entries      = @($archive.Entries.FullName)
            IdentityName = [string]$identity.Name
            Publisher    = [string]$identity.Publisher
            Version      = [string]$identity.Version
        }
    }
    finally {
        $archive.Dispose()
    }
}

function New-MsixNamespaceManager([xml]$Manifest) {
    $ns = New-Object System.Xml.XmlNamespaceManager($Manifest.NameTable)
    [void]$ns.AddNamespace("appx", "http://schemas.microsoft.com/appx/manifest/foundation/windows10")
    [void]$ns.AddNamespace("uap", "http://schemas.microsoft.com/appx/manifest/uap/windows10")
    [void]$ns.AddNamespace("uap3", "http://schemas.microsoft.com/appx/manifest/uap/windows10/3")
    [void]$ns.AddNamespace("uap4", "http://schemas.microsoft.com/appx/manifest/uap/windows10/4")
    [void]$ns.AddNamespace("desktop", "http://schemas.microsoft.com/appx/manifest/desktop/windows10")
    [void]$ns.AddNamespace("rescap", "http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities")
    [void]$ns.AddNamespace("rescap5", "http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities/5")
    return ,$ns
}

function Get-MsixStartupContract([xml]$Manifest) {
    $ns = New-MsixNamespaceManager -Manifest $Manifest

    $startupTask = $Manifest.SelectSingleNode(
        "//desktop:Extension[@Category='windows.startupTask']//desktop:StartupTask[@TaskId='MusuBridgeStartup']",
        $ns
    )
    $alias = $Manifest.SelectSingleNode(
        "//uap3:Extension[@Category='windows.appExecutionAlias']//desktop:ExecutionAlias[@Alias='musu.exe']",
        $ns
    )
    $customCapability = $Manifest.SelectSingleNode(
        "//uap4:CustomCapability[@Name='Microsoft.nonUserConfigurableStartupTasks_8wekyb3d8bbwe']",
        $ns
    )
    $runFullTrust = $Manifest.SelectSingleNode(
        "//rescap:Capability[@Name='runFullTrust']",
        $ns
    )

    $identity = $Manifest.SelectSingleNode("/appx:Package/appx:Identity", $ns)

    return [pscustomobject]@{
        IdentityName                               = if ($identity) { $identity.Attributes["Name"].Value } else { $null }
        Version                                    = if ($identity) { $identity.Attributes["Version"].Value } else { $null }
        HasAlias                                   = [bool]$alias
        AliasName                                  = if ($alias) { $alias.GetAttribute("Alias") } else { $null }
        HasStartupTask                             = [bool]$startupTask
        StartupTaskId                              = if ($startupTask) { $startupTask.GetAttribute("TaskId") } else { $null }
        StartupEnabled                             = if ($startupTask) { $startupTask.GetAttribute("Enabled") } else { $null }
        StartupImmediateRegistration               = if ($startupTask) { $startupTask.GetAttribute("ImmediateRegistration", $ns.LookupNamespace("rescap5")) } else { $null }
        HasNonUserConfigurableStartupCapability    = [bool]$customCapability
        HasRunFullTrust                            = [bool]$runFullTrust
    }
}

function Test-MsixStartupContractEquivalent($Left, $Right) {
    if ($null -eq $Left -or $null -eq $Right) {
        return $false
    }

    return (
        $Left.HasAlias -eq $Right.HasAlias -and
        $Left.AliasName -eq $Right.AliasName -and
        $Left.HasStartupTask -eq $Right.HasStartupTask -and
        $Left.StartupTaskId -eq $Right.StartupTaskId -and
        $Left.StartupEnabled -eq $Right.StartupEnabled -and
        $Left.StartupImmediateRegistration -eq $Right.StartupImmediateRegistration -and
        $Left.HasNonUserConfigurableStartupCapability -eq $Right.HasNonUserConfigurableStartupCapability -and
        $Left.HasRunFullTrust -eq $Right.HasRunFullTrust
    )
}

function Get-MusuLegacyWindowsConflicts() {
    $startupDir = [Environment]::GetFolderPath("Startup")
    $startupHelpers = @()
    $disabledStartupHelpers = @()
    if (Test-Path -LiteralPath $startupDir) {
        $allStartupHelpers = @(Get-ChildItem -LiteralPath $startupDir -Force -ErrorAction SilentlyContinue | Where-Object {
            $_.Name -like "*MUSU*"
        })
        $startupHelpers = @($allStartupHelpers | Where-Object { $_.Name -notlike "*.disabled" })
        $disabledStartupHelpers = @($allStartupHelpers | Where-Object { $_.Name -like "*.disabled" })
    }

    $scheduledTasks = @()
    $disabledScheduledTasks = @()
    try {
        $allScheduledTasks = @(Get-ScheduledTask -ErrorAction Stop | Where-Object {
            $_.TaskName -like "*musu*" -or $_.TaskPath -like "*Musu*"
        })
        $scheduledTasks = @($allScheduledTasks | Where-Object { $_.State -ne "Disabled" })
        $disabledScheduledTasks = @($allScheduledTasks | Where-Object { $_.State -eq "Disabled" })
    }
    catch {
        $scheduledTasks = @()
        $disabledScheduledTasks = @()
    }

    $legacyBinPaths = @(
        (Join-Path $HOME ".musu\bin\musu.exe"),
        (Join-Path $HOME ".musu\bin\musud.exe")
    )
    $legacyBins = @($legacyBinPaths | Where-Object { Test-Path -LiteralPath $_ })

    $windowsAppsAliasPath = Join-Path $env:LOCALAPPDATA "Microsoft\WindowsApps\musu.exe"
    $aliasCommands = @(Get-Command musu.exe -All -ErrorAction SilentlyContinue)
    $aliasSources = @($aliasCommands | ForEach-Object { $_.Source })
    $shadowingSources = @($aliasSources | Where-Object { $_ -ne $windowsAppsAliasPath })

    return [pscustomobject]@{
        StartupHelpers         = $startupHelpers
        DisabledStartupHelpers = $disabledStartupHelpers
        ScheduledTasks         = $scheduledTasks
        DisabledScheduledTasks = $disabledScheduledTasks
        LegacyBins             = $legacyBins
        AliasSources           = $aliasSources
        WindowsAppsAlias       = $windowsAppsAliasPath
        AliasShadowing         = $shadowingSources
        ConflictCount          = @($startupHelpers).Count + @($scheduledTasks).Count + @($legacyBins).Count + @($shadowingSources).Count
    }
}
