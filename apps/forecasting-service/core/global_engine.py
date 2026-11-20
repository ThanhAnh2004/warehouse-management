from __future__ import annotations
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional
import requests
import os
import pandas as pd

from core.models.global_xgboost import GlobalXGBoostForecaster
from core.models.baseline import MovingAverageForecaster
from core.features import to_daily_series

MODEL_STORAGE_DIR = str(Path(__file__).resolve().parent.parent / "models_storage")
_global_forecaster: Optional[GlobalXGBoostForecaster] = None


def get_global_forecaster() -> GlobalXGBoostForecaster:
    """Singleton getter: trả về đối tượng GlobalXGBoostForecaster trong bộ nhớ hoặc nạp từ đĩa."""
    global _global_forecaster
    if _global_forecaster is not None and _global_forecaster.is_fitted:
        return _global_forecaster

    forecaster = GlobalXGBoostForecaster()
    loaded = forecaster.load(MODEL_STORAGE_DIR)
    if loaded:
        _global_forecaster = forecaster
        print(f"[GlobalEngine] Loaded Global Model from '{MODEL_STORAGE_DIR}'.")
        return _global_forecaster

    _global_forecaster = forecaster
    return _global_forecaster


def train_global_model(products_data: Dict[str, List[dict]], products_meta: Optional[dict] = None) -> dict:
    """
    Huấn luyện toàn diện mô hình Global XGBoost trên toàn bộ sản phẩm của kho hàng (Đã nâng cấp Ưu tiên 1).
    Lưu checkpoint tự động vào đĩa sau khi huấn luyện xong.
    """
    global _global_forecaster
    forecaster = GlobalXGBoostForecaster()
    summary = forecaster.fit(products_data, products_meta=products_meta)
    forecaster.save(MODEL_STORAGE_DIR)
    _global_forecaster = forecaster

    return {
        "status": "success",
        "trainedAt": datetime.now(timezone.utc).isoformat(),
        "storageDir": MODEL_STORAGE_DIR,
        "summary": summary,
    }


def forecast_with_global_model(
    product_id: str,
    series_data: List[dict],
    horizon_days: int = 7,
    product_category: Optional[str] = None,
    product_price: Optional[float] = None,
) -> dict:
    """
    Dự báo nhu cầu cho 1 sản phẩm sử dụng Global XGBoost Model (Đã nâng cấp Ưu tiên 1).
    Áp dụng Safe Fallback về Moving Average nếu chuỗi quá ngắn hoặc mô hình chưa sẵn sàng.
    """
    now_iso = datetime.now(timezone.utc).isoformat()
    daily_series = to_daily_series(series_data)

    today = pd.Timestamp.now().floor('D')
    forecaster = get_global_forecaster()

    # 1. Nếu mô hình toàn cục đã sẵn sàng: Dùng trực tiếp Global Model
    # Global Model hỗ trợ cả Cold-Start (0 giao dịch hoặc ít giao dịch) nhờ Category & Price.
    if forecaster.is_fitted:
        try:
            forecast_list = forecaster.predict_product(
                product_id,
                series_data,
                horizon_days,
                product_category=product_category,
                product_price=product_price,
            )
            return {
                "productId": product_id,
                "algorithm": "Global Multi-Product XGBoost Regressor (Single Model Architecture)",
                "modelVersion": "2.1.0-global",
                "isFallback": False,
                "evaluatedMetrics": forecaster.evaluation_metrics,
                "forecast": forecast_list,
                "generatedAt": now_iso,
            }
        except Exception as e:
            import traceback
            traceback.print_exc()

    # 2. Nếu mô hình chưa từng được huấn luyện và có dữ liệu: thử huấn luyện nhanh
    if not forecaster.is_fitted and len(daily_series) >= 3:
        try:
            print(f"[GlobalEngine] Auto training on product '{product_id}'...")
            forecaster.fit({product_id: series_data})
            forecaster.save(MODEL_STORAGE_DIR)
            forecast_list = forecaster.predict_product(
                product_id,
                series_data,
                horizon_days,
                product_category=product_category,
                product_price=product_price,
            )
            return {
                "productId": product_id,
                "algorithm": "Global Multi-Product XGBoost Regressor (Auto-trained)",
                "modelVersion": "2.1.0-global",
                "isFallback": False,
                "evaluatedMetrics": forecaster.evaluation_metrics,
                "forecast": forecast_list,
                "generatedAt": now_iso,
            }
        except Exception as e:
            pass

    # 3. Safe Fallback: luôn trả về ngày trong tương lai (từ ngày mai trở đi)
    fallback_model = MovingAverageForecaster(window=max(1, min(7, len(daily_series))))
    if len(daily_series) > 0:
        fallback_model.fit(daily_series)
    fc_vals = fallback_model.predict(horizon_days)
    fc = [
        {
            "date": (today + pd.Timedelta(days=i)).strftime("%Y-%m-%d"),
            "predictedQuantity": round(float(v), 2),
            "dayIndex": i,
        }
        for i, v in enumerate(fc_vals, 1)
    ]
    return {
        "productId": product_id,
        "algorithm": "Moving Average (Baseline Fallback)",
        "modelVersion": "2.1.0-global-fallback",
        "isFallback": True,
        "evaluatedMetrics": {"MAE": 0.0, "RMSE": 0.0, "WAPE": 0.0, "Accuracy": 0.0},
        "forecast": fc,
        "generatedAt": now_iso,
    }
