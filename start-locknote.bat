@echo off
title Locknote — Zero-Knowledge Secret Sharing
cls

echo ========================================================
echo   🔐 Locknote — Zero-Knowledge Secret Sharing Platform
echo ========================================================
echo.
echo  [1/2] Starting Backend Server (http://localhost:3001)...
echo  [2/2] Starting Frontend Studio (http://localhost:5173)...
echo.
echo  Opening http://localhost:5173/ in your browser...
echo.

:: Open browser after 3 seconds
start "" http://localhost:5173/

:: Launch dev server (frontend + backend)
npm run dev

pause
