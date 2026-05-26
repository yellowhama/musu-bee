# musu-bee Windows 1-Liner Installer
# Usage: iwr https://raw.githubusercontent.com/yellowhama/musu-bee/main/install.ps1 -useb | iex

$ErrorActionPreference = "Stop"

Write-Host ">>> Fetching latest release info from GitHub..." -ForegroundColor Cyan
$apiUrl = "https://api.github.com/repos/yellowhama/musu-bee/releases/latest"
$release = Invoke-RestMethod -Uri $apiUrl -UseBasicParsing

$musuAsset = $release.assets | Where-Object { $_.name -match "musu-windows-x86_64.exe$" }

if (-not $musuAsset) {
    Write-Host "Error: Could not find Windows binaries in the latest release." -ForegroundColor Red
    exit 1
}

$tempDir = Join-Path $env:TEMP "musu-install-tmp"
if (Test-Path $tempDir) { Remove-Item -Path $tempDir -Recurse -Force }
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

$musuPath = Join-Path $tempDir "musu.exe"

Write-Host ">>> Downloading musu..." -ForegroundColor Cyan
Invoke-WebRequest -Uri $musuAsset.browser_download_url -OutFile $musuPath -UseBasicParsing

Write-Host ">>> Running musu installer..." -ForegroundColor Cyan
Push-Location $tempDir
try {
    # Install and register system service. Use the default Scheduled Task (logon-start) install path.
    & .\musu.exe install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Error during musu install." -ForegroundColor Red
        exit $LASTEXITCODE
    }
} finally {
    Pop-Location
}

Write-Host ">>> Adding ~/.musu/bin to PATH..." -ForegroundColor Cyan
$userPath = [Environment]::GetEnvironmentVariable("PATH", "User")
$musuBinPath = Join-Path $env:USERPROFILE ".musu\bin"
if ($userPath -notlike "*$musuBinPath*") {
    [Environment]::SetEnvironmentVariable("PATH", "$userPath;$musuBinPath", "User")
    $env:PATH = "$env:PATH;$musuBinPath"
    Write-Host "    Added $musuBinPath to your User PATH." -ForegroundColor Green
}

Write-Host "`n========================================================" -ForegroundColor Green
Write-Host "✅ musu installation completed successfully!" -ForegroundColor Green
Write-Host "Please restart your terminal (or run 'refreshenv')." -ForegroundColor Yellow
Write-Host "Then, connect this machine to your account by running:" -ForegroundColor Yellow
Write-Host "    musu login" -ForegroundColor White
Write-Host "========================================================`n" -ForegroundColor Green
