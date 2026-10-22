import math
import os
from pathlib import Path
import requests
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, BackgroundTasks

from core.global_engine import (
    forecast_with_global_model,
    train_global_model,
    get_global_forecaster,
)
from core.evaluator import compare_all_models
from core.ablation import run_ablation_study
from core.simulation import run_operational_simulation
from core.features import to_daily_series

# Load biến môi trường từ file .env của warehouse-system
env_path = Path(__file__).resolve().parent.parent.parent / '.env'
if env_path.exists():
    load_dotenv(dotenv_path=env_path)
else:
    load_dotenv(dotenv_path='../../.env')

app = FastAPI(
    title="Smart Warehouse Global AI Demand Forecasting Service",
    description="Kiến trúc 1 Mô hình Toàn cục (Global Multi-Product XGBoost Regressor) cho toàn bộ kho hàng",
    version="2.1.0-global",
)

DATA_PROCESSING_SERVICE_HOST = os.getenv('DATA_PROCESSING_SERVICE_HOST', 'localhost')
DATA_PROCESSING_SERVICE_PORT = os.getenv('DATA_PROCESSING_SERVICE_PORT', '8005')
DATA_PROCESSING_SERVICE_URL = f"http://{DATA_PROCESSING_SERVICE_HOST}:{DATA_PROCESSING_SERVICE_PORT}"

DEFAULT_ANNUAL_DEMAND = 260.0


