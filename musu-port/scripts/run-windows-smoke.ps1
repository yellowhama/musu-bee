param(
  [string]$VsInstallPath = "",
  [string]$CargoPath = "$env:USERPROFILE\.cargo\bin\cargo.exe",
  [string]$TargetDir = ""
)

$ErrorActionPreference = "Stop"

function Resolve-DevShellModulePath {
  param([string]$ExplicitPath)

  if ($ExplicitPath) {
    $candidate = Join-Path $ExplicitPath "Common7\Tools\Microsoft.VisualStudio.DevShell.dll"
    if (Test-Path -LiteralPath $candidate) {
      return $candidate
    }
    throw "DevShell module not found under VsInstallPath: $ExplicitPath"
  }

  $candidates = @(
    "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\Microsoft.VisualStudio.DevShell.dll",
    "C:\Program Files\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\Microsoft.VisualStudio.DevShell.dll",
    "C:\Program Files (x86)\Microsoft Visual Studio\2019\BuildTools\Common7\Tools\Microsoft.VisualStudio.DevShell.dll",
    "C:\Program Files\Microsoft Visual Studio\2019\BuildTools\Common7\Tools\Microsoft.VisualStudio.DevShell.dll"
  )

  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) {
      return $candidate
    }
  }

  throw "Could not find Microsoft.VisualStudio.DevShell.dll. Pass -VsInstallPath explicitly."
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$smokeScript = Join-Path $scriptDir "windows-native-smoke.ps1"

if ([string]::IsNullOrWhiteSpace($TargetDir)) {
  $TargetDir = Join-Path $env:TEMP ("musu-port-win-target-" + [guid]::NewGuid().ToString("N"))
}

if (-not (Test-Path -LiteralPath $CargoPath)) {
  throw "cargo.exe not found: $CargoPath"
}

$devShellModule = Resolve-DevShellModulePath -ExplicitPath $VsInstallPath
Import-Module $devShellModule

$resolvedVsInstallPath = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $devShellModule))
Enter-VsDevShell -VsInstallPath $resolvedVsInstallPath -DevCmdArguments "-arch=amd64 -host_arch=amd64"

Set-Location $repoRoot
$env:CARGO_TARGET_DIR = $TargetDir

& $CargoPath `
  --config "env.CC.value='cl.exe'" `
  --config "env.CC.force=true" `
  --config "env.CXX.value='cl.exe'" `
  --config "env.CXX.force=true" `
  --config "env.AR.value='lib.exe'" `
  --config "env.AR.force=true" `
  --config "env.RANLIB.value='lib.exe'" `
  --config "env.RANLIB.force=true" `
  build -p musu-portd

$exePath = Join-Path $env:CARGO_TARGET_DIR "debug\musu-portd.exe"

if (-not (Test-Path -LiteralPath $exePath)) {
  throw "Built executable not found: $exePath"
}

& $smokeScript -ExePath $exePath
