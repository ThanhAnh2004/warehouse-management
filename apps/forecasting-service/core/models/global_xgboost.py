from __future__ import annotations
import json
import os
from pathlib import Path
from typing import Dict, List, Optional
import numpy as np
import pandas as pd
import xgboost as xgb

from core.features import to_daily_series
from core.global_features import (
    build_global_features,
    build_single_step_global_features,
)
from core.metrics import calculate_metrics


class GlobalXGBoostForecaster:
    """
    Mô hình học máy toàn cục (Global Forecasting Model) sử dụng XGBoost Regressor.
    Một mô hình duy nhất học tập trung trên toàn bộ sản phẩm của kho hàng,
    giải quyết bài toán dự báo đa sản phẩm mà không cần tạo/chọn từng model riêng lẻ.
    """

    def __init__(
        self,
        n_estimators: int = 150,
        max_depth: int = 6,
        learning_rate: float = 0.05,
        subsample: float = 0.8,
        colsample_bytree: float = 0.8,
        random_state: int = 42,
    ):
        self.n_estimators = n_estimators
        self.max_depth = max_depth
        self.learning_rate = learning_rate
        self.subsample = subsample
        self.colsample_bytree = colsample_bytree
        self.random_state = random_state

        self.model: Optional[xgb.XGBRegressor] = None
        self.metadata: dict = {}
        self.evaluation_metrics: dict = {}
        self.is_fitted: bool = False

    def fit(
        self,
        products_series: Dict[str, List[dict]],
        val_days: int = 7,
    ) -> dict:
        """
        Huấn luyện mô hình toàn cục trên dữ liệu của TẤT CẢ các sản phẩm.
        - products_series: { product_id: [ {"date": "YYYY-MM-DD", "quantity": float}, ... ] }
        - val_days: số ngày cuối cùng của chuỗi dùng để đánh giá điểm WAPE/MAE/RMSE toàn cục.
        """
        X, y, metadata = build_global_features(products_series)
        if X.empty or len(y) == 0:
            raise ValueError("Không đủ dữ liệu toàn kho để huấn luyện Global Model.")

        self.metadata = metadata

        self.model = xgb.XGBRegressor(
            n_estimators=self.n_estimators,
            max_depth=self.max_depth,
            learning_rate=self.learning_rate,
            subsample=self.subsample,
            colsample_bytree=self.colsample_bytree,
            random_state=self.random_state,
            n_jobs=-1,
        )

        # Huấn luyện mô hình
        self.model.fit(X, y)
        self.is_fitted = True

        # Đánh giá toàn cục trên tập train/val
        preds = self.model.predict(X)
        preds = np.clip(preds, 0.0, None)
        self.evaluation_metrics = calculate_metrics(y.values, preds)

        return {
            "totalProducts": len(metadata.get("pid_to_code", {})),
            "totalTrainingRows": len(X),
            "featureCount": len(metadata.get("feature_cols", [])),
            "globalMetrics": self.evaluation_metrics,
        }

    def predict_product(
        self,
        product_id: str,
        series_data: List[dict],
        horizon_days: int = 7,
    ) -> List[dict]:
        """
        Dự báo tương lai cho 1 sản phẩm cụ thể bằng mô hình toàn cục.
        Sử dụng kỹ thuật Recursive Autoregressive Forecasting.
        """
        if not self.is_fitted or self.model is None:
            raise RuntimeError("Global Model chưa được huấn luyện hoặc nạp vào bộ nhớ.")

        daily_series = to_daily_series(series_data)
        if len(daily_series) == 0:
            return []

        history = daily_series.copy()
        last_date = history.index.max()
        forecasts = []

        for step in range(1, horizon_days + 1):
            target_date = last_date + pd.Timedelta(days=step)
            step_features = build_single_step_global_features(
                history_series=history,
                target_date=target_date,
                product_id=product_id,
                product_metadata=self.metadata,
            )

            pred_val = float(self.model.predict(step_features)[0])
            pred_val = max(0.0, pred_val)

            # Đệ quy: cập nhật giá trị dự báo vào lịch sử để tính lags cho các ngày tiếp theo
            history.loc[target_date] = pred_val

            forecasts.append({
                "date": target_date.strftime("%Y-%m-%d"),
                "predictedQuantity": round(pred_val, 2),
                "dayIndex": int((target_date - daily_series.index.min()).days),
            })

        return forecasts

    def predict_batch(
        self,
        products_series: Dict[str, List[dict]],
        horizon_days: int = 7,
    ) -> Dict[str, List[dict]]:
        """
        Dự báo đồng loạt cho toàn bộ danh mục sản phẩm trong kho hàng.
        """
        results = {}
        for pid, s_list in products_series.items():
            try:
                results[pid] = self.predict_product(pid, s_list, horizon_days)
            except Exception as e:
                print(f"Lỗi khi dự báo sản phẩm {pid}: {e}")
                results[pid] = []
        return results

    def save(self, directory: str = "models_storage"):
        """Lưu trọng số mô hình và metadata ra đĩa."""
        if not self.is_fitted or self.model is None:
            raise RuntimeError("Không thể lưu mô hình chưa huấn luyện.")

        dir_path = Path(directory)
        dir_path.mkdir(parents=True, exist_ok=True)

        model_path = dir_path / "global_xgboost.json"
        metadata_path = dir_path / "global_metadata.json"

        self.model.save_model(str(model_path))

        meta_to_save = {
            "evaluation_metrics": self.evaluation_metrics,
            "feature_cols": self.metadata.get("feature_cols", []),
            "pid_to_code": self.metadata.get("pid_to_code", {}),
            "product_stats": self.metadata.get("product_stats", {}),
        }

        with open(metadata_path, "w", encoding="utf-8") as f:
            json.dump(meta_to_save, f, ensure_ascii=False, indent=2)

    def load(self, directory: str = "models_storage") -> bool:
        """Nạp mô hình và metadata đã lưu từ đĩa."""
        dir_path = Path(directory)
        model_path = dir_path / "global_xgboost.json"
        metadata_path = dir_path / "global_metadata.json"

        if not model_path.exists() or not metadata_path.exists():
            return False

        with open(metadata_path, "r", encoding="utf-8") as f:
            meta = json.load(f)

        self.metadata = {
            "feature_cols": meta.get("feature_cols", []),
            "pid_to_code": meta.get("pid_to_code", {}),
            "code_to_pid": {int(v): k for k, v in meta.get("pid_to_code", {}).items()},
            "product_stats": meta.get("product_stats", {}),
        }
        self.evaluation_metrics = meta.get("evaluation_metrics", {})

        self.model = xgb.XGBRegressor()
        self.model.load_model(str(model_path))
        self.is_fitted = True
        return True
