FROM python:3.9-slim

WORKDIR /app

# Cần libpq-dev + gcc để build psycopg2 (kết nối tới PostgreSQL của Transaction Service)
RUN apt-get update && apt-get install -y libpq-dev gcc

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source
COPY . .

# Expose port
EXPOSE 8005

CMD ["python", "main.py"]
