@echo off
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File ".\APPLY_OPTION_B_V14.ps1"
echo.
echo Selesai. Jalankan npm run dev lalu buka http://localhost:3000
echo.
pause
