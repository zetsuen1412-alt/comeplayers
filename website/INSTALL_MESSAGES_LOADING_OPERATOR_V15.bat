@echo off
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File ".\APPLY_MESSAGES_LOADING_OPERATOR_V15.ps1"
echo.
echo Jika berhasil, jalankan npm run dev lalu buka http://localhost:3000/messages
echo.
pause
