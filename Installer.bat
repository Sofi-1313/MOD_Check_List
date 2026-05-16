@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title MOD-Check-List V1.10.5 Installer

echo ============================================================
echo MOD-Check-List V1.10.5 Installer
echo ============================================================
echo.
echo This installer prepares the app in this folder:
echo %CD%
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is not installed or not in PATH.
  echo Install Node.js LTS first, then run this installer again.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo ERROR: npm is not installed or not in PATH.
  echo Install Node.js LTS first, then run this installer again.
  pause
  exit /b 1
)

if not exist "backend" (
  echo ERROR: backend folder was not found.
  pause
  exit /b 1
)

if not exist "frontend" (
  echo ERROR: frontend folder was not found.
  pause
  exit /b 1
)

if not exist "backend\data" mkdir "backend\data"
if not exist "backend\uploads" mkdir "backend\uploads"

echo.
echo [1/4] Installing frontend dependencies...
call npm --prefix frontend install
if errorlevel 1 (
  echo ERROR: Frontend dependency install failed.
  pause
  exit /b 1
)

echo.
echo [2/4] Building frontend production files...
call npm --prefix frontend run build
if errorlevel 1 (
  echo ERROR: Frontend build failed.
  pause
  exit /b 1
)

echo.
echo [3/4] Installing backend dependencies...
call npm --prefix backend install
if errorlevel 1 (
  echo ERROR: Backend dependency install failed.
  pause
  exit /b 1
)

echo.
echo [4/4] Basic install completed.
echo.

choice /C YN /N /M "Install Windows auto-start task for this app? [Y/N]: "
if errorlevel 2 goto skip_autostart

echo.
echo Installing Windows auto-start task. Administrator rights may be required...
powershell -ExecutionPolicy Bypass -File "%~dp0install_windows_autostart.ps1"
if errorlevel 1 (
  echo WARNING: Auto-start task could not be installed. You can run this installer as Administrator and try again.
) else (
  echo Auto-start task installed.
)

:skip_autostart
echo.
choice /C YN /N /M "Start MOD-Check-List server now? [Y/N]: "
if errorlevel 2 goto done

echo.
echo Starting server...
start "MOD-Check-List V1.10.5 Server" cmd /k ""%~dp0start_mod_checklist_server_forever.bat""
timeout /t 5 >nul
start http://localhost:4000

echo.
echo If this computer has a fixed LAN IP, open the app from another computer with:
echo http://THIS-COMPUTER-IP:4000
echo Example: http://10.129.201.95:4000

goto done

:done
echo.
echo Installer finished.
pause
