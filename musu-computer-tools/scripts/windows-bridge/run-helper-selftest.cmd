@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0helper-selftest.ps1"
set ERR=%ERRORLEVEL%
exit /b %ERR%
