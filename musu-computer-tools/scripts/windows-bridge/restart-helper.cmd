@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -WindowStyle Hidden powershell.exe -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','%~dp0helper-lifecycle.ps1','-Action','restart' | Out-Null"
endlocal
