param(
  [ValidateSet("start", "status", "stop", "restart", "install", "uninstall")]
  [string]$Action = "status",
  [int]$HeartbeatFreshSeconds = 15,
  [int]$SchtasksTimeoutSeconds = 10
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Get-BridgePaths {
  $repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
  $runtimeRoot = Join-Path $repoRoot ".windows-bridge"
  $stateRoot = Join-Path $runtimeRoot "state"
  $localAppData = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { Join-Path $env:USERPROFILE "AppData\Local" }
  $startupDir = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Startup)
  $taskName = if ($env:MUSU_WINDOWS_BRIDGE_TASK_NAME) { $env:MUSU_WINDOWS_BRIDGE_TASK_NAME.Trim() } else { "MUSU Windows Bridge Helper" }
  $localInstallRoot = Join-Path (Join-Path $localAppData "MUSU") "WindowsBridge"
  $serviceLauncherPath = Join-Path $localInstallRoot "start-helper-service.cmd"
  $startupLauncherName = (($taskName -replace '[<>:"/\\|?*]', '_') + ".cmd")
  $startupLauncherPath = Join-Path $startupDir $startupLauncherName

  return [pscustomobject]@{
    RepoRoot            = $repoRoot
    RuntimeRoot         = $runtimeRoot
    StateRoot           = $stateRoot
    HeartbeatPath       = (Join-Path $stateRoot "helper-heartbeat.json")
    InstallStatePath    = (Join-Path $stateRoot "helper-install-state.json")
    HelperScriptPath    = (Join-Path $PSScriptRoot "windows-bridge-helper.ps1")
    ScriptDir           = $PSScriptRoot
    LocalInstallRoot    = $localInstallRoot
    ServiceLauncherPath = $serviceLauncherPath
    StartupDir          = $startupDir
    StartupLauncherPath = $startupLauncherPath
    TaskName            = $taskName
    SchtasksPath        = (Join-Path $env:SystemRoot "System32\schtasks.exe")
  }
}

function Ensure-BridgeDirs {
  param([object]$Paths)

  foreach ($path in @($Paths.RuntimeRoot, $Paths.StateRoot, $Paths.LocalInstallRoot)) {
    New-Item -ItemType Directory -Path $path -Force | Out-Null
  }
}

function Write-Utf8NoBom {
  param(
    [string]$Path,
    [string]$Content
  )

  $encoding = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Content, $encoding)
}

function Read-JsonFile {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    return $null
  }

  try {
    return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
  } catch {
    return $null
  }
}

function Get-CompactSummary {
  param([string]$Text)

  if ([string]::IsNullOrWhiteSpace($Text)) {
    return ""
  }

  $singleLine = ($Text -replace "\r?\n", " ") -replace "\s+", " "
  $singleLine = $singleLine.Trim()

  if ($singleLine.Length -gt 240) {
    return $singleLine.Substring(0, 240)
  }

  return $singleLine
}

function Quote-CmdArgument {
  param([string]$Value)

  return '"' + $Value.Replace('"', '""') + '"'
}

function Quote-SchtasksArgument {
  param([string]$Value)

  if ($Value -notmatch '[\s"]') {
    return $Value
  }

  return '"' + $Value.Replace('"', '\"') + '"'
}

