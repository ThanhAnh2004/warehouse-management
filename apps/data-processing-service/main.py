import os
from datetime import datetime, timezone

import pandas as pd
import psycopg2
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException

# Load biến môi trường từ thư mục gốc (giống cách Forecasting Service đang làm)
load_dotenv(dotenv_path='../../.env')

app = FastAPI(title="Data Processing Service", version="1.0")

# Hệ số dùng cho phương pháp IQR (Interquartile Range) để phát hiện outlier
IQR_MULTIPLIER = 1.5

# Chỉ những giao dịch đã hoàn tất mới được xem là dữ liệu "sạch" và đáng tin cậy
VALID_STATUS = 'COMPLETED'


def get_db_connection():
    """
    Kết nối tới PostgreSQL của Transaction Service - đây là nơi lưu "dữ liệu thô từ kho"
    mà đề tài yêu cầu Data Processing Service phải thu thập.
    """
    try:
        return psycopg2.connect(
            host=os.getenv('POSTGRES_HOST', 'localhost'),
            port=os.getenv('POSTGRES_PORT', '5432'),
            user=os.getenv('POSTGRES_USER', 'admin'),
            password=os.getenv('POSTGRES_PASSWORD', 'admin123'),
            database=os.getenv('POSTGRES_DB_TRANSACTION', 'warehouse_transactions'),
        )
    except Exception as e:
        print(f"Error connecting to database: {e}")
        return None


def fetch_raw_outbound(conn, product_id: str, lookback_days: int) -> pd.DataFrame:
    """Bước 1 - Thu thập dữ liệu thô: toàn bộ giao dịch OUTBOUND của 1 sản phẩm."""
    query = """
        SELECT id, "createdAt", quantity, status
        FROM "transactions"
        WHERE "productId" = %s AND "type" = 'OUTBOUND'
          AND "createdAt" >= NOW() - make_interval(days => %s)
        ORDER BY "createdAt" ASC
    """
    return pd.read_sql_query(query, conn, params=(product_id, int(lookback_days)))


