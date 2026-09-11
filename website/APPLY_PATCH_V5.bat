@echo off
setlocal
cd /d "%~dp0"
echo.
echo ComePlayers - Platform Select Patch V5
echo =======================================
echo.
node apply-platform-select-v5.mjs
echo.
pause
