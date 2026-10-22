from __future__ import annotations
import pandas as pd
import numpy as np
from core.holidays import get_vietnam_holidays

LAG_STEPS = [1, 2, 7, 14, 30]


def to_daily_series(series_data: list[dict]) -> pd.Series:
    """
    Chuyển đổi danh sách giao dịch thô sang pandas Series hàng ngày (resampling 'D')
    với index là DateTime và fillna bằng 0.0 cho các ngày không có giao dịch.
    """
    if not series_data:
        return pd.Series(dtype=float)

    df = pd.DataFrame(series_data)
    df['date'] = pd.to_datetime(df['date'])
    daily = df.sort_values('date').set_index('date')['quantity']
    # Ép về tần suất ngày, lấp 0 cho ngày trống
    daily = daily.asfreq('D').fillna(0.0)
    return daily


def create_feature_matrix(daily_series: pd.Series, include_all_features: bool = True) -> tuple[pd.DataFrame, pd.Series]:
    """
    Tạo ma trận đặc trưng cho học máy từ chuỗi thời gian:
    - Target (y): quantity
    - Features (X):
        + Lags (1, 2, 7, 14, 30)
        + Rolling statistics (Mean 7, Std 7, Mean 14, Mean 30) với .shift(1) chống leakage
        + Calendar (day_of_week, is_weekend, day_of_month, month, is_holiday)
    Nếu include_all_features = False (dùng cho Ablation Study), chỉ giữ lại các đặc trưng Lag.
    """
    df = pd.DataFrame({'quantity': daily_series})

    # 1. Lags
    for lag in LAG_STEPS:
        df[f'lag_{lag}'] = df['quantity'].shift(lag)

    if include_all_features:
        # 2. Rolling statistics (dùng shift(1) để không tính chính giá trị ngày hôm đó - chống rò rỉ dữ liệu)
        shifted = df['quantity'].shift(1)
        df['rolling_mean_7'] = shifted.rolling(window=7, min_periods=1).mean()
        df['rolling_std_7'] = shifted.rolling(window=7, min_periods=1).std().fillna(0.0)
        df['rolling_mean_14'] = shifted.rolling(window=14, min_periods=1).mean()
        df['rolling_mean_30'] = shifted.rolling(window=30, min_periods=1).mean()

        # 3. Calendar features
        df['day_of_week'] = df.index.dayofweek
        df['is_weekend'] = df.index.dayofweek.isin([5, 6]).astype(int)
        df['day_of_month'] = df.index.day
        df['month'] = df.index.month

        # 4. Vietnam Holidays
        holidays_cache = {}
        def check_holiday(d):
            y = d.year
            if y not in holidays_cache:
                holidays_cache[y] = get_vietnam_holidays(y)
            return 1 if d.date() in holidays_cache[y] else 0

        df['is_holiday'] = [check_holiday(d) for d in df.index]

    # Điền giá trị bfill cho các dòng đầu bị thiếu do lag 30
    df = df.bfill().fillna(0.0)

    feature_cols = [c for c in df.columns if c != 'quantity']
    X = df[feature_cols]
    y = df['quantity']
    return X, y


def build_single_step_features(history_series: pd.Series, target_date: pd.Timestamp, include_all_features: bool = True) -> pd.DataFrame:
    """
    Xây dựng 1 hàng đặc trưng cho ngày tương lai target_date phục vụ chiến lược
    Recursive Autoregressive Forecasting.
    """
    row = {}

    # Lags
    for lag in LAG_STEPS:
        lag_date = target_date - pd.Timedelta(days=lag)
        row[f'lag_{lag}'] = float(history_series.loc[lag_date]) if lag_date in history_series.index else 0.0

    if include_all_features:
        # Rolling stats từ 7, 14, 30 ngày trước target_date
        past_7_dates = [target_date - pd.Timedelta(days=j) for j in range(1, 8)]
        past_7_vals = [history_series.loc[d] for d in past_7_dates if d in history_series.index]
        row['rolling_mean_7'] = float(np.mean(past_7_vals)) if past_7_vals else 0.0
        row['rolling_std_7'] = float(np.std(past_7_vals)) if len(past_7_vals) > 1 else 0.0

        past_14_dates = [target_date - pd.Timedelta(days=j) for j in range(1, 15)]
        past_14_vals = [history_series.loc[d] for d in past_14_dates if d in history_series.index]
        row['rolling_mean_14'] = float(np.mean(past_14_vals)) if past_14_vals else 0.0

        past_30_dates = [target_date - pd.Timedelta(days=j) for j in range(1, 31)]
        past_30_vals = [history_series.loc[d] for d in past_30_dates if d in history_series.index]
        row['rolling_mean_30'] = float(np.mean(past_30_vals)) if past_30_vals else 0.0

        # Calendar
        row['day_of_week'] = target_date.dayofweek
        row['is_weekend'] = 1 if target_date.dayofweek in [5, 6] else 0
        row['day_of_month'] = target_date.day
        row['month'] = target_date.month

        holidays = get_vietnam_holidays(target_date.year)
        row['is_holiday'] = 1 if target_date.date() in holidays else 0

    return pd.DataFrame([row])
