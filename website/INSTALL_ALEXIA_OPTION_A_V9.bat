@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0APPLY_ALEXIA_OPTION_A_V9.ps1"
echo.
pause
