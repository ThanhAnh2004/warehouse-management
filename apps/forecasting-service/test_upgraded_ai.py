"""
Test suite toan dien kiem thu phan he AI Du bao nhu cau nang cap:
- Kiem thu cac dac trung Lags, Rolling, Calendar, Le Tet
- Kiem thu 3 truong phai mo hinh: Baseline (SMA/SNaive), ARIMA/SARIMAX, XGBoost
- Kiem thu Time-based Train/Test Split va tinh toan MAE, RMSE, WAPE
- Kiem thu Ablation Study (doi sanh dac trung)
- Kiem thu Safe Fallback khi du lieu ngan
"""

import sys
import datetime
import pandas as pd

# Ho tro hien thi Unicode tren Windows terminal
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

from core.features import to_daily_series, create_feature_matrix
from core.models import MovingAverageForecaster, NaiveSeasonalForecaster, ArimaForecaster, XGBoostForecaster
from core.evaluator import compare_all_models
from core.ablation import run_ablation_study
from core.forecast_engine import generate_demand_forecast


def generate_synthetic_data(num_days=60):
    """Sinh du lieu gia lap co xu huong va chu ky tuan (cuoi tuan ban cao hon)."""
    base_date = datetime.date(2026, 8, 1)
    data = []
    for i in range(num_days):
        d = base_date + datetime.timedelta(days=i)
        is_weekend = d.weekday() in [5, 6]
        qty = 25.0 if is_weekend else 10.0
        qty += (i % 5) - 2
        data.append({"date": d.strftime('%Y-%m-%d'), "quantity": max(0.0, float(qty))})
    return data


def test_ai_pipeline():
    print("=================================================================")
    print("[START] BAT DAU KIEM THU PHAN HE AI DU BAO NHU CAU NANG CAP")
    print("=================================================================\n")

    # 1. Sinh du lieu 60 ngay
    raw_data = generate_synthetic_data(num_days=60)
    daily = to_daily_series(raw_data)
    print(f"[OK] [1] Da nap chuoi thoi gian: {len(daily)} ngay lien tuc ({daily.index.min().date()} -> {daily.index.max().date()})")

    # 2. Kiem thu Feature Engineering
    X, y = create_feature_matrix(daily, include_all_features=True)
    print(f"[OK] [2] Trich xuat dac trung thanh cong: {X.shape[1]} dac trung bao gom:")
    print(f"       - Lags: {[c for c in X.columns if c.startswith('lag')]}")
    print(f"       - Rolling: {[c for c in X.columns if c.startswith('rolling')]}")
    print(f"       - Calendar: {[c for c in X.columns if not c.startswith('lag') and not c.startswith('rolling')]}")

    # 3. Kiem thu Huan luyen & Du bao rieng tung Model
    train_part = daily.iloc[:-7]
    test_part = daily.iloc[-7:]

    print("\n--- [3] Kiem thu 3 truong phai mo hinh (Du bao 7 ngay tren tap Test) ---")
    models = [
        MovingAverageForecaster(window=7),
        NaiveSeasonalForecaster(season_length=7),
        ArimaForecaster(),
        XGBoostForecaster(include_all_features=True),
    ]

    for m in models:
        m.fit(train_part)
        preds = m.predict(7)
        print(f"  * {m.name:50} => Du bao 7 ngay: {[round(p, 1) for p in preds[:4]]}...")

    # 4. Kiem thu So sanh mo hinh & Danh gia sai so (MAE, RMSE, WAPE)
    print("\n--- [4] Kiem thu Thi dau & So sanh 4 mo hinh (Evaluator) ---")
    comp_res = compare_all_models(daily, test_days=7)
    print(f"[BEST MODEL] Duoc chon tu dong: {comp_res['bestModel']}")
    print(f"[METRICS] Cua Best Model: WAPE = {comp_res['bestMetrics']['wape']}, MAE = {comp_res['bestMetrics']['mae']}, Accuracy = {comp_res['bestMetrics']['accuracy']}%")
    print("\nBang xep hang hieu nang:")
    for idx, row in enumerate(comp_res['comparisonTable'], 1):
        m = row['metrics']
        print(f"  {idx}. {row['modelName']:48} | WAPE: {m['wape']:.4f} | MAE: {m['mae']:.2f} | RMSE: {m['rmse']:.2f} | Do chinh xac: {m['accuracy']}%")

    # 5. Kiem thu Nghiencuu loai tru dac trung (Ablation Analysis)
    print("\n--- [5] Kiem thu Ablation Study (XGBoost Lag-only vs Full-features) ---")
    ablation = run_ablation_study(daily, test_days=7)
    wape_lag = ablation['lagOnlyVariant']['metrics']['wape']
    wape_full = ablation['fullFeaturesVariant']['metrics']['wape']
    print(f"  * XGBoost (Chi dung Lag):       WAPE = {wape_lag:.4f} (Do chinh xac: {ablation['lagOnlyVariant']['metrics']['accuracy']}%)")
    print(f"  * XGBoost (Day du dac trung):    WAPE = {wape_full:.4f} (Do chinh xac: {ablation['fullFeaturesVariant']['metrics']['accuracy']}%)")
    print(f"  [KET LUAN] {ablation['impact']['conclusion']}")

    # 6. Kiem thu Safe Fallback khi du lieu ngan (< 14 ngay)
    print("\n--- [6] Kiem thu Co che Safe Fallback ---")
    short_data = generate_synthetic_data(num_days=5)
    fallback_res = generate_demand_forecast(short_data, days=7)
    print(f"  * Khi du lieu chi co 5 ngay: isFallback = {fallback_res['isFallback']}")
    print(f"  * Thuat toan kich hoat: {fallback_res['algorithm']}")
    print(f"  * Model Version: {fallback_res['modelVersion']}")

    # 7. Kiem thu End-to-End Forecast Engine (Horizon 14 ngay)
    print("\n--- [7] Kiem thu Du bao Horizon 14 ngay voi Best Model ---")
    full_res = generate_demand_forecast(raw_data, days=14)
    print(f"  * Mo hinh chinh thuc: {full_res['algorithm']}")
    print(f"  * Phien ban: {full_res['modelVersion']}")
    print(f"  * So ngay du bao: {len(full_res['forecast'])} ngay")
    print(f"  * 3 ngay dau tien: {full_res['forecast'][:3]}")

    print("\n=================================================================")
    print("[SUCCESS] TAT CA CAC BAI TEST DA HOAN TAT THANH CONG!")
    print("=================================================================")


if __name__ == "__main__":
    test_ai_pipeline()
