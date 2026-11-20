@echo off
title Khoi chay He thong Kho Hang (WMS Microservices)
color 0A
echo ===================================================================
echo   HE THONG QUAN LY KHO HANG (MICROSERVICES WAREHOUSE MANAGEMENT)
echo ===================================================================
echo   Dang khoi chay 8 dich vu (Backend NestJS + Python AI + Frontend)...
echo ===================================================================

cd /d %~dp0

echo [1/8] Khoi chay API Gateway (Port 8000)...
start "1. API Gateway (Port 8000)" cmd /k "npm run start:dev api-gateway"

echo [2/8] Khoi chay Identity Service (Port 8001)...
start "2. Identity Service (Port 8001)" cmd /k "npm run start:dev identity-service"

echo [3/8] Khoi chay Inventory & Transaction Service (Port 8002)...
start "3. Inventory Service (Port 8002)" cmd /k "npm run start:dev inventory-service"

echo [4/8] Khoi chay Notification Service (Port 3004)...
start "4. Notification Service (Port 3004)" cmd /k "npm run start:dev notification-service"

echo [5/8] Khoi chay Reporting Service (Port 3005)...
start "5. Reporting Service (Port 3005)" cmd /k "npm run start:dev reporting-service"

cd /d %~dp0apps\data-processing-service
echo [6/8] Khoi chay Data Processing Service (Port 8005)...
start "6. Data Processing Service (Port 8005)" cmd /k "venv\Scripts\python main.py"

cd /d %~dp0apps\forecasting-service
echo [7/8] Khoi chay Forecasting Service (Port 8004)...
start "7. Forecasting Service (Port 8004)" cmd /k "venv\Scripts\python main.py"

cd /d %~dp0..\frontend
echo [8/8] Khoi chay Frontend Dev Server (Port 5173)...
start "8. Frontend Web (Port 5173)" cmd /k "npm run dev"

echo.
echo ===================================================================
echo [THANH CONG] Toan bo 8 dich vu dang duoc khoi chay!
echo Trinh duyet Web: http://localhost:5173/
echo API Gateway:     http://localhost:8000/api-docs
echo ===================================================================
timeout /t 5
