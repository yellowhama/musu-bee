[CmdletBinding()]
param(
    [string]$OutputRoot,
    [ValidateSet("local-sideload-manual", "store-reviewed-immediate-registration")]
    [string]$StartupContract = "local-sideload-manual",
    [switch]$IncludeDesktopShell
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $scriptDir "msix-common.ps1")

$repoRoot = Get-WindowsRepoRoot $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($OutputRoot)) {
    $OutputRoot = Join-Path $repoRoot ".local-build\multi-device-test-kit"
}

$version = (Get-Content -LiteralPath (Join-Path $repoRoot "VERSION") -Raw).Trim()
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$safeVersion = $version -replace "[^A-Za-z0-9._-]", "_"
$kitRoot = Join-Path $OutputRoot "musu-multidevice-$safeVersion-$stamp"
$kitWindowsDir = Join-Path $kitRoot "scripts\windows"
$kitMsixDir = Join-Path $kitRoot ".local-build\msix\output"
$kitDocsDir = Join-Path $kitRoot "docs"
$kitDesktopDir = Join-Path $kitRoot "desktop-shell"

if (Test-Path -LiteralPath $kitRoot) {
    throw "Test kit output already exists: $kitRoot"
}

$packagePath = Find-LatestMsixArtifact -Directory (Join-Path $repoRoot ".local-build\msix\output") -StartupContract $StartupContract
if (-not $packagePath -or -not (Test-Path -LiteralPath $packagePath)) {
    throw "MSIX package for '$StartupContract' was not found. Build the package first."
}

$certPath = Find-LatestMsixCertificateArtifact -Directory (Join-Path $repoRoot ".local-build\msix\output")
if (-not $certPath -or -not (Test-Path -LiteralPath $certPath)) {
    throw "MSIX public certificate was not found."
}
if ([System.IO.Path]::GetExtension($certPath).ToLowerInvariant() -notin @(".cer", ".crt", ".cert")) {
    throw "Refusing to package private certificate material. Expected a public .cer certificate, got: $certPath"
}

New-Item -ItemType Directory -Force -Path $kitWindowsDir, $kitMsixDir, $kitDocsDir | Out-Null

$scriptFiles = @(
    "msix-common.ps1",
    "check-msix-sideload-readiness.ps1",
    "check-msix-legacy-conflicts.ps1",
    "check-packaged-startup-state.ps1",
    "install-msix.ps1",
    "install-and-verify-msix.ps1",
    "verify-installed-msix-package.ps1",
    "capture-msix-install-evidence.ps1",
    "measure-musu-idle-cpu.ps1",
    "measure-musu-runtime-cpu-scenarios.ps1",
    "verify-runtime-cpu-scenario-matrix.ps1",
    "record-route-reachability-diagnostic.ps1",
    "verify-route-reachability-diagnostic.ps1",
    "audit-musu-process-ownership.ps1",
    "show-musu-process-attribution.ps1",
    "collect-second-pc-handoff.ps1",
    "run-second-pc-release-check.ps1",
    "verify-msix-install-evidence.ps1",
    "record-msix-install-evidence.ps1",
    "verify-multidevice-evidence.ps1",
    "record-multidevice-evidence.ps1",
    "smoke-multidevice-beta.ps1"
)

foreach ($name in $scriptFiles) {
    Copy-Item -LiteralPath (Join-Path $scriptDir $name) -Destination (Join-Path $kitWindowsDir $name)
}

Copy-Item -LiteralPath $packagePath -Destination (Join-Path $kitMsixDir (Split-Path -Leaf $packagePath))
Copy-Item -LiteralPath $certPath -Destination (Join-Path $kitMsixDir (Split-Path -Leaf $certPath))
Copy-Item -LiteralPath (Join-Path $repoRoot "VERSION") -Destination (Join-Path $kitRoot "VERSION")
Copy-Item -LiteralPath (Join-Path $repoRoot "docs\MULTI_DEVICE_RELEASE_TEST_PLAN_1_15_0_RC1_2026_05_29.md") -Destination $kitDocsDir

