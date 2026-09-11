@echo off
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File ".\APPLY_DUAL_WORLD_PORTAL_V12.ps1"
echo.
echo Selesai. Jalankan npm run dev lalu buka http://localhost:3000
echo.
pause
