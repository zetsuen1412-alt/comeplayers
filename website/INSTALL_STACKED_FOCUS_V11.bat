@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File ".\APPLY_STACKED_FOCUS_V11.ps1"
if errorlevel 1 (
  echo.
  echo Instalasi gagal. Pastikan file ini berada di folder website yang memiliki package.json.
  pause
  exit /b 1
)
echo.
echo Instalasi selesai. Jalankan npm run dev
pause
