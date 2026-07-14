import os
import uvicorn
from fastapi import FastAPI, HTTPException
import psycopg2
import pandas as pd
from sklearn.linear_model import LinearRegression
from dotenv import load_dotenv

# Load biến môi trường từ thư mục gốc
load_dotenv(dotenv_path='../../.env')

app = FastAPI(title="Forecasting Service", version="1.0")

def get_db_connection():
    try:
        conn = psycopg2.connect(
            host=os.getenv('POSTGRES_HOST', 'localhost'),
            port=os.getenv('POSTGRES_PORT', '5432'),
            user=os.getenv('POSTGRES_USER', 'admin'),
            password=os.getenv('POSTGRES_PASSWORD', 'admin123'),
            database=os.getenv('POSTGRES_DB_TRANSACTION', 'warehouse_transactions')
        )
        return conn
    except Exception as e:
        print(f"Error connecting to database: {e}")
        return None

@app.get("/forecast/{product_id}")
def forecast_demand(product_id: str, days: int = 7):
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection failed")
    
    try:
        # Lấy dữ liệu giao dịch OUTBOUND (Xuất kho) của sản phẩm
        query = """
            SELECT "createdAt", "quantity"
            FROM "transactions"
            WHERE "productId" = %s AND "type" = 'OUTBOUND'
            ORDER BY "createdAt" ASC
        """
        df = pd.read_sql_query(query, conn, params=(product_id,))
        
        if df.empty or len(df) < 3:
            return {
                "productId": product_id,
                "message": "Không đủ dữ liệu lịch sử xuất kho để dự báo (Cần ít nhất 3 giao dịch OUTBOUND)",
                "forecast": []
            }

        # Tiền xử lý dữ liệu: Gom nhóm theo ngày và tính tổng số lượng xuất kho mỗi ngày
        df['createdAt'] = pd.to_datetime(df['createdAt']).dt.date
        daily_outbound = df.groupby('createdAt')['quantity'].sum().reset_index()
        
        # Đảm bảo dữ liệu liên tục (điền 0 cho những ngày không có giao dịch xuất)
        daily_outbound['createdAt'] = pd.to_datetime(daily_outbound['createdAt'])
        daily_outbound.set_index('createdAt', inplace=True)
        # Resample để lấy đủ các ngày từ ngày đầu tiên đến ngày cuối cùng
        daily_outbound = daily_outbound.resample('D').sum().fillna(0).reset_index()
        
        # Tạo feature X là số ngày tính từ ngày đầu tiên (0, 1, 2, ...)
        daily_outbound['day_index'] = (daily_outbound['createdAt'] - daily_outbound['createdAt'].min()).dt.days
        
        X = daily_outbound[['day_index']]
        y = daily_outbound['quantity']
        
        # Huấn luyện mô hình Linear Regression
        model = LinearRegression()
        model.fit(X, y)
        
        # Dự báo cho N ngày tiếp theo
        last_day_index = daily_outbound['day_index'].max()
        future_X = pd.DataFrame({'day_index': range(last_day_index + 1, last_day_index + 1 + days)})
        future_predictions = model.predict(future_X)
        
        # Tạo kết quả trả về
        last_date = daily_outbound['createdAt'].max()
        forecast_results = []
        for i, pred in enumerate(future_predictions):
            future_date = last_date + pd.Timedelta(days=i+1)
            # Không cho phép dự đoán số âm, tối thiểu là 0
            pred_val = max(0, round(pred, 2))
            forecast_results.append({
                "date": future_date.strftime('%Y-%m-%d'),
                "predictedQuantity": pred_val
            })
            
        return {
            "productId": product_id,
            "algorithm": "Linear Regression",
            "forecast": forecast_results
        }
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8004, reload=True)
