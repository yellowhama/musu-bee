@echo off
setlocal
powershell.exe -ExecutionPolicy Bypass -File "%~dp0run-windows-smoke.ps1"
endlocal
