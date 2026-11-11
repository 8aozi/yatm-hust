@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0.."
call npm start
set "YATM_EXIT_CODE=%ERRORLEVEL%"
if not "%YATM_EXIT_CODE%"=="0" pause
exit /b %YATM_EXIT_CODE%
