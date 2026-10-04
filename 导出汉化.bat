@echo off
echo ============================================================
echo  Export localization: JP source + current translation
echo  to locales\zh-CN\translator-view\
echo ============================================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build.ps1" -Task export
if errorlevel 1 (
  echo.
  echo [ERROR] Export failed. See the log above.
  pause
  exit /b 1
)
echo.
echo Export done. Edit the "zh" fields under locales\zh-CN\translator-view\
pause