def _fetch_cleaned_series(product_id: str, lookback_days: int = 180) -> dict:
    """Lấy chuỗi OUTBOUND đã làm sạch từ Data Processing Service cho 1 sản phẩm."""
    resp = requests.get(
        f"{DATA_PROCESSING_SERVICE_URL}/process/{product_id}",
        params={"lookback_days": lookback_days},
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()


def _fetch_all_cleaned_products(lookback_days: int = 180) -> dict:
    """Lấy dữ liệu đã làm sạch của TẤT CẢ các sản phẩm từ Data Processing Service."""
    resp = requests.get(
        f"{DATA_PROCESSING_SERVICE_URL}/process-all",
        params={"lookback_days": lookback_days},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


@app.on_event("startup")
def startup_event():
    """Khởi động service: tự động tải Global Model nếu đã có checkpoint trên đĩa."""
    forecaster = get_global_forecaster()
    if forecaster.is_fitted:
        print(f"[*] Global Demand Forecaster đã sẵn sàng (đã học {len(forecaster.metadata.get('pid_to_code', {}))} sản phẩm).")
    else:
        print("[!] Global Demand Forecaster chưa có checkpoint. Sẽ tự động khởi tạo khi có yêu cầu hoặc gọi /train/global.")


@app.get("/health")
def health():
    forecaster = get_global_forecaster()
    return {
        "status": "ok",
        "service": "forecasting-service",
        "version": "2.1.0-global",
        "architecture": "Single Global Model (One Model for All SKUs)",
        "algorithm": "Global Multi-Product XGBoost Regressor",
        "isModelFitted": forecaster.is_fitted,
        "trainedProductsCount": len(forecaster.metadata.get("pid_to_code", {})),
        "globalMetrics": forecaster.evaluation_metrics,
    }


@app.get("/model/info")
def model_info():
    """Xem thông tin chi tiết về mô hình Global hiện tại trong hệ thống."""
    forecaster = get_global_forecaster()
    if not forecaster.is_fitted:
        return {
            "status": "not_trained",
            "message": "Chưa có mô hình toàn cục nào được huấn luyện. Hãy gọi POST /train/global.",
        }

    return {
        "status": "ready",
        "architecture": "Single Global Model (Panel Data XGBoost)",
        "totalProductsTrained": len(forecaster.metadata.get("pid_to_code", {})),
        "featureColumns": forecaster.metadata.get("feature_cols", []),
        "globalEvaluationMetrics": forecaster.evaluation_metrics,
    }


@app.post("/train/global")
def trigger_global_training(lookback_days: int = Query(default=180, ge=30, le=730)):
    """
    Kích hoạt huấn luyện 1 mô hình Global duy nhất cho toàn bộ sản phẩm trong kho hàng:
    - Kéo toàn bộ dữ liệu giao dịch sạch từ Data Processing Service.
    - Xây dựng ma trận đặc trưng toàn cục (Cross-product Lags, Rolling, Holidays, Product Volume Stats).
    - Huấn luyện XGBoost Regressor và lưu checkpoint vào đĩa.
    """
    try:
        all_data = _fetch_all_cleaned_products(lookback_days)
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Không thể kết nối Data Processing Service để lấy dữ liệu toàn kho: {e}",
        )

    products_map = all_data.get("products", {})
    if not products_map:
        raise HTTPException(
            status_code=400,
            detail="Không có sản phẩm nào có lịch sử xuất kho hợp lệ để huấn luyện mô hình.",
        )

    try:
        train_result = train_global_model(products_map)
        return {
            "message": "Huấn luyện Global Model thành công!",
            **train_result,
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Lỗi khi huấn luyện Global Model: {str(e)}")


@app.get("/forecast/{product_id}")
def forecast_demand(
    product_id: str,
    days: int = Query(default=7, ge=1, le=90, description="Dự báo số ngày tiếp theo (7, 14, 30...)"),
):
    """
    Dự báo nhu cầu cho sản phẩm `product_id` trong `days` ngày tới:
    - Sử dụng 1 MÔ HÌNH DUY NHẤT (Global XGBoost Regressor).
    - Không cần chạy so sánh hay chọn BEST MODEL cho từng sản phẩm.
    - Tốc độ phản hồi cực nhanh (mili-giây), hỗ trợ cả sản phẩm mới.
    - Tự động fallback nếu lịch sử < 3 ngày.
    """
    try:
        cleaned = _fetch_cleaned_series(product_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Data Processing Service unavailable: {e}")

    series = cleaned.get("series", [])
    if len(series) == 0:
        return {
            "productId": product_id,
            "message": "Không có dữ liệu lịch sử xuất kho nào để dự báo",
            "forecast": [],
            "isFallback": True,
        }

    try:
        result = forecast_with_global_model(product_id, series, days)
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Lỗi trong quá trình dự báo: {str(e)}")

    return {
        "productId": product_id,
        "horizonDays": days,
        "modelArchitecture": "Single Global Model (1 mô hình cho toàn kho)",
        "algorithm": result["algorithm"],
        "modelVersion": result["modelVersion"],
        "isFallback": result["isFallback"],
        "evaluatedMetrics": result["evaluatedMetrics"],
        "forecast": result["forecast"],
        "generatedAt": result["generatedAt"],
    }


@app.get("/forecast-all")
def forecast_all_products(
    days: int = Query(default=7, ge=1, le=90, description="Dự báo số ngày tiếp theo"),
    lookback_days: int = 180,
):
    """
    Dự báo đồng loạt cho TẤT CẢ các sản phẩm trong kho hàng chỉ trong 1 cuộc gọi API.
    Lợi thế vượt trội của kiến trúc Global Model so với kiến trúc cũ.
    """
    forecaster = get_global_forecaster()
    if not forecaster.is_fitted:
        raise HTTPException(
            status_code=400,
            detail="Global Model chưa được huấn luyện. Hãy gọi POST /train/global trước.",
        )

    try:
        all_data = _fetch_all_cleaned_products(lookback_days)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Data Processing Service unavailable: {e}")

    products_map = all_data.get("products", {})
    results = forecaster.predict_batch(products_map, horizon_days=days)

    return {
        "horizonDays": days,
        "totalProducts": len(results),
        "modelArchitecture": "Single Global Model",
        "algorithm": "Global Multi-Product XGBoost Regressor",
        "globalMetrics": forecaster.evaluation_metrics,
        "forecasts": results,
    }


@app.get("/models/compare/{product_id}")
def compare_models(
    product_id: str,
    test_days: int = Query(default=7, ge=3, le=30, description="Số ngày dùng làm tập Test để so sánh"),
):
    """
    So sánh đối chứng các trường phái mô hình (Baseline vs SARIMAX vs XGBoost)
    phục vụ báo cáo nghiệm thu và phân tích chuyên sâu.
    """
    try:
        cleaned = _fetch_cleaned_series(product_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Data Processing Service unavailable: {e}")

    series = cleaned.get("series", [])
    if len(series) < 10:
        raise HTTPException(
            status_code=400,
            detail=f"Cần ít nhất 10 ngày dữ liệu lịch sử để chạy so sánh mô hình (hiện có: {len(series)} ngày)",
        )

    daily = to_daily_series(series)
    try:
        comparison_result = compare_all_models(daily, test_days=test_days)
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Lỗi khi so sánh mô hình: {str(e)}")

    return {
        "productId": product_id,
        **comparison_result,
    }


@app.get("/experiments/ablation/{product_id}")
def ablation_experiment(
    product_id: str,
    test_days: int = Query(default=7, ge=3, le=30, description="Số ngày dùng làm tập Test"),
):
    """
    Nghiên cứu loại trừ đặc trưng (Ablation Analysis):
    Đối sánh thực nghiệm giữa mô hình chỉ dùng lag vs đầy đủ đặc trưng (Lags + Rolling + Lịch Lễ Tết).
    """
    try:
        cleaned = _fetch_cleaned_series(product_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Data Processing Service unavailable: {e}")

    series = cleaned.get("series", [])
    if len(series) < 14:
        raise HTTPException(
            status_code=400,
            detail=f"Cần ít nhất 14 ngày dữ liệu để thực hiện Ablation Study (hiện có: {len(series)} ngày)",
        )

    daily = to_daily_series(series)
    try:
        ablation_result = run_ablation_study(daily, test_days=test_days)
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Lỗi khi chạy Ablation Analysis: {str(e)}")

    return {
        "productId": product_id,
        **ablation_result,
    }


@app.get("/experiments/simulation/{product_id}")
def operational_simulation_experiment(
    product_id: str,
    test_days: int = Query(default=14, ge=7, le=60, description="Số ngày dùng làm tập Test mô phỏng"),
    lead_time: int = Query(default=3, ge=1, le=30, description="Lead time (ngày)"),
    unit_price: float = Query(default=100000.0, ge=1.0, description="Đơn giá sản phẩm (VNĐ)"),
    ordering_cost: float = Query(default=50000.0, ge=1000.0, description="Chi phí mỗi lần đặt hàng (VNĐ)"),
    holding_rate: float = Query(default=0.2, ge=0.01, le=1.0, description="Tỷ lệ chi phí lưu kho (%/năm)"),
):
    """
    Mô phỏng tác động vận hành (Mục 3.5 & 6.3 trong tài liệu đề tài):
    Replay dữ liệu test để đối sánh 2 chính sách:
    - Policy A: Không dùng Forecast (Simple Reorder Policy).
    - Policy B: Có AI Forecast + Safety Stock + ROP + EOQ.
    Đo lường 5 chỉ số: Stockout rate/count, Average inventory, Overstock, Replenishment count, Estimated cost.
    """
    try:
        cleaned = _fetch_cleaned_series(product_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Data Processing Service unavailable: {e}")

    series = cleaned.get("series", [])
    if len(series) < 14:
        raise HTTPException(
            status_code=400,
            detail=f"Cần ít nhất 14 ngày dữ liệu để thực hiện mô phỏng vận hành (hiện có: {len(series)} ngày)",
        )

    daily = to_daily_series(series)
    try:
        sim_result = run_operational_simulation(
            daily,
            test_days=test_days,
            lead_time=lead_time,
            unit_price=unit_price,
            ordering_cost=ordering_cost,
            holding_rate=holding_rate,
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Lỗi khi chạy Mô phỏng vận hành: {str(e)}")

    return {
        "productId": product_id,
        **sim_result,
    }


@app.get("/eoq/{product_id}")
def calculate_eoq(
    product_id: str,
    ordering_cost: float = 50000,
    holding_cost_rate: float = 0.2,
    unit_price: float = 1,
):
    """
    EOQ (Economic Order Quantity) = sqrt(2 * D * S / H)
    Giữ nguyên tính tương thích cao với Inventory Service.
    """
    try:
        cleaned = _fetch_cleaned_series(product_id)
        series = cleaned.get("series", [])
    except Exception:
        series = []

    if len(series) == 0:
        annual_demand = DEFAULT_ANNUAL_DEMAND
    else:
        avg_daily = sum(p["quantity"] for p in series) / len(series)
        annual_demand = max(1.0, avg_daily * 365)

    holding_cost = max(holding_cost_rate, 0.0001) * max(unit_price, 0.0001)
    eoq = math.sqrt((2 * annual_demand * ordering_cost) / holding_cost)

    return {
        "productId": product_id,
        "eoq": round(eoq),
        "annualDemand": round(annual_demand),
    }


if __name__ == "__main__":
    port = int(os.getenv('FORECASTING_SERVICE_PORT', '8004'))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
