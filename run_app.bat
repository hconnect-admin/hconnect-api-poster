@echo off
REM ========================================
REM hconnect API Client Launcher
REM ========================================

echo.
echo ========================================
echo   hconnect API Client
echo ========================================
echo.
echo Starting server...
echo.

REM Change to the script's directory
cd /d "%~dp0"

REM Start the Node.js server
echo Server will start on http://localhost:3000
echo.
echo Press Ctrl+C to stop the server
echo.

REM Wait a moment for the server to start, then open browser
start "" cmd /c "timeout /t 3 /nobreak > nul && start http://localhost:3000"

REM Start the Node.js application
npm start

REM Keep window open if there's an error
if errorlevel 1 (
    echo.
    echo ========================================
    echo   ERROR: Server failed to start
    echo ========================================
    echo.
    pause
)
