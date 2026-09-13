@echo off
setlocal
cd /d "%~dp0"
if not exist node_modules call npm install
call npm run verify
if errorlevel 1 goto :error
call npm test
if errorlevel 1 goto :error
call npm run typecheck
if errorlevel 1 goto :error
echo.
echo Semua pengujian dan pemeriksaan TypeScript selesai.
pause
exit /b 0
:error
echo.
echo Pengujian gagal. Lihat pesan di atas.
pause
exit /b 1
