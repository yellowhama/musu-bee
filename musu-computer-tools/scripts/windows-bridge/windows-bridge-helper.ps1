param(
  [int]$PollIntervalMs = 500,
  [switch]$RunOnce,
  [string]$SingleRequestPath = ""
)

$ErrorActionPreference = "Stop"

function Get-BridgePaths {
  $repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
  $runtimeRoot = Join-Path $repoRoot ".windows-bridge"

  return [pscustomobject]@{
    RepoRoot   = $repoRoot
    Runtime    = $runtimeRoot
    Queue      = Join-Path $runtimeRoot "queue"
    Processing = Join-Path $runtimeRoot "processing"
    Results    = Join-Path $runtimeRoot "results"
    Logs       = Join-Path $runtimeRoot "logs"
    State      = Join-Path $runtimeRoot "state"
  }
}

function Ensure-BridgeDirs {
  param([object]$Paths)

  foreach ($path in @($Paths.Runtime, $Paths.Queue, $Paths.Processing, $Paths.Results, $Paths.Logs, $Paths.State)) {
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

function Convert-InteropPath {
  param(
    [string]$Path,
    [string]$WslDistro
  )

  if ([string]::IsNullOrWhiteSpace($Path)) {
    return $Path
  }

  if ($Path.StartsWith("\\")) {
    return $Path
  }

  if ($Path -match '^[A-Za-z]:\\') {
    return $Path
  }

  if ($Path -match '^/mnt/([a-zA-Z])/(.*)$') {
    $drive = $Matches[1].ToUpperInvariant()
    $rest = $Matches[2] -replace '/', '\'
    return "{0}:\{1}" -f $drive, $rest
  }

  if ($Path.StartsWith('/')) {
    $distro = if ($WslDistro) { $WslDistro } else { "Ubuntu-22.04" }
    $trimmed = $Path.TrimStart('/')
    $rest = $trimmed -replace '/', '\'
    return "\\wsl.localhost\$distro\$rest"
  }

  return $Path
}

function Get-CompactSummary {
  param([string]$Text)

  if ([string]::IsNullOrWhiteSpace($Text)) {
    return ""
  }

  $singleLine = ($Text -replace "\r?\n", ' ') -replace '\s+', ' '
  $singleLine = $singleLine.Trim()

  if ($singleLine.Length -gt 240) {
    return $singleLine.Substring(0, 240)
  }

  return $singleLine
}

function Format-PowerShellCliArgument {
  param([string]$Argument)

  if ($Argument -match '^-[A-Za-z][A-Za-z0-9_-]*$') {
    return $Argument
  }

  return "'" + $Argument.Replace("'", "''") + "'"
}

function Get-RelativeInteropScriptPath {
  param(
    [string]$ScriptPath,
    [string]$WorkingDirectory
  )

  $normalizedScriptPath = $ScriptPath.TrimEnd('\')
  $normalizedWorkingDirectory = $WorkingDirectory.TrimEnd('\')

  if ($normalizedScriptPath.StartsWith($normalizedWorkingDirectory, [System.StringComparison]::OrdinalIgnoreCase)) {
    $suffix = $normalizedScriptPath.Substring($normalizedWorkingDirectory.Length).TrimStart('\')
    if (-not [string]::IsNullOrWhiteSpace($suffix)) {
      return ".\$suffix"
    }
  }

  return $ScriptPath
}

function Invoke-CmdFileRequest {
  param(
    [object]$Paths,
    [object]$Request
  )

  $scriptPath = Convert-InteropPath -Path ([string]$Request.script_path) -WslDistro ([string]$Request.wsl_distro)
  $workingDirectory = Convert-InteropPath -Path ([string]$Request.working_directory) -WslDistro ([string]$Request.wsl_distro)
  $logPath = Join-Path $Paths.Logs "$($Request.id).log"
  $startedAt = Get-Date
  $exitCode = 0
  $status = "success"
  $outputText = ""

  try {
    if (-not (Test-Path -LiteralPath $scriptPath)) {
      throw "Requested script not found: $scriptPath"
    }

    if (-not (Test-Path -LiteralPath $workingDirectory)) {
      throw "Working directory not found: $workingDirectory"
    }

    $relativeScriptPath = Get-RelativeInteropScriptPath -ScriptPath $scriptPath -WorkingDirectory $workingDirectory
    $escapedScriptPath = $relativeScriptPath.Replace('"', '""')
    $escapedLogPath = $logPath.Replace('"', '""')
    $commandText = "pushd ""$workingDirectory"" && call ""$escapedScriptPath"" > ""$escapedLogPath"" 2>&1"

    Push-Location ($env:SystemRoot)
    $null = & cmd.exe /D /C $commandText 2>&1
    $exitCode = if ($null -ne $LASTEXITCODE) { [int]$LASTEXITCODE } else { 0 }
    $outputText = if (Test-Path -LiteralPath $logPath) {
      (Get-Content -LiteralPath $logPath -Raw)
    } else {
      ""
    }

    if ($exitCode -ne 0) {
      $status = "failed"
    }
  } catch {
    $status = "failed"
    $exitCode = if ($exitCode -eq 0) { 1 } else { $exitCode }
    $outputText = ($_.Exception | Out-String).TrimEnd()
  } finally {
    Pop-Location -ErrorAction SilentlyContinue
  }

  $completedAt = Get-Date

  return [pscustomobject][ordered]@{
    request_id                = [string]$Request.id
    request_kind              = [string]$Request.kind
    display_name              = [string]$Request.display_name
    execution_surface         = [string]$Request.execution_surface
    resolution_reason         = [string]$Request.resolution_reason
    entrypoint_type           = [string]$Request.entrypoint_type
    status                    = $status
    exit_code                 = $exitCode
    started_at                = $startedAt.ToString("o")
    completed_at              = $completedAt.ToString("o")
    duration_ms               = [int][Math]::Round(($completedAt - $startedAt).TotalMilliseconds)
    log_path_windows          = $logPath
    script_path_windows       = $scriptPath
    working_directory_windows = $workingDirectory
    summary                   = Get-CompactSummary -Text $outputText
  }
}

function Write-Heartbeat {
  param([object]$Paths)

  $heartbeatPath = Join-Path $Paths.State "helper-heartbeat.json"
  $payload = [ordered]@{
    version    = 1
    helper     = "windows-bridge-helper"
    host       = $env:COMPUTERNAME
    pid        = $PID
    last_seen  = (Get-Date).ToString("o")
    queue_dir  = $Paths.Queue
    repo_root  = $Paths.RepoRoot
  }

  Write-Utf8NoBom -Path $heartbeatPath -Content (($payload | ConvertTo-Json -Depth 6) + [Environment]::NewLine)
}

function Write-Result {
  param(
    [object]$Paths,
    [string]$RequestId,
    [object]$Payload
  )

  $resultPath = Join-Path $Paths.Results "$RequestId.json"
  Write-Utf8NoBom -Path $resultPath -Content (($Payload | ConvertTo-Json -Depth 8) + [Environment]::NewLine)
}

function Invoke-PowerShellFileRequest {
  param(
    [object]$Paths,
    [object]$Request
  )

  $scriptPath = Convert-InteropPath -Path ([string]$Request.script_path) -WslDistro ([string]$Request.wsl_distro)
  $workingDirectory = Convert-InteropPath -Path ([string]$Request.working_directory) -WslDistro ([string]$Request.wsl_distro)
  $logPath = Join-Path $Paths.Logs "$($Request.id).log"
  $startedAt = Get-Date
  $exitCode = 0
  $status = "success"
  $outputText = ""

  $arguments = @()
  if ($null -ne $Request.arguments) {
    foreach ($argument in $Request.arguments) {
      $arguments += [string]$argument
    }
  }

  try {
    if (-not (Test-Path -LiteralPath $scriptPath)) {
      throw "Requested script not found: $scriptPath"
    }

    if (-not (Test-Path -LiteralPath $workingDirectory)) {
      throw "Working directory not found: $workingDirectory"
    }

    Push-Location $workingDirectory
    $invocationScriptPath = Get-RelativeInteropScriptPath -ScriptPath $scriptPath -WorkingDirectory $workingDirectory
    $escapedInvocationScriptPath = $invocationScriptPath.Replace("'", "''")
    $escapedWorkingDirectory = $workingDirectory.Replace("'", "''")
    $commandParts = @("Set-Location -LiteralPath '$escapedWorkingDirectory';", "& '$escapedInvocationScriptPath'")
    foreach ($argument in $arguments) {
      $commandParts += Format-PowerShellCliArgument -Argument $argument
    }
    $commandText = $commandParts -join " "

    $output = & powershell.exe -NoProfile -ExecutionPolicy Bypass -Command $commandText 2>&1
    $exitCode = if ($null -ne $LASTEXITCODE) { [int]$LASTEXITCODE } else { 0 }
    $outputText = if ($null -eq $output) { "" } else { ($output | Out-String).TrimEnd() }

    if ($exitCode -ne 0) {
      $status = "failed"
    }
  } catch {
    $status = "failed"
    $exitCode = if ($exitCode -eq 0) { 1 } else { $exitCode }
    $outputText = ($_.Exception | Out-String).TrimEnd()
  } finally {
    Pop-Location -ErrorAction SilentlyContinue
  }

  Write-Utf8NoBom -Path $logPath -Content $outputText

  $completedAt = Get-Date

  return [pscustomobject][ordered]@{
    request_id                = [string]$Request.id
    request_kind              = [string]$Request.kind
    display_name              = [string]$Request.display_name
    execution_surface         = [string]$Request.execution_surface
    resolution_reason         = [string]$Request.resolution_reason
    entrypoint_type           = [string]$Request.entrypoint_type
    status                    = $status
    exit_code                 = $exitCode
    started_at                = $startedAt.ToString("o")
    completed_at              = $completedAt.ToString("o")
    duration_ms               = [int][Math]::Round(($completedAt - $startedAt).TotalMilliseconds)
    log_path_windows          = $logPath
    script_path_windows       = $scriptPath
    working_directory_windows = $workingDirectory
    summary                   = Get-CompactSummary -Text $outputText
  }
}

function Process-RequestFile {
  param(
    [object]$Paths,
    [string]$RequestPath
  )

  $request = Get-Content -LiteralPath $RequestPath -Raw | ConvertFrom-Json

  switch ([string]$request.kind) {
    "ping" {
      return [pscustomobject][ordered]@{
        request_id   = [string]$request.id
        status       = "success"
        exit_code    = 0
        started_at   = (Get-Date).ToString("o")
        completed_at = (Get-Date).ToString("o")
        duration_ms  = 0
        summary      = "helper alive"
      }
    }
    "powershell_file" {
      return Invoke-PowerShellFileRequest -Paths $Paths -Request $request
    }
    "cmd_file" {
      return Invoke-CmdFileRequest -Paths $Paths -Request $request
    }
    default {
      return [pscustomobject][ordered]@{
        request_id   = [string]$request.id
        status       = "failed"
        exit_code    = 2
        started_at   = (Get-Date).ToString("o")
        completed_at = (Get-Date).ToString("o")
        duration_ms  = 0
        summary      = "Unsupported request kind: $($request.kind)"
      }
    }
  }
}

$paths = Get-BridgePaths
Ensure-BridgeDirs -Paths $paths

if ($SingleRequestPath) {
  $singleResult = Process-RequestFile -Paths $paths -RequestPath $SingleRequestPath
  Write-Result -Paths $paths -RequestId $singleResult.request_id -Payload $singleResult
  if ($singleResult.status -eq "success") {
    exit 0
  }
  exit $singleResult.exit_code
}

Write-Heartbeat -Paths $paths

while ($true) {
  Write-Heartbeat -Paths $paths
  $requests = @(Get-ChildItem -LiteralPath $paths.Queue -Filter "*.json" -File | Sort-Object LastWriteTimeUtc, Name)

  if ($requests.Count -eq 0) {
    if ($RunOnce) {
      break
    }

    Start-Sleep -Milliseconds $PollIntervalMs
    continue
  }

  foreach ($request in $requests) {
    $processingPath = Join-Path $paths.Processing $request.Name

    try {
      Move-Item -LiteralPath $request.FullName -Destination $processingPath -Force
    } catch {
      continue
    }

    try {
      $result = Process-RequestFile -Paths $paths -RequestPath $processingPath
    } catch {
      $result = [pscustomobject][ordered]@{
        request_id   = [System.IO.Path]::GetFileNameWithoutExtension($request.Name)
        status       = "failed"
        exit_code    = 1
        started_at   = (Get-Date).ToString("o")
        completed_at = (Get-Date).ToString("o")
        duration_ms  = 0
        summary      = Get-CompactSummary -Text (($_.Exception | Out-String).TrimEnd())
      }
    }

    Write-Result -Paths $paths -RequestId $result.request_id -Payload $result
    Remove-Item -LiteralPath $processingPath -Force -ErrorAction SilentlyContinue
    Write-Heartbeat -Paths $paths
  }

  if ($RunOnce) {
    break
  }
}
