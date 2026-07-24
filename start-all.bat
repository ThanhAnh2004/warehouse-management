@echo off
title Khoi chay He thong Kho Hang (WMS Microservices)
color 0A
echo ===================================================================
echo   HE THONG QUAN LY KHO HANG (MICROSERVICES WAREHOUSE MANAGEMENT)
echo ===================================================================
echo   Dang khoi chay 9 dich vu (Backend NestJS + Python AI + Frontend)...
echo ===================================================================

cd /d %~dp0

echo [1/9] Khoi chay API Gateway (Port 8000)...
start "1. API Gateway (Port 8000)" cmd /k "npm run start:dev api-gateway"

echo [2/9] Khoi chay Identity Service (Port 8001)...
start "2. Identity Service (Port 8001)" cmd /k "npm run start:dev identity-service"

echo [3/9] Khoi chay Inventory Service (Port 8002)...
start "3. Inventory Service (Port 8002)" cmd /k "npm run start:dev inventory-service"

echo [4/9] Khoi chay Transaction Service (Port 8003)...
start "4. Transaction Service (Port 8003)" cmd /k "npm run start:dev transaction-service"

echo [5/9] Khoi chay Notification Service (Port 3004)...
start "5. Notification Service (Port 3004)" cmd /k "npm run start:dev notification-service"

echo [6/9] Khoi chay Reporting Service (Port 3005)...
start "6. Reporting Service (Port 3005)" cmd /k "npm run start:dev reporting-service"

cd /d %~dp0apps\data-processing-service
echo [7/9] Khoi chay Data Processing Service (Port 8005)...
start "7. Data Processing Service (Port 8005)" cmd /k "venv\Scripts\python main.py"

cd /d %~dp0apps\forecasting-service
echo [8/9] Khoi chay Forecasting Service (Port 8004)...
start "8. Forecasting Service (Port 8004)" cmd /k "venv\Scripts\python main.py"

cd /d %~dp0..\frontend
echo [9/9] Khoi chay Frontend Dev Server (Port 5173)...
start "9. Frontend Web (Port 5173)" cmd /k "npm run dev"

echo.
echo ===================================================================
echo [THANH CONG] Toan bo 9 dich vu dang duoc khoi chay!
echo Trinh duyet Web: http://localhost:5173/
echo API Gateway:     http://localhost:8000/api-docs
echo ===================================================================
timeout /t 5
