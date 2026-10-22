from __future__ import annotations
import pandas as pd
import numpy as np
import xgboost as xgb
from core.models.base import BaseForecaster
from core.features import create_feature_matrix, build_single_step_features


class XGBoostForecaster(BaseForecaster):
    """
    ML Tabular Model: XGBoost Regressor với Recursive Multi-Step Forecasting.
    Hỗ trợ cả chế độ Full Features và Lag-Only (dùng cho Ablation Study).
    """

    def __init__(self, include_all_features: bool = True, n_estimators: int = 150, max_depth: int = 4, learning_rate: float = 0.05):
        suffix = "Đầy đủ Lag + Rolling + Calendar + Lễ Tết" if include_all_features else "Chỉ dùng Lag Features"
        super().__init__(name=f"XGBoost Regressor ({suffix})")
        self.include_all_features = include_all_features
        self.n_estimators = n_estimators
        self.max_depth = max_depth
        self.learning_rate = learning_rate
        self.model = None
        self.feature_names = []
        self.last_series = None

    def fit(self, series: pd.Series) -> "XGBoostForecaster":
        self.last_series = series.copy()
        X, y = create_feature_matrix(series, include_all_features=self.include_all_features)
        self.feature_names = list(X.columns)

        # Cấu hình XGBoost tối ưu cho dữ liệu kho vừa & nhỏ, chống overfitting
        self.model = xgb.XGBRegressor(
            n_estimators=self.n_estimators,
            max_depth=self.max_depth,
            learning_rate=self.learning_rate,
            subsample=0.85,
            colsample_bytree=0.85,
            random_state=42,
            n_jobs=1,
        )
        self.model.fit(X, y)
        self.is_fitted = True
        return self

    def predict(self, steps: int) -> list[float]:
        if not self.is_fitted or self.model is None or self.last_series is None:
            return [0.0] * steps

        working_series = self.last_series.copy()
        last_date = working_series.index.max()
        predictions = []

        for i in range(1, steps + 1):
            future_date = last_date + pd.Timedelta(days=i)
            X_step = build_single_step_features(working_series, future_date, include_all_features=self.include_all_features)
            # Khớp thứ tự cột
            X_step = X_step.reindex(columns=self.feature_names, fill_value=0.0)

            pred_val = float(self.model.predict(X_step)[0])
            pred_val = max(0.0, round(pred_val, 2))

            # Lưu lại vào chuỗi để làm lag cho các bước tiếp theo
            working_series.loc[future_date] = pred_val
            predictions.append(pred_val)

        return predictions
