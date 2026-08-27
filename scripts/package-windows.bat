@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0package-windows.ps1" %*
set "PACKAGE_EXIT_CODE=%ERRORLEVEL%"
echo.
pause
exit /b %PACKAGE_EXIT_CODE%
