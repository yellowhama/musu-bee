function Get-WindowsRepoRoot([string]$ScriptPath) {
    return (Resolve-Path (Join-Path (Split-Path -Parent $ScriptPath) "..\..")).Path
}

function Get-MusuSourceGitState {
    param([Parameter(Mandatory = $true)][string]$RepoRoot)

    $gitBranch = (& git -C $RepoRoot rev-parse --abbrev-ref HEAD 2>$null | Out-String).Trim()
    $gitCommit = (& git -C $RepoRoot rev-parse HEAD 2>$null | Out-String).Trim()
    $gitStatusShort = (& git -C $RepoRoot status --short 2>$null | Out-String).Trim()
    if ($gitCommit -match "^[0-9a-f]{40}$") {
        return [pscustomobject]@{
            source = "git"
            branch = $gitBranch
            commit = $gitCommit
            dirty = (-not [string]::IsNullOrWhiteSpace($gitStatusShort))
            status_short = $gitStatusShort
            metadata_path = $null
        }
    }

    $metadataCandidates = @(
        Join-Path $RepoRoot "kit-build-metadata.json",
        Join-Path $RepoRoot "packet-build-metadata.json"
    )
    foreach ($metadataPath in $metadataCandidates) {
        if (-not (Test-Path -LiteralPath $metadataPath)) {
            continue
        }

        try {
            $metadata = Get-Content -LiteralPath $metadataPath -Raw | ConvertFrom-Json
            $metadataCommit = if ($metadata -and $metadata.PSObject.Properties["git"] -and $metadata.git.PSObject.Properties["commit"]) {
                [string]$metadata.git.commit
            }
            else {
                ""
            }
            if ($metadataCommit -notmatch "^[0-9a-f]{40}$") {
                continue
            }

            $metadataStatusShort = if ($metadata.git.PSObject.Properties["status_short"]) {
                [string]$metadata.git.status_short
            }
            else {
                ""
            }
            return [pscustomobject]@{
                source = "metadata"
                branch = if ($metadata.git.PSObject.Properties["branch"]) { [string]$metadata.git.branch } else { "" }
                commit = $metadataCommit
                dirty = if ($metadata.git.PSObject.Properties["dirty"]) { [bool]$metadata.git.dirty } else { $null }
                status_short = $metadataStatusShort
                metadata_path = $metadataPath
            }
        }
        catch {
            continue
        }
    }

    return [pscustomobject]@{
        source = $null
        branch = $gitBranch
        commit = ""
        dirty = $null
        status_short = $gitStatusShort
        metadata_path = $null
    }
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

function Find-LatestMsixCertificateArtifact([string]$Directory) {
    $publicCert = Find-LatestArtifact -Directory $Directory -Filter "*.cer"
    if ($publicCert) {
        return $publicCert
    }
    return Find-LatestArtifact -Directory $Directory -Filter "*.pfx"
}

function Get-MsixCertificateThumbprint([string]$CertPath, [string]$CertPassword = "password") {
    if (-not $CertPath -or -not (Test-Path -LiteralPath $CertPath)) {
        return $null
    }

    $extension = [System.IO.Path]::GetExtension($CertPath).ToLowerInvariant()
    if ($extension -eq ".pfx" -or $extension -eq ".p12") {
        $pwd = ConvertTo-SecureString $CertPassword -AsPlainText -Force
        $pfx = Get-PfxData -FilePath $CertPath -Password $pwd
        return $pfx.EndEntityCertificates[0].Thumbprint
    }

    $cert = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new($CertPath)
    return $cert.Thumbprint
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
    $brainFullTrust = $Manifest.SelectSingleNode(
        "//desktop:Extension[@Category='windows.fullTrustProcess' and @Executable='musu-brain.exe']//desktop:FullTrustProcess",
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
        HasBrainFullTrustProcess                   = [bool]$brainFullTrust
        BrainExecutable                            = if ($brainFullTrust) { $brainFullTrust.ParentNode.GetAttribute("Executable") } else { $null }
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
        $Left.HasBrainFullTrustProcess -eq $Right.HasBrainFullTrustProcess -and
        $Left.BrainExecutable -eq $Right.BrainExecutable -and
        $Left.HasStartupTask -eq $Right.HasStartupTask -and
        $Left.StartupTaskId -eq $Right.StartupTaskId -and
        $Left.StartupEnabled -eq $Right.StartupEnabled -and
        $Left.StartupImmediateRegistration -eq $Right.StartupImmediateRegistration -and
        $Left.HasNonUserConfigurableStartupCapability -eq $Right.HasNonUserConfigurableStartupCapability -and
        $Left.HasRunFullTrust -eq $Right.HasRunFullTrust
    )
}

function Invoke-MusuOptionalProbe {
    param(
        [Parameter(Mandatory = $true)][scriptblock]$ScriptBlock,
        [int]$TimeoutSeconds = 5,
        [string]$Name = "optional probe"
    )

    $job = $null
    try {
        $job = Start-Job -ScriptBlock $ScriptBlock
        $completed = Wait-Job -Job $job -Timeout $TimeoutSeconds
        if ($null -ne $completed) {
            $value = @(Receive-Job -Job $job -ErrorAction Stop)
            return [pscustomobject]@{
                TimedOut = $false
                Error    = $null
                Value    = $value
            }
        }

        Stop-Job -Job $job -ErrorAction SilentlyContinue
        return [pscustomobject]@{
            TimedOut = $true
            Error    = "$Name timed out after ${TimeoutSeconds}s"
            Value    = @()
        }
    }
    catch {
        return [pscustomobject]@{
            TimedOut = $false
            Error    = $_.Exception.Message
            Value    = @()
        }
    }
    finally {
        if ($null -ne $job) {
            Remove-Job -Job $job -Force -ErrorAction SilentlyContinue
        }
    }
}

function Convert-MusuScheduledTaskState {
    param([AllowNull()]$State)

    if ($null -eq $State) {
        return "Unknown"
    }

    if ($State -is [string]) {
        return $State
    }

    switch ([int]$State) {
        1 { return "Disabled" }
        2 { return "Queued" }
        3 { return "Ready" }
        4 { return "Running" }
        default { return "Unknown" }
    }
}

function Get-MusuScheduledTaskConflictsFast {
    $tasks = @(Get-CimInstance -Namespace "root/Microsoft/Windows/TaskScheduler" -ClassName "MSFT_ScheduledTask" -ErrorAction Stop | Where-Object {
        $_.TaskName -like "*musu*" -or $_.TaskPath -like "*Musu*"
    })

    @($tasks | ForEach-Object {
        [pscustomobject]@{
            TaskName = $_.TaskName
            TaskPath = $_.TaskPath
            State    = Convert-MusuScheduledTaskState -State $_.State
        }
    })
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
    $scheduledTaskProbeTimedOut = $false
    $scheduledTaskProbeError = $null
    $scheduledTaskProbeMethod = "cim"
    try {
        $scheduledTaskProbe = [pscustomobject]@{
            TimedOut = $false
            Error    = $null
            Value    = @(Get-MusuScheduledTaskConflictsFast)
        }
    }
    catch {
        $scheduledTaskProbeMethod = "scheduledtasks-job"
        $scheduledTaskProbe = Invoke-MusuOptionalProbe -Name "scheduled task conflict scan" -TimeoutSeconds 5 -ScriptBlock {
            function Convert-MusuScheduledTaskStateInJob {
                param([AllowNull()]$State)

                if ($null -eq $State) {
                    return "Unknown"
                }

                return [string]$State
            }

            @(Get-ScheduledTask -ErrorAction Stop | Where-Object {
                $_.TaskName -like "*musu*" -or $_.TaskPath -like "*Musu*"
            } | ForEach-Object {
                [pscustomobject]@{
                    TaskName = $_.TaskName
                    TaskPath = $_.TaskPath
                    State    = Convert-MusuScheduledTaskStateInJob -State $_.State
                }
            })
        }
    }
    $scheduledTaskProbeTimedOut = [bool]$scheduledTaskProbe.TimedOut
    $scheduledTaskProbeError = $scheduledTaskProbe.Error
    try {
        $allScheduledTasks = @($scheduledTaskProbe.Value)
        $scheduledTasks = @($allScheduledTasks | Where-Object { $_.State -ne "Disabled" })
        $disabledScheduledTasks = @($allScheduledTasks | Where-Object { $_.State -eq "Disabled" })
    }
    catch {
        $scheduledTasks = @()
        $disabledScheduledTasks = @()
        $scheduledTaskProbeError = $_.Exception.Message
    }

    $legacyBinPaths = @(
        (Join-Path $HOME ".musu\bin\musu.exe"),
        (Join-Path $HOME ".musu\bin\musud.exe")
    )
    $legacyBins = @($legacyBinPaths | Where-Object { Test-Path -LiteralPath $_ })

    $windowsAppsAliasPath = Join-Path $env:LOCALAPPDATA "Microsoft\WindowsApps\musu.exe"
    $aliasCommands = @(Get-Command musu.exe -All -ErrorAction SilentlyContinue)
    $aliasSources = @($aliasCommands | ForEach-Object { $_.Source } | Where-Object {
        -not [string]::IsNullOrWhiteSpace([string]$_)
    })
    $windowsAppsAliasPresent = Test-Path -LiteralPath $windowsAppsAliasPath
    $windowsAppsAliasDiscovered = @($aliasSources | Where-Object { $_ -eq $windowsAppsAliasPath })
    $firstAliasPath = if ($aliasSources.Count -gt 0) { $aliasSources[0] } else { $null }
    $alternateAliasSources = @($aliasSources | Where-Object { $_ -ne $windowsAppsAliasPath })
    $shadowingSources = @()
    if (-not [string]::IsNullOrWhiteSpace([string]$firstAliasPath) -and $firstAliasPath -ne $windowsAppsAliasPath) {
        $shadowingSources = @($firstAliasPath)
    }

    return [pscustomobject]@{
        StartupHelpers         = $startupHelpers
        DisabledStartupHelpers = $disabledStartupHelpers
        ScheduledTasks         = $scheduledTasks
        DisabledScheduledTasks = $disabledScheduledTasks
        ScheduledTaskProbeTimedOut = $scheduledTaskProbeTimedOut
        ScheduledTaskProbeError = $scheduledTaskProbeError
        ScheduledTaskProbeMethod = $scheduledTaskProbeMethod
        LegacyBins             = $legacyBins
        AliasSources           = $aliasSources
        WindowsAppsAlias       = $windowsAppsAliasPath
        WindowsAppsAliasPresent = $windowsAppsAliasPresent
        WindowsAppsAliasDiscovered = ($windowsAppsAliasDiscovered.Count -gt 0)
        FirstAliasPath         = $firstAliasPath
        AlternateAliasSources  = $alternateAliasSources
        AliasShadowing         = $shadowingSources
        ConflictCount          = @($startupHelpers).Count + @($scheduledTasks).Count + @($legacyBins).Count + @($shadowingSources).Count
    }
}
