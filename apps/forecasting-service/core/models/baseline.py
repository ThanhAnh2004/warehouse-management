from __future__ import annotations
import pandas as pd
import numpy as np
from core.models.base import BaseForecaster


class MovingAverageForecaster(BaseForecaster):
    """
    Baseline Model 1: Simple Moving Average (SMA).
    Lấy giá trị trung bình của `window` ngày gần nhất làm giá trị dự báo cho tương lai.
    """

    def __init__(self, window: int = 7):
        super().__init__(name=f"Moving Average (SMA-{window})")
        self.window = window
        self.avg_val = 0.0

    def fit(self, series: pd.Series) -> "MovingAverageForecaster":
        recent = series.tail(self.window)
        self.avg_val = float(recent.mean()) if len(recent) > 0 else 0.0
        self.is_fitted = True
        return self

    def predict(self, steps: int) -> list[float]:
        val = max(0.0, round(self.avg_val, 2))
        return [val] * steps


class NaiveSeasonalForecaster(BaseForecaster):
    """
    Baseline Model 2: Seasonal Naive Forecaster.
    Lấy đúng giá trị của cùng ngày ở tuần trước: y_{t+k} = y_{t+k-7}.
    """

    def __init__(self, season_length: int = 7):
        super().__init__(name=f"Seasonal Naive (Chu kỳ {season_length} ngày)")
        self.season_length = season_length
        self.last_season_vals = []

    def fit(self, series: pd.Series) -> "NaiveSeasonalForecaster":
        recent = series.tail(self.season_length)
        self.last_season_vals = [float(v) for v in recent.values]
        if not self.last_season_vals:
            self.last_season_vals = [0.0]
        self.is_fitted = True
        return self

    def predict(self, steps: int) -> list[float]:
        predictions = []
        n = len(self.last_season_vals)
        for i in range(steps):
            val = self.last_season_vals[i % n]
            predictions.append(max(0.0, round(val, 2)))
        return predictions
