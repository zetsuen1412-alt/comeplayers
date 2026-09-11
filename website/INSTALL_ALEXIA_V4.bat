@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0APPLY_ALEXIA_HOME_V4.ps1"
pause
