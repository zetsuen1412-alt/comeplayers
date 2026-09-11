@echo off
setlocal
cd /d "%~dp0"
echo ComePlayers Game Coins Product Title Patch
echo ==========================================
node apply-game-coin-title-patch.mjs
echo.
pause
