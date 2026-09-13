@echo off
setlocal
cd /d "%~dp0"
echo.
echo ========================================
echo ComePlayers - Versi Sederhana
echo ========================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js belum terpasang.
  echo Silakan install Node.js 20 atau lebih baru.
  pause
  exit /b 1
)
if not exist .env.local copy /Y .env.example .env.local >nul
if not exist node_modules (
  echo Menyiapkan aplikasi untuk pertama kali...
  call npm install
  if errorlevel 1 goto :error
)
call npm run verify
if errorlevel 1 goto :error
echo.
echo Aplikasi akan dibuka di browser.
echo Mulai dari menu PANDUAN atau BERANDA.
echo.
start "" http://localhost:3000/admin/guide
call npm run dev
exit /b 0
:error
echo.
echo Aplikasi gagal dijalankan. Baca pesan di atas lalu coba lagi.
pause
exit /b 1
