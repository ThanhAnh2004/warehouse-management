from __future__ import annotations
import pandas as pd
from core.metrics import calculate_metrics
from core.models import (
    MovingAverageForecaster,
    NaiveSeasonalForecaster,
    ArimaForecaster,
    XGBoostForecaster,
)


def time_based_split(daily_series: pd.Series, test_days: int = 7) -> tuple[pd.Series, pd.Series]:
    """
    Phân chia dữ liệu theo dòng thời gian (Time-based Train/Test split).
    Tuyệt đối không shuffle hay random split.
    Lấy `test_days` ngày cuối cùng làm tập Test, phần còn lại làm tập Train.
    """
    n = len(daily_series)
    # Cần tối thiểu 7 ngày để train
    test_size = min(test_days, max(1, n - 7))
    train_series = daily_series.iloc[:-test_size]
    test_series = daily_series.iloc[-test_size:]
    return train_series, test_series


def evaluate_single_model(model, train_series: pd.Series, test_series: pd.Series) -> dict:
    """Huấn luyện 1 mô hình trên tập Train và tính MAE, RMSE, WAPE trên tập Test."""
    steps = len(test_series)
    try:
        model.fit(train_series)
        y_pred = model.predict(steps)
    except Exception as e:
        # Fallback an toàn nếu model lỗi
        y_pred = [float(train_series.mean())] * steps

    y_true = [float(v) for v in test_series.values]
    metrics = calculate_metrics(y_true, y_pred)

    test_dates = [d.strftime('%Y-%m-%d') for d in test_series.index]
    comparison_points = [
        {"date": date, "actual": round(actual, 2), "predicted": round(pred, 2)}
        for date, actual, pred in zip(test_dates, y_true, y_pred)
    ]

    return {
        "modelName": model.name,
        "metrics": metrics,
        "comparison": comparison_points,
    }


def compare_all_models(daily_series: pd.Series, test_days: int = 7) -> dict:
    """
    So sánh đồng thời 4 mô hình thuộc 3 trường phái trên cùng 1 tập Test:
    1. Moving Average (Baseline)
    2. Seasonal Naive (Baseline)
    3. ARIMA / SARIMAX (Thống kê)
    4. XGBoost (Học máy Tabular)
    Tự động xếp hạng theo WAPE tăng dần (WAPE nhỏ nhất là tốt nhất).
    """
    train_series, test_series = time_based_split(daily_series, test_days=test_days)

    candidate_models = [
        MovingAverageForecaster(window=7),
        NaiveSeasonalForecaster(season_length=7),
        ArimaForecaster(),
        XGBoostForecaster(include_all_features=True),
    ]

    results = []
    for m in candidate_models:
        res = evaluate_single_model(m, train_series, test_series)
        results.append(res)

    # Sắp xếp theo WAPE tăng dần (thấp nhất là chính xác nhất)
    results.sort(key=lambda x: (x["metrics"]["wape"], x["metrics"]["mae"]))

    best_model_info = results[0]

    return {
        "testPeriod": {
            "start": test_series.index.min().strftime('%Y-%m-%d'),
            "end": test_series.index.max().strftime('%Y-%m-%d'),
            "days": len(test_series),
        },
        "bestModel": best_model_info["modelName"],
        "bestMetrics": best_model_info["metrics"],
        "comparisonTable": results,
    }
