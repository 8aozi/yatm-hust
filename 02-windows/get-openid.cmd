@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0.."
call npm run openid
set "YATM_EXIT_CODE=%ERRORLEVEL%"
pause
exit /b %YATM_EXIT_CODE%
