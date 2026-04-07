param(
  [Parameter(Mandatory = $true)]
  [string]$ExePath,
  [string]$DeviceId = "windows-native-smoke",
  [int]$Port = 0,
  [int]$BackendPort = 0,
  [int]$ProbePort = 0,
  [string]$DataRoot = "",
  [string]$DiscoveryProvider = "windows"
)

$ErrorActionPreference = "Stop"

function Get-FreeTcpPort {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
  $listener.Start()
  try {
    return $listener.LocalEndpoint.Port
  } finally {
    $listener.Stop()
  }
}

function Write-Utf8NoBom {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [AllowEmptyString()]
    [string]$Content = ""
  )

  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

function Invoke-JsonGet {
  param(
    [string]$Url,
    [int]$TimeoutSec = 10
  )
  return Invoke-RestMethod -Method Get -Uri $Url -TimeoutSec $TimeoutSec
}

function Invoke-JsonPost {
  param(
    [string]$Url,
    [hashtable]$Body,
    [int]$TimeoutSec = 10
  )
  return Invoke-RestMethod -Method Post -Uri $Url -ContentType "application/json" -Body ($Body | ConvertTo-Json -Depth 8) -TimeoutSec $TimeoutSec
}

function Wait-Health {
  param(
    [string]$Url,
    [int]$TimeoutSeconds = 20
  )
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $payload = Invoke-JsonGet -Url $Url
      if ($payload.status -eq "ok") {
        return $payload
      }
    } catch {
      Start-Sleep -Milliseconds 250
    }
  }
  throw "service did not become healthy: $Url"
}

