@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-musu-port-native-smoke.ps1" %*
endlocal
