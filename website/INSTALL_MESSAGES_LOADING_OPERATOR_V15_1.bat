@echo off
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File ".\APPLY_MESSAGES_LOADING_OPERATOR_V15_1.ps1"
echo.
if errorlevel 1 (
  echo Instalasi gagal. Baca pesan ERROR di atas.
) else (
  echo Selesai. Jalankan npm run dev lalu buka http://localhost:3000/messages
)
echo.
pause