if ($IncludeDesktopShell) {
    New-Item -ItemType Directory -Force -Path $kitDesktopDir | Out-Null
    $desktopBundles = @(
        (Join-Path $repoRoot "musu-bee\src-tauri\target\release\bundle\msi\MUSU_1.15.0_x64_en-US.msi"),
        (Join-Path $repoRoot "musu-bee\src-tauri\target\release\bundle\nsis\MUSU_1.15.0_x64-setup.exe")
    )
    foreach ($bundle in $desktopBundles) {
        if (Test-Path -LiteralPath $bundle) {
            Copy-Item -LiteralPath $bundle -Destination (Join-Path $kitDesktopDir (Split-Path -Leaf $bundle))
        }
    }
}

$readme = @'
# MUSU __VERSION__ Multi-Device Test Kit

This kit is for the required second-PC beta smoke. It contains the public test
certificate, the __STARTUP_CONTRACT__ MSIX, install/verify scripts, and the
multi-device smoke script.

No private signing key is included.

## On each Windows PC

Open PowerShell in this kit directory.

Recommended one-command path:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\run-second-pc-release-check.ps1
```

If certificate trust fails, rerun the one-command check from an elevated
PowerShell with machine trust:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\run-second-pc-release-check.ps1 -MachineTrust
```

The wrapper runs the same steps below, writes
`.local-build\msix-install\*.evidence.json`,
`.local-build\runtime-idle-cpu\*.evidence.json`,
`.local-build\runtime-cpu-scenarios\*.runtime-cpu-scenario-matrix.json`,
`.local-build\route-diagnostics\*.route-reachability-diagnostic.json`,
`.local-build\process-attribution\*.process-attribution-summary.json`,
`.local-build\runtime-cleanup\*.runtime-cleanup.json`,
`.local-build\second-pc-handoff\*.handoff.json`, and
`.local-build\second-pc-release-check\*.release-check.json`, creates
`.local-build\second-pc-return\*.zip`, then prints the return zip and raw files
to return to the primary release repo.

The wrapper also opens the MUSU desktop app and captures the second-PC
`desktop-open` runtime CPU/resource evidence with:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\measure-musu-idle-cpu.ps1 -SampleSeconds 60 -Scenario desktop-open -RequireOwnedWebView2 -MaxOneCorePercent 5 -MaxOwnedProcessCount 16 -MaxOwnedWebView2ProcessCount 8 -MaxTotalWorkingSetMb 1024 -IncludeNode -IncludeWebView2 -FailOnHot -Json
```

Use `-SkipRuntimeIdleCpu` on `run-second-pc-release-check.ps1` only for
diagnosing install/handoff failures; a skipped CPU sample cannot close the
public runtime idle CPU gate.

The wrapper also captures a diagnostic runtime CPU scenario matrix with
`musu.runtime_cpu_scenario_matrix.v1` across `startup-open`, `runtime-started`,
`dashboard-open`, `desktop-open`, and `post-route`:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\measure-musu-runtime-cpu-scenarios.ps1 -Scenario startup-open,runtime-started,dashboard-open,desktop-open,post-route -SampleSeconds 60 -OpenDesktopApp -RunRouteProbe -Json
```

After the peer has been added or named by the primary PC, use a targeted
post-route attempt to capture CPU behavior immediately after a bounded remote
route attempt:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\measure-musu-runtime-cpu-scenarios.ps1 -Scenario startup-open,runtime-started,dashboard-open,desktop-open,post-route -SampleSeconds 60 -OpenDesktopApp -RunRouteProbe -RouteTarget PRIMARY-PC -AllowFailedRouteProbe -Json
```

The wrapper exposes the same diagnostic path:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\run-second-pc-release-check.ps1 -RuntimeCpuRouteTarget PRIMARY-PC -AllowFailedRuntimeCpuRouteProbe
```

