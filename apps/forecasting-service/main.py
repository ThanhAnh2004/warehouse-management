import uvicorn
import requests
from fastapi import FastAPI, HTTPException
import pandas as pd
from sklearn.linear_model import LinearRegression
from dotenv import load_dotenv

# Load bien moi truong tu thu muc goc
load_dotenv(dotenv_path='../../.env')

app = FastAPI(title="Forecasting Service", version="1.0")

DATA_PROCESSING_SERVICE_URL = "http://localhost:8005"


@app.get("/forecast/{product_id}")
def forecast_demand(product_id: str, days: int = 7):
    # Lay du lieu OUTBOUND da duoc lam sach/chuan hoa tu Data Processing Service
    # thay vi doc thang tu Postgres, dung dung kien truc microservice trong yeu cau de tai.
    try:
        resp = requests.get(
            f"{DATA_PROCESSING_SERVICE_URL}/clean-data/{product_id}",
            params={"transaction_type": "OUTBOUND"},
            timeout=10,
        )
        resp.raise_for_status()
        cleaned = resp.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Data Processing Service unavailable: {e}")

    series = cleaned.get("series", [])
    if cleaned.get("rawCount", 0) < 3 or len(series) == 0:
        return {
            "productId": product_id,
            "message": "Không đủ dữ liệu lịch sử xuất kho để dự báo (Cần ít nhất 3 giao dịch OUTBOUND)",
            "forecast": []
        }

    try:
        df = pd.DataFrame(series)
        df['date'] = pd.to_datetime(df['date'])

        # Tạo feature X là số ngày tính từ ngày đầu tiên (0, 1, 2, ...)
        df['day_index'] = (df['date'] - df['date'].min()).dt.days

        X = df[['day_index']]
        y = df['quantity']

        # Huấn luyện mô hình Linear Regression
        model = LinearRegression()
        model.fit(X, y)

        # Dự báo cho N ngày tiếp theo
        last_day_index = df['day_index'].max()
        future_X = pd.DataFrame({'day_index': range(last_day_index + 1, last_day_index + 1 + days)})
        future_predictions = model.predict(future_X)

        # Tạo kết quả trả về
        last_date = df['date'].max()
        forecast_results = []
        for i, pred in enumerate(future_predictions):
            future_date = last_date + pd.Timedelta(days=i + 1)
            # Không cho phép dự đoán số âm, tối thiểu là 0
            pred_val = max(0, round(pred, 2))
            forecast_results.append({
                "date": future_date.strftime('%Y-%m-%d'),
                "predictedQuantity": pred_val
            })

        return {
            "productId": product_id,
            "algorithm": "Linear Regression",
            "forecast": forecast_results
        }

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8004, reload=True)