function Resolve-TaskUser {
  $username = @($env:USERNAME, $env:USER, $env:LOGNAME) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -First 1
  if (-not $username) {
    return $null
  }

  if ($username.Contains('\')) {
    return $username
  }

  if ($env:USERDOMAIN) {
    return "$($env:USERDOMAIN)\$username"
  }

  return $username
}

function Invoke-Schtasks {
  param(
    [object]$Paths,
    [string[]]$Arguments,
    [int]$TimeoutSeconds = 10
  )

  $stdoutPath = Join-Path $env:TEMP ("musu-schtasks-{0}-stdout.txt" -f ([guid]::NewGuid().ToString("N")))
  $stderrPath = Join-Path $env:TEMP ("musu-schtasks-{0}-stderr.txt" -f ([guid]::NewGuid().ToString("N")))
  $process = $null
  $timedOut = $false

  try {
    $quotedArguments = ($Arguments | ForEach-Object { Quote-SchtasksArgument -Value $_ }) -join " "
    $process = Start-Process -FilePath $Paths.SchtasksPath -ArgumentList $quotedArguments -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
    if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
      $timedOut = $true
      Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    }

    $stdout = if (Test-Path -LiteralPath $stdoutPath) { Get-Content -LiteralPath $stdoutPath -Raw } else { "" }
    $stderr = if (Test-Path -LiteralPath $stderrPath) { Get-Content -LiteralPath $stderrPath -Raw } else { "" }
    $exitCode = if ($timedOut) { 124 } elseif ($process -and $null -ne $process.ExitCode) { [int]$process.ExitCode } else { 1 }
    $detail = if ($timedOut) {
      "schtasks timed out after ${TimeoutSeconds}s"
    } elseif (-not [string]::IsNullOrWhiteSpace($stderr)) {
      $stderr.TrimEnd()
    } elseif (-not [string]::IsNullOrWhiteSpace($stdout)) {
      $stdout.TrimEnd()
    } else {
      "schtasks produced no output"
    }

    return [pscustomobject]@{
      exit_code = $exitCode
      timed_out = $timedOut
      stdout    = $stdout
      stderr    = $stderr
      detail    = $detail
      summary   = Get-CompactSummary -Text $detail
    }
  } finally {
    foreach ($path in @($stdoutPath, $stderrPath)) {
      if (Test-Path -LiteralPath $path) {
        Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
      }
    }
  }
}

function Should-FallbackToStartup {
  param([object]$Result)

  if ($Result.exit_code -eq 0) {
    return $false
  }

  return $true
}

function Write-ServiceLauncher {
  param([object]$Paths)

  $content = @(
    "@echo off",
    "setlocal",
    "powershell.exe -NoProfile -ExecutionPolicy Bypass -File $(Quote-CmdArgument -Value $Paths.HelperScriptPath)",
    "endlocal"
  ) -join [Environment]::NewLine

  Write-Utf8NoBom -Path $Paths.ServiceLauncherPath -Content ($content + [Environment]::NewLine)
}

function Write-StartupLauncher {
  param([object]$Paths)

  $content = @(
    "@echo off",
    "setlocal",
    "call $(Quote-CmdArgument -Value $Paths.ServiceLauncherPath)",
    "endlocal"
  ) -join [Environment]::NewLine

  Write-Utf8NoBom -Path $Paths.StartupLauncherPath -Content ($content + [Environment]::NewLine)
}

function Get-HelperRuntimeStatus {
  param(
    [object]$Paths,
    [int]$FreshSeconds = 15
  )

  $payload = Read-JsonFile -Path $Paths.HeartbeatPath
  $heartbeatExists = Test-Path -LiteralPath $Paths.HeartbeatPath
  $state = "offline"
  $helperPid = $null
  $helperHost = ""
  $lastSeen = ""
  $ageSeconds = $null
  $processAlive = $false

  if ($heartbeatExists -and $payload) {
    if ($null -ne $payload.pid -and [string]$payload.pid -match '^\d+$') {
      $helperPid = [int]$payload.pid
      $processAlive = $null -ne (Get-Process -Id $helperPid -ErrorAction SilentlyContinue)
    }
    if ($null -ne $payload.host) {
      $helperHost = [string]$payload.host
    }
    if ($null -ne $payload.last_seen) {
      $lastSeen = [string]$payload.last_seen
    }
  }

  if ($heartbeatExists) {
    $heartbeatAge = New-TimeSpan -Start (Get-Item -LiteralPath $Paths.HeartbeatPath).LastWriteTimeUtc -End (Get-Date).ToUniversalTime()
    $ageSeconds = [int][Math]::Max([Math]::Floor($heartbeatAge.TotalSeconds), 0)
    if ($ageSeconds -le $FreshSeconds -and (($null -eq $helperPid) -or $processAlive)) {
      $state = "online"
    } else {
      $state = "stale"
    }
  }

  return [pscustomobject][ordered]@{
    state            = $state
    runtime_state    = $state
    heartbeat_exists = $heartbeatExists
    heartbeat_path   = $Paths.HeartbeatPath
    pid              = $helperPid
    pid_running      = $processAlive
    host             = $helperHost
    last_seen        = $lastSeen
    age_seconds      = $ageSeconds
  }
}

