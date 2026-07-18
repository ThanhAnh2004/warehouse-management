"""
Module mo hinh du bao cho Forecasting Service.

Tach rieng khoi main.py de: (1) de test/thay doi thuat toan doc lap voi tang HTTP,
va (2) neu sau nay co model da duoc huan luyen/tune rieng (vd tu file .pkl), chi can
thay the ham generate_forecast() ma khong dong den phan API/goi Data Processing Service.

Model chinh: ARIMA (statsmodels) - phu hop voi chuoi thoi gian nhu cau it diem du lieu
nhu trong pham vi do an. Tu dong fallback ve Linear Regression khi lich su qua ngan
hoac ARIMA khong hoi tu.
"""

import warnings
from itertools import product

import pandas as pd
from sklearn.linear_model import LinearRegression
from statsmodels.tsa.arima.model import ARIMA

# ARIMA can it nhat tung nay diem du lieu hang ngay moi cho ket qua on dinh;
# it hon thi uu tien Linear Regression de tranh mo hinh qua fit tren nhieu.
MIN_POINTS_FOR_ARIMA = 10

# Pham vi tim (p, d, q) - gioi han nho de du bao tra ve nhanh trong 1 request HTTP.
_P_RANGE = range(0, 3)
_D_RANGE = range(0, 2)
_Q_RANGE = range(0, 3)


def _to_daily_series(series: list) -> pd.Series:
    df = pd.DataFrame(series)
    df['date'] = pd.to_datetime(df['date'])
    daily = df.sort_values('date').set_index('date')['quantity']
    return daily.asfreq('D').fillna(0.0)


def _linear_regression_forecast(daily: pd.Series, days: int) -> list:
    df = daily.reset_index()
    df.columns = ['date', 'quantity']
    df['day_index'] = (df['date'] - df['date'].min()).dt.days

    model = LinearRegression()
    model.fit(df[['day_index']], df['quantity'])

    last_day_index = df['day_index'].max()
    future_X = pd.DataFrame({'day_index': range(last_day_index + 1, last_day_index + 1 + days)})
    predictions = model.predict(future_X)
    return [max(0.0, round(float(p), 2)) for p in predictions]


def _best_arima_fit(series: pd.Series):
    """Grid search (p,d,q) nho, chon mo hinh hoi tu voi AIC thap nhat."""
    best_aic = float('inf')
    best_order = None
    best_fit = None

    with warnings.catch_warnings():
        warnings.simplefilter('ignore')
        for p, d, q in product(_P_RANGE, _D_RANGE, _Q_RANGE):
            if p == 0 and q == 0:
                continue  # (0,d,0) khong phai mo hinh du bao co y nghia
            try:
                fit = ARIMA(series, order=(p, d, q)).fit()
            except Exception:
                continue
            if fit.aic < best_aic:
                best_aic = fit.aic
                best_order = (p, d, q)
                best_fit = fit

    return best_order, best_fit


def _arima_forecast(daily: pd.Series, days: int):
    if daily.nunique() <= 1:
        # Chuoi hang so (thuong gap voi san pham it giao dich, toan 0): ARIMA khong co
        # gi de hoc, du bao hop ly nhat la giu nguyen gia tri hang so do.
        flat_value = max(0.0, round(float(daily.iloc[-1]), 2))
        return [flat_value] * days, None

    order, fit = _best_arima_fit(daily)
    if fit is None:
        return None, None

    forecast_values = fit.forecast(steps=days)
    return [max(0.0, round(float(v), 2)) for v in forecast_values], order


def generate_forecast(series: list, days: int) -> dict:
    """
    series: [{"date": "YYYY-MM-DD", "quantity": float}, ...] (du lieu hang ngay,
            da lam sach/dien khuyet tu Data Processing Service).
    Tra ve: {"algorithm": str, "forecast": [{"date": ..., "predictedQuantity": ...}, ...]}
    """
    daily = _to_daily_series(series)

    algorithm = None
    values = None

    if len(daily) >= MIN_POINTS_FOR_ARIMA:
        try:
            values, order = _arima_forecast(daily, days)
            if values is not None:
                algorithm = f"ARIMA{order}" if order else "ARIMA (chuỗi hằng số)"
        except Exception:
            values = None

    if values is None:
        values = _linear_regression_forecast(daily, days)
        algorithm = 'Linear Regression (fallback - không đủ dữ liệu hoặc ARIMA không hội tụ)'

    last_date = daily.index.max()
    forecast = [
        {
            'date': (last_date + pd.Timedelta(days=i + 1)).strftime('%Y-%m-%d'),
            'predictedQuantity': v,
        }
        for i, v in enumerate(values)
    ]

    return {'algorithm': algorithm, 'forecast': forecast}
