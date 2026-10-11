@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Run-Transfer.ps1" -Mode all
echo.
echo Transfer command finished. Check the result above.
pause
