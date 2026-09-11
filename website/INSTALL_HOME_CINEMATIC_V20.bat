@echo off
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File ".\APPLY_HOME_CINEMATIC_V20.ps1"
echo.
echo Jalankan: npm run dev
echo Buka: http://localhost:3000
echo Lalu tekan Ctrl+F5.
echo.
pause
