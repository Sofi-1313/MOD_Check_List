@echo off
title MOD-Check-List V1.10.5

echo Starting MOD-Check-List V1.10.5...

REM BACKEND
echo Starting Backend...
start cmd /k "cd /d C:\Projects\MOD-Check-List-V1.10.5\backend && npm install && npm start"

timeout /t 3 >nul

REM FRONTEND
echo Starting Frontend...
start cmd /k "cd /d C:\Projects\MOD-Check-List-V1.10.5\frontend && npm install && npm run dev -- --host"

timeout /t 5 >nul

start http://localhost:5173

echo System started successfully.
pause
