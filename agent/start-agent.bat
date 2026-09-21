@echo off
REM ---------------------------------------------------------------------------
REM Trace HRIS Biometric Agent — launcher
REM
REM Double-click this file to start the agent. A console window opens with the
REM title "Trace HRIS Biometric Agent" so it's easy to spot in the taskbar and
REM to Alt+Tab back to. Minimising the window keeps it running.
REM
REM Closing the window stops the agent. If you want it to auto-start on login,
REM see README.md → "Auto-start on Windows login".
REM ---------------------------------------------------------------------------

title Trace HRIS Biometric Agent
cd /d "%~dp0"

REM Confirm Node.js is available before we try to run.
where node >nul 2>nul
if errorlevel 1 (
    echo.
    echo [ERROR] Node.js was not found on the PATH.
    echo Install Node 18 or newer from https://nodejs.org/ and try again.
    echo.
    pause
    exit /b 1
)

echo Starting Trace HRIS Biometric Agent...
echo (Press Ctrl+C to stop, or just close this window.)
echo.

node index.js

echo.
echo Agent stopped. Press any key to close this window.
pause >nul
