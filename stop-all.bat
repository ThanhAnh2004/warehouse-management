@echo off
title Tat toan bo He thong Kho Hang
color 0C
echo ===================================================================
echo   DANG TAT TOAN BO CAC DICH VU NODE.JS VA PYTHON...
echo ===================================================================

taskkill /F /IM node.exe /T 2>nul
taskkill /F /IM python.exe /T 2>nul
taskkill /F /IM python3.12.exe /T 2>nul

echo.
echo ===================================================================
echo [THANH CONG] Da tat toan bo 9 dich vu an toan!
echo ===================================================================
timeout /t 3
