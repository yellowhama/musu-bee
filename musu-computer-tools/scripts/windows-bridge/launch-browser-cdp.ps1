param(
  [ValidateSet("auto", "edge", "chrome")]
  [string]$Browser = "auto",
  [int]$Port = 9222,
  [string]$BindHost = "127.0.0.1",
  [string]$UserDataDir = "",
  [string]$InitialUrl = "about:blank",
  [int]$ProbeTimeoutSeconds = 5,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if ($Port -lt 1 -or $Port -gt 65535) {
  throw "Port must be between 1 and 65535."
}

if ($ProbeTimeoutSeconds -lt 1) {
  throw "ProbeTimeoutSeconds must be at least 1."
}

function Get-BrowserCandidates {
  $programFiles = @($env:ProgramFiles, ${env:ProgramFiles(x86)}) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
  return [ordered]@{
    edge = @(
      (Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe"),
      (Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe")
    ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
    chrome = @(
      (Join-Path $env:ProgramFiles "Google\Chrome\Application\chrome.exe"),
      (Join-Path ${env:ProgramFiles(x86)} "Google\Chrome\Application\chrome.exe")
    ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
  }
}

function Get-BrowserOrder {
  param([string]$RequestedBrowser)

  switch ($RequestedBrowser) {
    "edge" { return @("edge") }
    "chrome" { return @("chrome") }
    default { return @("edge", "chrome") }
  }
}

function Resolve-BrowserExecutable {
  param([string]$RequestedBrowser)

  $candidates = Get-BrowserCandidates
  foreach ($browserName in (Get-BrowserOrder -RequestedBrowser $RequestedBrowser)) {
    foreach ($candidatePath in $candidates[$browserName]) {
      if (Test-Path -LiteralPath $candidatePath) {
        return [pscustomobject]@{
          browser_name = $browserName
          browser_path = $candidatePath
          candidate_paths = $candidates[$browserName]
        }
      }
    }
  }

  $allCandidates = @()
  foreach ($browserName in $candidates.Keys) {
    $allCandidates += $candidates[$browserName]
  }

  throw "No supported browser executable found. Checked: $($allCandidates -join ', ')"
}

function Resolve-UserDataDir {
  param(
    [string]$ExplicitDir,
    [string]$ResolvedBrowser,
    [int]$ResolvedPort
  )

  if (-not [string]::IsNullOrWhiteSpace($ExplicitDir)) {
    return $ExplicitDir
  }

  $localAppData = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { Join-Path $env:USERPROFILE "AppData\Local" }
  $browserStateRoot = Join-Path (Join-Path $localAppData "MUSU") "BrowserCDP"
  return Join-Path $browserStateRoot ("{0}-{1}" -f $ResolvedBrowser, $ResolvedPort)
}

function Get-LaunchArguments {
  param(
    [int]$ResolvedPort,
    [string]$ResolvedBindHost,
    [string]$ResolvedUserDataDir,
    [string]$ResolvedInitialUrl
  )

  return @(
    "--remote-debugging-port=$ResolvedPort",
    "--remote-debugging-address=$ResolvedBindHost",
    "--user-data-dir=$ResolvedUserDataDir",
    "--no-first-run",
    "--no-default-browser-check",
    "--new-window",
    $ResolvedInitialUrl
  )
}

function Invoke-VersionProbe {
  param(
    [string]$VersionUrl,
    [int]$TimeoutSeconds
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $lastError = ""

  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-RestMethod -Uri $VersionUrl -Method Get -TimeoutSec 2
      return [pscustomobject]@{
        reachable = $true
        browser_name = [string]$response.Browser
        protocol_version = [string]$response."Protocol-Version"
        websocket_debugger_url = [string]$response.webSocketDebuggerUrl
        error = ""
      }
    } catch {
      $lastError = ($_.Exception.Message | Out-String).Trim()
      Start-Sleep -Milliseconds 500
    }
  }

  return [pscustomobject]@{
    reachable = $false
    browser_name = ""
    protocol_version = ""
    websocket_debugger_url = ""
    error = $lastError
  }
}

$resolvedBrowser = Resolve-BrowserExecutable -RequestedBrowser $Browser
$resolvedUserDataDir = Resolve-UserDataDir -ExplicitDir $UserDataDir -ResolvedBrowser $resolvedBrowser.browser_name -ResolvedPort $Port
$launchArguments = Get-LaunchArguments -ResolvedPort $Port -ResolvedBindHost $BindHost -ResolvedUserDataDir $resolvedUserDataDir -ResolvedInitialUrl $InitialUrl
$versionUrl = "http://{0}:{1}/json/version" -f $BindHost, $Port
$listUrl = "http://{0}:{1}/json/list" -f $BindHost, $Port

$result = [ordered]@{
  browser = $resolvedBrowser.browser_name
  browser_path = $resolvedBrowser.browser_path
  candidate_paths = $resolvedBrowser.candidate_paths
  remote_debugging_port = $Port
  remote_debugging_address = $BindHost
  endpoint_base_url = "http://{0}:{1}" -f $BindHost, $Port
  version_url = $versionUrl
  list_url = $listUrl
  user_data_dir = $resolvedUserDataDir
  launch_arguments = $launchArguments
  initial_url = $InitialUrl
  dry_run = [bool]$DryRun
  launched = $false
  pid = $null
  probe_reachable = $false
  probe_browser_name = ""
  probe_protocol_version = ""
  probe_websocket_debugger_url = ""
  probe_error = ""
  recommended_next_action = "Run probe-browser-cdp.sh against the endpoint after browser launch."
}

if ($DryRun) {
  $result["recommended_next_action"] = "Remove -DryRun to launch the browser, then run probe-browser-cdp.sh."
  $result | ConvertTo-Json -Depth 6
  exit 0
}

New-Item -ItemType Directory -Path $resolvedUserDataDir -Force | Out-Null
$process = Start-Process -FilePath $resolvedBrowser.browser_path -ArgumentList $launchArguments -PassThru
$result["launched"] = $true
$result["pid"] = $process.Id

$probe = Invoke-VersionProbe -VersionUrl $versionUrl -TimeoutSeconds $ProbeTimeoutSeconds
$result["probe_reachable"] = [bool]$probe.reachable
$result["probe_browser_name"] = $probe.browser_name
$result["probe_protocol_version"] = $probe.protocol_version
$result["probe_websocket_debugger_url"] = $probe.websocket_debugger_url
$result["probe_error"] = $probe.error

if ($probe.reachable) {
  $result["recommended_next_action"] = "CDP endpoint is reachable; continue with probe-browser-cdp.sh or a CDP consumer."
} else {
  $result["recommended_next_action"] = "Browser launched but CDP endpoint did not answer yet; inspect browser process and re-run probe-browser-cdp.sh."
}

$result | ConvertTo-Json -Depth 6
