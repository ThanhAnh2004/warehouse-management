from __future__ import annotations
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional
import requests
import os

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


def train_global_model(products_data: Dict[str, List[dict]]) -> dict:
    """
    Huấn luyện toàn diện mô hình Global XGBoost trên toàn bộ sản phẩm của kho hàng.
    Lưu checkpoint tự động vào đĩa sau khi huấn luyện xong.
    """
    global _global_forecaster
    forecaster = GlobalXGBoostForecaster()
    summary = forecaster.fit(products_data)
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
) -> dict:
    """
    Dự báo nhu cầu cho 1 sản phẩm sử dụng Global XGBoost Model.
    Áp dụng Safe Fallback về Moving Average nếu chuỗi quá ngắn hoặc mô hình chưa sẵn sàng.
    """
    now_iso = datetime.now(timezone.utc).isoformat()
    daily_series = to_daily_series(series_data)

    if len(daily_series) < 3:
        # Dữ liệu quá ít: fallback về Moving Average
        fallback_model = MovingAverageForecaster(window=3)
        fallback_model.fit(daily_series)
        fc = fallback_model.predict(horizon_days)
        return {
            "productId": product_id,
            "algorithm": "Moving Average (Baseline Fallback - Chuỗi < 3 ngày)",
            "modelVersion": "2.1.0-global-fallback",
            "isFallback": True,
            "evaluatedMetrics": {"MAE": 0.0, "RMSE": 0.0, "WAPE": 0.0, "Accuracy": 0.0},
            "forecast": fc,
            "generatedAt": now_iso,
        }

    forecaster = get_global_forecaster()

    # Nếu mô hình chưa từng được huấn luyện:
    if not forecaster.is_fitted:
        # Tự động huấn luyện nhanh trên sản phẩm hiện tại để phục vụ dự báo tức thì
        try:
            print(f"[GlobalEngine] Auto training on product '{product_id}'...")
            forecaster.fit({product_id: series_data})
            forecaster.save(MODEL_STORAGE_DIR)
        except Exception as e:
            # Safe Fallback
            fallback_model = MovingAverageForecaster(window=min(7, len(daily_series)))
            fallback_model.fit(daily_series)
            fc = fallback_model.predict(horizon_days)
            return {
                "productId": product_id,
                "algorithm": f"Moving Average (Baseline Fallback - {e})",
                "modelVersion": "2.1.0-global-fallback",
                "isFallback": True,
                "evaluatedMetrics": {"MAE": 0.0, "RMSE": 0.0, "WAPE": 0.0, "Accuracy": 0.0},
                "forecast": fc,
                "generatedAt": now_iso,
            }

    try:
        forecast_list = forecaster.predict_product(product_id, series_data, horizon_days)
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
        fallback_model = MovingAverageForecaster(window=min(7, len(daily_series)))
        fallback_model.fit(daily_series)
        fc = fallback_model.predict(horizon_days)
        return {
            "productId": product_id,
            "algorithm": f"Moving Average (Safe Fallback do lỗi dự báo: {e})",
            "modelVersion": "2.1.0-global-fallback",
            "isFallback": True,
            "evaluatedMetrics": {"MAE": 0.0, "RMSE": 0.0, "WAPE": 0.0, "Accuracy": 0.0},
            "forecast": fc,
            "generatedAt": now_iso,
        }
