@echo off
echo ============================================================
echo  Import localization: write back - regenerate - deploy - refresh dist
echo ============================================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build.ps1" -Task import
if errorlevel 1 (
  echo.
  echo [WARN] Some step failed. See the log above. Details: docs\PITFALLS.md
  pause
  exit /b 1
)
echo.
echo Import done. Final image: copy dist over the original PS3_GAME.
pause
