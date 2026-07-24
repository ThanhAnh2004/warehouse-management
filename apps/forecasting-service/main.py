import math
import os

import requests
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException

from model import generate_forecast

# Load bien moi truong tu thu muc goc (chi co tac dung khi chay local ngoai Docker;
# trong container, docker-compose da inject env truc tiep qua env_file).
load_dotenv(dotenv_path='../../.env')

app = FastAPI(title="Forecasting Service", version="1.0")

DATA_PROCESSING_SERVICE_HOST = os.getenv('DATA_PROCESSING_SERVICE_HOST', 'localhost')
DATA_PROCESSING_SERVICE_PORT = os.getenv('DATA_PROCESSING_SERVICE_PORT', '8005')
DATA_PROCESSING_SERVICE_URL = f"http://{DATA_PROCESSING_SERVICE_HOST}:{DATA_PROCESSING_SERVICE_PORT}"


# Nhu cau nam gia dinh khi san pham chua co lich su OUTBOUND nao (giong gia tri fallback
# ben Inventory Service truoc day, giu thong nhat neu Forecasting Service khong san sang).
DEFAULT_ANNUAL_DEMAND = 260.0


def _fetch_cleaned_series(product_id: str) -> dict:
    """Lay chuoi OUTBOUND da lam sach/chuan hoa tu Data Processing Service.

    Goi dung endpoint /process/{id} ma Data Processing Service da cung cap (khong phai
    /clean-data nhu ban nhap truoc do), de tuong thich voi ban da merge len backend/full.
    """
    resp = requests.get(
        f"{DATA_PROCESSING_SERVICE_URL}/process/{product_id}",
        params={"lookback_days": 180},
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()


@app.get("/health")
def health():
    return {"status": "ok", "service": "forecasting-service"}


@app.get("/forecast/{product_id}")
def forecast_demand(product_id: str, days: int = 7):
    if days < 1 or days > 90:
        raise HTTPException(status_code=400, detail="days phải trong khoảng 1-90")

    # Lay du lieu OUTBOUND da duoc lam sach/chuan hoa tu Data Processing Service
    # thay vi doc thang tu Postgres, dung dung kien truc microservice trong yeu cau de tai.
    try:
        cleaned = _fetch_cleaned_series(product_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Data Processing Service unavailable: {e}")

    series = cleaned.get("series", [])
    if len(series) < 3:
        return {
            "productId": product_id,
            "message": "Không đủ dữ liệu lịch sử xuất kho để dự báo (Cần ít nhất 3 giao dịch OUTBOUND)",
            "forecast": []
        }

    try:
        result = generate_forecast(series, days)
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

    return {
        "productId": product_id,
        "algorithm": result["algorithm"],
        "forecast": result["forecast"],
    }


@app.get("/eoq/{product_id}")
def calculate_eoq(
    product_id: str,
    ordering_cost: float = 50000,
    holding_cost_rate: float = 0.2,
    unit_price: float = 1,
):
    """
    EOQ (Economic Order Quantity) = sqrt(2 * D * S / H)
      D (annual_demand): nhu cau nam, uoc tinh tu trung binh ngay cua chuoi OUTBOUND
                          da lam sach (Data Processing Service) nhan 365.
      S (ordering_cost):  chi phi moi lan dat hang - Inventory Service truyen sang.
      H (holding cost):   holding_cost_rate * unit_price - Inventory Service truyen sang.
    Inventory Service goi endpoint nay thay vi tu tinh D/EOQ, dung yeu cau de tai
    (cong thuc EOQ phai duoc tinh o phia Python).
    """
    try:
        cleaned = _fetch_cleaned_series(product_id)
        series = cleaned.get("series", [])
    except Exception as e:
        # Data Processing Service khong san sang: van tra ve EOQ dua tren nhu cau mac dinh
        # thay vi bao loi 502, de Inventory Service luon co mot con so hop ly de hien thi.
        series = []

    if len(series) == 0:
        annual_demand = DEFAULT_ANNUAL_DEMAND
    else:
        avg_daily = sum(p["quantity"] for p in series) / len(series)
        annual_demand = max(1.0, avg_daily * 365)

    holding_cost = max(holding_cost_rate, 0.0001) * max(unit_price, 0.0001)
    eoq = math.sqrt((2 * annual_demand * ordering_cost) / holding_cost)

    return {
        "productId": product_id,
        "eoq": round(eoq),
        "annualDemand": round(annual_demand),
    }


if __name__ == "__main__":
    port = int(os.getenv('FORECASTING_SERVICE_PORT', '8004'))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
