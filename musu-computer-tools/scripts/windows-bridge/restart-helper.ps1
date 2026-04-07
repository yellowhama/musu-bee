param(
  [Parameter(Mandatory = $true, Position = 0)]
  [int]$CurrentHelperPid,
  [Parameter(Mandatory = $true, Position = 1)]
  [string]$LauncherPath
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $LauncherPath)) {
  throw "Launcher not found: $LauncherPath"
}

Start-Process -FilePath $LauncherPath | Out-Null

$shutdownCommand = "Start-Sleep -Seconds 2; Stop-Process -Id $CurrentHelperPid -Force"
Start-Process -FilePath "powershell.exe" -ArgumentList @(
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-Command", $shutdownCommand
) | Out-Null

[ordered]@{
  restarted_pid = $CurrentHelperPid
  launcher_path = $LauncherPath
  timestamp = (Get-Date).ToString("o")
} | ConvertTo-Json -Depth 4
