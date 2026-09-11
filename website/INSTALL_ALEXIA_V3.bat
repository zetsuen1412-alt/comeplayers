@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0APPLY_ALEXIA_HOME_V3.ps1"
pause
