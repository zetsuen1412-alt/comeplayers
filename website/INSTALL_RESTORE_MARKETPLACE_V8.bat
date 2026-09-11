@echo off
setlocal
cd /d "%~dp0"
echo.
echo ==========================================
echo  ComePlayers Marketplace Restore V8
echo ==========================================
echo.
if not exist package.json (
  echo ERROR: Jalankan file ini dari folder website yang memiliki package.json.
  pause
  exit /b 1
)
if exist .next rmdir /s /q .next

echo Marketplace berhasil dikembalikan ke versi asli.
echo Homepage game lobby tidak diubah.
echo.
echo Jalankan: npm run dev
pause
