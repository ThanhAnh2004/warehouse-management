from __future__ import annotations
import warnings
import pandas as pd
import numpy as np
from statsmodels.tsa.statespace.sarimax import SARIMAX
from core.models.base import BaseForecaster


class ArimaForecaster(BaseForecaster):
    """
    Statistical Model: SARIMAX / ARIMA cho chuỗi thời gian.
    Bắt chu kỳ tuần (seasonality = 7) và tính dừng sai phân (differencing).
    """

    def __init__(self, order=(1, 1, 1), seasonal_order=(1, 0, 1, 7)):
        super().__init__(name="ARIMA / SARIMAX Model")
        self.order = order
        self.seasonal_order = seasonal_order
        self.fitted_model = None
        self.fallback_mean = 0.0

    def fit(self, series: pd.Series) -> "ArimaForecaster":
        self.fallback_mean = float(series.mean()) if len(series) > 0 else 0.0

        # Nếu dữ liệu quá ngắn (< 14 ngày), SARIMAX chu kỳ 7 sẽ không hội tụ tốt,
        # ta giảm xuống ARIMA(1, 1, 0)
        use_seasonal = len(series) >= 21
        order_to_use = self.order
        seasonal_to_use = self.seasonal_order if use_seasonal else (0, 0, 0, 0)

        with warnings.catch_warnings():
            warnings.filterwarnings("ignore")
            try:
                model = SARIMAX(
                    series,
                    order=order_to_use,
                    seasonal_order=seasonal_to_use,
                    enforce_stationarity=False,
                    enforce_invertibility=False,
                )
                self.fitted_model = model.fit(disp=False, maxiter=50)
                self.is_fitted = True
            except Exception as e:
                # Fallback sang ARIMA đơn giản hơn nếu lỗi hội tụ
                try:
                    model = SARIMAX(series, order=(1, 0, 0), enforce_stationarity=False, enforce_invertibility=False)
                    self.fitted_model = model.fit(disp=False, maxiter=30)
                    self.is_fitted = True
                except Exception:
                    self.fitted_model = None
                    self.is_fitted = False

        return self

    def predict(self, steps: int) -> list[float]:
        if not self.is_fitted or self.fitted_model is None:
            # Fallback an toàn về trung bình
            return [max(0.0, round(self.fallback_mean, 2))] * steps

        try:
            forecast_res = self.fitted_model.forecast(steps=steps)
            return [max(0.0, round(float(v), 2)) for v in forecast_res]
        except Exception:
            return [max(0.0, round(self.fallback_mean, 2))] * steps