function Start-BackgroundPowerShellFile {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ScriptPath,
    [string[]]$Arguments = @()
  )

  $psi = [System.Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = "powershell.exe"
  $psi.WorkingDirectory = Split-Path -Parent $ScriptPath
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $escapedScriptPath = $ScriptPath.Replace('"', '`"')
  $escapedArguments = @()
  foreach ($argument in $Arguments) {
    $escapedArguments += ('"' + $argument.Replace('"', '`"') + '"')
  }
  $psi.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$escapedScriptPath`" $($escapedArguments -join ' ')"

  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $psi
  $null = $process.Start()
  return $process
}

if (-not (Test-Path -LiteralPath $ExePath)) {
  throw "ExePath not found: $ExePath"
}

if ([string]::IsNullOrWhiteSpace($DataRoot)) {
  $DataRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("musu-port-win-smoke-" + [guid]::NewGuid().ToString("N"))
}

if ($Port -le 0) {
  $Port = Get-FreeTcpPort
}
if ($BackendPort -le 0) {
  $BackendPort = Get-FreeTcpPort
}
if ($ProbePort -le 0) {
  $ProbePort = Get-FreeTcpPort
}

$null = New-Item -ItemType Directory -Force -Path $DataRoot
$reportsRoot = Join-Path $DataRoot "reports"
$null = New-Item -ItemType Directory -Force -Path $reportsRoot
$seedPath = Join-Path $DataRoot "seed-services.json"
$profilePath = Join-Path $DataRoot "device-profile.json"
$stdoutPath = Join-Path $DataRoot "musu-port.stdout.log"
$stderrPath = Join-Path $DataRoot "musu-port.stderr.log"
$httpScriptPath = Join-Path $DataRoot "http-backend.ps1"
$tcpScriptPath = Join-Path $DataRoot "tcp-probe.ps1"

$seedPayload = ConvertTo-Json @(
  @{
    name = "windows-validation-api"
    alias = "windows-validation-api"
    enabled = $true
    running = $true
    port = $BackendPort
  }
) -Depth 8
Write-Utf8NoBom -Path $seedPath -Content $seedPayload

$profilePayload = @{
  version = "musu.device-profile.v1"
  device_id = $DeviceId
  runtime_kind = "windows"
  filesystem_context = "windows_native"
  launch = @{
    windows_command = $ExePath
  }
  health = @{
    health_path = "/health"
    probe_timeout_ms = 250
  }
  transport = @{
    preferred_ingress = "http"
    supports_connect = $true
    supports_quic = $true
    auto_promote_mcp = $false
  }
  validation = @{
    on_error = "warn"
  }
  path_hints = @{
    windows_root = (Split-Path -Parent (Split-Path -Parent $DataRoot))
  }
  report_roots = @{
    metadata = (Join-Path $reportsRoot "metadata")
    connect = (Join-Path $reportsRoot "connect")
  }
  guidance = @{
    translator_hints = @(
      "prefer .exe when runtime_kind is windows",
      "surface connect_url to AI agents instead of raw target port"
    )
  }
} | ConvertTo-Json -Depth 8
Write-Utf8NoBom -Path $profilePath -Content $profilePayload

Write-Utf8NoBom -Path $httpScriptPath -Content @'
param([int]$ListenPort)
Add-Type -AssemblyName System.Net.HttpListener
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://127.0.0.1:$ListenPort/")
$listener.Start()
try {
  while ($true) {
    $context = $listener.GetContext()
    $body = @{
      ok = $true
      route = $context.Request.RawUrl
      method = $context.Request.HttpMethod
    } | ConvertTo-Json -Depth 8
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
    $context.Response.StatusCode = 200
    $context.Response.ContentType = "application/json"
    $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $context.Response.OutputStream.Close()
  }
} finally {
  $listener.Stop()
}
'@

Write-Utf8NoBom -Path $tcpScriptPath -Content @'
param([int]$ListenPort)
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $ListenPort)
$listener.Start()
try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    $client.Close()
  }
} finally {
  $listener.Stop()
}
'@

$httpProcess = Start-BackgroundPowerShellFile -ScriptPath $httpScriptPath -Arguments @("-ListenPort", "$BackendPort")
$tcpProcess = Start-BackgroundPowerShellFile -ScriptPath $tcpScriptPath -Arguments @("-ListenPort", "$ProbePort")

$process = $null
$stdoutRead = $null
$stderrRead = $null
$failureMessage = $null
$currentStep = "bootstrap"
try {
  $psi = [System.Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = $ExePath
  $psi.WorkingDirectory = (Split-Path -Parent $ExePath)
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.Environment["MUSU_PORT_MANAGER_PORT"] = "$Port"
  $psi.Environment["MUSU_PORT_MANAGER_ALLOW_FALLBACK"] = "false"
  $psi.Environment["MUSU_PORT_SEED_SERVICES"] = $seedPath
  $psi.Environment["MUSU_PORT_DATA_ROOT"] = $DataRoot
  $psi.Environment["MUSU_PORT_DISCOVERY_PROVIDER"] = $DiscoveryProvider
  $psi.Environment["MUSU_DEVICE_ID"] = $DeviceId
  $psi.Environment["MUSU_DEVICE_PROFILE_PATH"] = $profilePath
  $psi.Environment["RUST_LOG"] = "musu_portd=info,musu_port_core=info"

  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $psi
  $null = $process.Start()

  $stdoutRead = $process.StandardOutput.ReadToEndAsync()
  $stderrRead = $process.StandardError.ReadToEndAsync()

  $currentStep = "wait_health"
  Write-Host "windows-native-smoke step: $currentStep"
  $health = Wait-Health -Url "http://127.0.0.1:$Port/health"

  $currentStep = "routes"
  Write-Host "windows-native-smoke step: $currentStep"
  $routes = Invoke-JsonGet -Url "http://127.0.0.1:$Port/routes"
  $routeEntries = @()
  if ($routes -is [System.Array]) {
    $routeEntries = @($routes)
  } elseif ($null -ne $routes.routes) {
    $routeEntries = @($routes.routes)
  } elseif ($null -ne $routes.services) {
    $routeEntries = @($routes.services)
  }

  $currentStep = "discovery"
  Write-Host "windows-native-smoke step: $currentStep"
  $discovery = Invoke-JsonGet -Url "http://127.0.0.1:$Port/discovery" -TimeoutSec 30
  $discoveryEndpoints = @()
  if ($discovery -is [System.Array]) {
    $discoveryEndpoints = @($discovery)
  } elseif ($null -ne $discovery.endpoints) {
    $discoveryEndpoints = @($discovery.endpoints)
  }

  $currentStep = "connect_mode"
  Write-Host "windows-native-smoke step: $currentStep"
  $null = Invoke-JsonPost -Url "http://127.0.0.1:$Port/connect/mode" -Body @{ mode = "preview" }

  $currentStep = "connect_status"
  Write-Host "windows-native-smoke step: $currentStep"
  $connect = Invoke-JsonGet -Url "http://127.0.0.1:$Port/connect/windows-validation-api"

  $currentStep = "coverage"
  Write-Host "windows-native-smoke step: $currentStep"
  $coverage = Invoke-JsonGet -Url "http://127.0.0.1:$Port/coverage" -TimeoutSec 30

  $currentStep = "metadata_export"
  Write-Host "windows-native-smoke step: $currentStep"
  $metadata = Invoke-JsonPost -Url "http://127.0.0.1:$Port/metadata/export" -Body @{ format = "json" } -TimeoutSec 30

  $result = [ordered]@{
    runtime = @{
      device_id = $health.device_id
      runtime_context = $health.runtime_context
      filesystem_context = $health.filesystem_context
      binary_kind = $health.binary_kind
      preferred_executable_kind = $health.preferred_executable_kind
      preferred_executable_path = $health.preferred_executable_path
      discovery_provider = $health.discovery_provider
      data_root = $health.data_root
      device_profile_loaded = $health.device_profile_loaded
    }
    routes = @{
      route_count = if ($null -ne $routes.route_count) { $routes.route_count } else { @($routeEntries).Count }
      has_validation_alias = [bool]($routeEntries | Where-Object {
        $_.alias -eq "windows-validation-api" -or $_.name -eq "windows-validation-api"
      })
    }
    discovery = @{
      endpoint_count = @($discoveryEndpoints).Count
      has_backend_port = [bool]($discoveryEndpoints | Where-Object { $_.port -eq $BackendPort })
      has_probe_port = [bool]($discoveryEndpoints | Where-Object { $_.port -eq $ProbePort })
    }
    connect = @{
      allowed = $connect.allowed
      connect_kind = $connect.connect_kind
      delivery_contract = $connect.delivery_contract
      connect_url = $connect.connect_url
    }
    coverage = @{
      roundtrip_ready = $coverage.metadata_dual_path_status.roundtrip_ready
      windows_data_root = $coverage.metadata_dual_path_status.data_root.windows
    }
    metadata_export = $metadata
    logs = @{
      stdout = $stdoutPath
      stderr = $stderrPath
    }
  }

  $result | ConvertTo-Json -Depth 8
} catch {
  $failureMessage = "$currentStep :: $($_.Exception.Message)"
  Write-Host "windows-native-smoke failure: $failureMessage"
  throw
} finally {
  if ($process -and -not $process.HasExited) {
    $process.Kill()
    $process.WaitForExit()
  }
  if ($stdoutRead) {
    Write-Utf8NoBom -Path $stdoutPath -Content $stdoutRead.Result
  }
  if ($stderrRead) {
    Write-Utf8NoBom -Path $stderrPath -Content $stderrRead.Result
  }
  if ($failureMessage) {
    Write-Host "windows-native-smoke logs:"
    Write-Host "  data_root=$DataRoot"
    Write-Host "  stdout=$stdoutPath"
    Write-Host "  stderr=$stderrPath"
  }
  if ($httpProcess -and -not $httpProcess.HasExited) {
    $httpProcess.Kill()
    $httpProcess.WaitForExit()
  }
  if ($tcpProcess -and -not $tcpProcess.HasExited) {
    $tcpProcess.Kill()
    $tcpProcess.WaitForExit()
  }
}
