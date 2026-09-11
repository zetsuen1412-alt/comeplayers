@echo off
setlocal
cd /d "%~dp0"
echo.
echo ComePlayers - Memperbaiki tautan logo ke halaman utama
echo =====================================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js tidak ditemukan.
  echo Instal Node.js lalu jalankan file ini kembali.
  pause
  exit /b 1
)
node apply-logo-home-fix.mjs
echo.
pause
