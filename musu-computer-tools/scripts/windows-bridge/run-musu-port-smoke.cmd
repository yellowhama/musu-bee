@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-musu-port-smoke.ps1" %*
endlocal
