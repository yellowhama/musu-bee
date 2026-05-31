param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path,
  [string]$SourceMarkPath = "",
  [string]$OutputDir = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($SourceMarkPath)) {
  $SourceMarkPath = Join-Path $RepoRoot "musu-bee\public\images\favicon-header.png"
}

if ([string]::IsNullOrWhiteSpace($OutputDir)) {
  $OutputDir = Join-Path $RepoRoot "musu-bee\public\images\logos"
}

if (-not (Test-Path -LiteralPath $SourceMarkPath)) {
  throw "Source mark not found: $SourceMarkPath"
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
Add-Type -AssemblyName System.Drawing

function Convert-HexColor {
  param([Parameter(Mandatory=$true)][string]$Hex)

  $clean = $Hex.TrimStart("#")
  if ($clean.Length -ne 6) {
    throw "Expected #RRGGBB color, got: $Hex"
  }

  return [System.Drawing.Color]::FromArgb(
    255,
    [Convert]::ToInt32($clean.Substring(0, 2), 16),
    [Convert]::ToInt32($clean.Substring(2, 2), 16),
    [Convert]::ToInt32($clean.Substring(4, 2), 16)
  )
}

function New-LogoFont {
  param([Parameter(Mandatory=$true)][float]$Size)

  foreach ($family in @("Arial Black", "Segoe UI Black", "Segoe UI", "Arial")) {
    try {
      return [System.Drawing.Font]::new(
        $family,
        $Size,
        [System.Drawing.FontStyle]::Bold,
        [System.Drawing.GraphicsUnit]::Pixel
      )
    } catch {
      continue
    }
  }

  throw "No usable system font found for logo generation."
}

function Save-LogoPng {
  param(
    [Parameter(Mandatory=$true)][System.Drawing.Image]$Mark,
    [Parameter(Mandatory=$true)][string]$Path,
    [Parameter(Mandatory=$true)][int]$Width,
    [Parameter(Mandatory=$true)][int]$Height,
    [Parameter(Mandatory=$true)][int]$MarkSize,
    [Parameter(Mandatory=$true)][int]$Gap,
    [Parameter(Mandatory=$true)][float]$InitialFontSize,
    [Parameter(Mandatory=$true)][string]$WordColor
  )

  $bitmap = [System.Drawing.Bitmap]::new($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $font = $null
  $brush = $null
  $format = $null

  try {
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    $fontSize = $InitialFontSize
    $font = New-LogoFont -Size $fontSize
    $availableTextWidth = $Width - $MarkSize - $Gap - 24
    $measured = $graphics.MeasureString("MUSU", $font)

    while (($measured.Width -gt $availableTextWidth) -and ($fontSize -gt 12)) {
      $font.Dispose()
      $fontSize -= 2
      $font = New-LogoFont -Size $fontSize
      $measured = $graphics.MeasureString("MUSU", $font)
    }

    $groupWidth = [int][Math]::Ceiling($MarkSize + $Gap + $measured.Width)
    $markX = [int][Math]::Max(0, [Math]::Round(($Width - $groupWidth) / 2))
    $markY = [int][Math]::Round(($Height - $MarkSize) / 2)
    $textX = $markX + $MarkSize + $Gap

    $graphics.DrawImage($Mark, $markX, $markY, $MarkSize, $MarkSize)

    $brush = [System.Drawing.SolidBrush]::new((Convert-HexColor $WordColor))
    $format = [System.Drawing.StringFormat]::new()
    $format.Alignment = [System.Drawing.StringAlignment]::Near
    $format.LineAlignment = [System.Drawing.StringAlignment]::Center
    $format.FormatFlags = [System.Drawing.StringFormatFlags]::NoClip

    $textRect = [System.Drawing.RectangleF]::new(
      [float]$textX,
      0.0,
      [float]($Width - $textX),
      [float]$Height
    )
    $graphics.DrawString("MUSU", $font, $brush, $textRect, $format)
    $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    if ($format -ne $null) { $format.Dispose() }
    if ($brush -ne $null) { $brush.Dispose() }
    if ($font -ne $null) { $font.Dispose() }
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}

$layouts = @(
  @{ Name = "header";  Width = 384;  Height = 96;  MarkSize = 72;  Gap = 18; FontSize = 54 },
  @{ Name = "display"; Width = 768;  Height = 192; MarkSize = 144; Gap = 36; FontSize = 108 },
  @{ Name = "hero";    Width = 1200; Height = 300; MarkSize = 228; Gap = 56; FontSize = 172 }
)

$variants = @(
  @{ Name = "on-light";  WordColor = "#000000" },
  @{ Name = "on-dark";   WordColor = "#FFFFFF" },
  @{ Name = "on-yellow"; WordColor = "#000000" }
)

$mark = [System.Drawing.Image]::FromFile((Resolve-Path -LiteralPath $SourceMarkPath).Path)
$written = @()

try {
  $markAlias = Join-Path $OutputDir "musu-mark-512.png"
  $mark.Save($markAlias, [System.Drawing.Imaging.ImageFormat]::Png)
  $written += $markAlias

  foreach ($layout in $layouts) {
    foreach ($variant in $variants) {
      $path = Join-Path $OutputDir ("musu-logo-{0}-{1}.png" -f $layout.Name, $variant.Name)
      Save-LogoPng `
        -Mark $mark `
        -Path $path `
        -Width $layout.Width `
        -Height $layout.Height `
        -MarkSize $layout.MarkSize `
        -Gap $layout.Gap `
        -InitialFontSize $layout.FontSize `
        -WordColor $variant.WordColor
      $written += $path
    }
  }
} finally {
  $mark.Dispose()
}

[pscustomobject]@{
  ok = $true
  source_mark = (Resolve-Path -LiteralPath $SourceMarkPath).Path
  output_dir = (Resolve-Path -LiteralPath $OutputDir).Path
  generated = $written
} | ConvertTo-Json -Depth 4
