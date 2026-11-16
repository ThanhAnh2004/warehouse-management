import psycopg2
import os

conn = psycopg2.connect(
    host=os.getenv('DATABASE_HOST', 'postgres'),
    user=os.getenv('DATABASE_USER', 'postgres'),
    password=os.getenv('DATABASE_PASSWORD', 'postgres'),
    dbname=os.getenv('DATABASE_NAME', 'warehouse_inventory'),
    port=int(os.getenv('DATABASE_PORT', 5432))
)
cur = conn.cursor()
cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'products'")
cols = cur.fetchall()
print("Products columns:", [c[0] for c in cols])
cur.execute('SELECT id, name, sku, "createdAt" FROM products ORDER BY "createdAt" DESC LIMIT 5')
print("Recent products:", cur.fetchall())
cur.execute('SELECT id, name, sku FROM products WHERE sku = \'1234\'')
print("Product 1234:", cur.fetchall())
