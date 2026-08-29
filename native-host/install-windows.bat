@echo off
REM ═══════════════════════════════════════════════════════════
REM Download Manager Pro — Native Host Installer (Windows)
REM Supports: Chrome, Brave, Edge, Opera, Vivaldi, Chromium
REM ═══════════════════════════════════════════════════════════

echo ======================================================
echo   Download Manager Pro - Native Host Installer
echo ======================================================
echo.

set HOST_NAME=com.dlmanager.shutdown
set SCRIPT_DIR=%~dp0

REM Check Python
python --version >nul 2>&1
if errorlevel 1 (
    python3 --version >nul 2>&1
    if errorlevel 1 (
        echo ERROR: Python 3 is required but not found.
        echo Download from https://python.org
        pause
        exit /b 1
    )
)

echo Found Python.
echo.

REM Ask for Extension ID
set /p EXT_ID="Enter your extension ID: "
if "%EXT_ID%"=="" (
    echo Extension ID is required.
    pause
    exit /b 1
)

REM Generate manifest with proper path (double backslashes for JSON)
set HOST_SCRIPT=%SCRIPT_DIR%shutdown_host.py
set HOST_SCRIPT_JSON=%HOST_SCRIPT:\=\\%

(
echo {
echo   "name": "%HOST_NAME%",
echo   "description": "Shutdown helper for Download Manager Pro",
echo   "path": "%HOST_SCRIPT_JSON%",
echo   "type": "stdio",
echo   "allowed_origins": [
echo     "chrome-extension://%EXT_ID%/"
echo   ]
echo }
) > "%SCRIPT_DIR%%HOST_NAME%.json"

set MANIFEST_PATH=%SCRIPT_DIR%%HOST_NAME%.json

echo Generated manifest.
echo.

REM Register for each browser via registry
echo Installing for browsers...
echo.

REM Chrome
reg add "HKCU\Software\Google\Chrome\NativeMessagingHosts\%HOST_NAME%" /ve /t REG_SZ /d "%MANIFEST_PATH%" /f >nul 2>&1
if not errorlevel 1 echo   [OK] Google Chrome

REM Brave
reg add "HKCU\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\%HOST_NAME%" /ve /t REG_SZ /d "%MANIFEST_PATH%" /f >nul 2>&1
if not errorlevel 1 echo   [OK] Brave

REM Edge
reg add "HKCU\Software\Microsoft\Edge\NativeMessagingHosts\%HOST_NAME%" /ve /t REG_SZ /d "%MANIFEST_PATH%" /f >nul 2>&1
if not errorlevel 1 echo   [OK] Microsoft Edge

REM Opera
reg add "HKCU\Software\Opera Software\Opera Stable\NativeMessagingHosts\%HOST_NAME%" /ve /t REG_SZ /d "%MANIFEST_PATH%" /f >nul 2>&1
if not errorlevel 1 echo   [OK] Opera

REM Vivaldi
reg add "HKCU\Software\Vivaldi\NativeMessagingHosts\%HOST_NAME%" /ve /t REG_SZ /d "%MANIFEST_PATH%" /f >nul 2>&1
if not errorlevel 1 echo   [OK] Vivaldi

REM Chromium
reg add "HKCU\Software\Chromium\NativeMessagingHosts\%HOST_NAME%" /ve /t REG_SZ /d "%MANIFEST_PATH%" /f >nul 2>&1
if not errorlevel 1 echo   [OK] Chromium

echo.
echo Done! Restart your browser(s) for changes to take effect.
echo.
pause