function Get-InstallStatus {
  param(
    [object]$Paths,
    [object]$RuntimeStatus
  )

  $taskQuery = Invoke-Schtasks -Paths $Paths -Arguments @("/Query", "/TN", $Paths.TaskName, "/FO", "LIST") -TimeoutSeconds $SchtasksTimeoutSeconds
  $taskInstalled = $taskQuery.exit_code -eq 0
  $startupExists = Test-Path -LiteralPath $Paths.StartupLauncherPath
  $serviceLauncherExists = Test-Path -LiteralPath $Paths.ServiceLauncherPath
  $installState = "not-installed"
  $installStateSource = "none"

  if ($taskInstalled) {
    $installState = "scheduled-task"
    $installStateSource = "scheduled-task"
  } elseif ($startupExists) {
    $installState = "startup-folder"
    $installStateSource = "startup-folder"
  } elseif ($RuntimeStatus.runtime_state -ne "offline") {
    $installState = "manual"
    $installStateSource = "runtime-only"
  }

  return [pscustomobject][ordered]@{
    install_state           = $installState
    install_state_source    = $installStateSource
    task_name               = $Paths.TaskName
    task_installed          = $taskInstalled
    task_query_exit_code    = $taskQuery.exit_code
    task_query_summary      = $taskQuery.summary
    startup_launcher_path   = $Paths.StartupLauncherPath
    startup_launcher_exists = $startupExists
    service_launcher_path   = $Paths.ServiceLauncherPath
    service_launcher_exists = $serviceLauncherExists
    helper_script_path      = $Paths.HelperScriptPath
  }
}

function Get-RecommendedAction {
  param(
    [string]$RuntimeState,
    [string]$InstallState
  )

  if ($RuntimeState -eq "online") {
    return "none"
  }
  if ($RuntimeState -eq "stale") {
    return "restart"
  }
  if ($InstallState -eq "not-installed") {
    return "install"
  }
  return "start"
}

function Get-CombinedStatus {
  param([object]$Paths)

  $runtime = Get-HelperRuntimeStatus -Paths $Paths -FreshSeconds $HeartbeatFreshSeconds
  $install = Get-InstallStatus -Paths $Paths -RuntimeStatus $runtime
  $recommendedAction = Get-RecommendedAction -RuntimeState $runtime.runtime_state -InstallState $install.install_state

  return [pscustomobject][ordered]@{
    version                 = 1
    checked_at              = (Get-Date).ToString("o")
    host                    = $env:COMPUTERNAME
    state                   = $runtime.runtime_state
    runtime_state           = $runtime.runtime_state
    install_state           = $install.install_state
    install_state_source    = $install.install_state_source
    recommended_action      = $recommendedAction
    pid                     = $runtime.pid
    pid_running             = $runtime.pid_running
    last_seen               = $runtime.last_seen
    age_seconds             = $runtime.age_seconds
    heartbeat_exists        = $runtime.heartbeat_exists
    heartbeat_path          = $runtime.heartbeat_path
    task_name               = $install.task_name
    task_installed          = $install.task_installed
    task_query_exit_code    = $install.task_query_exit_code
    task_query_summary      = $install.task_query_summary
    startup_launcher_path   = $install.startup_launcher_path
    startup_launcher_exists = $install.startup_launcher_exists
    service_launcher_path   = $install.service_launcher_path
    service_launcher_exists = $install.service_launcher_exists
    helper_script_path      = $install.helper_script_path
  }
}

