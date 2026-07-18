import os
from datetime import timedelta

import pandas as pd
import requests
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from sklearn.linear_model import LinearRegression

# Load biến môi trường từ thư mục gốc
load_dotenv(dotenv_path='../../.env')

app = FastAPI(title="Forecasting Service", version="1.0")

# Cần ít nhất 3 ngày có dữ liệu (sau khi đã làm sạch/chuẩn hóa) mới đủ để huấn luyện mô hình
MIN_HISTORY_POINTS = 3


def get_data_processing_url(product_id: str) -> str:
    host = os.getenv('DATA_PROCESSING_SERVICE_HOST', 'localhost')
    port = os.getenv('DATA_PROCESSING_SERVICE_PORT', '8005')
    return f"http://{host}:{port}/process/{product_id}"


def fetch_processed_series(product_id: str) -> dict:
    """
    Lấy dữ liệu xuất kho ĐÃ được làm sạch & chuẩn hóa từ Data Processing Service.

    Forecasting Service không còn tự truy vấn PostgreSQL / tự tiền xử lý dữ liệu thô
    nữa - trách nhiệm đó đã được tách riêng cho Data Processing Service, đúng theo
    kiến trúc microservice của đề tài (mỗi service chỉ đảm nhận một chức năng riêng).
    """
    url = get_data_processing_url(product_id)
    try:
        response = requests.get(url, params={'lookback_days': 180}, timeout=10)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        raise HTTPException(
            status_code=502,
            detail=f"Không thể kết nối tới Data Processing Service: {e}"
        )


@app.get("/health")
def health():
    return {"status": "ok", "service": "forecasting-service"}


@app.get("/forecast/{product_id}")
def forecast_demand(product_id: str, days: int = 7):
    processed = fetch_processed_series(product_id)
    series = processed.get('series') or []

    if len(series) < MIN_HISTORY_POINTS:
        return {
            "productId": product_id,
            "message": f"Không đủ dữ liệu lịch sử xuất kho để dự báo (cần ít nhất {MIN_HISTORY_POINTS} ngày có dữ liệu sau khi xử lý)",
            "forecast": []
        }

    try:
        daily_outbound = pd.DataFrame(series)
        daily_outbound['date'] = pd.to_datetime(daily_outbound['date'])

        X = daily_outbound[['dayIndex']].rename(columns={'dayIndex': 'day_index'})
        y = daily_outbound['quantity']

        # Huấn luyện mô hình Linear Regression trên dữ liệu đã được Data Processing Service xử lý
        model = LinearRegression()
        model.fit(X, y)

        # Dự báo cho N ngày tiếp theo
        last_day_index = int(daily_outbound['dayIndex'].max())
        future_X = pd.DataFrame({'day_index': range(last_day_index + 1, last_day_index + 1 + days)})
        future_predictions = model.predict(future_X)

        last_date = daily_outbound['date'].max()
        forecast_results = []
        for i, pred in enumerate(future_predictions):
            future_date = last_date + timedelta(days=i + 1)
            # Không cho phép dự đoán số âm, tối thiểu là 0
            pred_val = max(0, round(float(pred), 2))
            forecast_results.append({
                "date": future_date.strftime('%Y-%m-%d'),
                "predictedQuantity": pred_val
            })

        return {
            "productId": product_id,
            "algorithm": "Linear Regression",
            "dataQuality": processed.get('stats'),
            "forecast": forecast_results
        }

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8004, reload=True)
