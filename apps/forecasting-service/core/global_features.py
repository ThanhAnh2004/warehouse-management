from __future__ import annotations
from typing import Dict, List, Tuple, Optional
import pandas as pd
import numpy as np
from core.holidays import get_vietnam_holidays

LAG_STEPS = [1, 2, 3, 7, 14, 30]

CATEGORY_MAP = {
    'phone': 0,
    'laptop': 1,
    'tv': 2,
    'cooling': 3,
    'accessories': 4,
    'other': 5,
}


def get_category_code(cat_str: str) -> int:
    """Mã hóa tên ngành hàng thành mã danh mục chuẩn."""
    if not cat_str:
        return 5
    c = str(cat_str).lower()
    if 'thoại' in c or 'phone' in c or 'tablet' in c or 'ipad' in c:
        return 0
    if 'laptop' in c or 'máy tính' in c or 'pc' in c or 'macbook' in c:
        return 1
    if 'tivi' in c or 'tv' in c or 'loa' in c or 'soundbar' in c or 'giải trí' in c:
        return 2
    if 'tủ lạnh' in c or 'điện lạnh' in c or 'máy giặt' in c or 'điều hòa' in c or 'gia dụng' in c or 'tủ đông' in c or 'tủ mát' in c:
        return 3
    if 'phụ kiện' in c or 'accessories' in c or 'tai nghe' in c or 'chuột' in c or 'bàn phím' in c or 'headphone' in c or 'console' in c or 'camera' in c:
        return 4
    return 5


def get_price_features(price: float) -> tuple[float, int]:
    """Trích xuất độ co giãn log giá và phân khúc giá (Price Tier)."""
    p = float(price) if price and price > 0 else 1000000.0
    log_p = float(np.log10(max(1000.0, p)))
    if p < 5000000:
        tier = 0       # Bình dân (< 5M)
    elif p < 15000000:
        tier = 1       # Phổ thông (5M - 15M)
    elif p < 30000000:
        tier = 2       # Cận cao cấp (15M - 30M)
    else:
        tier = 3       # Cao cấp (> 30M)
    return log_p, tier


def is_payday_period(d) -> int:
    """
    Chu kỳ dòng tiền tại Việt Nam (Payday Effect):
    Ngày 25 đến hết tháng và ngày 1 đến ngày 5 đầu tháng là đợt nhận lương, sức mua đồ điện máy tăng mạnh.
    """
    day = d.day
    return 1 if (day >= 25 or day <= 5) else 0


def is_mega_sale_event(d) -> int:
    """Ngày hội mua sắm TMĐT: Ngày đôi (11/11, 12/12...) và Black Friday."""
    day = d.day
    month = d.month
    if day == month:
        return 1
    if month == 11 and (24 <= day <= 29):
        return 1
    return 0


