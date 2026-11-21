import os
from datetime import datetime, timezone
from pathlib import Path
import pandas as pd
import psycopg2

IQR_MULTIPLIER = 1.5
VALID_STATUS = 'COMPLETED'


def get_db_connection():
    """Kết nối tới PostgreSQL database warehouse_inventory."""
    try:
        return psycopg2.connect(
            host=os.getenv('POSTGRES_HOST', 'localhost'),
            port=os.getenv('POSTGRES_PORT', '5432'),
            user=os.getenv('POSTGRES_USER', 'postgres'),
            password=os.getenv('POSTGRES_PASSWORD', '818757'),
            database=os.getenv('POSTGRES_DB_INVENTORY', 'warehouse_inventory'),
        )
    except Exception as e:
        print(f"[DataCleaning] Error connecting to PostgreSQL: {e}")
        return None


def fetch_raw_outbound(conn, product_id: str, lookback_days: int) -> pd.DataFrame:
    """Thu thập dữ liệu thô: toàn bộ giao dịch OUTBOUND của 1 sản phẩm."""
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
    Làm sạch dữ liệu:
    1. Loại bỏ bản ghi trùng id
    2. Chỉ lấy trạng thái COMPLETED
    3. Lọc số lượng null, <= 0
    4. Cắt tỉa ngoại lai bằng IQR
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
    """Gom nhóm theo ngày, lấp đầy 0, sinh day_index."""
    df = df.copy()
    df['createdAt'] = pd.to_datetime(df['createdAt'])
    daily = df.groupby(df['createdAt'].dt.date)['quantity'].sum().reset_index()
    daily.columns = ['date', 'quantity']
    daily['date'] = pd.to_datetime(daily['date'])
    daily = daily.set_index('date').resample('D').sum().fillna(0).reset_index()
    daily['day_index'] = (daily['date'] - daily['date'].min()).dt.days
    return daily


def process_product_data(product_id: str, lookback_days: int = 730) -> dict:
    """Tiền xử lý và làm sạch chuỗi thời gian cho 1 sản phẩm."""
    conn = get_db_connection()
    if not conn:
        return {
            "productId": product_id,
            "category": "Khác",
            "price": 0.0,
            "createdAt": None,
            "firstOutboundAt": None,
            "daysActive": 0,
            "series": [],
            "stats": {"raw": 0, "cleaned": 0},
            "message": "Không thể kết nối cơ sở dữ liệu",
            "processedAt": datetime.now(timezone.utc).isoformat(),
        }

    try:
        prod_category = "Khác"
        prod_price = 1000000.0
        prod_created_at = None
        try:
            p_res = pd.read_sql_query(
                'SELECT category, COALESCE(price, 0) as price, "createdAt" FROM products WHERE id::text = %s',
                conn,
                params=(str(product_id),),
            )
            if not p_res.empty:
                prod_category = str(p_res.iloc[0]["category"])
                prod_price = float(p_res.iloc[0]["price"])
                if pd.notnull(p_res.iloc[0]["createdAt"]):
                    prod_created_at = pd.to_datetime(p_res.iloc[0]["createdAt"]).isoformat()
        except Exception:
            pass

        raw_df = fetch_raw_outbound(conn, product_id, lookback_days)

        if raw_df.empty:
            return {
                "productId": product_id,
                "category": prod_category,
                "price": prod_price,
                "createdAt": prod_created_at,
                "firstOutboundAt": None,
                "daysActive": 0,
                "series": [],
                "stats": {"raw": 0, "cleaned": 0},
                "message": "Không có dữ liệu giao dịch OUTBOUND nào cho sản phẩm này",
                "processedAt": datetime.now(timezone.utc).isoformat(),
            }

        cleaned_df, stats = clean_data(raw_df)

        if cleaned_df.empty:
            return {
                "productId": product_id,
                "category": prod_category,
                "price": prod_price,
                "createdAt": prod_created_at,
                "firstOutboundAt": None,
                "daysActive": 0,
                "series": [],
                "stats": stats,
                "message": "Dữ liệu sau khi làm sạch không còn bản ghi hợp lệ",
                "processedAt": datetime.now(timezone.utc).isoformat(),
            }

        daily_df = normalize_daily_series(cleaned_df)
        first_date = daily_df['date'].min()
        last_date = daily_df['date'].max()
        days_active = int((last_date - first_date).days) + 1 if not daily_df.empty else 0

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
            "category": prod_category,
            "price": prod_price,
            "createdAt": prod_created_at,
            "firstOutboundAt": first_date.isoformat() if not daily_df.empty else None,
            "daysActive": days_active,
            "series": series,
            "stats": stats,
            "dateRange": {"start": series[0]['date'], "end": series[-1]['date']} if series else None,
            "processedAt": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as e:
        print(f"[DataCleaning] Error processing product {product_id}: {e}")
        return {
            "productId": product_id,
            "category": "Khác",
            "price": 0.0,
            "createdAt": None,
            "firstOutboundAt": None,
            "daysActive": 0,
            "series": [],
            "stats": {"raw": 0, "cleaned": 0},
            "error": str(e),
            "processedAt": datetime.now(timezone.utc).isoformat(),
        }
    finally:
        conn.close()


