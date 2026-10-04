param([Parameter(Mandatory=$true)][string]$Job)
Add-Type -AssemblyName System.Drawing

$j = Get-Content -Raw -Path $Job -Encoding UTF8 | ConvertFrom-Json

# ---- configurable font ----------------------------------------------------
# A single global override in work/font_cfg.json (or the ZH_FONT env var) makes
# EVERY generator that renders through this script use the chosen typeface.
$fontName = [string]$j.font
$boldOverride = $null
$cfgPath = Join-Path $PSScriptRoot '..\work\font_cfg.json'
if (Test-Path $cfgPath) {
  try {
    $cfg = Get-Content -Raw -Path $cfgPath -Encoding UTF8 | ConvertFrom-Json
    if ($cfg.font) { $fontName = [string]$cfg.font }
    if ($null -ne $cfg.bold) { $boldOverride = [int]$cfg.bold }
  } catch { }
}
if ($env:ZH_FONT) { $fontName = [string]$env:ZH_FONT }
# ---------------------------------------------------------------------------

$style = [System.Drawing.FontStyle]::Regular
if ([int]$j.bold -eq 1) { $style = [System.Drawing.FontStyle]::Bold }
if ($null -ne $boldOverride) {
  if ($boldOverride -eq 1) { $style = [System.Drawing.FontStyle]::Bold } else { $style = [System.Drawing.FontStyle]::Regular }
}
$baseSize = [single]$j.size
$sf = New-Object System.Drawing.StringFormat
$sf.FormatFlags = [System.Drawing.StringFormatFlags]::MeasureTrailingSpaces

foreach ($ln in $j.lines) {
  $sz = $baseSize
  if ($null -ne $ln.size -and [single]$ln.size -gt 0) { $sz = [single]$ln.size }
  $font = New-Object System.Drawing.Font($fontName, $sz, $style, [System.Drawing.GraphicsUnit]::Pixel)
  $bmp = New-Object System.Drawing.Bitmap([int]$j.width, [int]$j.height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::Black)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $hint = 'aa'
  if ($null -ne $j.hint) { $hint = [string]$j.hint }
  if ($null -ne $ln.hint) { $hint = [string]$ln.hint }
  switch ($hint) {
    'grid' { $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit }
    'sbp' { $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::SingleBitPerPixelGridFit }
    'ct' { $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit }
    default { $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias }
  }
  $g.DrawString([string]$ln.text, $font, [System.Drawing.Brushes]::White, [single]20, [single]20, $sf)
  $g.Dispose()
  $font.Dispose()
  $bmp.Save([string]$ln.out, [System.Drawing.Imaging.ImageFormat]::Bmp)
  $bmp.Dispose()
  Write-Output ("saved " + $ln.out)
}