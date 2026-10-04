#Requires -Version 5
<#
  Build / install entry point for the
  "Siren: New Translation" (BCJS30020) Simplified-Chinese localization.

  Clean repository checkout
    + user-supplied original game directory (set -GameDir)
        -> regenerated glyph atlases and baked textures
        -> patched game data in <repo>\dist
        -> (optionally) deployed to the RPCS3 HDD install data

  The tools resolve their roots from tools/_config.js (config.local.json, or the
  legacy developer paths when no config exists).  No load-time path rewriting.

  Examples:
    .\build.ps1 -Task prepare -GameDir D:\game            # stage sources into work
    .\build.ps1 -Task extract -GameDir D:\game            # + pull base assets from the game
    .\build.ps1 -Task export                              # dump jp/zh to locales/<locale>/translator-view
    .\build.ps1 -Task build  -GameDir D:\game -HddDir D:\rpcs3\...\data
    .\build.ps1 -Task import -GameDir D:\game -HddDir D:\rpcs3\...\data
    .\build.ps1 -Task rebuild -GameDir D:\game -Font "Microsoft YaHei" -Bold 0
#>
[CmdletBinding()]
param(
  [ValidateSet('prepare', 'extract', 'build', 'import', 'export', 'rebuild')]
  [string]$Task = 'build',

  [string]$GameDir,
  [string]$HddDir,
  [string]$Font,
  [int]$Bold = -1,

  [ValidateSet('zh-CN')]
  [string]$Locale = 'zh-CN'
)

$ErrorActionPreference = 'Stop'
$repo = $PSScriptRoot
$node = 'node'

# --- resolve node -----------------------------------------------------------
if (-not (Get-Command $node -ErrorAction SilentlyContinue)) {
  throw "Node.js was not found in PATH.  This project requires Node.js v24.x (see BUILDING.md)."
}

# --- write per-run config ---------------------------------------------------
$cfgPath = Join-Path $repo 'config.local.json'
if ($GameDir -or $HddDir) {
  $cfg = [ordered]@{ locale = $Locale }
  if ($GameDir) { $cfg.gameRoot = ($GameDir -replace '\\', '/') }
  if ($HddDir)  { $cfg.hddData  = ($HddDir  -replace '\\', '/') }
  ($cfg | ConvertTo-Json) | Set-Content -Encoding UTF8 -Path $cfgPath
  Write-Host "config.local.json written: $cfgPath"
} elseif (-not (Test-Path $cfgPath)) {
  Write-Host "No config.local.json and no -GameDir supplied: using legacy developer paths." -ForegroundColor Yellow
}

# --- point the tools at this config ----------------------------------------
if (Test-Path $cfgPath) { $env:SNT_CONFIG = $cfgPath }

Push-Location (Join-Path $repo 'tools')
try {
  # Portable builds stage their workspace from locales/<locale>/source first.
  if ((Test-Path $cfgPath) -and ($Task -in @('build', 'import', 'rebuild'))) {
    Write-Host '== prepare workspace (stage sources) ==' -ForegroundColor Cyan
    & $node '_extract_base.js'
    if ($LASTEXITCODE -ne 0) { throw "workspace preparation failed (exit $LASTEXITCODE)" }
  }

  switch ($Task) {
    'prepare' {
      Write-Host '== prepare workspace (stage sources) ==' -ForegroundColor Cyan
      & $node '_extract_base.js'
    }
    'extract' {
      Write-Host '== extract base assets + stage sources ==' -ForegroundColor Cyan
      & $node '_extract_base.js' '--assets'
    }
    'export' {
      Write-Host '== export translator view ==' -ForegroundColor Cyan
      & $node '_i18n_export.js'
    }
    'import' {
      Write-Host '== import translator edits -> regenerate -> deploy -> refresh dist ==' -ForegroundColor Cyan
      & $node '_i18n_import.js'
    }
    'build' {
      Write-Host '== regenerate localization artifacts ==' -ForegroundColor Cyan
      & $node '-e' "require('./_pipeline.js').runPipeline();"
    }
    'rebuild' {
      if (-not $Font) { throw "Task 'rebuild' requires -Font <name>.  Example: .\build.ps1 -Task rebuild -Font SimHei" }
      Write-Host "== change font to '$Font' and regenerate everything ==" -ForegroundColor Cyan
      $nodeArgs = @('_setfont.js', $Font, '--rebuild')
      if ($Bold -ge 0) { $nodeArgs += @('--bold', "$Bold") }
      & $node @nodeArgs
    }
  }
  if ($LASTEXITCODE -ne 0) { throw "task '$Task' failed (exit $LASTEXITCODE)" }
}
finally {
  Pop-Location
}

Write-Host "done: $Task" -ForegroundColor Green
