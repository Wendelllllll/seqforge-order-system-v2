@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-SeqForge.ps1" -OpenBrowser
if errorlevel 1 pause