function Write-InstallStateCache {
  param(
    [object]$Paths,
    [object]$Status
  )

  Write-Utf8NoBom -Path $Paths.InstallStatePath -Content (($Status | ConvertTo-Json -Depth 8) + [Environment]::NewLine)
}

function Start-HelperProcess {
  param([object]$Paths)

  if (-not (Test-Path -LiteralPath $Paths.HelperScriptPath)) {
    throw "Helper script not found: $($Paths.HelperScriptPath)"
  }

  $process = Start-Process -FilePath "powershell.exe" -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", $Paths.HelperScriptPath
  ) -WorkingDirectory $Paths.ScriptDir -WindowStyle Hidden -PassThru

  Start-Sleep -Milliseconds 1200

  return [pscustomobject][ordered]@{
    launched    = $true
    launch_pid  = $process.Id
    launch_time = (Get-Date).ToString("o")
  }
}

function Stop-HelperProcess {
  param(
    [object]$Paths,
    [object]$RuntimeStatus
  )

  $stoppedPid = $null
  $stopped = $false

  if ($null -ne $RuntimeStatus.pid) {
    $existingProcess = Get-Process -Id $RuntimeStatus.pid -ErrorAction SilentlyContinue
    if ($existingProcess) {
      Stop-Process -Id $RuntimeStatus.pid -Force -ErrorAction Stop
      $stopped = $true
      $stoppedPid = $RuntimeStatus.pid
      Start-Sleep -Milliseconds 500
    }
  }

  if (Test-Path -LiteralPath $Paths.HeartbeatPath) {
    Remove-Item -LiteralPath $Paths.HeartbeatPath -Force -ErrorAction SilentlyContinue
  }

  return [pscustomobject][ordered]@{
    stopped     = $stopped
    stopped_pid = $stoppedPid
  }
}

function Install-HelperService {
  param([object]$Paths)

  Write-ServiceLauncher -Paths $Paths

  $baseArgs = @(
    "/Create",
    "/F",
    "/SC",
    "ONLOGON",
    "/RL",
    "LIMITED",
    "/TN",
    $Paths.TaskName,
    "/TR",
    $Paths.ServiceLauncherPath
  )

  $taskUser = Resolve-TaskUser
  $createResult = if ($taskUser) {
    Invoke-Schtasks -Paths $Paths -Arguments ($baseArgs + @("/RU", $taskUser, "/NP", "/IT")) -TimeoutSeconds $SchtasksTimeoutSeconds
  } else {
    Invoke-Schtasks -Paths $Paths -Arguments $baseArgs -TimeoutSeconds $SchtasksTimeoutSeconds
  }

  if ($createResult.exit_code -ne 0 -and $taskUser) {
    $createResult = Invoke-Schtasks -Paths $Paths -Arguments $baseArgs -TimeoutSeconds $SchtasksTimeoutSeconds
  }

  $installMode = "scheduled-task"
  $fallbackReason = ""
  $runResult = $null

  if ($createResult.exit_code -ne 0) {
    if (Should-FallbackToStartup -Result $createResult) {
      Write-StartupLauncher -Paths $Paths
      $installMode = "startup-folder"
      $fallbackReason = $createResult.summary
    } else {
      throw "schtasks create failed: $($createResult.detail)"
    }
  } else {
    if (Test-Path -LiteralPath $Paths.StartupLauncherPath) {
      Remove-Item -LiteralPath $Paths.StartupLauncherPath -Force -ErrorAction SilentlyContinue
    }
    $runResult = Invoke-Schtasks -Paths $Paths -Arguments @("/Run", "/TN", $Paths.TaskName) -TimeoutSeconds $SchtasksTimeoutSeconds
  }

  $startResult = Start-HelperProcess -Paths $Paths
  $taskRunExitCode = if ($runResult) { $runResult.exit_code } else { $null }
  $taskRunSummary = if ($runResult) { $runResult.summary } else { "" }

  return [pscustomobject][ordered]@{
    install_requested       = $true
    install_mode            = $installMode
    task_create_exit_code   = $createResult.exit_code
    task_create_summary     = $createResult.summary
    task_run_exit_code      = $taskRunExitCode
    task_run_summary        = $taskRunSummary
    startup_fallback_reason = $fallbackReason
    launch_pid              = $startResult.launch_pid
  }
}

