from __future__ import annotations
import datetime
import pandas as pd
from core.features import to_daily_series
from core.evaluator import compare_all_models
from core.models import (
    MovingAverageForecaster,
    NaiveSeasonalForecaster,
    ArimaForecaster,
    XGBoostForecaster,
)

MIN_POINTS_FOR_AI = 14


def generate_demand_forecast(series_data: list[dict], days: int = 7) -> dict:
    """
    Quy trình dự báo nhu cầu toàn diện:
    1. Resample dữ liệu về chuỗi ngày liên tục.
    2. Nếu dữ liệu < 14 ngày: Áp dụng Safe Fallback về Moving Average.
    3. Nếu dữ liệu >= 14 ngày:
       - Đánh giá so sánh 4 mô hình trên tập Test gần nhất để chọn Best Model.
       - Huấn luyện lại Best Model trên toàn bộ dữ liệu hiện có.
       - Dự báo đa bước cho `days` ngày tiếp theo.
       - Đính kèm metadata: modelVersion, horizonDays, metrics (MAE, RMSE, WAPE), timestamp.
    """
    daily = to_daily_series(series_data)
    # Luôn neo mốc xuất phát dự báo từ ngày hôm nay (today) để dự báo luôn ở tương lai
    today_ts = pd.Timestamp.now().floor('D')
    last_date = today_ts
    generated_at = datetime.datetime.now(datetime.timezone.utc).isoformat()

    # Trường hợp 1: Dữ liệu quá ít (< 7 ngày)
    if len(daily) < 7:
        mean_val = float(daily.mean()) if len(daily) > 0 else 5.0
        forecast_vals = [max(0.0, round(mean_val, 2))] * days
        return {
            "algorithm": "Moving Average (Safe Fallback - Dữ liệu lịch sử < 7 ngày)",
            "modelVersion": "v2.0-fallback-short",
            "isFallback": True,
            "evaluatedMetrics": {"mae": 0.0, "rmse": 0.0, "wape": 0.0, "accuracy": 100.0},
            "forecast": [
                {
                    "date": (last_date + pd.Timedelta(days=i + 1)).strftime('%Y-%m-%d'),
                    "predictedQuantity": forecast_vals[i],
                }
                for i in range(days)
            ],
            "generatedAt": generated_at,
        }

    # Trường hợp 2: Dữ liệu từ 7 đến 13 ngày (Dùng Moving Average 7 ngày)
    if len(daily) < MIN_POINTS_FOR_AI:
        ma_model = MovingAverageForecaster(window=min(7, len(daily)))
        ma_model.fit(daily)
        forecast_vals = ma_model.predict(days)
        return {
            "algorithm": "Moving Average 7-Day (Safe Fallback - Cần >= 14 ngày để kích hoạt XGBoost)",
            "modelVersion": "v2.0-fallback-ma7",
            "isFallback": True,
            "evaluatedMetrics": {"mae": 0.0, "rmse": 0.0, "wape": 0.0, "accuracy": 100.0},
            "forecast": [
                {
                    "date": (last_date + pd.Timedelta(days=i + 1)).strftime('%Y-%m-%d'),
                    "predictedQuantity": forecast_vals[i],
                }
                for i in range(days)
            ],
            "generatedAt": generated_at,
        }

    # Trường hợp 3: Dữ liệu đầy đủ (>= 14 ngày)
    # Bước 3.1: So sánh các model trên Test Set (7 ngày cuối)
    test_days = min(7, max(3, len(daily) // 4))
    comparison = compare_all_models(daily, test_days=test_days)
    best_model_name = comparison["bestModel"]
    best_metrics = comparison["bestMetrics"]

    # Bước 3.2: Khởi tạo mô hình tương ứng và fit trên toàn bộ dữ liệu lịch sử
    if "XGBoost" in best_model_name:
        final_model = XGBoostForecaster(include_all_features=True)
        model_version = "v2.0-xgboost-prod"
    elif "ARIMA" in best_model_name:
        final_model = ArimaForecaster()
        model_version = "v2.0-sarimax-prod"
    elif "Seasonal Naive" in best_model_name:
        final_model = NaiveSeasonalForecaster(season_length=7)
        model_version = "v2.0-snaive-prod"
    else:
        final_model = MovingAverageForecaster(window=7)
        model_version = "v2.0-ma7-prod"

    try:
        final_model.fit(daily)
        forecast_vals = final_model.predict(days)
    except Exception as e:
        # Fallback khẩn cấp nếu lúc fit gặp ngoại lệ
        fallback = MovingAverageForecaster(window=7)
        fallback.fit(daily)
        forecast_vals = fallback.predict(days)
        best_model_name = f"Moving Average (Khẩn cấp - Lỗi fit {final_model.name}: {str(e)})"
        model_version = "v2.0-fallback-emergency"

    forecast_list = [
        {
            "date": (last_date + pd.Timedelta(days=i + 1)).strftime('%Y-%m-%d'),
            "predictedQuantity": forecast_vals[i],
        }
        for i in range(days)
    ]

    return {
        "algorithm": best_model_name,
        "modelVersion": model_version,
        "isFallback": False,
        "evaluatedMetrics": best_metrics,
        "forecast": forecast_list,
        "generatedAt": generated_at,
    }
