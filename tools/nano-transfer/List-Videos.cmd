@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Run-Transfer.ps1" -Mode list
echo.
pause
