@echo off
chcp 65001 >nul
echo ============================================================
echo  导出汉化文本：日文原文 + 现用译文 到  locales\zh-CN\translator-view\
echo ============================================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build.ps1" -Task export
if errorlevel 1 (
  echo.
  echo [错误] 导出失败，请查看上面的日志。
  pause
  exit /b 1
)
echo.
echo 导出完成。请在 locales\zh-CN\translator-view\ 下按类别编辑各 json 的 "zh" 字段。
pause
