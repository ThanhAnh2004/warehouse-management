import sys
import numpy as np
import pandas as pd
from datetime import datetime, timedelta

# Fix console encoding on Windows
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

from core.models.global_xgboost import GlobalXGBoostForecaster
from core.global_engine import train_global_model, forecast_with_global_model


def generate_synthetic_catalog_data():
    """Tạo dữ liệu bán hàng cho 5 sản phẩm khác nhau trong 60 ngày."""
    np.random.seed(42)
    base_date = datetime(2026, 8, 1)
    dates = [base_date + timedelta(days=i) for i in range(60)]

    products = {
        "PROD_HIGH_DEMAND": {
            "base": 120,
            "weekly_cycle": [1.0, 1.05, 1.0, 1.1, 1.3, 1.5, 1.2], # Cao điểm cuối tuần
            "noise": 10,
        },
        "PROD_MID_DEMAND": {
            "base": 45,
            "weekly_cycle": [1.0, 1.0, 1.1, 1.0, 1.2, 1.3, 1.1],
            "noise": 5,
        },
        "PROD_LOW_DEMAND": {
            "base": 8,
            "weekly_cycle": [1.0, 1.0, 1.0, 1.0, 1.2, 1.2, 1.0],
            "noise": 2,
        },
        "PROD_SEASONAL": {
            "base": 30,
            "weekly_cycle": [0.8, 0.8, 0.9, 1.0, 1.4, 1.6, 1.1],
            "noise": 4,
        },
    }

    catalog_data = {}
    for pid, config in products.items():
        series = []
        for i, dt in enumerate(dates):
            dow = dt.weekday()
            demand = config["base"] * config["weekly_cycle"][dow] + np.random.normal(0, config["noise"])
            demand = max(0.0, round(float(demand), 1))
            series.append({
                "date": dt.strftime("%Y-%m-%d"),
                "quantity": demand,
                "dayIndex": i,
            })
        catalog_data[pid] = series

    return catalog_data


def test_global_forecasting():
    print("================================================================")
    print("   KIỂM THỬ KIẾN TRÚC 1 MÔ HÌNH TOÀN CỤC (GLOBAL MODEL)")
    print("================================================================")

    data = generate_synthetic_catalog_data()
    print(f"[1] Đã sinh dữ liệu mô phỏng cho {len(data)} sản phẩm (mỗi sản phẩm 60 ngày):")
    for pid, s in data.items():
        avg = np.mean([x['quantity'] for x in s])
        print(f"    - {pid:<18}: Trung bình xuất kho ~ {avg:.1f} đơn vị/ngày")

    print("\n[2] Bắt đầu huấn luyện ĐÚNG 1 MÔ HÌNH TOÀN CỤC (Global XGBoost)...")
    result = train_global_model(data)
    summary = result["summary"]
    metrics = summary["globalMetrics"]

    print(f"    -> Đã huấn luyện trên: {summary['totalProducts']} sản phẩm")
    print(f"    -> Tổng số dòng dữ liệu bảng: {summary['totalTrainingRows']} dòng")
    print(f"    -> Số đặc trưng đầu vào: {summary['featureCount']} đặc trưng")
    print(f"    -> Độ chính xác toàn cục (Global Accuracy): {metrics['accuracy']}%")
    print(f"    -> Sai số WAPE: {metrics['wape'] * 100:.2f}% | MAE: {metrics['mae']} | RMSE: {metrics['rmse']}")

    print("\n[3] Kiểm thử dự báo cho từng sản phẩm bằng chính mô hình duy nhất này:")
    for pid in data.keys():
        fc_res = forecast_with_global_model(pid, data[pid], horizon_days=7)
        fc = fc_res["forecast"]
        first_3_days = [f"{x['date']}: {x['predictedQuantity']}" for x in fc[:3]]
        print(f"    - {pid:<18} -> 3 ngày đầu: {', '.join(first_3_days)}")
        assert len(fc) == 7, "Số ngày dự báo phải đúng 7 ngày!"
        assert not fc_res["isFallback"], "Mô hình Global phải dự báo được trực tiếp mà không cần fallback!"

    print("\n[4] Kiểm thử sản phẩm mới hoàn toàn (Cold Start chưa từng xuất hiện trong tập huấn luyện):")
    cold_start_series = [
        {"date": f"2026-10-0{i}", "quantity": float(20 + i), "dayIndex": i}
        for i in range(1, 8)
    ]
    cold_fc = forecast_with_global_model("PROD_BRAND_NEW_SKU", cold_start_series, horizon_days=7)
    print(f"    - PROD_BRAND_NEW_SKU -> Dự báo 7 ngày thành công: {len(cold_fc['forecast'])} ngày")
    print(f"    - Thuật toán: {cold_fc['algorithm']}")

    print("\n================================================================")
    print("   TẤT CẢ KIỂM THỬ GLOBAL MODEL ĐÃ HOÀN TẤT THÀNH CÔNG 100%!")
    print("================================================================")


if __name__ == "__main__":
    test_global_forecasting()