function Uninstall-HelperService {
  param([object]$Paths)

  $taskQuery = Invoke-Schtasks -Paths $Paths -Arguments @("/Query", "/TN", $Paths.TaskName, "/FO", "LIST") -TimeoutSeconds $SchtasksTimeoutSeconds
  $taskDelete = $null

  if ($taskQuery.exit_code -eq 0) {
    $taskDelete = Invoke-Schtasks -Paths $Paths -Arguments @("/Delete", "/F", "/TN", $Paths.TaskName) -TimeoutSeconds $SchtasksTimeoutSeconds
  }

  $startupRemoved = $false
  if (Test-Path -LiteralPath $Paths.StartupLauncherPath) {
    Remove-Item -LiteralPath $Paths.StartupLauncherPath -Force -ErrorAction SilentlyContinue
    $startupRemoved = $true
  }

  $serviceLauncherRemoved = $false
  if (Test-Path -LiteralPath $Paths.ServiceLauncherPath) {
    Remove-Item -LiteralPath $Paths.ServiceLauncherPath -Force -ErrorAction SilentlyContinue
    $serviceLauncherRemoved = $true
  }

  $stopResult = Stop-HelperProcess -Paths $Paths -RuntimeStatus (Get-HelperRuntimeStatus -Paths $Paths -FreshSeconds $HeartbeatFreshSeconds)
  $taskDeleteExitCode = if ($taskDelete) { $taskDelete.exit_code } else { $null }
  $taskDeleteSummary = if ($taskDelete) { $taskDelete.summary } else { "" }

  return [pscustomobject][ordered]@{
    uninstall_requested      = $true
    task_installed_before    = ($taskQuery.exit_code -eq 0)
    task_delete_exit_code    = $taskDeleteExitCode
    task_delete_summary      = $taskDeleteSummary
    startup_launcher_removed = $startupRemoved
    service_launcher_removed = $serviceLauncherRemoved
    stopped                  = $stopResult.stopped
    stopped_pid              = $stopResult.stopped_pid
  }
}

$paths = Get-BridgePaths
Ensure-BridgeDirs -Paths $paths

$actionResult = $null

switch ($Action) {
  "start" {
    $currentStatus = Get-CombinedStatus -Paths $paths
    if ($currentStatus.runtime_state -eq "online") {
      $actionResult = [pscustomobject][ordered]@{
        already_online = $true
        pid            = $currentStatus.pid
      }
    } else {
      $actionResult = Start-HelperProcess -Paths $paths
    }
  }
  "stop" {
    $actionResult = Stop-HelperProcess -Paths $paths -RuntimeStatus (Get-HelperRuntimeStatus -Paths $paths -FreshSeconds $HeartbeatFreshSeconds)
  }
  "restart" {
    $null = Stop-HelperProcess -Paths $paths -RuntimeStatus (Get-HelperRuntimeStatus -Paths $paths -FreshSeconds $HeartbeatFreshSeconds)
    $actionResult = Start-HelperProcess -Paths $paths
  }
  "install" {
    $actionResult = Install-HelperService -Paths $paths
  }
  "uninstall" {
    $actionResult = Uninstall-HelperService -Paths $paths
  }
  "status" {
    $actionResult = [pscustomobject][ordered]@{
      status_only = $true
    }
  }
}

$status = Get-CombinedStatus -Paths $paths
$response = [pscustomobject][ordered]@{
  action       = $Action
  action_result = $actionResult
}

foreach ($property in $status.PSObject.Properties) {
  $response | Add-Member -NotePropertyName $property.Name -NotePropertyValue $property.Value
}

Write-InstallStateCache -Paths $paths -Status $status
$response | ConvertTo-Json -Depth 8
