@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File ".\APPLY_GAME_LOBBY_V6.ps1"
echo.
pause
