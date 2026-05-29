[CmdletBinding()]
param(
    [string]$HandoffPath,
    [string]$MsixInstallEvidencePath,
    [string]$RemoteAddr,
    [string]$RemoteName,
    [string]$ExpectedRouteOutput = "MUSU_REMOTE_ROUTE_OK",
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
$version = (Get-Content -LiteralPath (Join-Path $repoRoot "VERSION") -Raw).Trim()

function Resolve-LatestFile {
    param(
        [Parameter(Mandatory = $true)][string]$Root,
        [Parameter(Mandatory = $true)][string]$Filter,
        [Parameter(Mandatory = $true)][string]$Label
    )

    if (-not (Test-Path -LiteralPath $Root)) {
        throw "$Label directory not found: $Root"
    }

    $file = Get-ChildItem -LiteralPath $Root -Filter $Filter -File -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTimeUtc -Descending |
        Select-Object -First 1
    if (-not $file) {
        throw "$Label file not found under $Root matching $Filter"
    }
    return $file.FullName
}

function ConvertTo-RepoRelativeDisplayPath {
    param([Parameter(Mandatory = $true)][string]$Path)

    $resolved = (Resolve-Path -LiteralPath $Path).Path
    $rootWithSlash = $repoRoot.TrimEnd("\") + "\"
    if ($resolved.StartsWith($rootWithSlash, [System.StringComparison]::OrdinalIgnoreCase)) {
        return $resolved.Substring($rootWithSlash.Length)
    }
    return $resolved
}

if ([string]::IsNullOrWhiteSpace($HandoffPath)) {
    $HandoffPath = Resolve-LatestFile `
        -Root (Join-Path $repoRoot ".local-build\second-pc-handoff") `
        -Filter "*.handoff.json" `
        -Label "second-PC handoff"
}
if (-not (Test-Path -LiteralPath $HandoffPath)) {
    throw "Handoff file not found: $HandoffPath"
}
$HandoffPath = (Resolve-Path -LiteralPath $HandoffPath).Path
$handoff = Get-Content -LiteralPath $HandoffPath -Raw | ConvertFrom-Json

if ([string]$handoff.schema -ne "musu.second_pc_handoff.v1") {
    throw "Unexpected handoff schema in ${HandoffPath}: $($handoff.schema)"
}
if ([string]$handoff.version -ne $version) {
    throw "Handoff version mismatch. Expected $version, got $($handoff.version)."
}
if (-not [bool]$handoff.ok) {
    throw "Handoff file reports ok=false: $HandoffPath"
}

$candidateAddrs = @($handoff.suggested_remote_addrs | ForEach-Object { [string]$_ } | Where-Object {
    -not [string]::IsNullOrWhiteSpace($_)
})
if ($candidateAddrs.Count -eq 0) {
    throw "Handoff file does not include suggested_remote_addrs."
}

if ([string]::IsNullOrWhiteSpace($RemoteAddr)) {
    $RemoteAddr = $candidateAddrs[0]
}
if ($RemoteAddr -notmatch "^[^:]+:\d+$") {
    throw "RemoteAddr must be host:port. Got: $RemoteAddr"
}

if ([string]::IsNullOrWhiteSpace($RemoteName)) {
    $RemoteName = [string]$handoff.remote_name_suggestion
}
if ([string]::IsNullOrWhiteSpace($RemoteName)) {
    $RemoteName = "second-pc"
}

$msixEvidenceFound = $false
if ([string]::IsNullOrWhiteSpace($MsixInstallEvidencePath)) {
    $msixRoot = Join-Path $repoRoot ".local-build\msix-install"
    if (Test-Path -LiteralPath $msixRoot) {
        $candidate = Get-ChildItem -LiteralPath $msixRoot -Filter "*.evidence.json" -File -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTimeUtc -Descending |
            Select-Object -First 1
        if ($candidate) {
            $MsixInstallEvidencePath = $candidate.FullName
            $msixEvidenceFound = $true
        }
    }
}
elseif (Test-Path -LiteralPath $MsixInstallEvidencePath) {
    $MsixInstallEvidencePath = (Resolve-Path -LiteralPath $MsixInstallEvidencePath).Path
    $msixEvidenceFound = $true
}

$msixEvidenceDisplay = if ($msixEvidenceFound) {
    ConvertTo-RepoRelativeDisplayPath -Path $MsixInstallEvidencePath
}
else {
    ".local-build\msix-install\<INSTALL_EVIDENCE_JSON>"
}

$multiDeviceEvidenceDisplay = ".local-build\multi-device\<EVIDENCE_JSON>"

$commands = [pscustomobject]@{
    record_msix_install = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\record-msix-install-evidence.ps1 -EvidencePath $msixEvidenceDisplay -Json"
    run_multidevice_smoke = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\smoke-multidevice-beta.ps1 -RemoteAddr $RemoteAddr -RemoteName $RemoteName -RouteTarget $RemoteName -ExpectedRouteOutput $ExpectedRouteOutput"
    record_multidevice = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\record-multidevice-evidence.ps1 -EvidencePath $multiDeviceEvidenceDisplay -ExpectedRouteOutput $ExpectedRouteOutput -Json"
    show_status = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\show-final-release-handoff-status.ps1"
}

$result = [pscustomobject]@{
    schema = "musu.second_pc_return_card.v1"
    generated_at = (Get-Date).ToString("o")
    version = $version
    handoff_path = $HandoffPath
    handoff_machine = [string]$handoff.operator_machine
    remote_name = $RemoteName
    remote_addr = $RemoteAddr
    suggested_remote_addrs = $candidateAddrs
    msix_install_evidence_path = if ($msixEvidenceFound) { $MsixInstallEvidencePath } else { $null }
    commands = $commands
}

if ($Json) {
    $result | ConvertTo-Json -Depth 8
}
else {
    "MUSU second-PC return card"
    "version: $($result.version)"
    "handoff: $($result.handoff_path)"
    "handoff_machine: $($result.handoff_machine)"
    "remote_name: $($result.remote_name)"
    "remote_addr: $($result.remote_addr)"
    "msix_install_evidence: $(if ($msixEvidenceFound) { $result.msix_install_evidence_path } else { '<not found; use returned .local-build\msix-install\*.evidence.json>' })"
    ""
    "Candidate RemoteAddr values"
    $candidateAddrs | ForEach-Object { "- $_" }
    ""
    "Primary repo commands"
    $result.commands.PSObject.Properties | ForEach-Object {
        "[$($_.Name)] $($_.Value)"
    }
}
