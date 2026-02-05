@echo off
echo ========================================
echo Mobile Testing Setup with ngrok
echo ========================================
echo.

REM Check if ngrok is installed
where ngrok >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] ngrok is not installed!
    echo.
    echo Please install ngrok:
    echo 1. Download from: https://ngrok.com/download
    echo 2. Extract to a folder in your PATH
    echo 3. Run: ngrok authtoken YOUR_TOKEN
    echo.
    pause
    exit /b 1
)

echo [1/3] Starting backend server...
echo.

REM Start backend in a new window
start "Backend Server" cmd /k "cd /d %~dp0 && npm start"

echo Waiting for backend to start (10 seconds)...
timeout /t 10 /nobreak >nul

echo.
echo [2/3] Starting ngrok tunnel...
echo.

REM Start ngrok in a new window
start "ngrok Tunnel" cmd /k "ngrok http 5050"

echo.
echo ========================================
echo SETUP COMPLETE!
echo ========================================
echo.
echo NEXT STEPS:
echo.
echo 1. Look at the ngrok window for your public URL
echo    Example: https://abc123.ngrok.io
echo.
echo 2. Update your frontend .env file:
echo    VITE_BACKEND_URL=https://abc123.ngrok.io/api/biometric
echo.
echo 3. Restart your frontend development server
echo.
echo 4. Open the frontend URL on your mobile device
echo.
echo 5. Test fingerprint registration and authentication!
echo.
echo ========================================
pause
