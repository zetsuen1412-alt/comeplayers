@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0INSTALL_V59.ps1"
if errorlevel 1 (
  echo.
  echo Instalasi gagal. Periksa pesan di atas.
  pause
  exit /b 1
)
echo.
pause
