"""
Module mo hinh du bao cho Forecasting Service.

Su dung thuat toan Ridge Regression ho tro dac trung:
- Thu tu ngay trong tuan (day_of_week)
- Ngay cuoi tuan (is_weekend)
- Ngay le tet Viet Nam (is_holiday)
- Nhu cau tre (lag_7)
- Trung binh truot (rolling_mean_7)

Dinh ky chay multi-step autoregressive de du bao cho 7 ngay tiep theo.
"""

import warnings
import datetime
import pandas as pd
import numpy as np
from sklearn.linear_model import LinearRegression, Ridge

# Can it nhat 14 ngay lich su de co the tinh toan lag_7 va rolling_mean_7 on dinh
MIN_POINTS_FOR_SUPERVISED = 14

def get_vietnam_holidays(year: int) -> set:
    """Tra ve danh sach cac ngay le Tet cua Viet Nam de dua vao mo hinh hoc may."""
    holidays = {
        datetime.date(year, 1, 1),   # New Year's Day
        datetime.date(year, 4, 30),  # Reunification Day
        datetime.date(year, 5, 1),   # International Workers' Day
        datetime.date(year, 9, 2),   # National Day
        datetime.date(year, 9, 3),   # National Day (additional day)
    }
    
    # Anh xa cac ngay le am lich co dinh trong lich duong tuong ung tu 2024-2026:
    if year == 2024:
        # Giot to Hung Vuong: 18/04/2024
        holidays.add(datetime.date(2024, 4, 18))
        # Tet Nguyen Dan: 08/02/2024 - 14/02/2024
        for day in range(8, 15):
            holidays.add(datetime.date(2024, 2, day))
    elif year == 2025:
        # Giot to Hung Vuong: 07/04/2025
        holidays.add(datetime.date(2025, 4, 7))
        # Tet Nguyen Dan: 25/01/2025 - 02/02/2025
        for day in range(25, 32):
            holidays.add(datetime.date(2025, 1, day))
        holidays.add(datetime.date(2025, 2, 1))
        holidays.add(datetime.date(2025, 2, 2))
    elif year == 2026:
        # Giot to Hung Vuong: 26/04/2026
        holidays.add(datetime.date(2026, 4, 26))
        # Tet Nguyen Dan: 13/02/2026 - 21/02/2026
        for day in range(13, 22):
            holidays.add(datetime.date(2026, 2, day))
            
    return holidays

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

def _supervised_forecast(daily: pd.Series, days: int):
    # 1. Chuan bi dataframe va tinh toan dac trung cho du lieu lich su
    df = pd.DataFrame(daily)
    df.columns = ['quantity']
    df['day_of_week'] = df.index.dayofweek
    df['is_weekend'] = df.index.dayofweek.isin([5, 6]).astype(int)
    df['is_holiday'] = df.index.map(lambda d: 1 if d.date() in get_vietnam_holidays(d.year) else 0)
    
    # Lags va rolling statistics tu qua khu
    df['lag_7'] = df['quantity'].shift(7).bfill().fillna(0.0)
    df['rolling_mean_7'] = df['quantity'].shift(1).rolling(window=7, min_periods=1).mean().bfill().fillna(0.0)

    # 2. Train Ridge Regression
    X = df[['day_of_week', 'is_weekend', 'is_holiday', 'lag_7', 'rolling_mean_7']]
    y = df['quantity']
    
    model = Ridge(alpha=1.0)
    model.fit(X, y)

    # 3. Autoregressive multi-step forecasting cho tuong lai
    working_series = daily.copy()
    last_date = daily.index.max()
    predictions = []
    
    for i in range(1, days + 1):
        future_date = last_date + pd.Timedelta(days=i)
        
        # dynamic lag_7
        lag_date = future_date - pd.Timedelta(days=7)
        lag_7_val = working_series.loc[lag_date] if lag_date in working_series.index else 0.0
        
        # dynamic rolling_mean_7 (lay trung binh 7 ngay sat truoc do)
        past_7_dates = [future_date - pd.Timedelta(days=j) for j in range(1, 8)]
        rolling_vals = [working_series.loc[d] for d in past_7_dates if d in working_series.index]
        rolling_mean_7_val = sum(rolling_vals) / len(rolling_vals) if rolling_vals else 0.0
        
        is_holiday_val = 1 if future_date.date() in get_vietnam_holidays(future_date.year) else 0
        is_weekend_val = 1 if future_date.dayofweek in [5, 6] else 0
        day_of_week_val = future_date.dayofweek
        
        X_pred = pd.DataFrame([{
            'day_of_week': day_of_week_val,
            'is_weekend': is_weekend_val,
            'is_holiday': is_holiday_val,
            'lag_7': lag_7_val,
            'rolling_mean_7': rolling_mean_7_val
        }])
        
        # Du bao
        pred_qty = max(0.0, round(float(model.predict(X_pred)[0]), 2))
        
        # Luu tru de lam dac trung cho cac ngay tiep theo
        working_series.loc[future_date] = pred_qty
        predictions.append(pred_qty)
        
    return predictions

def generate_forecast(series: list, days: int) -> dict:
    """
    series: [{"date": "YYYY-MM-DD", "quantity": float}, ...]
    Tra ve: {"algorithm": str, "forecast": [{"date": ..., "predictedQuantity": ...}, ...]}
    """
    daily = _to_daily_series(series)
    
    # Mac dinh dung Ridge Regression neu du diem du lieu
    if len(daily) >= MIN_POINTS_FOR_SUPERVISED:
        try:
            values = _supervised_forecast(daily, days)
            algorithm = "Ridge Regression (với Lễ, Tết & Ngày cuối tuần)"
        except Exception as e:
            # Fallback neu co loi tinh toan
            values = _linear_regression_forecast(daily, days)
            algorithm = f"Linear Regression (fallback - loi Ridge: {str(e)})"
    else:
        values = _linear_regression_forecast(daily, days)
        algorithm = "Linear Regression (fallback - không đủ dữ liệu lịch sử)"
        
    last_date = daily.index.max()
    forecast = [
        {
            'date': (last_date + pd.Timedelta(days=i + 1)).strftime('%Y-%m-%d'),
            'predictedQuantity': v,
        }
        for i, v in enumerate(values)
    ]
    
    return {'algorithm': algorithm, 'forecast': forecast}
