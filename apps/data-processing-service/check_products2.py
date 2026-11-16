import psycopg2
import os

conn = psycopg2.connect(
    host=os.getenv('POSTGRES_HOST', 'host.docker.internal'),
    user=os.getenv('POSTGRES_USER', 'postgres'),
    password=os.getenv('POSTGRES_PASSWORD', '818757'),
    dbname=os.getenv('POSTGRES_DB_INVENTORY', 'warehouse_inventory'),
    port=int(os.getenv('POSTGRES_PORT', 5432))
)
cur = conn.cursor()
cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'products'")
cols = cur.fetchall()
print("Products columns:", [c[0] for c in cols])
cur.execute('SELECT id, name, sku, "createdAt" FROM products WHERE sku = \'1234\'')
print("Product 1234:", cur.fetchall())

import pandas as pd
df = pd.read_sql_query('SELECT "productId", count(*) as cnt, min("createdAt") as min_d, max("createdAt") as max_d FROM transactions GROUP BY "productId"', conn)
print("Total products with txs:", len(df))
df_loc = pd.read_sql_query('SELECT code, rack, zone, "shelfLevel", "maxCapacity" FROM locations ORDER BY code', conn)
print("Locations in DB:")
print(df_loc.to_string())
