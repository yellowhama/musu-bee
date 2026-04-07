@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0helper-lifecycle.ps1" -Action start
endlocal
