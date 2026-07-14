import os
import uvicorn
from fastapi import FastAPI, HTTPException
import psycopg2
import pandas as pd
from dotenv import load_dotenv

# Data Processing Service: thu thap du lieu giao dich tho tu Postgres (nguon du lieu
# cua Transaction Service), lam sach va chuan hoa dinh dang thanh chuoi thoi gian lien tuc,
# de Forecasting Service luon nhan duoc du lieu "sach" va chinh xac truoc khi du bao.
load_dotenv(dotenv_path='../../.env')

app = FastAPI(title="Data Processing Service", version="1.0")


def get_db_connection():
    return psycopg2.connect(
        host=os.getenv('POSTGRES_HOST', 'localhost'),
        port=os.getenv('POSTGRES_PORT', '5432'),
        user=os.getenv('POSTGRES_USER', 'admin'),
        password=os.getenv('POSTGRES_PASSWORD', 'admin123'),
        database=os.getenv('POSTGRES_DB_TRANSACTION', 'warehouse_transactions')
    )


@app.get("/clean-data/{product_id}")
def clean_data(product_id: str, transaction_type: str = "OUTBOUND"):
    conn = get_db_connection()
    try:
        query = """
            SELECT "createdAt", "quantity"
            FROM "transactions"
            WHERE "productId" = %s AND "type" = %s
            ORDER BY "createdAt" ASC
        """
        df = pd.read_sql_query(query, conn, params=(product_id, transaction_type))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")
    finally:
        conn.close()

    raw_count = len(df)
    if df.empty:
        return {"productId": product_id, "rawCount": 0, "cleanedCount": 0, "series": []}

    # 1. Chuan hoa dinh dang ngay (bo gio, chi giu ngay)
    df['createdAt'] = pd.to_datetime(df['createdAt']).dt.normalize()

    # 2. Loai bo du lieu ban: so luong am hoac bang 0 la loi ghi nhan
    df = df[df['quantity'] > 0]

    # 3. Loai bo outlier bang phuong phap IQR (Interquartile Range) - tranh cac ban ghi
    #    bat thuong (vd: nhap sai so luong) lam lech mo hinh du bao
    if len(df) >= 4:
        q1 = df['quantity'].quantile(0.25)
        q3 = df['quantity'].quantile(0.75)
        iqr = q3 - q1
        lower_bound = q1 - 1.5 * iqr
        upper_bound = q3 + 1.5 * iqr
        df = df[(df['quantity'] >= lower_bound) & (df['quantity'] <= upper_bound)]

    # 4. Gop theo ngay va dien 0 cho cac ngay khong co giao dich, tao chuoi thoi gian lien tuc
    daily = df.groupby('createdAt')['quantity'].sum().reset_index()
    daily = daily.set_index('createdAt').resample('D').sum().fillna(0).reset_index()

    series = [
        {"date": row['createdAt'].strftime('%Y-%m-%d'), "quantity": float(row['quantity'])}
        for _, row in daily.iterrows()
    ]

    return {
        "productId": product_id,
        "rawCount": raw_count,
        "cleanedCount": len(series),
        "series": series,
    }


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8005, reload=True)
