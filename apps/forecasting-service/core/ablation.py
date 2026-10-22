from __future__ import annotations
import pandas as pd
from core.evaluator import time_based_split, evaluate_single_model
from core.models.xgboost_model import XGBoostForecaster


def run_ablation_study(daily_series: pd.Series, test_days: int = 7) -> dict:
    """
    Thực hiện nghiên cứu loại trừ đặc trưng (Ablation Analysis):
    So sánh đối chuẩn định lượng giữa:
    - Biến thể A: XGBoost chỉ dùng Lag features (t-1, t-2, t-7, t-14, t-30)
    - Biến thể B: XGBoost đầy đủ (Lag + Rolling Mean/Std + Calendar + Lễ Tết Việt Nam)
    Đo lường độ giảm sai số (WAPE reduction) để chứng minh giá trị khoa học của Feature Engineering.
    """
    train_series, test_series = time_based_split(daily_series, test_days=test_days)

    model_lag_only = XGBoostForecaster(include_all_features=False)
    model_full_features = XGBoostForecaster(include_all_features=True)

    res_lag = evaluate_single_model(model_lag_only, train_series, test_series)
    res_full = evaluate_single_model(model_full_features, train_series, test_series)

    wape_lag = res_lag["metrics"]["wape"]
    wape_full = res_full["metrics"]["wape"]

    wape_diff = round(wape_lag - wape_full, 4)
    improvement_pct = round((wape_diff / wape_lag * 100), 2) if wape_lag > 0 else 0.0

    return {
        "testPeriod": {
            "start": test_series.index.min().strftime('%Y-%m-%d'),
            "end": test_series.index.max().strftime('%Y-%m-%d'),
            "days": len(test_series),
        },
        "lagOnlyVariant": {
            "features": ["lag_1", "lag_2", "lag_7", "lag_14", "lag_30"],
            "metrics": res_lag["metrics"],
        },
        "fullFeaturesVariant": {
            "features": [
                "lag_1, lag_2, lag_7, lag_14, lag_30",
                "rolling_mean_7, rolling_std_7, rolling_mean_14, rolling_mean_30",
                "day_of_week, is_weekend, day_of_month, month",
                "is_holiday (Lễ Tết Việt Nam)",
            ],
            "metrics": res_full["metrics"],
        },
        "impact": {
            "wapeReduction": wape_diff,
            "accuracyGainPct": improvement_pct,
            "conclusion": (
                f"Đặc trưng Rolling statistics và Niên lịch/Lễ Tết giúp cải thiện độ chính xác thêm {abs(improvement_pct)}% "
                f"(WAPE giảm từ {wape_lag:.4f} xuống {wape_full:.4f})."
                if wape_diff > 0 else
                "Trên chuỗi dữ liệu này, mô hình Lag cơ bản hoạt động tương đương do tính chất tiêu thụ đơn giản."
            ),
        },
    }