def days_to_payday(d) -> int:
    """Khoảng cách số ngày tới ngày nhận lương gần nhất."""
    day = d.day
    if day <= 5 or day >= 25:
        return 0
    return 25 - day


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
    products_meta: Optional[Dict[str, dict]] = None,
) -> Tuple[pd.DataFrame, pd.Series, dict]:
    """
    Sinh ma trận đặc trưng cho toàn bộ kho hàng (Global Training Dataset) đã nâng cấp:
    - 1. Lags & Rolling windows riêng biệt theo từng productId (chống leakage qua shift(1)).
    - 2. Calendar & Holidays (ngày trong tuần, cuối tuần, ngày lễ Tết Việt Nam).
    - 3. Ưu tiên 1: Ngành hàng (Category), Phân khúc giá (Price Tier & Log Price).
    - 4. Ưu tiên 1: Chu kỳ nhận lương (Payday Effect) & Siêu sale ngày đôi (Mega Sale).
    - Trả về: (X, y, metadata_dict)
    """
    panel_df = build_global_panel_dataframe(products_series)
    if panel_df.empty:
        return pd.DataFrame(), pd.Series(dtype=float), {}

    meta_dict = products_meta or {}

    # 1. Thống kê tĩnh theo từng sản phẩm
    stats_df = panel_df.groupby('productId')['quantity'].agg(
        product_mean_demand='mean',
        product_std_demand=lambda x: float(np.std(x)) if len(x) > 1 else 0.0,
        product_max_demand='max',
        product_record_count='count'
    ).reset_index()

    unique_pids = sorted(list(panel_df['productId'].unique()))
    pid_to_code = {pid: idx for idx, pid in enumerate(unique_pids)}
    code_to_pid = {idx: pid for pid, idx in pid_to_code.items()}

    product_metadata = {
        "pid_to_code": pid_to_code,
        "code_to_pid": code_to_pid,
        "product_stats": stats_df.set_index('productId').to_dict(orient='index'),
        "products_meta": meta_dict,
        "category_stats": {},
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
        group = group.set_index('date').asfreq('D').fillna({'quantity': 0.0, 'productId': pid})

        # Lags
        for lag in LAG_STEPS:
            group[f'lag_{lag}'] = group['quantity'].shift(lag)

        # Rolling statistics (shift(1) chống leakage)
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

        # [Ưu tiên 1]: Payday & Mega Sale
        group['is_payday'] = [is_payday_period(d) for d in group.index]
        group['is_mega_sale'] = [is_mega_sale_event(d) for d in group.index]
        group['days_to_payday'] = [days_to_payday(d) for d in group.index]

        # [Ưu tiên 1]: Category & Price
        p_info = meta_dict.get(str(pid), {})
        cat_str = p_info.get("category", "")
        price_val = float(p_info.get("price", 1000000.0))
        cat_code = get_category_code(cat_str)
        log_p, price_tier = get_price_features(price_val)

        group['category_code'] = cat_code
        group['log_price'] = log_p
        group['price_tier'] = price_tier

        # Product static demand features
        p_stats = product_metadata["product_stats"].get(pid, {})
        group['product_mean_demand'] = float(p_stats.get('product_mean_demand', 0.0))
        group['product_std_demand'] = float(p_stats.get('product_std_demand', 0.0))
        group['product_max_demand'] = float(p_stats.get('product_max_demand', 0.0))

        group = group.bfill().fillna(0.0)
        processed_groups.append(group.reset_index())

    full_df = pd.concat(processed_groups, ignore_index=True)
    full_df = full_df.sort_values(by=['date', 'productId']).reset_index(drop=True)

    # [Ưu tiên 1]: Target Encoding theo Category (Nhu cầu trung bình của cả ngành hàng)
    cat_demand_map = full_df.groupby('category_code')['quantity'].mean().to_dict()
    full_df['category_mean_demand'] = full_df['category_code'].map(cat_demand_map).fillna(0.0)
    product_metadata["category_stats"] = cat_demand_map

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
    product_category: Optional[str] = None,
    product_price: Optional[float] = None,
) -> pd.DataFrame:
    """
    Tạo 1 hàng đặc trưng cho bước dự báo tiếp theo của 1 sản phẩm cụ thể
    dùng trong chiến lược Autoregressive Recursive Forecasting của Global Model (Đã nâng cấp Ưu tiên 1).
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

    # 3. Calendar & Holiday
    row['day_of_week'] = target_date.dayofweek
    row['is_weekend'] = 1 if target_date.dayofweek in [5, 6] else 0
    row['day_of_month'] = target_date.day
    row['month'] = target_date.month

    holidays = get_vietnam_holidays(target_date.year)
    row['is_holiday'] = 1 if target_date.date() in holidays else 0

    # 4. [Ưu tiên 1]: Payday & Mega Sale
    row['is_payday'] = is_payday_period(target_date)
    row['is_mega_sale'] = is_mega_sale_event(target_date)
    row['days_to_payday'] = days_to_payday(target_date)

    # 5. [Ưu tiên 1]: Category & Price
    p_meta = product_metadata.get("products_meta", {}).get(str(product_id), {})
    cat_str = product_category or p_meta.get("category", "")
    price_val = product_price if product_price is not None else float(p_meta.get("price", 1000000.0))

    cat_code = get_category_code(cat_str)
    log_p, price_tier = get_price_features(price_val)
    cat_mean = product_metadata.get("category_stats", {}).get(cat_code, 1.0)

    row['category_code'] = cat_code
    row['category_mean_demand'] = float(cat_mean)
    row['log_price'] = log_p
    row['price_tier'] = price_tier

    # 6. Product demand volume scale
    p_stats = product_metadata.get("product_stats", {}).get(str(product_id), {})
    if p_stats:
        row['product_mean_demand'] = float(p_stats.get('product_mean_demand', 0.0))
        row['product_std_demand'] = float(p_stats.get('product_std_demand', 0.0))
        row['product_max_demand'] = float(p_stats.get('product_max_demand', 0.0))
    else:
        # Sản phẩm mới chưa có trong stats: dùng category_mean_demand hoặc history
        hist_vals = history_series.values
        row['product_mean_demand'] = float(np.mean(hist_vals)) if len(hist_vals) > 0 else float(cat_mean)
        row['product_std_demand'] = float(np.std(hist_vals)) if len(hist_vals) > 1 else 0.0
        row['product_max_demand'] = float(np.max(hist_vals)) if len(hist_vals) > 0 else float(cat_mean)

    feature_cols = product_metadata.get("feature_cols", list(row.keys()))
    ordered_row = {col: row.get(col, 0.0) for col in feature_cols}
    return pd.DataFrame([ordered_row])
