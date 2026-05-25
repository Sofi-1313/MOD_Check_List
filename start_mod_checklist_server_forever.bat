@echo off
setlocal
title MOD-Check-List Server

cd /d "%~dp0"

echo Preparing MOD-Check-List server...

if not exist "frontend\dist\index.html" (
  echo Frontend build not found. Installing frontend dependencies...
  call npm --prefix frontend install
  if errorlevel 1 exit /b 1

  echo Building frontend for production...
  call npm --prefix frontend run build
  if errorlevel 1 exit /b 1
)

echo Installing backend dependencies if needed...
call npm --prefix backend install
if errorlevel 1 exit /b 1

:loop
echo [%date% %time%] Starting backend on port 4000...
call npm --prefix backend start
echo [%date% %time%] Server stopped. Restarting in 5 seconds...
timeout /t 5 >nul
goto loop
