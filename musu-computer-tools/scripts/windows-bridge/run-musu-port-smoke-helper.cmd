@echo off
setlocal
pushd "%~dp0..\..\..\musu-port" || exit /b 1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\run-windows-smoke.ps1"
set ERR=%ERRORLEVEL%
popd
exit /b %ERR%
