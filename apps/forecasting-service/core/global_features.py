from __future__ import annotations
from typing import Dict, List, Tuple
import pandas as pd
import numpy as np
from core.holidays import get_vietnam_holidays

LAG_STEPS = [1, 2, 3, 7, 14, 30]


def build_global_panel_dataframe(products_series: Dict[str, List[dict]]) -> pd.DataFrame:
    """
    Gom dữ liệu của toàn bộ các sản phẩm trong kho thành 1 bảng Long-format (Panel Data).
    products_series: { product_id: [ {"date": "YYYY-MM-DD", "quantity": float, ...}, ... ] }
    """
    rows = []
    for pid, s_list in products_series.items():
        if not s_list:
            continue
        for item in s_list:
            rows.append({
                "productId": str(pid),
                "date": item["date"],
                "quantity": float(item["quantity"]),
            })

    if not rows:
        return pd.DataFrame()

    df = pd.DataFrame(rows)
    df['date'] = pd.to_datetime(df['date'])
    df = df.sort_values(by=['productId', 'date']).reset_index(drop=True)
    return df


def build_global_features(
    products_series: Dict[str, List[dict]],
) -> Tuple[pd.DataFrame, pd.Series, dict]:
    """
    Sinh ma trận đặc trưng cho toàn bộ kho hàng (Global Training Dataset):
    - Đảm bảo tính toán lags và rolling window riêng biệt theo từng productId.
    - Áp dụng .shift(1) để chống rò rỉ dữ liệu (data leakage).
    - Trả về: (X, y, metadata_dict)
    """
    panel_df = build_global_panel_dataframe(products_series)
    if panel_df.empty:
        return pd.DataFrame(), pd.Series(dtype=float), {}

    # 1. Tính toán thống kê tĩnh theo từng sản phẩm (Product-level aggregate features)
    stats_df = panel_df.groupby('productId')['quantity'].agg(
        product_mean_demand='mean',
        product_std_demand=lambda x: float(np.std(x)) if len(x) > 1 else 0.0,
        product_max_demand='max',
        product_record_count='count'
    ).reset_index()

    # Tạo mapping product_id sang mã số nguyên (Label Encoding)
    unique_pids = sorted(list(panel_df['productId'].unique()))
    pid_to_code = {pid: idx for idx, pid in enumerate(unique_pids)}
    code_to_pid = {idx: pid for pid, idx in pid_to_code.items()}

    product_metadata = {
        "pid_to_code": pid_to_code,
        "code_to_pid": code_to_pid,
        "product_stats": stats_df.set_index('productId').to_dict(orient='index'),
    }

    # 2. Xây dựng feature matrix theo từng nhóm sản phẩm
    processed_groups = []
    holidays_cache = {}

    def is_vn_holiday(d):
        y = d.year
        if y not in holidays_cache:
            holidays_cache[y] = get_vietnam_holidays(y)
        return 1 if d.date() in holidays_cache[y] else 0

    for pid, group in panel_df.groupby('productId'):
        group = group.sort_values('date').copy()
        
        # Tạo chuỗi ngày liên tục nếu bị ngắt quãng
        group = group.set_index('date').asfreq('D').fillna({'quantity': 0.0, 'productId': pid})
        
        # Lags
        for lag in LAG_STEPS:
            group[f'lag_{lag}'] = group['quantity'].shift(lag)

        # Rolling statistics (dùng shift(1) chống leakage)
        shifted = group['quantity'].shift(1)
        group['rolling_mean_7'] = shifted.rolling(window=7, min_periods=1).mean()
        group['rolling_std_7'] = shifted.rolling(window=7, min_periods=1).std().fillna(0.0)
        group['rolling_mean_14'] = shifted.rolling(window=14, min_periods=1).mean()
        group['rolling_mean_30'] = shifted.rolling(window=30, min_periods=1).mean()

        # Calendar features
        group['day_of_week'] = group.index.dayofweek
        group['is_weekend'] = group.index.dayofweek.isin([5, 6]).astype(int)
        group['day_of_month'] = group.index.day
        group['month'] = group.index.month

        # Vietnam Holiday
        group['is_holiday'] = [is_vn_holiday(d) for d in group.index]

        # Product static features (Target Encoding / Volume Scaling)
        p_stats = product_metadata["product_stats"].get(pid, {})
        group['product_mean_demand'] = float(p_stats.get('product_mean_demand', 0.0))
        group['product_std_demand'] = float(p_stats.get('product_std_demand', 0.0))
        group['product_max_demand'] = float(p_stats.get('product_max_demand', 0.0))

        # Điền missing do lags đầu chuỗi
        group = group.bfill().fillna(0.0)
        processed_groups.append(group.reset_index())

    full_df = pd.concat(processed_groups, ignore_index=True)
    full_df = full_df.sort_values(by=['date', 'productId']).reset_index(drop=True)

    ignore_cols = ['date', 'productId', 'quantity']
    feature_cols = [c for c in full_df.columns if c not in ignore_cols]
    
    product_metadata["feature_cols"] = feature_cols

    X = full_df[feature_cols]
    y = full_df['quantity']
    return X, y, product_metadata


def build_single_step_global_features(
    history_series: pd.Series,
    target_date: pd.Timestamp,
    product_id: str,
    product_metadata: dict,
) -> pd.DataFrame:
    """
    Tạo 1 hàng đặc trưng cho bước dự báo tiếp theo của 1 sản phẩm cụ thể
    dùng trong chiến lược Autoregressive Recursive Forecasting của Global Model.
    """
    row = {}
    
    # 1. Lags
    for lag in LAG_STEPS:
        lag_date = target_date - pd.Timedelta(days=lag)
        row[f'lag_{lag}'] = float(history_series.loc[lag_date]) if lag_date in history_series.index else 0.0

    # 2. Rolling stats
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

    # 3. Calendar
    row['day_of_week'] = target_date.dayofweek
    row['is_weekend'] = 1 if target_date.dayofweek in [5, 6] else 0
    row['day_of_month'] = target_date.day
    row['month'] = target_date.month

    # 4. Holiday
    holidays = get_vietnam_holidays(target_date.year)
    row['is_holiday'] = 1 if target_date.date() in holidays else 0

    # 5. Product demand volume scale
    p_stats = product_metadata.get("product_stats", {}).get(product_id, {})
    if p_stats:
        row['product_mean_demand'] = float(p_stats.get('product_mean_demand', 0.0))
        row['product_std_demand'] = float(p_stats.get('product_std_demand', 0.0))
        row['product_max_demand'] = float(p_stats.get('product_max_demand', 0.0))
    else:
        # Sản phẩm mới chưa có trong stats: dùng trung bình từ history_series truyền vào
        hist_vals = history_series.values
        row['product_mean_demand'] = float(np.mean(hist_vals)) if len(hist_vals) > 0 else 0.0
        row['product_std_demand'] = float(np.std(hist_vals)) if len(hist_vals) > 1 else 0.0
        row['product_max_demand'] = float(np.max(hist_vals)) if len(hist_vals) > 0 else 0.0

    feature_cols = product_metadata.get("feature_cols", list(row.keys()))
    # Đảm bảo đúng thứ tự cột như lúc train
    ordered_row = {col: row.get(col, 0.0) for col in feature_cols}
    return pd.DataFrame([ordered_row])
