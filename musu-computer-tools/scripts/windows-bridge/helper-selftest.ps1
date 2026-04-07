param(
  [string]$Label = "windows-bridge-helper-selftest"
)

$ErrorActionPreference = "Stop"

[ordered]@{
  ok = $true
  label = $Label
  cwd = (Get-Location).Path
  timestamp = (Get-Date).ToString("o")
} | ConvertTo-Json -Depth 4