If the primary PC is already registered as a peer on this second PC, also pass
`-RouteReachabilityTarget PRIMARY-PC`. The wrapper then records
`musu.route_reachability_diagnostic.v1`, verifies that the selected route target
is non-local, and includes the diagnostic in the second-PC return zip:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\run-second-pc-release-check.ps1 -RouteReachabilityTarget PRIMARY-PC -RuntimeCpuRouteTarget PRIMARY-PC -AllowFailedRuntimeCpuRouteProbe
```

This diagnostic is not release-grade multi-device proof by itself. It is the
operator-facing preflight for explaining whether a peer endpoint is registered,
reachable over TCP, selected by route explain, and backed by raw route-attempt
evidence before the primary PC records the real two-machine smoke.

Use `-AllowFailedRouteProbe` or `-AllowFailedRuntimeCpuRouteProbe` only to
diagnose CPU after a failed remote route attempt. The normal release matrix
without that flag still requires a successful post-route probe.

This matrix is also verified by
`scripts\windows\verify-runtime-cpu-scenario-matrix.ps1`. It does not replace
the release-grade two-machine `desktop-open` runtime idle CPU evidence, but the
final go/no-go now requires a clean 60s matrix on two machines so busy-loop
regressions can be attributed to startup activation, runtime start,
dashboard/desktop opening, or post-route state. Use
`-SkipRuntimeCpuScenarioMatrix` on
`run-second-pc-release-check.ps1` only when debugging install/handoff failures.
Each scenario measurement must preserve `cpu_attribution` with
`musu.runtime_idle_cpu_attribution.v1` and `top_processes`, so CPU symptoms are
traceable to concrete MUSU, Node.js, or WebView2 PIDs instead of aggregate
percentages only.
Release-grade returned CPU evidence must also preserve subrole fields:
`process_subrole`, `process_counts_by_subrole`,
`max_one_core_percent_by_subrole`, and `memory_totals_by_subrole_mb`. The
second-PC release-check JSON reports `runtime_cpu_subrole_contract_ok=true`
only when the bridge runtime, desktop shell, and WebView2 helpers are separated
as `bridge_runtime`, `desktop_shell`, and `webview2_helper`. Older return zips
without those fields are diagnostic only and cannot close the public release
CPU/matrix gates.

The wrapper also writes a process-attribution summary with schema
`musu.process_attribution_summary.v1`. It separates machine-wide Node.js and
WebView2 processes from MUSU-owned descendants so an operator can tell whether
extra `node.exe` processes belong to MUSU or to unrelated local tooling:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\show-musu-process-attribution.ps1
```

At the end of the wrapper, MUSU runtime cleanup is recorded with schema
`musu.second_pc_runtime_cleanup.v1`. The wrapper runs `musu down --json` to
stop the registered bridge runtime, closes the packaged desktop shell it opened
for CPU evidence, and includes `.local-build\runtime-cleanup\*.runtime-cleanup.json`
in the return zip. This prevents a second-PC evidence run from leaving stale
bridge or desktop processes behind.

Manual fallback:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\check-msix-sideload-readiness.ps1
powershell -ExecutionPolicy Bypass -File scripts\windows\install-and-verify-msix.ps1 -StartupContract __STARTUP_CONTRACT__ -ReplaceExisting
powershell -ExecutionPolicy Bypass -File scripts\windows\capture-msix-install-evidence.ps1 -StartupContract __STARTUP_CONTRACT__
powershell -ExecutionPolicy Bypass -File scripts\windows\collect-second-pc-handoff.ps1
Start-Process explorer.exe 'shell:AppsFolder\Yellowhama.MUSU_ygcjq669as2b6!MUSU'
powershell -ExecutionPolicy Bypass -File scripts\windows\measure-musu-idle-cpu.ps1 -SampleSeconds 60 -Scenario desktop-open -RequireOwnedWebView2 -MaxOneCorePercent 5 -MaxOwnedProcessCount 16 -MaxOwnedWebView2ProcessCount 8 -MaxTotalWorkingSetMb 1024 -IncludeNode -IncludeWebView2 -FailOnHot -Json
powershell -ExecutionPolicy Bypass -File scripts\windows\measure-musu-runtime-cpu-scenarios.ps1 -Scenario startup-open,runtime-started,dashboard-open,desktop-open,post-route -SampleSeconds 60 -OpenDesktopApp -RunRouteProbe -Json
powershell -ExecutionPolicy Bypass -File scripts\windows\measure-musu-runtime-cpu-scenarios.ps1 -Scenario startup-open,runtime-started,dashboard-open,desktop-open,post-route -SampleSeconds 60 -OpenDesktopApp -RunRouteProbe -RouteTarget PRIMARY-PC -AllowFailedRouteProbe -Json
powershell -ExecutionPolicy Bypass -File scripts\windows\record-route-reachability-diagnostic.ps1 -Target PRIMARY-PC -EvidenceDir .local-build\route-diagnostics -Json
powershell -ExecutionPolicy Bypass -File scripts\windows\verify-route-reachability-diagnostic.ps1 -EvidencePath .local-build\route-diagnostics\<DIAGNOSTIC_JSON> -ExpectedTarget PRIMARY-PC -RequireNonLocalTarget -AllowSuccessfulReachability -Json
powershell -ExecutionPolicy Bypass -File scripts\windows\show-musu-process-attribution.ps1
musu down --json
musu up --json
musu doctor --json
musu status
```

If certificate trust fails, rerun the install from an elevated PowerShell with:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\install-and-verify-msix.ps1 -StartupContract __STARTUP_CONTRACT__ -ReplaceExisting -MachineTrust
```

