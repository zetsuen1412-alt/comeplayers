@echo off
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File ".\APPLY_MESSAGES_CHAT_LOADER_V17.ps1"
echo.
echo Selesai. Jalankan npm run dev lalu buka http://localhost:3000/messages
echo.
pause