def process_all_products(lookback_days: int = 730) -> dict:
    """Làm sạch và gom nhóm toàn bộ dữ liệu xuất kho của tất cả sản phẩm."""
    conn = get_db_connection()
    if not conn:
        return {"totalProducts": 0, "products": {}, "productsMetadata": {}, "processedAt": datetime.now(timezone.utc).isoformat()}

    try:
        query = """
            SELECT id, "productId", "createdAt", quantity, status
            FROM "transactions"
            WHERE "type" = 'OUTBOUND'
              AND "createdAt" >= NOW() - make_interval(days => %s)
            ORDER BY "createdAt" ASC
        """
        raw_df = pd.read_sql_query(query, conn, params=(int(lookback_days),))
        if raw_df.empty:
            return {"totalProducts": 0, "products": {}, "productsMetadata": {}, "processedAt": datetime.now(timezone.utc).isoformat()}

        products_map = {}
        for product_id, group in raw_df.groupby("productId"):
            cleaned_df, _ = clean_data(group)
            if cleaned_df.empty:
                continue
            daily_df = normalize_daily_series(cleaned_df)
            series = [
                {
                    "date": row['date'].strftime('%Y-%m-%d'),
                    "quantity": float(row['quantity']),
                    "dayIndex": int(row['day_index']),
                }
                for _, row in daily_df.iterrows()
            ]
            if series:
                products_map[str(product_id)] = series

        products_metadata = {}
        try:
            p_all = pd.read_sql_query('SELECT id::text, category, COALESCE(price, 0) as price FROM products', conn)
            for _, r in p_all.iterrows():
                products_metadata[str(r["id"])] = {
                    "category": str(r["category"]),
                    "price": float(r["price"])
                }
        except Exception as e:
            print(f"[DataCleaning] Warning fetching products metadata: {e}")

        return {
            "totalProducts": len(products_map),
            "products": products_map,
            "productsMetadata": products_metadata,
            "processedAt": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as e:
        print(f"[DataCleaning] Error in process_all_products: {e}")
        return {"totalProducts": 0, "products": {}, "productsMetadata": {}, "error": str(e), "processedAt": datetime.now(timezone.utc).isoformat()}
    finally:
        conn.close()


def get_quality_overview(lookback_days: int = 730) -> dict:
    """Tổng quan chất lượng dữ liệu toàn kho: thống kê số bản ghi đã lọc."""
    conn = get_db_connection()
    if not conn:
        return {"overview": {}, "products": [], "processedAt": datetime.now(timezone.utc).isoformat()}

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
        return {"overview": {}, "products": [], "error": str(e), "processedAt": datetime.now(timezone.utc).isoformat()}
    finally:
        conn.close()
