@echo off
echo ========================================
echo Clearing Biometric Registration Data
echo ========================================
echo.

REM Delete the biometric store file
if exist biometric-store.json (
    del biometric-store.json
    echo ✅ Deleted biometric-store.json
) else (
    echo ℹ️  No biometric-store.json found
)

echo.
echo ========================================
echo DONE!
echo ========================================
echo.
echo Next steps:
echo 1. Restart the backend server
echo 2. Refresh the frontend
echo 3. Register fingerprint again
echo.
pause
