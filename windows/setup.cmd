@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0.."
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 22 or 24 LTS, then run setup.cmd again.
  pause
  exit /b 1
)
call npm ci --ignore-scripts
if errorlevel 1 goto failed
call npm run build
if errorlevel 1 goto failed
echo Setup complete. Double-click start.cmd.
pause
exit /b 0
:failed
echo Setup failed. See the error above.
pause
exit /b 1
