@echo off
chcp 65001 >nul
echo ============================================================
echo  导入汉化文本：回写译文 - 重新生成 - 部署 HDD/镜像 - 刷新 dist
echo ============================================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build.ps1" -Task import
if errorlevel 1 (
  echo.
  echo [警告] 有步骤失败，请查看上面的日志（常见原因见 docs\PITFALLS.md）。
  pause
  exit /b 1
)
echo.
echo 导入完成。最终镜像：把 dist 覆盖到原 PS3_GAME 即可。
pause
