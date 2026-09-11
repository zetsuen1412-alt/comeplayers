@echo off
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File ".\APPLY_HOME_BUTTONS_V19.ps1"
echo.
echo Selesai. Jalankan npm run dev lalu buka http://localhost:3000
echo.
pause