The install evidence command writes `.local-build\msix-install\*.evidence.json`.
The runtime CPU command writes `.local-build\runtime-idle-cpu\*.evidence.json`.
The scenario matrix command writes `.local-build\runtime-cpu-scenarios\*.json`.
The route reachability command writes
`.local-build\route-diagnostics\*.route-reachability-diagnostic.json`.
The wrapper cleanup command writes `.local-build\runtime-cleanup\*.json`.
The process-attribution command writes
`.local-build\process-ownership\*.json` unless an explicit output path is used.
The handoff command writes `.local-build\second-pc-handoff\*.handoff.json`
with `suggested_remote_addrs` values such as `192.168.1.20:10621`.
Return the `.local-build\second-pc-return\*.zip` if the wrapper created one;
otherwise return both JSON files to the release repo with the multi-device smoke
evidence.

## On the primary PC

Use one of the other PC's `suggested_remote_addrs` values from
`.local-build\second-pc-handoff\*.handoff.json`.

Status-only:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\smoke-multidevice-beta.ps1 -RemoteAddr OTHER_PC_IP:BRIDGE_PORT -RemoteName OTHER_PC_NAME -SkipRoute
```

Full route:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\smoke-multidevice-beta.ps1 -RemoteAddr OTHER_PC_IP:BRIDGE_PORT -RemoteName OTHER_PC_NAME -RouteTarget OTHER_PC_NAME
```

The smoke writes `.local-build\multi-device\*.evidence.json`.
For public release, that evidence must include `musu.route_explain.v1` path
selection diagnostics and `musu.route_evidence.v1` execution evidence with route
kind, handshake timing, peer identity verification, hardened encryption, and
payload transit truth. The current legacy HTTP bearer route is recorded honestly
as unverified and will not satisfy the final release gate until the route is
hardened.
Send that JSON back to the release repo before claiming multi-device readiness.

Verify it locally with:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\verify-multidevice-evidence.ps1 -EvidencePath .local-build\multi-device\YOUR-EVIDENCE.json
```

In the release repo, record verified evidence with:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\record-multidevice-evidence.ps1 -EvidencePath .local-build\multi-device\YOUR-EVIDENCE.json
```
'@
$readme = $readme.Replace("__VERSION__", $version).Replace("__STARTUP_CONTRACT__", $StartupContract)
$readme | Set-Content -LiteralPath (Join-Path $kitRoot "README_MULTI_DEVICE_TEST_KIT.md") -Encoding UTF8

$checksumsPath = Join-Path $kitRoot "SHA256SUMS.txt"
Get-ChildItem -LiteralPath $kitRoot -Recurse -File |
    Where-Object { $_.FullName -ne $checksumsPath } |
    Sort-Object FullName |
    ForEach-Object {
        $relative = $_.FullName.Substring($kitRoot.Length + 1)
        $hash = Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName
        "{0}  {1}" -f $hash.Hash.ToLowerInvariant(), ($relative -replace "\\", "/")
    } | Set-Content -LiteralPath $checksumsPath -Encoding ASCII

$zipPath = "$kitRoot.zip"
Compress-Archive -Path (Join-Path $kitRoot "*") -DestinationPath $zipPath -Force

[pscustomobject]@{
    ok = $true
    version = $version
    startup_contract = $StartupContract
    kit_root = $kitRoot
    zip_path = $zipPath
    package = Split-Path -Leaf $packagePath
    certificate = Split-Path -Leaf $certPath
    includes_desktop_shell = [bool]$IncludeDesktopShell
}