def clean_data(df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """
    Bước 2 - Làm sạch dữ liệu (data cleaning):
    1. Loại bỏ giao dịch trùng lặp (cùng id).
    2. Chỉ giữ giao dịch đã hoàn tất (status = COMPLETED), loại PENDING/FAILED vì
       đó là giao dịch chưa được xác nhận / lỗi, không phản ánh nhu cầu thực tế.
    3. Loại bỏ bản ghi có số lượng null, âm hoặc bằng 0 (dữ liệu rác).
    4. Chặn outlier bằng phương pháp IQR để tránh làm lệch mô hình dự báo
       (VD: nhân viên nhập nhầm số lượng xuất kho lớn bất thường).
    """
    stats = {"raw": int(len(df))}

    df = df.drop_duplicates(subset=['id'])
    stats["afterDedup"] = int(len(df))

    df = df[df['status'] == VALID_STATUS]
    stats["afterStatusFilter"] = int(len(df))

    df = df.copy()
    df['quantity'] = pd.to_numeric(df['quantity'], errors='coerce').astype(float)
    df = df.dropna(subset=['quantity', 'createdAt'])
    df = df[df['quantity'] > 0]
    stats["afterInvalidFilter"] = int(len(df))

    outliers_capped = 0
    if len(df) >= 4:
        q1 = df['quantity'].quantile(0.25)
        q3 = df['quantity'].quantile(0.75)
        iqr = q3 - q1
        if iqr > 0:
            upper_bound = q3 + IQR_MULTIPLIER * iqr
            mask = df['quantity'] > upper_bound
            outliers_capped = int(mask.sum())
            df.loc[mask, 'quantity'] = upper_bound

    stats["outliersCapped"] = outliers_capped
    stats["cleaned"] = int(len(df))
    return df, stats


def normalize_daily_series(df: pd.DataFrame) -> pd.DataFrame:
    """
    Bước 3 - Chuẩn hóa dữ liệu (data normalization):
    - Gom nhóm số lượng xuất kho theo ngày.
    - Lấp đầy các ngày không có giao dịch bằng 0 để chuỗi thời gian liên tục
      (mô hình dự báo cần dữ liệu liên tục, không có "lỗ hổng" ngày).
    - Sinh feature day_index (số ngày kể từ ngày đầu tiên) phục vụ huấn luyện mô hình.
    """
    df = df.copy()
    df['createdAt'] = pd.to_datetime(df['createdAt'])
    daily = df.groupby(df['createdAt'].dt.date)['quantity'].sum().reset_index()
    daily.columns = ['date', 'quantity']
    daily['date'] = pd.to_datetime(daily['date'])
    daily = daily.set_index('date').resample('D').sum().fillna(0).reset_index()
    daily['day_index'] = (daily['date'] - daily['date'].min()).dt.days
    return daily


@app.get("/health")
def health():
    return {"status": "ok", "service": "data-processing-service"}


@app.get("/quality/overview")
def quality_overview(lookback_days: int = 180):
    """
    Tổng quan chất lượng dữ liệu toàn kho: chạy pipeline làm sạch cho TẤT CẢ sản phẩm
    có phát sinh xuất kho và tổng hợp lại số bản ghi đã bị loại ở từng bước.
    Dùng để minh họa trực quan khâu "làm sạch dữ liệu" của Data Processing Service.
    """
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Data Processing Service: Database connection failed")

    try:
        query = """
            SELECT id, "productId", "createdAt", quantity, status
            FROM "transactions"
            WHERE "type" = 'OUTBOUND'
              AND "createdAt" >= NOW() - make_interval(days => %s)
        """
        df = pd.read_sql_query(query, conn, params=(int(lookback_days),))

        agg = {
            "totalProducts": 0,
            "totalRaw": int(len(df)),
            "totalCleaned": 0,
            "duplicatesRemoved": 0,
            "invalidRemoved": 0,
            "outliersCapped": 0,
        }
        per_product = []

        if not df.empty:
            for product_id, group in df.groupby("productId"):
                cleaned_df, stats = clean_data(group)
                agg["totalProducts"] += 1
                agg["totalCleaned"] += stats["cleaned"]
                agg["duplicatesRemoved"] += stats["raw"] - stats["afterDedup"]
                agg["invalidRemoved"] += stats["afterStatusFilter"] - stats["afterInvalidFilter"]
                agg["outliersCapped"] += stats["outliersCapped"]
                per_product.append({"productId": str(product_id), "stats": stats})

        agg["removedTotal"] = agg["totalRaw"] - agg["totalCleaned"]
        agg["cleanRatePct"] = round((agg["totalCleaned"] / agg["totalRaw"]) * 100, 2) if agg["totalRaw"] else 0

        return {
            "overview": agg,
            "products": per_product,
            "processedAt": datetime.now(timezone.utc).isoformat(),
        }

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@app.get("/process/{product_id}")
def process_product_data(product_id: str, lookback_days: int = 180):
    """
    Endpoint chính: thu thập dữ liệu xuất kho thô của 1 sản phẩm, làm sạch & chuẩn hóa,
    trả về chuỗi thời gian "sạch" sẵn sàng cho Forecasting Service sử dụng để huấn luyện
    mô hình dự báo nhu cầu.
    """
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Data Processing Service: Database connection failed")

    try:
        raw_df = fetch_raw_outbound(conn, product_id, lookback_days)

        if raw_df.empty:
            return {
                "productId": product_id,
                "series": [],
                "stats": {"raw": 0, "cleaned": 0},
                "message": "Không có dữ liệu giao dịch OUTBOUND nào cho sản phẩm này",
                "processedAt": datetime.now(timezone.utc).isoformat(),
            }

        cleaned_df, stats = clean_data(raw_df)

        if cleaned_df.empty:
            return {
                "productId": product_id,
                "series": [],
                "stats": stats,
                "message": "Dữ liệu sau khi làm sạch không còn bản ghi hợp lệ",
                "processedAt": datetime.now(timezone.utc).isoformat(),
            }

        daily_df = normalize_daily_series(cleaned_df)

        series = [
            {
                "date": row['date'].strftime('%Y-%m-%d'),
                "quantity": float(row['quantity']),
                "dayIndex": int(row['day_index']),
            }
            for _, row in daily_df.iterrows()
        ]

        return {
            "productId": product_id,
            "series": series,
            "stats": stats,
            "dateRange": {"start": series[0]['date'], "end": series[-1]['date']} if series else None,
            "processedAt": datetime.now(timezone.utc).isoformat(),
        }

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


if __name__ == "__main__":
    port = int(os.getenv('DATA_PROCESSING_SERVICE_PORT', 8005))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
